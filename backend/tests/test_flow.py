"""Offline test of the lab switch and scenario run workflow: routers and EVE-NG are replaced by fakes.

    cd backend && ../venv/Scripts/python.exe -m pytest tests -q        (or: python tests/test_flow.py)
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("BGP_LABS", str(ROOT / "labs"))
os.environ["BGP_RUNS"] = tempfile.mkdtemp()
os.environ["BGP_MONITOR"] = "false"
sys.path.insert(0, str(ROOT / "backend"))

from app import devices as dev_mod            # noqa: E402
from app import events, labmgr, scenarios      # noqa: E402


_real_sleep = asyncio.sleep


async def _fast_sleep(delay, *a, **k):        # the scenarios wait 40 s for BGP to settle: not in a test
    await _real_sleep(0)


asyncio.sleep = _fast_sleep


class Fake:
    """A pretend EVE-NG plus routers: records what was done and answers show commands from a script."""

    def __init__(self) -> None:
        self.running: set[str] = {"shared"}         # labs whose nodes are up
        self.log: list[str] = []
        self.configured: set[str] = set()            # routers that have their baseline
        self.applied = False
        self.conflicts: list[str] = []            # addresses that another lab answers on

    def install(self) -> None:
        labmgr.node_status = self.node_status
        labmgr.stop_lab = self.stop_lab
        labmgr._is_lab = lambda ctx, count=2: ctx.id in self.running
        labmgr.find_conflicts = lambda devices: self.conflicts
        labmgr.start_lab = self.start_lab

        async def wait_ssh(devices, emit, step, timeout):
            return set(devices)

        async def bootstrap(ctx, devices, names, emit):
            self.log.append(f"bootstrap {ctx.id} {','.join(names)}")

        async def push_baselines(ctx, devices, names, emit):
            self.log.append(f"baseline {ctx.id} {','.join(names)}")
            self.configured |= {f"{ctx.id}:{n}" for n in names}

        async def check_baseline(ctx, devices):
            return [n for n in devices if f"{ctx.id}:{n}" not in self.configured]

        async def converge(devices, emit, timeout=300, expected=0):
            emit.step("converge", "running", "all up")

        labmgr.wait_ssh, labmgr.bootstrap_devices, labmgr.push_baselines = wait_ssh, bootstrap, push_baselines
        labmgr.check_baseline, labmgr.converge = check_baseline, converge
        dev_mod.show = self.show
        dev_mod.push_config = self.push_config
        dev_mod.exec_cmd = lambda dev, cmd, emit=None: ""

    def node_status(self, ctx):
        names = [n for n in ctx.load_inventory()["devices"]]
        st = "running" if ctx.id in self.running else "stopped"
        return {n.upper(): {"id": str(i + 1), "status": st, "console_host": "127.0.0.1", "console_port": 32000 + i} for i, n in enumerate(names)}

    def stop_lab(self, ctx, emit, timeout=150):
        self.log.append(f"stop {ctx.id}")
        self.running.discard(ctx.id)

    def start_lab(self, ctx, emit):
        self.log.append(f"start {ctx.id}")
        self.running.add(ctx.id)

    def show(self, dev, command, use_textfsm=False, emit=None):
        if emit:
            emit(dev.name, "ssh", f"$ ssh lab@{dev.mgmt_ip}")
            emit(dev.name, "cmd", f"{dev.name}#{command}")
        out = "route present" if self.applied else "% Subnet not in table"
        return out

    def push_config(self, dev, lines, save=True, emit=None):
        self.log.append(f"push {dev.name} {len(lines)} lines")
        self.applied = not any(ln.strip().startswith("no ") for ln in lines) or self.applied
        if emit:
            emit(dev.name, "cmd", f"{dev.name}(config)#{lines[0]}")
        return "ok"


async def collect(run_id: str) -> list[dict]:
    q = events.subscribe(run_id)
    out = []
    while True:
        msg = await asyncio.wait_for(q.get(), timeout=20)
        if msg is None:
            return out
        out.append(msg)


async def wait_done(run_id: str) -> dict:
    for _ in range(400):
        if scenarios.RUNS[run_id]["state"] != "running":
            return scenarios.RUNS[run_id]
        await asyncio.sleep(0.05)
    raise AssertionError("run did not finish")


def steps_of(evts: list[dict]) -> dict[str, str]:
    st: dict[str, str] = {}
    for e in evts:
        if e["event"] == "step":
            st[e["data"]["id"]] = e["data"]["status"]
    return st


async def scenario_main() -> None:
    fake = Fake()
    fake.install()
    ctxs = labmgr.contexts()
    labmgr.ACTIVE = ctxs["shared"]
    labmgr.STATUS.update(running=True, phase="idle")

    # 1. run a scenario of another lab: the shared lab is stopped, the target started and set up, the scenario runs
    ctx = ctxs["05_med"]
    sc = scenarios.get_scenario("05_med", ctx)
    run_id = scenarios.run_scenario("05_med", False, ctx, switch=True)
    assert labmgr.CURRENT == run_id
    try:
        scenarios.run_scenario("05_med", False, ctx, switch=True)
        raise AssertionError("a second run should be refused while one is in progress")
    except RuntimeError as exc:
        assert "in progress" in str(exc)
    evts = await collect(run_id)
    run = await wait_done(run_id)
    st = steps_of(evts)
    print("steps:", st)
    assert st["stop"] == "done" and st["start"] == "done" and st["prepare"] == "skipped" or st["prepare"] == "done"
    assert fake.log[0] == "stop shared" and "start 05_med" in fake.log
    assert labmgr.ACTIVE.id == "05_med" and labmgr.STATUS["running"] and labmgr.STATUS["phase"] == "idle"
    assert st["apply"] == "done" and st["verify"] in ("done", "error")
    assert any(e["event"] == "cli" for e in evts), "no CLI transcript events"
    assert any(e["event"] == "plan" for e in evts)
    assert evts[-1]["event"] == "result" or any(e["event"] == "result" for e in evts)
    assert "05_med" in labmgr.state["applied"] and "05_med" in labmgr.state["applied"]["05_med"]
    assert labmgr.state["prepared"].get("05_med"), "the lab should be marked prepared"
    assert run["lab"] == "05_med" and run["state"] in ("passed", "failed")
    assert labmgr.CURRENT is None, "the lock must be released"

    # 2. a late subscriber still gets the whole stream
    late = await collect(run_id)
    assert len(late) == len(evts), (len(late), len(evts))

    # 3. running again on the same lab does not stop or start anything
    fake.log.clear()
    rid = scenarios.run_scenario("05_med", True, ctx, switch=True)
    ev2 = await collect(rid)
    await wait_done(rid)
    st2 = steps_of(ev2)
    assert st2["stop"] == st2["start"] == st2["prepare"] == "skipped", st2
    assert not [x for x in fake.log if x.startswith(("stop", "start"))]
    assert "05_med" not in labmgr.state["applied"].get("05_med", []), "a rollback clears the applied mark"

    # 4. leaving a lab with a scenario still applied rolls it back first
    rid = scenarios.run_scenario("05_med", False, ctx, switch=True)
    await collect(rid)
    await wait_done(rid)
    assert "05_med" in labmgr.state["applied"]["05_med"]
    fake.log.clear()
    other = ctxs["12_mpls_l3vpn"]
    aid = labmgr.activate_job(other)
    ev3 = await collect(aid)
    st3 = steps_of(ev3)
    assert st3["cleanup"] == "done", st3
    assert any(x.startswith("push") for x in fake.log[:3]) and "stop 05_med" in fake.log and "start 12_mpls_l3vpn" in fake.log
    assert labmgr.state["applied"]["05_med"] == []
    assert labmgr.ACTIVE.id == "12_mpls_l3vpn"

    # 5. a lab that was never configured is bootstrapped and gets its baseline
    fake.log.clear()
    labmgr.state["prepared"].pop("13_mpls_overlap", None)
    fake_conf = fake.configured
    fake.configured = set()
    ev4 = await collect(labmgr.activate_job(ctxs["13_mpls_overlap"]))
    st4 = steps_of(ev4)
    print("steps unprepared:", st4)
    assert st4["baseline"] == "done" and any(x.startswith("baseline 13_mpls_overlap") for x in fake.log)

    # 5b. another lab answering on one of the addresses: the switch is refused before anything is started
    fake.log.clear()
    fake.conflicts = ["192.168.99.111 is answered by 'R1' (this lab expects DC-EAST)"]
    fake.running.clear()
    labmgr.ACTIVE = ctxs["shared"]
    rid = scenarios.run_scenario("05_med", False, ctxs["05_med"], switch=True)
    ev6 = await collect(rid)
    run6 = await wait_done(rid)
    assert run6["state"] == "error" and "R1" in run6["error"] and "OSPF" in run6["error"], run6
    assert not [x for x in fake.log if x.startswith(("start", "baseline", "push", "bootstrap"))], fake.log
    fake.conflicts = []

    # 6. a failing step ends the run in error and releases the lock
    def boom(ctx, emit):
        raise RuntimeError("EVE said no")

    labmgr.start_lab = boom
    fake.running.clear()
    labmgr.ACTIVE = ctxs["shared"]
    rid = scenarios.run_scenario("01_weight", False, ctxs["01_weight"], switch=True)
    ev5 = await collect(rid)
    run5 = await wait_done(rid)
    assert run5["state"] == "error" and "EVE said no" in run5["error"], run5
    assert steps_of(ev5)["start"] == "error" or "start" in steps_of(ev5)
    assert labmgr.CURRENT is None and labmgr.STATUS["phase"] == "idle"
    print("flow test OK")


def test_flow() -> None:
    asyncio.run(scenario_main())


if __name__ == "__main__":
    test_flow()

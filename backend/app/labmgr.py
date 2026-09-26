"""Lab registry and the lab switch workflow.

The dashboard used to be tied to one lab through fixed paths. A LabContext now describes any lab (the shared
8-router lab or one of labs/<NN_topic>/): its inventory, baseline configs, scenarios, templates and EVE path.
`ACTIVE` is the context the dashboard talks to. `ensure_active()` makes another lab the active one:

    roll back what a previous run left applied -> stop the running lab -> start the target's routers ->
    wait for SSH -> first-time setup if the lab was never configured -> check the baseline -> wait for BGP

EVE-NG can run only one of these labs at a time on this VM (node ids collide and RAM is 8 GB), so switching
always stops the running lab first. Scripts (labs/labtool.sh) never use this module's workflow: they run with
the environment variables and the context built from them (see `_env_context`)."""
from __future__ import annotations

import asyncio
import importlib
import json
import logging
import re
import socket
import sys
import time
import uuid
import zipfile
import io
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import yaml

from . import events
from .config import (BASE_DIR, BASELINE_DIR, INVENTORY_PATH, LABS_DIR, RUNS_DIR, SCENARIO_DIR, TEMPLATE_DIR, settings)
from .eveng import EveNGClient, EveNGError

log = logging.getLogger("bgp.labmgr")

SHARED_ID = "shared"
MPLS_NAMES = {"12_mpls_l3vpn": "L3VPN basics", "13_mpls_overlap": "Overlapping addresses", "14_mpls_shared_services": "Shared services",
              "15_mpls_hub_spoke": "Hub and spoke", "16_mpls_vpnv4_rr": "VPNv4 route reflector", "17_mpls_as_override": "Same customer AS"}
SHARED_EVE_PATH = "/bgp-attributes.unl"
_LAB_DIR = re.compile(r"\d{2}_[a-z0-9_]+")
CTX_ID = re.compile(r"shared|\d{2}_[a-z0-9_]+")           # ids the API accepts


# ------------------------------------------------------------------ contexts
@dataclass(frozen=True)
class LabContext:
    id: str
    title: str
    group: str                # shared | attributes | mpls | env
    inventory: Path
    baseline: Path
    scenarios: Path
    templates: Path
    eve_path: str
    unl: Path | None = None

    def load_inventory(self) -> dict:
        return yaml.safe_load(self.inventory.read_text(encoding="utf-8"))

    @property
    def routers(self) -> int:
        return len(self.load_inventory().get("devices", {}))

    @property
    def short(self) -> str:
        """A short name for menus: 'WEIGHT', 'LOCAL PREF', 'L3VPN basics', 'Shared 8-router lab'."""
        if self.id in MPLS_NAMES:
            return MPLS_NAMES[self.id]
        if _LAB_DIR.fullmatch(self.id):
            return self.id.split("_", 1)[1].replace("_", " ").upper()
        return self.title.split(",")[0].strip()


def _lab_title(inv_path: Path, fallback: str) -> str:
    for ln in inv_path.read_text(encoding="utf-8").splitlines():
        if ln.startswith("# Lab"):
            return ln.split(":", 1)[-1].strip().rstrip(".")
    return fallback


def shared_context() -> LabContext:
    return LabContext(SHARED_ID, "Shared 8-router lab", "shared", INVENTORY_PATH, BASELINE_DIR, SCENARIO_DIR,
                      TEMPLATE_DIR, SHARED_EVE_PATH, LABS_DIR / "bgp-attributes.unl")


def lab_contexts() -> dict[str, LabContext]:
    out: dict[str, LabContext] = {}
    if LABS_DIR.is_dir():
        for p in sorted(LABS_DIR.iterdir()):
            if p.is_dir() and _LAB_DIR.fullmatch(p.name) and (p / "inventory.yaml").is_file() and (p / "baseline").is_dir():
                out[p.name] = LabContext(p.name, _lab_title(p / "inventory.yaml", p.name),
                                         "mpls" if int(p.name[:2]) >= 12 else "attributes",
                                         p / "inventory.yaml", p / "baseline", p / "scenarios", p / "templates",
                                         f"/{p.name}.unl", p / f"{p.name}.unl")
    return out


def contexts() -> dict[str, LabContext]:
    """Every lab the dashboard can run, in menu order: attribute labs, MPLS labs, then the shared lab."""
    out = lab_contexts()
    out[SHARED_ID] = shared_context()
    return out


def get_context(ctx_id: str) -> LabContext:
    ctxs = contexts()
    if ctx_id not in ctxs:
        raise KeyError(ctx_id)
    return ctxs[ctx_id]


def _env_context() -> LabContext:
    """The lab this process is configured for by environment variables (the dashboard: the shared lab; labtool
    containers: the lab folder they were pointed at)."""
    if settings.lab_path == SHARED_EVE_PATH:
        return shared_context()
    stem = Path(settings.lab_path).stem
    return LabContext(stem, stem, "env", INVENTORY_PATH, BASELINE_DIR, SCENARIO_DIR, TEMPLATE_DIR, settings.lab_path)


ACTIVE: LabContext = _env_context()


# ------------------------------------------------------------------ state
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


STATE_FILE = RUNS_DIR / "labstate.json"


def _load_state() -> dict:
    try:
        d = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    d.setdefault("prepared", {})          # lab id -> when it was last found configured
    d.setdefault("applied", {})           # lab id -> scenario ids applied and not yet rolled back
    d.setdefault("active", None)          # the lab that was last made active (EVE-NG cannot tell which lab is really running)
    return d


state = _load_state()


def _save_state() -> None:
    try:
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except OSError:
        log.warning("could not save %s", STATE_FILE)


STATUS: dict = {"phase": "idle", "running": True, "detail": "", "since": _now()}


def monitorable() -> bool:
    """The session monitor polls only a running lab that is not being switched."""
    return STATUS["phase"] == "idle" and STATUS["running"]


def mark_applied(ctx_id: str, sid: str, applied: bool) -> None:
    lst = state["applied"].setdefault(ctx_id, [])
    if applied and sid not in lst:
        lst.append(sid)
    if not applied and sid in lst:
        lst.remove(sid)
    _save_state()


def status_dict() -> dict:
    return {"active": ACTIVE.id, "title": ACTIVE.title, "group": ACTIVE.group, **STATUS,
            "applied": state["applied"], "prepared": state["prepared"], "busy": CURRENT}


# ------------------------------------------------------------------ runs and progress events
RUNS: dict[str, dict] = {}
LOCK = asyncio.Lock()             # one run or lab switch at a time
CURRENT: str | None = None        # run id that owns the lock (set synchronously when a run is accepted)

ACT_STEPS = [
    ("cleanup", "Roll back what is still applied"),
    ("stop", "Stop the running lab"),
    ("start", "Start the routers"),
    ("boot", "Wait for the routers"),
    ("prepare", "First-time setup"),
    ("baseline", "Check the baseline"),
    ("converge", "Wait for BGP"),
]


class Emitter:
    """Sends progress and CLI events of one run to its SSE stream. Safe to call from any thread."""

    def __init__(self, run_id: str, loop: asyncio.AbstractEventLoop) -> None:
        self.run_id, self.loop = run_id, loop

    def _pub(self, event: str, data) -> None:
        try:
            on_loop = asyncio.get_running_loop() is self.loop
        except RuntimeError:
            on_loop = False
        if on_loop:                       # publish now: a deferred call could arrive after the run's end marker
            events.publish(self.run_id, event, data)
        else:
            self.loop.call_soon_threadsafe(events.publish, self.run_id, event, data)

    def log(self, text: str) -> None:
        self._pub("log", text)

    def plan(self, steps: list[tuple[str, str]]) -> None:
        self._pub("plan", [{"id": i, "label": t} for i, t in steps])

    def step(self, sid: str, status: str, detail: str = "") -> None:
        self._pub("step", {"id": sid, "status": status, "detail": detail, "ts": _now()})

    def cli(self, router: str, kind: str, text: str) -> None:
        self._pub("cli", {"router": router, "kind": kind, "text": text, "ts": _now()})


class SubEmitter(Emitter):
    """Reports the steps of one lab activation as a single step of a bigger job (prewarm)."""

    def __init__(self, parent: Emitter, step_id: str, label: str) -> None:
        super().__init__(parent.run_id, parent.loop)
        self.parent, self.step_id, self.label = parent, step_id, label

    def plan(self, steps) -> None:                       # the parent already has its own plan
        pass

    def step(self, sid: str, status: str, detail: str = "") -> None:
        if status in ("running", "error"):
            self.parent.step(self.step_id, "running" if status == "running" else "error", f"{self.label}: {sid} {detail}".strip())


# ------------------------------------------------------------------ EVE helpers (blocking; call through to_thread)
_eve: EveNGClient | None = None


def eve() -> EveNGClient:
    global _eve
    if _eve is None:
        _eve = EveNGClient()
    return _eve


def node_status(ctx: LabContext) -> dict[str, dict]:
    """name -> {id, status, console_host, console_port}; empty if the lab is not in EVE."""
    try:
        return eve().enrich(ctx.eve_path)
    except Exception as exc:                                  # not in EVE-NG, or EVE-NG unreachable (httpx errors)
        log.debug("no node status for %s: %s", ctx.id, exc)
        return {}


def _running(nodes: dict[str, dict]) -> int:
    return sum(1 for v in nodes.values() if v["status"] != "stopped")


def stop_lab(ctx: LabContext, emit: Emitter, timeout: int = 150) -> None:
    e = eve()
    nodes = node_status(ctx)
    for name, v in sorted(nodes.items(), key=lambda kv: int(kv[1]["id"])):
        if v["status"] != "stopped":
            e.stop_node(v["id"], ctx.eve_path)
            emit.log(f"stop {ctx.id} / {name}")
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _running(node_status(ctx)) == 0:
            return
        time.sleep(3)
    raise RuntimeError(f"lab {ctx.id} did not stop within {timeout} s")


def stop_running(target_id: str, emit: Emitter) -> list[str]:
    """Stop whatever lab is really running, except `target_id`. Returns the ids of the labs that were stopped.

    EVE-NG keys a running router by its tenant and node id, so it reports the nodes of EVERY lab with the same ids as
    'running' while one lab runs, and a stop sent through the wrong lab does nothing. The lab that was made active last
    is tried first; the others only if something is still running afterwards."""
    stopped: list[str] = []
    tried: set[str] = set()
    for _ in range(6):
        cands = [c for c in contexts().values() if c.id != target_id and c.id not in tried and _running(node_status(c)) > 0]
        if not cands:
            break
        cands.sort(key=lambda c: (c.id != ACTIVE.id, -len(node_status(c))))
        c = cands[0]
        tried.add(c.id)
        try:
            stop_lab(c, emit, 150 if c.id == ACTIVE.id else 45)
            stopped.append(c.id)
        except RuntimeError as exc:
            emit.log(f"{exc}")
    left = [c.id for c in contexts().values() if c.id != target_id and _running(node_status(c)) > 0]
    if left:
        raise RuntimeError("could not stop the running lab (EVE-NG still reports " + ", ".join(left[:4]) + " running); stop it in EVE-NG or with labtool.sh")
    return stopped


def _lab_zip(ctx: LabContext) -> bytes:
    if ctx.unl is None or not ctx.unl.is_file():
        raise RuntimeError(f"lab {ctx.id} is not in EVE-NG and there is no .unl to import")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(ctx.unl, arcname=ctx.unl.name)
    return buf.getvalue()


def start_lab(ctx: LabContext, emit: Emitter) -> None:
    e = eve()
    if not e.lab_exists(ctx.eve_path):
        emit.log(f"{ctx.id} is not in EVE-NG yet: importing {ctx.unl.name if ctx.unl else ''}")
        e.import_lab(ctx.unl.stem + ".zip", _lab_zip(ctx))
    nodes = node_status(ctx)
    if not nodes:
        raise RuntimeError(f"EVE-NG has no nodes for {ctx.eve_path}")
    for name, v in sorted(nodes.items(), key=lambda kv: int(kv[1]["id"])):
        if v["status"] == "stopped":
            e.start_node(v["id"], ctx.eve_path)
            emit.log(f"start {ctx.id} / {name}")
            time.sleep(2)
    deadline = time.time() + 90
    while time.time() < deadline:
        if all(v["status"] != "stopped" for v in node_status(ctx).values()):
            return
        time.sleep(3)
    raise RuntimeError("some routers did not start within 90 s")


def _ssh_open(ip: str) -> bool:
    try:
        socket.create_connection((ip, 22), 3).close()
        return True
    except OSError:
        return False


def _is_lab(ctx: LabContext, count: int = 2) -> bool:
    """True if the first routers of `ctx` answer on SSH and carry the names from its inventory."""
    from . import devices as dev_mod
    from .inventory import build_devices

    ok = 0
    for dev in list(build_devices(None, ctx).values())[:count]:
        try:
            out = dev_mod.show(dev, "show running-config | include ^hostname")
        except Exception:  # noqa: BLE001
            return False
        ok += f"hostname {dev.name}" in out
    return ok == count


def whoami(dev) -> str | None:
    """The hostname that answers on this router's management address, or None if nothing (usable) answers."""
    from netmiko import ConnectHandler

    from . import devices as dev_mod

    if not _ssh_open(dev.mgmt_ip):
        return None
    try:
        c = ConnectHandler(**dev_mod._ssh_params(dev))
    except Exception:  # noqa: BLE001
        return "?"                                        # something answers but we cannot log in
    try:
        return (c.base_prompt or "").strip()
    finally:
        c.disconnect()


def _ours(dev) -> bool:
    got = whoami(dev)
    return bool(got) and got.lower() == dev.name.lower()


async def wait_ssh(devices: dict, emit: Emitter, step: str, timeout: int) -> set[str]:
    """Wait until the routers accept SSH AND answer with their own hostname. Returns the names that do when time runs
    out or all do. An address answered by another router is reported, never used."""
    t0 = time.time()
    reachable: set[str] = set()
    foreign: dict[str, str] = {}
    while True:
        pending = [d for n, d in devices.items() if n not in reachable]
        res = await asyncio.gather(*(asyncio.to_thread(whoami, d) for d in pending))
        for d, got in zip(pending, res):
            if got and got.lower() == d.name.lower():
                reachable.add(d.name)
                foreign.pop(d.name, None)
            elif got:
                foreign[d.name] = got
        note = "".join(f"; {devices[n].mgmt_ip} answers as '{g}', not {n}" for n, g in foreign.items())
        emit.step(step, "running", f"{len(reachable)}/{len(devices)} routers answer on SSH ({int(time.time() - t0)} s){note}")
        if len(reachable) == len(devices) or time.time() - t0 > timeout:
            return reachable
        await asyncio.sleep(10)


def find_conflicts(devices: dict) -> list[str]:
    """Management addresses of this lab that another router already answers on (called while this lab is stopped)."""
    out = []
    for d in devices.values():
        got = whoami(d)
        if got and got.lower() != d.name.lower():
            out.append(f"{d.mgmt_ip} is answered by '{got}' (this lab expects {d.name})")
    return out


# ------------------------------------------------------------------ first-time setup and baseline
def _bootstrap_module():
    p = str(BASE_DIR / "scripts")
    if p not in sys.path:
        sys.path.insert(0, p)
    return importlib.import_module("bootstrap")


_SEM = None


async def _limited(coro_fn, *a):
    global _SEM
    if _SEM is None:
        _SEM = asyncio.Semaphore(2)                  # the c7200s are CPU-bound: a couple of routers at a time
    async with _SEM:
        return await asyncio.to_thread(coro_fn, *a)


def _marker(ctx: LabContext, name: str) -> str:
    """A line the baseline config of this router must have in the running config."""
    cfg = ctx.baseline / f"{name}.cfg"
    if cfg.is_file():
        for ln in cfg.read_text(encoding="utf-8").splitlines():
            if re.match(r"^router (bgp|ospf) \d+", ln):
                return ln.strip()
    return f"hostname {name}"


def _check_one(dev, ctx: LabContext) -> bool:
    from . import devices as dev_mod

    marker = _marker(ctx, dev.name)
    key = "^" + marker.split()[0] + " " if marker.startswith("router") else "^hostname"
    try:
        out = dev_mod.show(dev, f"show running-config | include {key}")
    except Exception:  # noqa: BLE001
        return False
    return marker in out


async def bootstrap_devices(ctx: LabContext, devices: dict, names: list[str], emit: Emitter) -> None:
    bs = _bootstrap_module()
    gw = ctx.load_inventory().get("defaults", {}).get("mgmt_gateway", "192.168.99.1")

    def one(name: str) -> None:
        emit.cli(name, "info", f"console setup of {name}: hostname, user, SSH key, management address")
        try:
            bs.bootstrap_one(devices[name], gw)
            emit.cli(name, "out", "console setup done")
        except Exception as exc:  # noqa: BLE001   # the console prompt can time out while the router is fine; SSH decides
            emit.cli(name, "err", f"console setup reported: {str(exc).splitlines()[0][:160]}")

    await asyncio.gather(*(_limited(one, n) for n in names))


def retry(fn, tries: int, on_fail=None, pause: float = 15):
    """Call fn(); on an exception try again (a busy VM makes the emulated routers answer slowly). The last error is raised.
    A WrongDevice error is never retried: it means another router holds the address."""
    from .devices import WrongDevice

    for n in range(1, tries + 1):
        try:
            return fn()
        except WrongDevice:
            raise
        except Exception as exc:  # noqa: BLE001
            if n == tries:
                raise
            if on_fail:
                on_fail(n, exc)
            time.sleep(pause)


async def push_baselines(ctx: LabContext, devices: dict, names: list[str], emit: Emitter) -> None:
    from . import devices as dev_mod

    def one(name: str) -> None:
        cfg = ctx.baseline / f"{name}.cfg"
        if cfg.is_file():
            retry(lambda: dev_mod.push_file(devices[name], str(cfg), emit=emit.cli), 3,
                  lambda n, exc: emit.cli(name, "info", f"attempt {n} failed ({str(exc).splitlines()[0][:80] if str(exc) else type(exc).__name__}), trying again"))

    results = await asyncio.gather(*(_limited(one, n) for n in names), return_exceptions=True)
    bad = [f"{n}: {r}" for n, r in zip(names, results) if isinstance(r, Exception)]
    if bad:
        raise RuntimeError("baseline push failed on " + "; ".join(bad)[:400])


async def check_baseline(ctx: LabContext, devices: dict) -> list[str]:
    """Names of the routers whose running config does not have the baseline's router section."""
    res = await asyncio.gather(*(_limited(_check_one, d, ctx) for d in devices.values()))
    return [d.name for d, ok in zip(devices.values(), res) if not ok]


def _bgp_rows(dev) -> tuple[int, int]:
    from . import devices as dev_mod
    from . import monitor

    out = dev_mod.show_many(dev, ["show ip bgp summary", "show bgp vpnv4 unicast all summary"])
    rows = [r for o in out.values() for r in monitor.parse_summary(o)]
    return sum(1 for r in rows if r["established"]), len(rows)


def expected_sessions(ctx: LabContext) -> int:
    """How many BGP neighbor rows the routers of this lab list in total (each session is listed by both ends)."""
    from . import graph

    total = 0
    for cfg in ctx.baseline.glob("*.cfg"):
        total += len(graph._parse_baseline(cfg.read_text(encoding="utf-8"))["remote"])
    return total


async def converge(devices: dict, emit: Emitter, timeout: int = 300, expected: int = 0) -> None:
    """Wait until every router answers and every configured BGP session is established."""
    t0 = time.time()
    while True:
        res = await asyncio.gather(*(_limited(_bgp_rows, d) for d in devices.values()), return_exceptions=True)
        failed = sum(isinstance(r, Exception) for r in res)
        est = sum(r[0] for r in res if not isinstance(r, Exception))
        tot = sum(r[1] for r in res if not isinstance(r, Exception))
        emit.step("converge", "running", f"{est}/{max(tot, expected)} BGP sessions established ({int(time.time() - t0)} s)"
                  + (f", {failed} router(s) not answering" if failed else ""))
        if failed == 0 and tot >= expected and est == tot and (tot > 0 or expected == 0):
            return
        if time.time() - t0 > timeout:
            emit.log(f"warning: {max(tot, expected) - est} BGP session(s) still not established after {timeout} s, continuing")
            return
        await asyncio.sleep(10)


# ------------------------------------------------------------------ switching
async def _cleanup_applied(ctx: LabContext, emit: Emitter) -> None:
    """Roll back scenarios that a previous run left applied, so the lab is at its baseline when it is stopped."""
    from . import devices as dev_mod
    from . import scenarios
    from .inventory import build_devices

    devices = await asyncio.to_thread(build_devices, None, ctx)
    for sid in list(state["applied"].get(ctx.id, [])):
        try:
            sc = scenarios.get_scenario(sid, ctx)
            lines = scenarios.render(sc, True, ctx)
            for tgt in sc["targets"]:
                emit.log(f"rolling back {ctx.id}/{sid} on {tgt}")
                await asyncio.to_thread(dev_mod.push_config, devices[tgt], lines, True, emit.cli)
            mark_applied(ctx.id, sid, False)
        except Exception as exc:  # noqa: BLE001
            emit.log(f"could not roll back {sid}: {exc}")


async def refresh_status() -> None:
    nodes = await asyncio.to_thread(node_status, ACTIVE)
    STATUS.update(running=_running(nodes) > 0, phase="idle", detail="")


async def ensure_active(ctx: LabContext, emit: Emitter, force_prepare: bool = False) -> None:
    """Make `ctx` the running, configured, converged lab. Steps that are not needed are reported as skipped."""
    global ACTIVE
    from . import monitor
    from .inventory import build_devices

    already = ACTIVE.id == ctx.id
    nodes = await asyncio.to_thread(node_status, ctx)
    all_up = already and bool(nodes) and all(v["status"] != "stopped" for v in nodes.values())    # another lab's nodes may look 'running'
    if all_up and STATUS["running"] and STATUS["phase"] == "idle" and not force_prepare and await asyncio.to_thread(_is_lab, ctx):
        for sid, _ in ACT_STEPS:                       # nothing to do: this lab is the running one
            emit.step(sid, "skipped", "already active")
        return
    STATUS.update(phase="switching", detail=f"activating {ctx.id}", since=_now())
    try:

        # 1. leftovers of the lab that is being left
        prev = ACTIVE
        if not already and STATUS["running"] and state["applied"].get(prev.id):
            emit.step("cleanup", "running", f"rolling back {', '.join(state['applied'][prev.id])} on {prev.id}")
            await _cleanup_applied(prev, emit)
            emit.step("cleanup", "done")
        else:
            emit.step("cleanup", "skipped", "nothing applied")

        # 2. stop the lab that is running (unless it is the target itself)
        if not already:
            emit.step("stop", "running", f"stopping {ACTIVE.id}")
            stopped = await asyncio.to_thread(stop_running, ctx.id, emit)
            emit.step("stop", "done" if stopped else "skipped", ", ".join(stopped) or "no other lab is running")
        else:
            emit.step("stop", "skipped", "this lab is already the active one")

        # 3. start the target (never while another router already uses one of its management addresses)
        if not already:
            clash = await asyncio.to_thread(lambda: find_conflicts(build_devices(None, ctx)))
            if clash:
                raise RuntimeError("cannot start " + ctx.id + ": " + "; ".join(clash[:4]) + ". Another lab on the same management network "
                                   "(for example the OSPF project) is running with the same addresses: stop it, or give one of the labs different "
                                   "management addresses. Nothing was sent to those routers.")
        nodes = await asyncio.to_thread(node_status, ctx)
        if already and nodes and all(v["status"] != "stopped" for v in nodes.values()):
            emit.step("start", "skipped", f"{ctx.id} is already running")
        else:
            emit.step("start", "running", f"{len(nodes) or ctx.routers} routers")
            await asyncio.to_thread(start_lab, ctx, emit)
            emit.step("start", "done")
        ACTIVE = ctx                                    # its routers are running now, whatever happens next
        state["active"] = ctx.id
        _save_state()
        devices = await asyncio.to_thread(build_devices, eve(), ctx)          # console ports exist now

        # 4. wait for SSH
        prepared = ctx.id in state["prepared"] and not force_prepare
        emit.step("boot", "running", "waiting for SSH")
        reachable = await wait_ssh(devices, emit, "boot", 600 if prepared else 200)
        missing = [n for n in devices if n not in reachable]
        emit.step("boot", "done", f"{len(reachable)}/{len(devices)} routers reachable")

        # 5. first-time setup for routers with no SSH (a lab never configured under this account starts blank)
        if missing or force_prepare:
            emit.step("prepare", "running", f"console setup of {', '.join(missing or devices)}")
            for attempt in (1, 2):
                await bootstrap_devices(ctx, devices, missing or list(devices), emit)
                reachable = await wait_ssh(devices, emit, "prepare", 300)
                missing = [n for n in devices if n not in reachable]
                if not missing:
                    break
                emit.log(f"still no SSH on {', '.join(missing)}: retrying the console setup")
            if missing:
                raise RuntimeError(f"no SSH on {', '.join(missing)} after the console setup")
            emit.step("prepare", "running", "pushing the baseline to every router")
            await push_baselines(ctx, devices, list(devices), emit)
            emit.step("prepare", "done")
        else:
            emit.step("prepare", "skipped", "already configured")

        # 6. the baseline must really be on the routers
        emit.step("baseline", "running", "checking the router configurations")
        bad = await check_baseline(ctx, devices)
        if bad:
            emit.log(f"baseline missing on {', '.join(bad)}: pushing it")
            await push_baselines(ctx, devices, bad, emit)
            bad = await check_baseline(ctx, devices)
            if bad:
                raise RuntimeError(f"baseline still missing on {', '.join(bad)}")
        emit.step("baseline", "done", "every router has its baseline")
        state["prepared"][ctx.id] = _now()
        _save_state()

        # 7. BGP up
        emit.step("converge", "running", "waiting for the BGP sessions")
        await converge(devices, emit, expected=await asyncio.to_thread(expected_sessions, ctx))
        emit.step("converge", "done")

        ACTIVE = ctx
        state["active"] = ctx.id
        _save_state()
        monitor.reset()
        STATUS.update(phase="idle", running=True, detail="", since=_now())
    except BaseException:
        await refresh_status()
        raise


# ------------------------------------------------------------------ detection at startup
def detect_active() -> None:
    """Find out which lab is really running (called once at startup, in a thread).

    EVE-NG reports the nodes of several labs as running when their node ids match, so the lab that was made active
    last is trusted first and every candidate is confirmed by the router names on SSH."""
    global ACTIVE
    try:
        cands = []
        for c in contexts().values():
            n = _running(node_status(c))
            if n:
                cands.append((c, n))
        if not cands:
            saved = state.get("active")
            if saved in contexts():
                ACTIVE = contexts()[saved]
            STATUS.update(running=False, phase="idle")
            return
        cands.sort(key=lambda cn: (cn[0].id != state.get("active"), -cn[1]))
        for c, _ in cands:
            if _is_lab(c):
                ACTIVE = c
                STATUS.update(running=True, phase="idle")
                return
        STATUS.update(running=False, phase="idle")           # routers are up but do not answer yet
    except Exception as exc:  # noqa: BLE001
        log.warning("could not detect the running lab: %s", exc)


# ------------------------------------------------------------------ jobs (activate, prepare, prewarm)
def start_job(kind: str, lab: str, work, run_id: str | None = None, record: dict | None = None) -> str:
    """Run `await work(emit)` as the one locked background job (activation, prepare, prewarm, scenario run).

    Raises RuntimeError if another job is in progress. `work` may set RUNS[run_id]["state"] itself (a scenario run
    ends 'passed' or 'failed'); otherwise the job ends 'done', or 'error' if `work` raises."""
    global CURRENT
    if CURRENT is not None:
        raise RuntimeError(f"another run is in progress ({CURRENT})")
    run_id = run_id or f"{kind}-{lab}-{uuid.uuid4().hex[:8]}"
    RUNS[run_id] = record or {"run_id": run_id, "scenario": kind, "lab": lab, "mode": kind, "state": "running", "started": _now()}
    CURRENT = run_id
    loop = asyncio.get_running_loop()

    async def _worker() -> None:
        global CURRENT
        emit = Emitter(run_id, loop)
        t0 = time.time()
        try:
            async with LOCK:
                await work(emit)
            if RUNS[run_id]["state"] == "running":
                RUNS[run_id]["state"] = "done"
        except Exception as exc:  # noqa: BLE001
            RUNS[run_id].update(state="error", error=str(exc))
            emit.log(f"ERROR: {exc}")
        finally:
            RUNS[run_id].setdefault("duration", round(time.time() - t0, 1))
            RUNS[run_id]["finished"] = _now()
            CURRENT = None
            events.publish(run_id, "result", RUNS[run_id]["state"])
            events.done(run_id)

    asyncio.create_task(_worker())
    return run_id


def activate_job(ctx: LabContext, force_prepare: bool = False) -> str:
    async def work(emit: Emitter) -> None:
        emit.plan(ACT_STEPS)
        await ensure_active(ctx, emit, force_prepare)

    return start_job("activate", ctx.id, work)


def prewarm_job(ids: list[str] | None = None, skip_prepared: bool = True) -> str:
    """Bring every lab up once so it is configured and saved: later switches are then just a boot."""
    ctxs = contexts()
    order = [c for c in ctxs.values() if c.id != SHARED_ID] + [ctxs[SHARED_ID]]      # the shared lab last: it stays active
    if ids:
        order = [c for c in order if c.id in ids]

    async def work(emit: Emitter) -> None:
        emit.plan([(f"lab-{c.id}", f"{c.id}  {c.short}") for c in order])
        for c in order:
            if skip_prepared and c.id in state["prepared"] and c.id != SHARED_ID:
                emit.step(f"lab-{c.id}", "skipped", "already configured and saved")
                continue
            sub = SubEmitter(emit, f"lab-{c.id}", c.short)
            emit.step(f"lab-{c.id}", "running", "starting")
            try:
                await ensure_active(c, sub)
                emit.step(f"lab-{c.id}", "done", "configured and saved")
            except Exception as exc:  # noqa: BLE001
                emit.step(f"lab-{c.id}", "error", str(exc)[:200])
                emit.log(f"{c.id}: {exc}")

    return start_job("prewarm", "all", work)

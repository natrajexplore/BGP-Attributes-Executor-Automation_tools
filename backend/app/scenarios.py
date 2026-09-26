from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from . import bus, labmgr, validate
from . import devices as dev_mod
from .config import RUNS_DIR, settings
from .inventory import build_devices, globals_dict

RUNS = labmgr.RUNS

# The steps of a scenario run, as shown by the Live tab.
SC_STEPS = [
    ("before", "Capture the state before"),
    ("apply", "Push the configuration over SSH"),
    ("settle", "Let BGP converge"),
    ("verify", "Verify the result"),
]

_envs: dict[str, Environment] = {}


def _env(ctx) -> Environment:
    key = str(ctx.templates)
    if key not in _envs:
        _envs[key] = Environment(loader=FileSystemLoader(key), undefined=StrictUndefined,
                                 trim_blocks=True, lstrip_blocks=True)
    return _envs[key]


# -- scenario catalogue --------------------------------------------------
def list_scenarios(ctx=None) -> list[dict]:
    ctx = ctx or labmgr.ACTIVE
    out = []
    for p in sorted(ctx.scenarios.glob("*.yaml")):
        sc = yaml.safe_load(p.read_text(encoding="utf-8"))
        sc["id"] = p.stem
        out.append(sc)
    return out


def get_scenario(sid: str, ctx=None) -> dict:
    ctx = ctx or labmgr.ACTIVE
    p = ctx.scenarios / f"{sid}.yaml"
    if not p.exists():
        raise FileNotFoundError(sid)
    sc = yaml.safe_load(p.read_text(encoding="utf-8"))
    sc["id"] = sid
    return sc


def verify_for(sc: dict, rollback: bool) -> list[dict]:
    """Apply runs `verify`. Rollback runs `rollback_verify` if the scenario defines
    it, else the inverse of `verify` (expected -> forbidden, forbidden -> expected)."""
    if not rollback:
        return sc.get("verify", [])
    if "rollback_verify" in sc:
        return sc["rollback_verify"]
    inverse = []
    for v in sc.get("verify", []):
        item = {"device": v["device"], "command": v["command"]}
        if v.get("expect_regex"):
            item["must_not_match"] = v["expect_regex"]
        if v.get("must_not_match"):
            item["expect_regex"] = v["must_not_match"]
        inverse.append(item)
    return inverse


def render(sc: dict, rollback: bool, ctx=None) -> list[str]:
    ctx = ctx or labmgr.ACTIVE
    variables = {**globals_dict(ctx), **sc.get("vars", {}), "rollback": rollback}
    text = _env(ctx).get_template(sc["template"]).render(**variables)
    return [ln.rstrip() for ln in text.splitlines() if ln.strip()]


def _emit_config_event(run: dict, attribute: str | None, targets: list[str]) -> None:
    bus.emit(settings.topic_config, run["scenario"], {
        "type": "config_change", "severity": "warning" if run["state"] in ("failed", "error") else "info",
        "run_id": run["run_id"], "scenario": run["scenario"], "lab": run.get("lab"), "attribute": attribute,
        "mode": run["mode"], "result": run["state"], "targets": targets,
        "lines": run.get("config", []), "duration": run.get("duration"), "error": run.get("error"),
    })


# -- execution ---------------------------------------------------------------
async def _capture(emit: labmgr.Emitter, verify: list[dict], devices: dict, phase: str) -> dict[str, str]:
    captured: dict[str, str] = {}
    for v in verify:
        dev = devices[v["device"]]
        key = f"{v['device']} :: {v['command']}"
        emit.log(f"[{phase}] {key}")
        try:
            captured[key] = await asyncio.to_thread(dev_mod.show, dev, v["command"], False, emit.cli)
        except Exception as exc:  # noqa: BLE001
            captured[key] = f"<error: {exc}>"
            emit.log(f"[{phase}] {key} FAILED: {exc}")
            emit.cli(dev.name, "err", f"{v['command']} failed: {exc}")
    return captured


def run_scenario(sid: str, rollback: bool = False, ctx=None, switch: bool = False) -> str:
    """Start a scenario run in the background and return its run id (call from a running event loop).

    ctx: the lab the scenario belongs to (default: the active lab). switch=True first makes that lab the running
    one (stops another lab, starts this one, sets it up if needed), which is what the dashboard does.
    Raises FileNotFoundError for an unknown scenario and RuntimeError if another run is in progress."""
    ctx = ctx or labmgr.ACTIVE
    sc = get_scenario(sid, ctx)
    mode = "rollback" if rollback else "apply"
    run_id = f"{ctx.id}-{sid}-{mode}-{uuid.uuid4().hex[:8]}"
    record = {
        "run_id": run_id, "scenario": sid, "lab": ctx.id, "lab_title": ctx.title, "mode": mode,
        "state": "running", "started": datetime.now(timezone.utc).isoformat(),
    }

    async def work(emit: labmgr.Emitter) -> None:
        t0 = time.time()
        step = "before"
        try:
            emit.plan((labmgr.ACT_STEPS if switch else []) + [(sid_, lb if sid_ != "apply" or not rollback else "Push the rollback over SSH")
                                                             for sid_, lb in SC_STEPS])
            if switch:
                await labmgr.ensure_active(ctx, emit)
            devices = await asyncio.to_thread(build_devices, None, ctx)
            verify = verify_for(sc, rollback)
            targets = sc["targets"]
            lines = render(sc, rollback, ctx)

            emit.log(f"=== [{ctx.id}] {sc['title']} ({mode.upper()}) ===")
            emit.log(f"targets: {', '.join(targets)}")

            step = "before"
            emit.step("before", "running", f"{len(verify)} checks")
            before = await _capture(emit, verify, devices, "before")
            emit.step("before", "done")

            step = "apply"
            emit.step("apply", "running", ", ".join(targets))
            for tgt in targets:
                emit.log(f"--- pushing to {tgt} ---")
                for ln in lines:
                    emit.log(f"  {tgt}| {ln}")
                out = await asyncio.to_thread(dev_mod.push_config, devices[tgt], lines, True, emit.cli)
                emit.log(out.strip())
            labmgr.mark_applied(ctx.id, sid, not rollback)
            emit.step("apply", "done")

            step = "settle"
            if sc.get("soft_clear", True):
                emit.step("settle", "running", "clear ip bgp * soft")
                for tgt in targets:
                    emit.log(f"--- clear ip bgp * soft on {tgt} ---")
                    await asyncio.to_thread(dev_mod.exec_cmd, devices[tgt], "clear ip bgp * soft", emit.cli)
                wait = int(sc.get("settle_seconds", 8))
                for left in range(wait, 0, -1):
                    if left % 3 == 0 or left == wait:
                        emit.step("settle", "running", f"{left} s left")
                    await asyncio.sleep(1)
                emit.step("settle", "done")
            else:
                emit.step("settle", "skipped", "this scenario does not reset the sessions")

            step = "verify"
            emit.step("verify", "running", f"{len(verify)} checks")
            after = await _capture(emit, verify, devices, "after")

            results = validate.evaluate(verify, after)
            for r in results:
                r["diff"] = validate.diff(
                    before.get(f"{r['device']} :: {r['command']}", ""),
                    r["output"], f"{r['device']} {r['command']}",
                )
            passed = all(r["passed"] for r in results) if results else None
            emit.step("verify", "done" if passed in (True, None) else "error",
                      "all checks passed" if passed else "a check failed" if passed is False else "")

            RUNS[run_id].update(
                state="passed" if passed else ("failed" if passed is False else "done"),
                results=results, config=lines, before=before, duration=round(time.time() - t0, 1),
            )
        except Exception as exc:  # noqa: BLE001
            RUNS[run_id].update(state="error", error=str(exc), duration=round(time.time() - t0, 1))
            emit.step(step, "error", str(exc)[:200])
            emit.log(f"ERROR: {exc}")
        finally:
            RUNS[run_id]["finished"] = datetime.now(timezone.utc).isoformat()
            (RUNS_DIR / f"{run_id}.json").write_text(json.dumps(RUNS[run_id], indent=2, default=str), encoding="utf-8")
            _emit_config_event(RUNS[run_id], sc.get("attribute"), sc.get("targets", []))

    return labmgr.start_job(mode, ctx.id, work, run_id=run_id, record=record)


def reset_baseline(nodes: list[str] | None = None, ctx=None) -> str:
    """Push the baseline configs again to every router of the lab (or the named ones)."""
    ctx = ctx or labmgr.ACTIVE

    async def work(emit: labmgr.Emitter) -> None:
        devices = await asyncio.to_thread(build_devices, None, ctx)
        targets = [n for n in (nodes or list(devices)) if n in devices]
        run_id = labmgr.CURRENT
        if run_id:
            RUNS[run_id]["nodes"] = targets
        emit.plan([("baseline", "Push the baseline to " + ", ".join(targets))])
        emit.step("baseline", "running", ", ".join(targets))
        await labmgr.push_baselines(ctx, devices, targets, emit)
        emit.step("baseline", "done")
        _emit_config_event({"run_id": run_id, "scenario": "baseline", "lab": ctx.id, "mode": "reset", "state": "done"}, "baseline", targets)

    return labmgr.start_job("baseline", ctx.id, work)

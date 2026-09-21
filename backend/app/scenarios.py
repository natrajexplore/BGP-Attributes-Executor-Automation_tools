from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from . import devices as dev_mod
from . import bus, validate
from .config import RUNS_DIR, SCENARIO_DIR, TEMPLATE_DIR, settings
from .events import done, publish
from .inventory import build_devices, globals_dict

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)

_run_lock = asyncio.Lock()
RUNS: dict[str, dict] = {}


# -- scenario catalogue --------------------------------------------------
def list_scenarios() -> list[dict]:
    out = []
    for p in sorted(SCENARIO_DIR.glob("*.yaml")):
        sc = yaml.safe_load(p.read_text())
        sc["id"] = p.stem
        out.append(sc)
    return out


def get_scenario(sid: str) -> dict:
    p = SCENARIO_DIR / f"{sid}.yaml"
    if not p.exists():
        raise FileNotFoundError(sid)
    sc = yaml.safe_load(p.read_text())
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


def render(sc: dict, rollback: bool) -> list[str]:
    variables = {**globals_dict(), **sc.get("vars", {}), "rollback": rollback}
    text = _env.get_template(sc["template"]).render(**variables)
    return [ln.rstrip() for ln in text.splitlines() if ln.strip()]


def _emit_config_event(run: dict, attribute: str | None, targets: list[str]) -> None:
    bus.emit(settings.topic_config, run["scenario"], {
        "type": "config_change", "severity": "warning" if run["state"] in ("failed", "error") else "info",
        "run_id": run["run_id"], "scenario": run["scenario"], "attribute": attribute,
        "mode": run["mode"], "result": run["state"], "targets": targets,
        "lines": run.get("config", []), "duration": run.get("duration"), "error": run.get("error"),
    })


# -- execution ---------------------------------------------------------------
async def _capture(run_id: str, verify: list[dict], devices: dict, phase: str) -> dict[str, str]:
    captured: dict[str, str] = {}
    for v in verify:
        dev = devices[v["device"]]
        key = f"{v['device']} :: {v['command']}"
        publish(run_id, "log", f"[{phase}] {key}")
        try:
            captured[key] = await asyncio.to_thread(dev_mod.show, dev, v["command"])
        except Exception as exc:  # noqa: BLE001
            captured[key] = f"<error: {exc}>"
            publish(run_id, "log", f"[{phase}] {key} FAILED: {exc}")
    return captured


async def run_scenario(sid: str, rollback: bool = False) -> str:
    sc = get_scenario(sid)
    run_id = f"{sid}-{'rollback' if rollback else 'apply'}-{uuid.uuid4().hex[:8]}"
    RUNS[run_id] = {
        "run_id": run_id, "scenario": sid, "mode": "rollback" if rollback else "apply",
        "state": "running", "started": datetime.now(timezone.utc).isoformat(),
    }

    async def _worker() -> None:
        t0 = time.time()
        try:
            async with _run_lock:
                devices = build_devices()
                verify = verify_for(sc, rollback)
                targets = sc["targets"]
                lines = render(sc, rollback)

                publish(run_id, "log", f"=== {sc['title']} ({'ROLLBACK' if rollback else 'APPLY'}) ===")
                publish(run_id, "log", f"targets: {', '.join(targets)}")

                before = await _capture(run_id, verify, devices, "before")

                for tgt in targets:
                    publish(run_id, "log", f"--- pushing to {tgt} ---")
                    for ln in lines:
                        publish(run_id, "log", f"  {tgt}| {ln}")
                    out = await asyncio.to_thread(dev_mod.push_config, devices[tgt], lines)
                    publish(run_id, "log", out.strip())

                if sc.get("soft_clear", True):
                    for tgt in targets:
                        publish(run_id, "log", f"--- clear ip bgp * soft on {tgt} ---")
                        await asyncio.to_thread(dev_mod.exec_cmd, devices[tgt], "clear ip bgp * soft")
                    await asyncio.sleep(sc.get("settle_seconds", 8))

                after = await _capture(run_id, verify, devices, "after")

                results = validate.evaluate(verify, after)
                for r in results:
                    r["diff"] = validate.diff(
                        before.get(f"{r['device']} :: {r['command']}", ""),
                        r["output"], f"{r['device']} {r['command']}",
                    )
                passed = all(r["passed"] for r in results) if results else None

                RUNS[run_id].update(
                    state="passed" if passed else ("failed" if passed is False else "done"),
                    results=results, config=lines, before=before,
                    duration=round(time.time() - t0, 1),
                )
                publish(run_id, "result", "passed" if passed else "failed" if passed is False else "done")
        except Exception as exc:  # noqa: BLE001
            RUNS[run_id].update(state="error", error=str(exc), duration=round(time.time() - t0, 1))
            publish(run_id, "log", f"ERROR: {exc}")
            publish(run_id, "result", "error")
        finally:
            RUNS[run_id]["finished"] = datetime.now(timezone.utc).isoformat()
            (RUNS_DIR / f"{run_id}.json").write_text(json.dumps(RUNS[run_id], indent=2, default=str))
            _emit_config_event(RUNS[run_id], sc.get("attribute"), sc.get("targets", []))
            done(run_id)

    asyncio.create_task(_worker())
    return run_id


async def reset_baseline(nodes: list[str] | None = None) -> str:
    from .config import BASELINE_DIR

    run_id = f"baseline-{uuid.uuid4().hex[:8]}"
    RUNS[run_id] = {"run_id": run_id, "scenario": "baseline", "mode": "reset",
                    "state": "running", "started": datetime.now(timezone.utc).isoformat()}

    async def _worker() -> None:
        try:
            async with _run_lock:
                devices = build_devices()
                targets = nodes or list(devices)
                RUNS[run_id]["nodes"] = targets
                for name in targets:
                    cfg = BASELINE_DIR / f"{name}.cfg"
                    if not cfg.exists():
                        publish(run_id, "log", f"skip {name}: no baseline file")
                        continue
                    publish(run_id, "log", f"--- baseline -> {name} ---")
                    out = await asyncio.to_thread(dev_mod.push_file, devices[name], str(cfg))
                    publish(run_id, "log", out.strip())
                RUNS[run_id]["state"] = "done"
                publish(run_id, "result", "done")
        except Exception as exc:  # noqa: BLE001
            RUNS[run_id].update(state="error", error=str(exc))
            publish(run_id, "result", "error")
        finally:
            RUNS[run_id]["finished"] = datetime.now(timezone.utc).isoformat()
            _emit_config_event(RUNS[run_id], "baseline", RUNS[run_id].get("nodes", []))
            done(run_id)

    asyncio.create_task(_worker())
    return run_id

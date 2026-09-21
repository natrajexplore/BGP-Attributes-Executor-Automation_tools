#!/usr/bin/env python
"""Run a scenario, or a read-only show command, against whichever lab BGP_INVENTORY points at.
This is what the per-attribute labs (labs/<NN_attribute>/) use, since they are not served by the dashboard.

    python scripts/run_scenario.py apply    <scenario-id>
    python scripts/run_scenario.py rollback <scenario-id>
    python scripts/run_scenario.py show     <DEVICE> "<show command>"

Use labs/labtool.sh rather than calling this directly: it sets the BGP_* variables for the chosen lab.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import devices as dev_mod            # noqa: E402
from app import scenarios                     # noqa: E402
from app.inventory import build_devices       # noqa: E402


async def run(sid: str, rollback: bool) -> int:
    run_id = await scenarios.run_scenario(sid, rollback=rollback)
    while scenarios.RUNS[run_id]["state"] == "running":
        await asyncio.sleep(1)
    r = scenarios.RUNS[run_id]
    print(f"{r['mode'].upper()} {sid}: {r['state']} in {r.get('duration')}s")
    if r.get("error"):
        print("  error:", r["error"][:400])
    for x in r.get("results", []):
        print(f"  [{'ok ' if x['passed'] else 'BAD'}] {x['device']}: {x['command']} -> {x['reason']}")
    return 0 if r["state"] in ("passed", "done") else 1


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] in ("apply", "rollback"):
        return asyncio.run(run(argv[1], argv[0] == "rollback"))
    if len(argv) == 3 and argv[0] == "show":
        devs = build_devices()
        if argv[1] not in devs:
            print(f"unknown device {argv[1]}; known: {', '.join(devs)}")
            return 2
        print(dev_mod.show(devs[argv[1]], argv[2]))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

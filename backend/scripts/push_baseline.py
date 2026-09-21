#!/usr/bin/env python
"""Push backend/baseline/<NODE>.cfg to routers. Run inside the container:

    docker exec -it bgp-attributes-executor python scripts/push_baseline.py [NODE ...]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import devices as dev_mod            # noqa: E402
from app.config import BASELINE_DIR           # noqa: E402
from app.inventory import build_devices       # noqa: E402


def main(argv: list[str]) -> int:
    devs = build_devices()
    targets = argv or list(devs)
    rc = 0
    for name in targets:
        cfg = BASELINE_DIR / f"{name}.cfg"
        if name not in devs:
            print(f"!! unknown device {name}")
            rc = 1
            continue
        if not cfg.exists():
            print(f"-- {name}: no baseline file, skipped")
            continue
        print(f"== {name}: pushing {cfg.name}")
        try:
            dev_mod.push_file(devs[name], str(cfg))
            print(f"   {name}: OK")
        except Exception as exc:  # noqa: BLE001
            print(f"   {name}: FAILED {exc}")
            rc = 1
    return rc


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

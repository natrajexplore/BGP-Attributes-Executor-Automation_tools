"""The Credentials tab lists every router of every lab and agrees with the baselines."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("BGP_LABS", str(ROOT / "labs"))
os.environ["BGP_RUNS"] = tempfile.mkdtemp()
sys.path.insert(0, str(ROOT / "backend"))

from app import credentials  # noqa: E402


def test_every_router_listed_with_matching_baseline() -> None:
    labs = credentials.all_credentials()
    assert len(labs) == 18
    routers = [r for lab in labs for r in lab["routers"]]
    assert len(routers) == 92
    assert all(r["username"] and r["password"] and r["secret"] for r in routers)
    assert all(r["baseline_match"] is True for r in routers), [r["name"] for r in routers if r["baseline_match"] is not True]


if __name__ == "__main__":
    test_every_router_listed_with_matching_baseline()
    print("credentials test OK")

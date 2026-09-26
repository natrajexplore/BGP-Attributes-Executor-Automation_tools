"""The retry helper used for slow routers: it retries ordinary errors and never retries a wrong-device refusal."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("BGP_LABS", str(ROOT / "labs"))
os.environ["BGP_RUNS"] = tempfile.mkdtemp()
sys.path.insert(0, str(ROOT / "backend"))

from app import labmgr                          # noqa: E402
from app.devices import WrongDevice             # noqa: E402


def test_retries_then_succeeds() -> None:
    calls, seen = [], []

    def fn():
        calls.append(1)
        if len(calls) < 3:
            raise TimeoutError("slow router")
        return "ok"

    assert labmgr.retry(fn, 3, lambda n, e: seen.append(n), pause=0) == "ok"
    assert len(calls) == 3 and seen == [1, 2]


def test_raises_the_last_error() -> None:
    def fn():
        raise TimeoutError("still slow")

    try:
        labmgr.retry(fn, 2, pause=0)
        raise AssertionError("must raise")
    except TimeoutError as exc:
        assert "still slow" in str(exc)


def test_wrong_device_is_not_retried() -> None:
    calls = []

    def fn():
        calls.append(1)
        raise WrongDevice("another lab is using this address")

    try:
        labmgr.retry(fn, 3, pause=0)
        raise AssertionError("must raise")
    except WrongDevice:
        pass
    assert len(calls) == 1, "a wrong-device refusal must not be retried"


if __name__ == "__main__":
    test_retries_then_succeeds(); test_raises_the_last_error(); test_wrong_device_is_not_retried()
    print("retry test OK")

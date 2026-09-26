"""The guard that keeps the executor from configuring a router that is not the one it expects."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("BGP_LABS", str(ROOT / "labs"))
os.environ["BGP_RUNS"] = tempfile.mkdtemp()
sys.path.insert(0, str(ROOT / "backend"))

from app import devices as dev_mod            # noqa: E402
from app.inventory import Device             # noqa: E402


class FakeConn:
    def __init__(self, prompt: str) -> None:
        self.base_prompt, self.closed = prompt, False

    def disconnect(self) -> None:
        self.closed = True


def _dev(name: str = "DC-EAST") -> Device:
    return Device(name, "edge", 65000, "192.168.99.111", "10.255.0.1", "lab", "x", "x")


def test_matching_hostname_is_accepted() -> None:
    c = FakeConn("dc-east")                              # the case of the hostname does not matter
    dev_mod._verify(_dev(), c)
    assert not c.closed


def test_other_router_is_refused_and_disconnected() -> None:
    c = FakeConn("R1")
    try:
        dev_mod._verify(_dev(), c)
        raise AssertionError("a router with another hostname must be refused")
    except dev_mod.WrongDevice as exc:
        assert "R1" in str(exc) and "192.168.99.111" in str(exc) and "DC-EAST" in str(exc)
    assert c.closed, "the session must be closed without sending anything"


def test_no_hostname_is_refused() -> None:
    c = FakeConn("")
    try:
        dev_mod._verify(_dev(), c)
        raise AssertionError("an empty prompt must be refused")
    except dev_mod.WrongDevice:
        pass


if __name__ == "__main__":
    test_matching_hostname_is_accepted()
    test_other_router_is_refused_and_disconnected()
    test_no_hostname_is_refused()
    print("guard test OK")

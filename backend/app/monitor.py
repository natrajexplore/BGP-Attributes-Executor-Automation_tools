"""Polls `show ip bgp summary` and `show bgp vpnv4 unicast all summary` on every router of the active lab,
detects neighbor state transitions and publishes them to Kafka (bgp.neighbor.events) plus a full snapshot per
poll (bgp.neighbor.snapshots) that the exporter turns into Prometheus gauges.

It polls only while a lab is running and not being switched (labmgr.monitorable()), and forgets its state
when the active lab changes (reset())."""
from __future__ import annotations

import asyncio
import logging
import re
import time

from . import bus, labmgr
from . import devices as dev_mod
from .config import settings
from .inventory import Device, build_devices

log = logging.getLogger("bgp.monitor")

_ROW = re.compile(
    r"^(\d{1,3}(?:\.\d{1,3}){3})\s+4\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\S+)\s+(.+?)\s*$"
)
_COMMANDS = ["show ip bgp summary", "show bgp vpnv4 unicast all summary"]

# (router, neighbor, af) -> last known neighbor dict
STATE: dict[tuple[str, str, str], dict] = {}
REACHABLE: dict[str, bool] = {}


def reset() -> None:
    STATE.clear()
    REACHABLE.clear()


def parse_summary(output: str) -> list[dict]:
    neighbors = []
    for line in output.splitlines():
        m = _ROW.match(line.strip())
        if not m:
            continue
        ip, remote_as, updown, last = m.groups()
        established = last.isdigit()
        neighbors.append({
            "neighbor": ip,
            "remote_as": int(remote_as),
            "uptime": updown,
            "state": "Established" if established else last,
            "established": established,
            "prefixes": int(last) if established else 0,
        })
    return neighbors


def _poll_one(dev: Device) -> list[dict] | None:
    try:
        out = dev_mod.show_many(dev, _COMMANDS)
    except Exception as exc:  # noqa: BLE001
        log.info("poll %s failed: %s", dev.name, exc)
        return None
    neighbors = [dict(n, af="ipv4") for n in parse_summary(out[_COMMANDS[0]])]
    for n in parse_summary(out[_COMMANDS[1]]):
        # the vpnv4 summary lists the PE-PE VPNv4 sessions and the PE-CE sessions inside the VRFs
        neighbors.append(dict(n, af="vpnv4" if n["remote_as"] == dev.asn else "vrf"))
    return neighbors


def _process(dev: Device, neighbors: list[dict] | None) -> None:
    reachable = neighbors is not None
    prev_reach = REACHABLE.get(dev.name)
    if prev_reach is not None and prev_reach != reachable:
        bus.emit(settings.topic_events, dev.name, {
            "type": "router_reachable" if reachable else "router_unreachable",
            "severity": "info" if reachable else "critical",
            "router": dev.name, "asn": dev.asn, "lab": labmgr.ACTIVE.id,
        })
    REACHABLE[dev.name] = reachable

    for n in neighbors or []:
        k = (dev.name, n["neighbor"], n["af"])
        prev = STATE.get(k)
        if prev is not None and prev["established"] != n["established"]:
            down = not n["established"]
            bus.emit(settings.topic_events, dev.name, {
                "type": "neighbor_down" if down else "neighbor_up",
                "severity": "critical" if down else "info",
                "router": dev.name, "asn": dev.asn, "lab": labmgr.ACTIVE.id,
                "neighbor": n["neighbor"], "remote_as": n["remote_as"], "af": n["af"],
                "state": n["state"], "prev_state": prev["state"],
                "session": "ibgp" if n["remote_as"] == dev.asn else "ebgp",
            })
        STATE[k] = n

    bus.emit(settings.topic_snapshots, dev.name, {
        "router": dev.name, "asn": dev.asn, "role": dev.role, "lab": labmgr.ACTIVE.id,
        "reachable": reachable, "neighbors": neighbors or [],
    }, ui=False)


def snapshot() -> list[dict]:
    return [{"router": r, **n} for (r, _, _), n in sorted(STATE.items())]


def reachability() -> dict[str, bool]:
    return dict(REACHABLE)


async def run_forever() -> None:
    while True:
        t0 = time.time()
        if not labmgr.monitorable():
            await asyncio.sleep(2)
            continue
        try:
            active = labmgr.ACTIVE.id
            devs = list((await asyncio.to_thread(build_devices)).values())
            results = await asyncio.gather(*(asyncio.to_thread(_poll_one, d) for d in devs))
            if labmgr.ACTIVE.id == active and labmgr.monitorable():          # the lab was not switched meanwhile
                for d, r in zip(devs, results):
                    _process(d, r)
        except Exception:  # noqa: BLE001
            log.exception("monitor cycle failed")
        await asyncio.sleep(max(1.0, settings.poll_interval - (time.time() - t0)))

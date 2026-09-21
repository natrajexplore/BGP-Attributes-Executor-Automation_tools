"""Polls `show ip bgp summary` on every router, detects neighbor state transitions
and publishes them to Kafka (bgp.neighbor.events) plus a full snapshot per poll
(bgp.neighbor.snapshots) that the exporter turns into Prometheus gauges."""
from __future__ import annotations

import asyncio
import logging
import re
import time

from . import bus
from . import devices as dev_mod
from .config import settings
from .inventory import Device, build_devices

log = logging.getLogger("bgp.monitor")

_ROW = re.compile(
    r"^(\d{1,3}(?:\.\d{1,3}){3})\s+4\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\S+)\s+(.+?)\s*$"
)

# (router, neighbor) -> last known neighbor dict
STATE: dict[tuple[str, str], dict] = {}
REACHABLE: dict[str, bool] = {}


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
        return parse_summary(dev_mod.show(dev, "show ip bgp summary"))
    except Exception as exc:  # noqa: BLE001
        log.info("poll %s failed: %s", dev.name, exc)
        return None


def _process(dev: Device, neighbors: list[dict] | None) -> None:
    reachable = neighbors is not None
    prev_reach = REACHABLE.get(dev.name)
    if prev_reach is not None and prev_reach != reachable:
        bus.emit(settings.topic_events, dev.name, {
            "type": "router_reachable" if reachable else "router_unreachable",
            "severity": "info" if reachable else "critical",
            "router": dev.name, "asn": dev.asn,
        })
    REACHABLE[dev.name] = reachable

    for n in neighbors or []:
        k = (dev.name, n["neighbor"])
        prev = STATE.get(k)
        if prev is not None and prev["established"] != n["established"]:
            down = not n["established"]
            bus.emit(settings.topic_events, dev.name, {
                "type": "neighbor_down" if down else "neighbor_up",
                "severity": "critical" if down else "info",
                "router": dev.name, "asn": dev.asn,
                "neighbor": n["neighbor"], "remote_as": n["remote_as"],
                "state": n["state"], "prev_state": prev["state"],
                "session": "ibgp" if n["remote_as"] == dev.asn else "ebgp",
            })
        STATE[k] = n

    bus.emit(settings.topic_snapshots, dev.name, {
        "router": dev.name, "asn": dev.asn, "role": dev.role,
        "reachable": reachable, "neighbors": neighbors or [],
    }, ui=False)


def snapshot() -> list[dict]:
    return [{"router": r, **n} for (r, _), n in sorted(STATE.items())]


async def run_forever() -> None:
    while True:
        t0 = time.time()
        try:
            devs = list(build_devices().values())
            results = await asyncio.gather(*(asyncio.to_thread(_poll_one, d) for d in devs))
            for d, r in zip(devs, results):
                _process(d, r)
        except Exception:  # noqa: BLE001
            log.exception("monitor cycle failed")
        await asyncio.sleep(max(1.0, settings.poll_interval - (time.time() - t0)))

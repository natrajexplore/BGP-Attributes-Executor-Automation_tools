"""Offline test of the exporter logic: docker run --rm -v <this file>:/app/t.py bgp-attributes-executor-exporter python t.py"""
import time
import exporter as e
from prometheus_client import REGISTRY

def n(name):
    return len([s for m in REGISTRY.collect() if m.name == name for s in m.samples if s.name == name])

def snap(lab, router, asn, neighbors):
    e.on_snapshot({"lab": lab, "router": router, "asn": asn, "reachable": True, "ts": "2026-09-26T10:00:00+00:00", "neighbors": neighbors})

nb = lambda ip, ras, af, up=True: {"neighbor": ip, "remote_as": ras, "established": up, "prefixes": 1, "af": af}
snap("12_mpls_l3vpn", "PE1", 65000, [nb("10.0.0.2", 65000, "ipv4"), nb("10.0.0.2", 65000, "vpnv4"), nb("172.16.1.2", 65101, "vrf")])
assert n("bgp_neighbor_up") == 3, n("bgp_neighbor_up")            # ipv4 and vpnv4 to the same neighbor no longer collide
snap("05_med", "ISP-W", 65001, [nb("1.1.1.1", 65000, "ipv4")])
assert n("bgp_neighbor_up") == 1 and n("bgp_router_reachable") == 1, (n("bgp_neighbor_up"), n("bgp_router_reachable"))   # previous lab dropped
e.STATE["seen"] = time.time() - e.IDLE_DROP_S - 5
e.drop_live_state(); assert n("bgp_neighbor_up") == 0
e.on_event({"type": "neighbor_down", "lab": "05_med", "router": "ISP-W", "neighbor": "1.1.1.1", "ts": "2026-09-26T10:00:00+00:00"})
e.on_config({"lab": "05_med", "scenario": "05_med", "attribute": "MED", "mode": "apply", "result": "passed", "ts": "2026-09-26T10:00:00+00:00", "duration": 3.2})
e.on_config({"scenario": "old", "mode": "apply", "result": "passed", "ts": "2026-09-26T10:00:00+00:00"})   # message from before labs were tagged
print("exporter logic OK")

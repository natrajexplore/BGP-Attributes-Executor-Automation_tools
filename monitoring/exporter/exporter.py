"""Kafka -> Prometheus bridge. Consumes the three BGP topics and exposes /metrics."""
import json
import logging
import os
import time
from datetime import datetime

from confluent_kafka import Consumer
from prometheus_client import Counter, Gauge, start_http_server

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("exporter")

BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka:29092")
T_EVENTS = os.getenv("TOPIC_EVENTS", "bgp.neighbor.events")
T_SNAP = os.getenv("TOPIC_SNAPSHOTS", "bgp.neighbor.snapshots")
T_CONFIG = os.getenv("TOPIC_CONFIG", "bgp.config.changes")

# The dashboard runs one lab at a time and tags every message with its lab id. Series carry `lab` and `af` (ipv4, vpnv4 or vrf),
# and the per-router state of a lab that is no longer being polled is dropped, so Grafana shows the running lab only.
N = ["lab", "router", "neighbor", "remote_as", "session", "af"]
neighbor_up = Gauge("bgp_neighbor_up", "1 if BGP session is Established", N)
neighbor_pfx = Gauge("bgp_neighbor_prefixes_received", "Prefixes received from neighbor", N)
router_reach = Gauge("bgp_router_reachable", "1 if router answered the last poll", ["lab", "router"])
snap_seen = Gauge("bgp_snapshot_timestamp_seconds", "Time of last snapshot per router", ["lab", "router"])
transitions = Counter("bgp_neighbor_transitions_total", "Session state transitions",
                      ["lab", "router", "neighbor", "direction"])
last_transition = Gauge("bgp_neighbor_last_transition_timestamp_seconds",
                        "Time of last session transition", ["lab", "router", "neighbor", "direction"])
config_changes = Counter("bgp_config_changes_total", "Config pushes from the UI",
                         ["lab", "scenario", "attribute", "mode", "result"])
config_last = Gauge("bgp_config_last_change_timestamp_seconds", "Time of last config push",
                    ["lab", "scenario", "attribute", "mode"])
config_dur = Gauge("bgp_config_last_duration_seconds", "Duration of last config push", ["scenario"])
consumed = Counter("bgp_exporter_messages_total", "Kafka messages consumed", ["topic"])


def ts(v):
    try:
        return datetime.fromisoformat(v).timestamp()
    except Exception:  # noqa: BLE001
        return time.time()


STATE = {"lab": None, "seen": 0.0}
IDLE_DROP_S = 600          # no snapshot for 10 minutes (lab stopped): stop showing its last state as if it were live


def drop_live_state():
    for g in (neighbor_up, neighbor_pfx, router_reach, snap_seen):
        g.clear()
    STATE["lab"] = None


def on_snapshot(m):
    lab = m.get("lab") or "shared"
    if STATE["lab"] != lab:                                    # the dashboard switched labs: forget the routers of the previous one
        drop_live_state()
        STATE["lab"] = lab
        log.info("active lab: %s", lab)
    STATE["seen"] = time.time()
    r = m["router"]
    router_reach.labels(lab, r).set(1 if m["reachable"] else 0)
    snap_seen.labels(lab, r).set(ts(m["ts"]))
    for n in m["neighbors"]:
        sess = "ibgp" if n["remote_as"] == m["asn"] else "ebgp"
        lbl = (lab, r, n["neighbor"], str(n["remote_as"]), sess, n.get("af", "ipv4"))
        neighbor_up.labels(*lbl).set(1 if n["established"] else 0)
        neighbor_pfx.labels(*lbl).set(n["prefixes"])


def on_event(m):
    t = m["type"]
    if t in ("neighbor_up", "neighbor_down"):
        d = t.split("_")[1]
        lab = m.get("lab") or "shared"
        transitions.labels(lab, m["router"], m["neighbor"], d).inc()
        last_transition.labels(lab, m["router"], m["neighbor"], d).set(ts(m["ts"]))


def on_config(m):
    a = m.get("attribute") or "n/a"
    lab = m.get("lab") or "shared"
    config_changes.labels(lab, m["scenario"], a, m["mode"], m["result"]).inc()
    config_last.labels(lab, m["scenario"], a, m["mode"]).set(ts(m["ts"]))
    if m.get("duration") is not None:
        config_dur.labels(m["scenario"]).set(m["duration"])


HANDLERS = {T_SNAP: on_snapshot, T_EVENTS: on_event, T_CONFIG: on_config}


def main():
    start_http_server(9108)
    c = Consumer({
        "bootstrap.servers": BOOTSTRAP, "group.id": "bgp-exporter",
        "auto.offset.reset": "earliest", "enable.auto.commit": True,
        "allow.auto.create.topics": True,
    })
    c.subscribe(list(HANDLERS))
    log.info("consuming %s from %s, metrics on :9108", list(HANDLERS), BOOTSTRAP)
    while True:
        msg = c.poll(1.0)
        if msg is None:
            if STATE["lab"] and time.time() - STATE["seen"] > IDLE_DROP_S:
                log.info("no snapshot for %d s: dropping the state of lab %s", IDLE_DROP_S, STATE["lab"])
                drop_live_state()
            continue
        if msg.error():
            log.debug("kafka: %s", msg.error())
            continue
        try:
            HANDLERS[msg.topic()](json.loads(msg.value()))
            consumed.labels(msg.topic()).inc()
        except Exception:  # noqa: BLE001
            log.exception("bad message on %s", msg.topic())


if __name__ == "__main__":
    main()

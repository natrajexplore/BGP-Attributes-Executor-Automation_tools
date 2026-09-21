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

N = ["router", "neighbor", "remote_as", "session"]
neighbor_up = Gauge("bgp_neighbor_up", "1 if BGP session is Established", N)
neighbor_pfx = Gauge("bgp_neighbor_prefixes_received", "Prefixes received from neighbor", N)
router_reach = Gauge("bgp_router_reachable", "1 if router answered the last poll", ["router"])
snap_seen = Gauge("bgp_snapshot_timestamp_seconds", "Time of last snapshot per router", ["router"])
transitions = Counter("bgp_neighbor_transitions_total", "Session state transitions",
                      ["router", "neighbor", "direction"])
last_transition = Gauge("bgp_neighbor_last_transition_timestamp_seconds",
                        "Time of last session transition", ["router", "neighbor", "direction"])
config_changes = Counter("bgp_config_changes_total", "Config pushes from the UI",
                         ["scenario", "attribute", "mode", "result"])
config_last = Gauge("bgp_config_last_change_timestamp_seconds", "Time of last config push",
                    ["scenario", "attribute", "mode"])
config_dur = Gauge("bgp_config_last_duration_seconds", "Duration of last config push", ["scenario"])
consumed = Counter("bgp_exporter_messages_total", "Kafka messages consumed", ["topic"])


def ts(v):
    try:
        return datetime.fromisoformat(v).timestamp()
    except Exception:  # noqa: BLE001
        return time.time()


def on_snapshot(m):
    r = m["router"]
    router_reach.labels(r).set(1 if m["reachable"] else 0)
    snap_seen.labels(r).set(ts(m["ts"]))
    for n in m["neighbors"]:
        sess = "ibgp" if n["remote_as"] == m["asn"] else "ebgp"
        lbl = (r, n["neighbor"], str(n["remote_as"]), sess)
        neighbor_up.labels(*lbl).set(1 if n["established"] else 0)
        neighbor_pfx.labels(*lbl).set(n["prefixes"])


def on_event(m):
    t = m["type"]
    if t in ("neighbor_up", "neighbor_down"):
        d = t.split("_")[1]
        transitions.labels(m["router"], m["neighbor"], d).inc()
        last_transition.labels(m["router"], m["neighbor"], d).set(ts(m["ts"]))


def on_config(m):
    a = m.get("attribute") or "n/a"
    config_changes.labels(m["scenario"], a, m["mode"], m["result"]).inc()
    config_last.labels(m["scenario"], a, m["mode"]).set(ts(m["ts"]))
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

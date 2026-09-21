"""Kafka publishing + UI fan-out. Fail-soft: if Kafka is down the dashboard keeps working."""
from __future__ import annotations

import json
import logging
import uuid
from collections import deque
from datetime import datetime, timezone

from .config import settings
from .events import publish as ui_publish

log = logging.getLogger("bgp.bus")

UI_CHANNEL = "__bgp_events__"
RECENT: deque[dict] = deque(maxlen=200)
_producer = None


def _get_producer():
    global _producer
    if _producer is None and settings.kafka_bootstrap:
        from confluent_kafka import Producer

        _producer = Producer({
            "bootstrap.servers": settings.kafka_bootstrap,
            "client.id": "bgp-executor",
            "message.timeout.ms": 10000,
            "socket.timeout.ms": 5000,
        })
    return _producer


def _on_delivery(err, msg) -> None:
    if err is not None:
        log.warning("kafka delivery failed (%s): %s", msg.topic(), err)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def emit(topic: str, key: str, payload: dict, ui: bool = True) -> None:
    """Publish to Kafka (async, non-blocking) and optionally to the UI live feed."""
    payload = {"event_id": uuid.uuid4().hex, "ts": now(), **payload}
    body = json.dumps(payload, default=str)
    p = _get_producer()
    if p is not None:
        try:
            p.produce(topic, key=key, value=body, callback=_on_delivery)
            p.poll(0)
        except Exception as exc:  # noqa: BLE001
            log.warning("kafka produce error: %s", exc)
    if ui:
        RECENT.appendleft(payload)
        ui_publish(UI_CHANNEL, "bgp", body)


def flush() -> None:
    if _producer is not None:
        _producer.flush(3)

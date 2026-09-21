"""In-process pub/sub for streaming run logs over SSE. publish() is only called
from async code (Netmiko runs via asyncio.to_thread between publishes)."""
from __future__ import annotations

import asyncio
from collections import defaultdict

_subs: dict[str, list[asyncio.Queue]] = defaultdict(list)


def subscribe(run_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _subs[run_id].append(q)
    return q


def unsubscribe(run_id: str, q: asyncio.Queue) -> None:
    if q in _subs.get(run_id, []):
        _subs[run_id].remove(q)
    if not _subs.get(run_id):
        _subs.pop(run_id, None)


def publish(run_id: str, event: str, data: str) -> None:
    for q in list(_subs.get(run_id, [])):
        q.put_nowait({"event": event, "data": data})


def done(run_id: str) -> None:
    for q in list(_subs.get(run_id, [])):
        q.put_nowait(None)

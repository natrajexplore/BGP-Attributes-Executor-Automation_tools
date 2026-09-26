"""In-process pub/sub for streaming run logs over SSE.

publish() must run on the event loop thread: code that runs in worker threads (Netmiko) goes through
labmgr.Emitter, which uses loop.call_soon_threadsafe.

Every run's events are kept (bounded) so a client that connects after the run started, or after it finished,
still receives the whole stream: the Live tab shows the same steps and CLI transcript either way."""
from __future__ import annotations

import asyncio
from collections import defaultdict

_subs: dict[str, list[asyncio.Queue]] = defaultdict(list)
_history: dict[str, list[dict]] = {}
_finished: set[str] = set()
_order: list[str] = []
_MAX_RUNS = 60            # runs kept in memory
_MAX_EVENTS = 20000       # events kept per run


def _keep(run_id: str) -> bool:
    return not run_id.startswith("__")        # the UI feed channel is a live stream, not a run


def subscribe(run_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    if _keep(run_id):
        for msg in _history.get(run_id, []):
            q.put_nowait(msg)
        if run_id in _finished:
            q.put_nowait(None)
    _subs[run_id].append(q)
    return q


def unsubscribe(run_id: str, q: asyncio.Queue) -> None:
    if q in _subs.get(run_id, []):
        _subs[run_id].remove(q)
    if not _subs.get(run_id):
        _subs.pop(run_id, None)


def publish(run_id: str, event: str, data) -> None:
    msg = {"event": event, "data": data}
    if _keep(run_id):
        if run_id not in _history:
            _history[run_id] = []
            _order.append(run_id)
            while len(_order) > _MAX_RUNS:
                old = _order.pop(0)
                _history.pop(old, None)
                _finished.discard(old)
        if len(_history[run_id]) < _MAX_EVENTS:
            _history[run_id].append(msg)
    for q in list(_subs.get(run_id, [])):
        q.put_nowait(msg)


def done(run_id: str) -> None:
    if _keep(run_id):
        _finished.add(run_id)
    for q in list(_subs.get(run_id, [])):
        q.put_nowait(None)

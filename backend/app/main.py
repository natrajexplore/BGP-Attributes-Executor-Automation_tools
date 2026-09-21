from __future__ import annotations

import asyncio
import json
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import bus, monitor, scenarios
from .config import FRONTEND_DIR, settings
from .eveng import EveNGClient, EveNGError
from .events import subscribe, unsubscribe
from .inventory import build_devices



@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(monitor.run_forever()) if settings.monitor_enabled else None
    yield
    if task:
        task.cancel()
    bus.flush()


app = FastAPI(title="bgp-attributes-executor", lifespan=lifespan)
_eve = EveNGClient()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/config")
def public_config() -> dict:
    return {"grafana_url": settings.grafana_url, "kafka_enabled": bool(settings.kafka_bootstrap),
            "poll_interval": settings.poll_interval}


@app.get("/api/monitor/state")
def monitor_state() -> list[dict]:
    return monitor.snapshot()


@app.get("/api/events/recent")
def events_recent() -> list[dict]:
    return list(bus.RECENT)


@app.get("/api/events/stream")
async def events_stream() -> StreamingResponse:
    q = subscribe(bus.UI_CHANNEL)

    async def gen():
        try:
            while True:
                msg = await q.get()
                if msg is None:
                    return
                yield f"event: bgp\ndata: {msg['data']}\n\n"
        finally:
            unsubscribe(bus.UI_CHANNEL, q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/devices")
def devices() -> list[dict]:
    devs = build_devices(_eve)
    return [
        {"name": d.name, "role": d.role, "asn": d.asn, "mgmt_ip": d.mgmt_ip,
         "router_id": d.router_id, "status": d.status,
         "console": f"{d.console_host}:{d.console_port}" if d.console else None}
        for d in devs.values()
    ]


@app.get("/api/topology")
def topology() -> dict:
    devs = build_devices(_eve)
    nodes = [{"name": d.name, "asn": d.asn, "role": d.role, "status": d.status}
             for d in devs.values()]
    links = []
    try:
        for item in _eve.topology():
            links.append({
                "source": item.get("source_label") or item.get("source"),
                "target": item.get("destination_label") or item.get("destination"),
            })
    except EveNGError as exc:
        return {"nodes": nodes, "links": [], "warning": str(exc)}
    return {"nodes": nodes, "links": links}


@app.get("/api/devices/{name}/bgp")
def device_bgp(name: str, prefix: str | None = None) -> dict:
    from . import devices as dev_mod

    devs = build_devices()
    if name not in devs:
        raise HTTPException(404, name)
    cmd = f"show ip bgp {prefix}" if prefix else "show ip bgp summary"
    return {"device": name, "command": cmd, "output": dev_mod.show(devs[name], cmd)}


_IP = r"\d{1,3}(?:\.\d{1,3}){3}"
_PFX = rf"{_IP}(?:/\d{{1,2}})?"
_SHOW_ALLOWED = [re.compile(p) for p in (
    r"show ip bgp",
    r"show ip bgp summary",
    rf"show ip bgp {_PFX}(?: longer-prefixes)?",
    rf"show ip bgp neighbors {_IP}(?: (?:advertised-routes|received-routes|routes))?",
    r"show ip bgp regexp [\w ^$*+?.()\[\]_-]{1,40}",     # no '|': keeps '| redirect' out
    r"show ip bgp community [\w: -]{1,60}",
    rf"show ip route(?: {_IP})?",
    r"show ip ospf neighbor",
    r"show route-map(?: [\w.-]{1,32})?",
    r"show ip prefix-list(?: [\w.-]{1,32})?",
    r"show running-config \| (?:section|include) [\w .:/-]{1,40}",
)]


@app.get("/api/devices/{name}/show")
def device_show(name: str, cmd: str) -> dict:
    """Read-only `show` for the Learn tab exercises. Whitelisted; nothing that can change config."""
    from . import devices as dev_mod

    devs = build_devices()
    if name not in devs:
        raise HTTPException(404, name)
    cmd = " ".join(cmd.split())
    if len(cmd) > 120 or not any(p.fullmatch(cmd) for p in _SHOW_ALLOWED):
        raise HTTPException(400, "command not allowed (read-only BGP/route show commands only)")
    return {"device": name, "command": cmd, "output": dev_mod.show(devs[name], cmd)}


@app.get("/api/scenarios")
def scenario_list() -> list[dict]:
    return scenarios.list_scenarios()


@app.post("/api/scenarios/{sid}/run")
async def scenario_run(sid: str) -> dict:
    try:
        run_id = await scenarios.run_scenario(sid, rollback=False)
    except FileNotFoundError:
        raise HTTPException(404, sid)
    return {"run_id": run_id}


@app.post("/api/scenarios/{sid}/rollback")
async def scenario_rollback(sid: str) -> dict:
    try:
        run_id = await scenarios.run_scenario(sid, rollback=True)
    except FileNotFoundError:
        raise HTTPException(404, sid)
    return {"run_id": run_id}


@app.post("/api/lab/reset")
async def lab_reset(nodes: list[str] | None = None) -> dict:
    return {"run_id": await scenarios.reset_baseline(nodes)}


@app.get("/api/runs/{run_id}")
def run_detail(run_id: str) -> dict:
    if run_id not in scenarios.RUNS:
        raise HTTPException(404, run_id)
    return scenarios.RUNS[run_id]


@app.get("/api/stream/{run_id}")
async def stream(run_id: str) -> StreamingResponse:
    q = subscribe(run_id)

    async def gen():
        try:
            # replay terminal state if the run already finished
            if run_id in scenarios.RUNS and scenarios.RUNS[run_id]["state"] not in ("running",):
                yield f"event: result\ndata: {scenarios.RUNS[run_id]['state']}\n\n"
                return
            while True:
                msg = await q.get()
                if msg is None:
                    yield "event: end\ndata: end\n\n"
                    return
                yield f"event: {msg['event']}\ndata: {json.dumps(msg['data'])}\n\n"
        finally:
            unsubscribe(run_id, q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

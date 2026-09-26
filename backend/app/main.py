from __future__ import annotations

import asyncio
import io
import json
import re
import zipfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import bus, graph, labmgr, monitor, scenarios
from .config import FRONTEND_DIR, LABS_DIR, settings
from .eveng import EveNGError
from .events import subscribe, unsubscribe
from .inventory import build_devices


@asynccontextmanager
async def lifespan(_: FastAPI):
    detect = asyncio.create_task(asyncio.to_thread(labmgr.detect_active))      # which lab is EVE-NG running? (does not delay startup)
    task = asyncio.create_task(monitor.run_forever()) if settings.monitor_enabled else None
    yield
    if task:
        task.cancel()
    bus.flush()


app = FastAPI(title="bgp-attributes-executor", lifespan=lifespan)
_eve = labmgr.eve()


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
        {"lab": labmgr.ACTIVE.id, "name": d.name, "role": d.role, "asn": d.asn, "mgmt_ip": d.mgmt_ip,
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
    r"show bgp vpnv4 unicast all(?: summary)?",
    rf"show bgp vpnv4 unicast all {_PFX}",
    r"show ip vrf(?: detail)?(?: [\w-]{1,32})?",
    rf"show ip route vrf [\w-]{{1,32}}(?: {_IP})?",
    r"show mpls ldp neighbor",
    r"show mpls forwarding-table",
)]


@app.get("/api/devices/{name}/show")
def device_show(name: str, cmd: str) -> dict:
    """Read-only `show` for the Learn tab exercises. Whitelisted; nothing that can change config."""
    from . import devices as dev_mod

    devs = build_devices()
    if name not in devs:
        raise HTTPException(404, f"{name} is not in the active lab ({labmgr.ACTIVE.id}). Run a scenario of the lab you want, or use the Live labs tab.")
    cmd = " ".join(cmd.split())
    if len(cmd) > 120 or not any(p.fullmatch(cmd) for p in _SHOW_ALLOWED):
        raise HTTPException(400, "command not allowed (read-only BGP/route show commands only)")
    return {"device": name, "command": cmd, "output": dev_mod.show(devs[name], cmd)}


_LAB_ID = re.compile(r"\d{2}_[a-z0-9_]+")        # lab folder names look like 05_med; anything else (../, slashes) is rejected


@app.get("/api/labs")
def labs_list() -> list[dict]:
    """Per-attribute labs that have a README (folders under labs/)."""
    if not LABS_DIR.is_dir():
        return []
    return [{"id": p.name, "unl": (p / f"{p.name}.unl").is_file()} for p in sorted(LABS_DIR.iterdir())
            if p.is_dir() and _LAB_ID.fullmatch(p.name) and (p / "README.md").is_file()]


@app.get("/api/labs/{lab_id}/readme")
def lab_readme(lab_id: str) -> dict:
    """The lab's README.md as Markdown text, read-only."""
    readme = LABS_DIR / lab_id / "README.md"
    if not _LAB_ID.fullmatch(lab_id) or not readme.is_file():
        raise HTTPException(404, lab_id)
    return {"id": lab_id, "markdown": readme.read_text(encoding="utf-8")}


@app.get("/api/labs/{lab_id}/unl")
def lab_unl(lab_id: str) -> FileResponse:
    """The lab's generated EVE-NG topology file, as a download (plain topology XML: no credentials)."""
    unl = LABS_DIR / lab_id / f"{lab_id}.unl"
    if not _LAB_ID.fullmatch(lab_id) or not unl.is_file():
        raise HTTPException(404, lab_id)
    return FileResponse(unl, media_type="application/xml", filename=f"{lab_id}.unl")


@app.get("/api/labs/{lab_id}/zip")
def lab_zip(lab_id: str) -> Response:
    """The .unl wrapped in a zip: the form EVE-NG's Import accepts (it rejects a bare .unl)."""
    unl = LABS_DIR / lab_id / f"{lab_id}.unl"
    if not _LAB_ID.fullmatch(lab_id) or not unl.is_file():
        raise HTTPException(404, lab_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(unl, arcname=f"{lab_id}.unl")                 # top level, the layout that EVE's import was tested with
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{lab_id}.zip"'})


# ---------------------------------------------------------------- live labs: every lab, switching, 3D graph
def _ctx(lab_id: str) -> labmgr.LabContext:
    if not labmgr.CTX_ID.fullmatch(lab_id):
        raise HTTPException(404, lab_id)
    try:
        return labmgr.get_context(lab_id)
    except KeyError:
        raise HTTPException(404, lab_id)


def _busy(exc: RuntimeError) -> HTTPException:
    return HTTPException(409, str(exc))


def _scenario_summary(ctx: labmgr.LabContext) -> list[dict]:
    return [{"id": sc["id"], "title": sc.get("title", sc["id"]), "attribute": sc.get("attribute"),
             "summary": " ".join(str(sc.get("summary", "")).split()), "targets": sc.get("targets", []),
             "checks": len(sc.get("verify", []))} for sc in scenarios.list_scenarios(ctx)]


@app.get("/api/catalog")
def catalog() -> dict:
    """Every lab with its scenarios: what the Live labs tab shows."""
    labs = []
    for ctx in labmgr.contexts().values():
        labs.append({"id": ctx.id, "title": ctx.title, "short": ctx.short, "group": ctx.group, "routers": ctx.routers,
                     "prepared": labmgr.state["prepared"].get(ctx.id), "applied": labmgr.state["applied"].get(ctx.id, []),
                     "active": ctx.id == labmgr.ACTIVE.id and bool(labmgr.STATUS["running"]), "selected": ctx.id == labmgr.ACTIVE.id,
                     "scenarios": _scenario_summary(ctx)})
    return {"status": labmgr.status_dict(), "labs": labs}


@app.get("/api/lab/status")
def lab_status() -> dict:
    return labmgr.status_dict()


@app.get("/api/labs/{lab_id}/graph")
async def lab_graph(lab_id: str) -> dict:
    """Routers, links and BGP sessions of a lab for the 3D view (live state overlaid when it is the running lab)."""
    return await asyncio.to_thread(graph.build_graph, _ctx(lab_id))


@app.post("/api/labs/{lab_id}/activate")
async def lab_activate(lab_id: str, force_prepare: bool = False) -> dict:
    """Stop the running lab and bring this one up (configured, BGP converged). Progress: /api/stream/<run_id>."""
    try:
        return {"run_id": labmgr.activate_job(_ctx(lab_id), force_prepare)}
    except RuntimeError as exc:
        raise _busy(exc)


@app.post("/api/labs/{lab_id}/scenarios/{sid}/run")
async def lab_scenario_run(lab_id: str, sid: str) -> dict:
    try:
        return {"run_id": scenarios.run_scenario(sid, False, _ctx(lab_id), switch=True)}
    except FileNotFoundError:
        raise HTTPException(404, sid)
    except RuntimeError as exc:
        raise _busy(exc)


@app.post("/api/labs/{lab_id}/scenarios/{sid}/rollback")
async def lab_scenario_rollback(lab_id: str, sid: str) -> dict:
    try:
        return {"run_id": scenarios.run_scenario(sid, True, _ctx(lab_id), switch=True)}
    except FileNotFoundError:
        raise HTTPException(404, sid)
    except RuntimeError as exc:
        raise _busy(exc)


@app.post("/api/prewarm")
async def prewarm(labs: list[str] | None = None) -> dict:
    """Bring every lab up once so it is configured and saved (a long background job)."""
    try:
        return {"run_id": labmgr.prewarm_job(labs)}
    except RuntimeError as exc:
        raise _busy(exc)


# The original endpoints (Lab tab, Learn-tab exercises) drive the shared 8-router lab; running one switches back to it.
@app.get("/api/scenarios")
def scenario_list() -> list[dict]:
    return scenarios.list_scenarios(labmgr.shared_context())


@app.post("/api/scenarios/{sid}/run")
async def scenario_run(sid: str) -> dict:
    try:
        return {"run_id": scenarios.run_scenario(sid, False, labmgr.shared_context(), switch=True)}
    except FileNotFoundError:
        raise HTTPException(404, sid)
    except RuntimeError as exc:
        raise _busy(exc)


@app.post("/api/scenarios/{sid}/rollback")
async def scenario_rollback(sid: str) -> dict:
    try:
        return {"run_id": scenarios.run_scenario(sid, True, labmgr.shared_context(), switch=True)}
    except FileNotFoundError:
        raise HTTPException(404, sid)
    except RuntimeError as exc:
        raise _busy(exc)


@app.post("/api/lab/reset")
async def lab_reset(nodes: list[str] | None = None) -> dict:
    try:
        return {"run_id": scenarios.reset_baseline(nodes)}
    except RuntimeError as exc:
        raise _busy(exc)


@app.get("/api/runs/{run_id}")
def run_detail(run_id: str) -> dict:
    if run_id not in scenarios.RUNS:
        raise HTTPException(404, run_id)
    return scenarios.RUNS[run_id]


@app.get("/api/stream/{run_id}")
async def stream(run_id: str) -> StreamingResponse:
    """Server-sent events of a run: log, plan, step, cli, result. A client that connects late (or after the run
    ended) still receives everything from the start."""
    if run_id not in scenarios.RUNS:
        raise HTTPException(404, run_id)
    q = subscribe(run_id)

    async def gen():
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if msg is None:
                    yield "event: end\ndata: end\n\n"
                    return
                yield f"event: {msg['event']}\ndata: {json.dumps(msg['data'])}\n\n"
        finally:
            unsubscribe(run_id, q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.middleware("http")
async def revalidate_frontend(request, call_next):
    """The page and its scripts change together; make browsers revalidate so an old cached script never meets a new page."""
    resp = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

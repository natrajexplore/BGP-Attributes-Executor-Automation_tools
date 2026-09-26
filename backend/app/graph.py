"""The topology of a lab as data for the 3D view: routers with positions, physical links and BGP sessions.

Routers, links and sessions come from the lab files (inventory.yaml and baseline/*.cfg), so any lab can be
drawn without being started. When the lab is the running one, the state of the routers and sessions is
overlaid from EVE-NG and the session monitor."""
from __future__ import annotations

import re

from . import labmgr, monitor

_LINK = re.compile(r"^\s*-\s*\{a:\s*([^,\s]+),\s*a_if:\s*([^,\s]+),\s*b:\s*([^,\s]+),\s*b_if:\s*([^,\s}]+)\}\s*(?:#\s*(.*))?$")
_IP = r"\d{1,3}(?:\.\d{1,3}){3}"


def _links(ctx) -> list[dict]:
    out = []
    for ln in ctx.inventory.read_text(encoding="utf-8").splitlines():
        m = _LINK.match(ln)
        if m:
            out.append({"a": m.group(1), "a_if": m.group(2), "b": m.group(3), "b_if": m.group(4), "note": (m.group(5) or "").strip()})
    return out


def _parse_baseline(cfg: str) -> dict:
    """Interface addresses (not the management VRF) and BGP neighbors of one router's baseline config."""
    ips: list[str] = []
    remote: dict[str, int] = {}
    vrf_nbrs: set[str] = set()
    vpnv4: set[str] = set()
    group_as: dict[str, int] = {}
    member: dict[str, str] = {}
    local_as = None
    cur_if = mgmt = False
    in_bgp, af = False, None
    for raw in cfg.splitlines():
        if not raw.strip() or raw.lstrip().startswith("!"):
            continue                              # a '!' separator does not end a block: the next unindented line does
        if not raw.startswith(" "):
            cur_if, in_bgp, af = False, False, None
            m = re.match(r"interface (\S+)", raw)
            if m:
                cur_if, mgmt = True, False
                continue
            m = re.match(r"router bgp (\d+)", raw)
            if m:
                in_bgp, local_as = True, int(m.group(1))
            continue
        ln = raw.strip()
        if cur_if:
            if ln.startswith("ip vrf forwarding MGMT"):
                mgmt = True
            m = re.match(rf"ip address ({_IP}) ", ln)
            if m and not mgmt:
                ips.append(m.group(1))
            continue
        if not in_bgp:
            continue
        m = re.match(r"address-family (\S+)(?: \S+ (\S+))?", ln)
        if m:
            af = ("vrf", m.group(2)) if m.group(1) == "ipv4" and m.group(2) else m.group(1)
            continue
        if ln == "exit-address-family":
            af = None
            continue
        m = re.match(r"neighbor (\S+) remote-as (\d+)", ln)
        if m:
            tok, asn = m.group(1), int(m.group(2))
            if re.fullmatch(_IP, tok):
                remote[tok] = asn
                if isinstance(af, tuple):
                    vrf_nbrs.add(tok)
            else:
                group_as[tok] = asn
            continue
        m = re.match(rf"neighbor ({_IP}) peer-group (\S+)", ln)
        if m:
            member[m.group(1)] = m.group(2)
            continue
        m = re.match(rf"neighbor ({_IP}) activate", ln)
        if m and af == "vpnv4":
            vpnv4.add(m.group(1))
    for ip, g in member.items():
        if ip not in remote and g in group_as:
            remote[ip] = group_as[g]
    return {"ips": ips, "remote": remote, "vrf": vrf_nbrs, "vpnv4": vpnv4, "as": local_as}


def build_graph(ctx: "labmgr.LabContext") -> dict:
    """Blocking (asks EVE-NG for node states): call through asyncio.to_thread."""
    inv = ctx.load_inventory()
    live = ctx.id == labmgr.ACTIVE.id and labmgr.monitorable()
    # EVE-NG reports the routers (and console ports) of every lab with the same node ids as running while one lab runs,
    # so only the active lab's state is real; every other lab is stopped
    eve_nodes = labmgr.node_status(ctx) if ctx.id == labmgr.ACTIVE.id else {}
    reach = monitor.reachability() if live else {}
    links = _links(ctx)
    adjacent: dict[str, set[str]] = {}
    for lk in links:
        adjacent.setdefault(lk["a"], set()).add(lk["b"])
        adjacent.setdefault(lk["b"], set()).add(lk["a"])

    parsed = {}
    owners: dict[str, list[str]] = {}
    for name in inv["devices"]:
        cfg = ctx.baseline / f"{name}.cfg"
        parsed[name] = _parse_baseline(cfg.read_text(encoding="utf-8")) if cfg.is_file() else {"ips": [], "remote": {}, "vrf": set(), "vpnv4": set(), "as": None}
        for ip in parsed[name]["ips"]:
            owners.setdefault(ip, []).append(name)

    def owner(router: str, ip: str) -> str | None:
        cand = owners.get(ip, [])
        if len(cand) > 1:                        # the same subnet reused in several VRFs: the neighbor is the adjacent one
            cand = [c for c in cand if c in adjacent.get(router, set())] or cand
        return cand[0] if cand else None

    nodes = []
    for name, d in inv["devices"].items():
        cv = d.get("canvas") or [0, 0]
        ev = eve_nodes.get(name.upper())
        running = bool(ev) and ev["status"] != "stopped" and bool(ev.get("console_port"))
        nodes.append({
            "name": name, "role": d["role"], "asn": d["asn"], "mgmt_ip": str(d["mgmt_ip"]).split("/")[0],
            "router_id": d.get("router_id"), "x": cv[0], "y": cv[1],
            "status": ev["status"] if ev else ("stopped" if ctx.id != labmgr.ACTIVE.id else "unknown"),
            "reachable": reach.get(name) if live else None,
            # the EVE-NG telnet console of the router: available while the lab is running (EVE-NG hands out the port at start)
            "console": f"{ev['console_host']}:{ev['console_port']}" if running else None,
        })

    live_rows = {(s["router"], s["neighbor"]): s for s in monitor.snapshot()} if live else {}
    sessions: dict[tuple, dict] = {}
    for router, p in parsed.items():
        for ip, asn in p["remote"].items():
            peer = owner(router, ip)
            if not peer:
                continue
            kind = "vrf" if ip in p["vrf"] else "vpnv4" if ip in p["vpnv4"] else ("ibgp" if asn == p["as"] else "ebgp")
            key = (frozenset((router, peer)), "vpnv4" if kind == "vpnv4" else "ipv4")      # both ends of a session describe it once
            row = live_rows.get((router, ip))
            s = sessions.setdefault(key, {"a": router, "b": peer, "kind": kind, "af": kind, "established": None, "state": "configured",
                                          "prefixes": 0, "neighbor": ip})
            if kind == "vrf":                                   # the PE end knows it is a VRF session; the CE end sees plain eBGP
                s["kind"] = s["af"] = "vrf"
            if row:
                est = row["established"]
                s["established"] = est if s["established"] is None else (s["established"] and est)
                s["state"] = row["state"] if not est or s["state"] == "configured" else s["state"]
                s["prefixes"] += row["prefixes"]
    if live:
        for s in sessions.values():
            if s["established"] is None:
                s["state"] = "no data yet"

    from . import scenarios                      # lazy: scenarios uses labmgr

    targets: list[str] = []
    for sc in scenarios.list_scenarios(ctx):
        targets += [t for t in sc.get("targets", []) if t not in targets]

    return {
        "lab": {"id": ctx.id, "title": ctx.title, "short": ctx.short, "group": ctx.group, "routers": len(nodes),
                "eve_path": ctx.eve_path, "targets": targets,
                "active": ctx.id == labmgr.ACTIVE.id, "running": bool(labmgr.STATUS["running"]) if ctx.id == labmgr.ACTIVE.id else False,
                "phase": labmgr.STATUS["phase"] if ctx.id == labmgr.ACTIVE.id else "idle", "live": live},
        "nodes": nodes, "links": links, "sessions": list(sessions.values()),
    }

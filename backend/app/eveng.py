"""Thin EVE-NG REST client. Used for topology + node state + console ports only;
config is pushed with Netmiko (see devices.py)."""
from __future__ import annotations

import re

import httpx

from .config import settings

_STATUS = {0: "stopped", 1: "starting", 2: "running", 3: "running"}


class EveNGError(RuntimeError):
    pass


class EveNGClient:
    def __init__(self) -> None:
        self._c = httpx.Client(base_url=settings.eveng_url, timeout=15.0, verify=False)
        self._auth = False

    def login(self) -> None:
        r = self._c.post(
            "/api/auth/login",
            json={"username": settings.eveng_user, "password": settings.eveng_pass, "html5": "-1"},
        )
        if r.status_code != 200:
            raise EveNGError(f"EVE-NG login failed: {r.status_code} {r.text[:200]}")
        self._auth = True

    def _get(self, path: str) -> dict:
        if not self._auth:
            self.login()
        r = self._c.get(path)
        if r.status_code in (401, 412):        # session expired
            self.login()
            r = self._c.get(path)
        if r.status_code != 200:
            raise EveNGError(f"GET {path} -> {r.status_code} {r.text[:200]}")
        return r.json().get("data", {})

    # -- public -----------------------------------------------------------
    def nodes(self) -> dict:
        """{ '1': {name, status, url, ...}, ... }"""
        return self._get(f"/api/labs{settings.lab_path}/nodes")

    def topology(self) -> list:
        return self._get(f"/api/labs{settings.lab_path}/topology")

    def start_node(self, node_id: str) -> dict:
        return self._get(f"/api/labs{settings.lab_path}/nodes/{node_id}/start")

    def stop_node(self, node_id: str) -> dict:
        return self._get(f"/api/labs{settings.lab_path}/nodes/{node_id}/stop")

    def enrich(self) -> dict:
        """name(upper) -> {id, status, console_host, console_port}"""
        out: dict[str, dict] = {}
        for node_id, n in self.nodes().items():
            host, port = None, None
            m = re.search(r"telnet://([\d.]+):(\d+)", n.get("url", "") or "")
            if m:
                host, port = m.group(1), int(m.group(2))
            out[str(n.get("name", "")).upper()] = {
                "id": node_id,
                "status": _STATUS.get(n.get("status"), str(n.get("status"))),
                "console_host": host,
                "console_port": port,
            }
        return out

"""Thin EVE-NG REST client: lab and node state, start/stop, console ports and lab import.
Config is pushed with Netmiko (see devices.py).

Every method takes an optional lab path (for example "/05_med.unl"). Without it the client uses the lab
that the dashboard currently has active (see labmgr)."""
from __future__ import annotations

import re

import httpx

from .config import settings

_STATUS = {0: "stopped", 1: "starting", 2: "running", 3: "running"}


class EveNGError(RuntimeError):
    pass


def _default_path() -> str:
    from . import labmgr                      # lazy: labmgr uses this module

    return labmgr.ACTIVE.eve_path


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

    def _request(self, method: str, path: str, **kw) -> httpx.Response:
        if not self._auth:
            self.login()
        r = self._c.request(method, path, **kw)
        if r.status_code in (401, 412):        # session expired, or another login on this account replaced it
            self.login()
            r = self._c.request(method, path, **kw)
        return r

    def _get(self, path: str) -> dict:
        r = self._request("GET", path)
        if r.status_code != 200:
            raise EveNGError(f"GET {path} -> {r.status_code} {r.text[:200]}")
        return r.json().get("data", {})

    # -- public -----------------------------------------------------------
    def nodes(self, lab_path: str | None = None) -> dict:
        """{ '1': {name, status, url, ...}, ... }"""
        return self._get(f"/api/labs{lab_path or _default_path()}/nodes")

    def topology(self, lab_path: str | None = None) -> list:
        return self._get(f"/api/labs{lab_path or _default_path()}/topology")

    def start_node(self, node_id: str, lab_path: str | None = None) -> dict:
        return self._get(f"/api/labs{lab_path or _default_path()}/nodes/{node_id}/start")

    def stop_node(self, node_id: str, lab_path: str | None = None) -> dict:
        return self._get(f"/api/labs{lab_path or _default_path()}/nodes/{node_id}/stop")

    def lab_exists(self, lab_path: str) -> bool:
        return self._request("GET", f"/api/labs{lab_path}").status_code == 200

    def import_lab(self, filename: str, zip_bytes: bytes, folder: str = "/") -> None:
        """Import a lab zip (the .unl at its top level) into an EVE folder."""
        r = self._request("POST", "/api/import", data={"path": folder},
                          files={"file": (filename, zip_bytes, "application/zip")})
        if r.status_code != 200:
            raise EveNGError(f"import {filename} -> {r.status_code} {r.text[:200]}")

    def enrich(self, lab_path: str | None = None) -> dict:
        """name(upper) -> {id, status, console_host, console_port}"""
        out: dict[str, dict] = {}
        for node_id, n in self.nodes(lab_path).items():
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

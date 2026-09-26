"""Router logins of every lab, for the Credentials tab: what the dashboard uses to log in (inventory) and whether the lab's
baseline configures the same login and enable secret."""
from __future__ import annotations

import re

from . import labmgr
from .inventory import build_devices

_ENABLE = re.compile(r"^enable secret (?:\d\s+)?(\S+)", re.M)
_USER = re.compile(r"^username (\S+) .*?secret (?:\d\s+)?(\S+)", re.M)


def _baseline_login(ctx, name: str) -> tuple[str, str, str] | None:
    """(user, password, enable secret) as written in the baseline of a router, or None when the file or a line is missing."""
    f = ctx.baseline / f"{name}.cfg"
    if not f.is_file():
        return None
    text = f.read_text(encoding="utf-8")
    en, us = _ENABLE.search(text), _USER.search(text)
    return (us.group(1), us.group(2), en.group(1)) if en and us else None


def all_credentials() -> list[dict]:
    labs = []
    for ctx in labmgr.contexts().values():
        rows = []
        for d in build_devices(None, ctx).values():
            base = _baseline_login(ctx, d.name)
            rows.append({"name": d.name, "role": d.role, "asn": d.asn, "mgmt_ip": d.mgmt_ip,
                         "username": d.username, "password": d.password, "secret": d.secret,
                         "baseline_match": base == (d.username, d.password, d.secret) if base else None})
        labs.append({"id": ctx.id, "short": ctx.short, "title": ctx.title, "group": ctx.group, "eve_path": ctx.eve_path, "routers": rows})
    return labs

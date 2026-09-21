from __future__ import annotations

from dataclasses import dataclass, field

from .config import load_inventory, settings
from .eveng import EveNGClient, EveNGError


@dataclass
class Device:
    name: str
    role: str
    asn: int
    mgmt_ip: str
    router_id: str
    username: str
    password: str
    secret: str
    eveng_id: str | None = None
    status: str = "unknown"
    console_host: str | None = None
    console_port: int | None = None

    @property
    def console(self) -> bool:
        return bool(self.console_host and self.console_port)


def build_devices(eve: EveNGClient | None = None) -> dict[str, Device]:
    inv = load_inventory()
    d = inv.get("defaults", {})
    devices: dict[str, Device] = {}
    for name, spec in inv["devices"].items():
        devices[name] = Device(
            name=name,
            role=spec["role"],
            asn=int(spec["asn"]),
            mgmt_ip=str(spec["mgmt_ip"]).split("/")[0],
            router_id=spec["router_id"],
            username=spec.get("username", d.get("username", settings.device_user)),
            password=spec.get("password", d.get("password", settings.device_pass)),
            secret=spec.get("secret", d.get("secret", settings.device_secret)),
        )
    if eve is not None:
        try:
            enriched = eve.enrich()
        except EveNGError:
            enriched = {}
        for name, dev in devices.items():
            e = enriched.get(name.upper())
            if e:
                dev.eveng_id = e["id"]
                dev.status = e["status"]
                dev.console_host = e["console_host"]
                dev.console_port = e["console_port"]
    return devices


def globals_dict() -> dict:
    return load_inventory().get("globals", {})

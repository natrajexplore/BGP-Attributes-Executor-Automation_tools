"""Netmiko access to routers. SSH to the MGMT VRF IP; fall back to the EVE-NG
telnet console port if SSH is unreachable."""
from __future__ import annotations

from netmiko import ConnectHandler
from netmiko.exceptions import (
    NetmikoAuthenticationException,
    NetmikoTimeoutException,
)

from .config import settings
from .inventory import Device


def _ssh_params(dev: Device) -> dict:
    return dict(
        device_type="cisco_ios",
        host=dev.mgmt_ip,
        username=dev.username,
        password=dev.password,
        secret=dev.secret,
        fast_cli=False,
        conn_timeout=settings.conn_timeout,
    )


def _console_params(dev: Device) -> dict:
    return dict(
        device_type="cisco_ios_telnet",
        host=dev.console_host,
        port=dev.console_port,
        username=dev.username,
        password=dev.password,
        secret=dev.secret,
        fast_cli=False,
        conn_timeout=settings.conn_timeout,
    )


def _connect(dev: Device):
    try:
        return ConnectHandler(**_ssh_params(dev))
    except (NetmikoTimeoutException, NetmikoAuthenticationException, OSError):
        if settings.console_fallback and dev.console:
            return ConnectHandler(**_console_params(dev))
        raise


def show(dev: Device, command: str, use_textfsm: bool = False) -> str:
    with _connect(dev) as c:
        c.enable()
        return c.send_command(command, use_textfsm=use_textfsm, read_timeout=settings.read_timeout)


def exec_cmd(dev: Device, command: str) -> str:
    with _connect(dev) as c:
        c.enable()
        return c.send_command_timing(command, read_timeout=settings.read_timeout)


def push_config(dev: Device, lines: list[str], save: bool = True) -> str:
    lines = [ln for ln in lines if ln.strip() and not ln.strip().startswith("!")]
    with _connect(dev) as c:
        c.enable()
        out = c.send_config_set(lines, read_timeout=max(60, settings.read_timeout))
        if save:
            out += "\n" + c.save_config()
        return out


def push_file(dev: Device, path: str) -> str:
    with open(path) as fh:
        return push_config(dev, fh.read().splitlines())

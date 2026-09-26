"""Netmiko access to routers. SSH to the MGMT VRF IP; fall back to the EVE-NG
telnet console port if SSH is unreachable.

Every function takes an optional `emit(router, kind, text)` callback. It receives the CLI session as it happens
(kinds: ssh, cmd, out, err, info) so the dashboard can show the real commands. Without it nothing is emitted."""
from __future__ import annotations

from typing import Callable

from netmiko import ConnectHandler
from netmiko.exceptions import (
    NetmikoAuthenticationException,
    NetmikoTimeoutException,
)

from .config import settings
from .inventory import Device

Emit = Callable[[str, str, str], None]


class WrongDevice(RuntimeError):
    """The address answered, but as another router: two labs are using the same management address."""


def _verify(dev: Device, c) -> None:
    """Never send anything to a router whose hostname is not the one this lab expects.

    Labs that run on the same management network (for example another project's lab with the same 192.168.99.x plan)
    can answer on our address. Talking to them could change their configuration, so the session is closed instead."""
    got = (c.base_prompt or "").strip()
    if got.lower() != dev.name.lower():
        c.disconnect()
        raise WrongDevice(f"{dev.mgmt_ip} answered as '{got}', expected '{dev.name}': another lab is using this address")
_ERR = ("% Invalid", "% Incomplete", "% Ambiguous", "% Unknown", "%Error")


def _ssh_params(dev: Device) -> dict:
    return dict(
        device_type="cisco_ios",
        host=dev.mgmt_ip,
        username=dev.username,
        password=dev.password,
        secret=dev.secret,
        fast_cli=False,
        conn_timeout=max(settings.conn_timeout, 45),           # the emulated routers answer slowly when the VM's CPUs are busy
        banner_timeout=45,
        auth_timeout=45,
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


def _connect(dev: Device, emit: Emit | None = None):
    say = emit or (lambda *a: None)
    try:
        c = ConnectHandler(**_ssh_params(dev))
        _verify(dev, c)
        say(dev.name, "ssh", f"$ ssh {dev.username}@{dev.mgmt_ip}")
        return c
    except (NetmikoTimeoutException, NetmikoAuthenticationException, OSError):
        if settings.console_fallback and dev.console:
            say(dev.name, "info", f"ssh to {dev.mgmt_ip} failed, using the console {dev.console_host}:{dev.console_port}")
            say(dev.name, "ssh", f"$ telnet {dev.console_host} {dev.console_port}")
            return ConnectHandler(**_console_params(dev))
        raise


def show(dev: Device, command: str, use_textfsm: bool = False, emit: Emit | None = None) -> str:
    say = emit or (lambda *a: None)
    with _connect(dev, emit) as c:
        c.enable()
        say(dev.name, "cmd", f"{c.find_prompt()}{command}")
        out = c.send_command(command, use_textfsm=use_textfsm, read_timeout=settings.read_timeout)
        say(dev.name, "out", out if isinstance(out, str) else str(out))
        return out


def show_many(dev: Device, commands: list[str], emit: Emit | None = None) -> dict[str, str]:
    """Several show commands over one session."""
    say = emit or (lambda *a: None)
    out: dict[str, str] = {}
    with _connect(dev, emit) as c:
        c.enable()
        prompt = c.find_prompt()
        for cmd in commands:
            say(dev.name, "cmd", f"{prompt}{cmd}")
            out[cmd] = c.send_command(cmd, read_timeout=settings.read_timeout)
            say(dev.name, "out", out[cmd])
    return out


def exec_cmd(dev: Device, command: str, emit: Emit | None = None) -> str:
    say = emit or (lambda *a: None)
    with _connect(dev, emit) as c:
        c.enable()
        say(dev.name, "cmd", f"{c.find_prompt()}{command}")
        out = c.send_command_timing(command, read_timeout=settings.read_timeout)
        if out.strip():
            say(dev.name, "out", out)
        return out


def push_config(dev: Device, lines: list[str], save: bool = True, emit: Emit | None = None) -> str:
    """Enter configuration mode, send the lines one at a time (each is echoed to `emit`), leave, save."""
    say = emit or (lambda *a: None)
    lines = [ln for ln in lines if ln.strip() and not ln.strip().startswith("!")]
    with _connect(dev, emit) as c:
        c.enable()
        say(dev.name, "cmd", f"{c.find_prompt()}configure terminal")
        c.config_mode()
        prompt = c.find_prompt()
        transcript = []
        for ln in lines:
            out = c.send_config_set([ln], enter_config_mode=False, exit_config_mode=False,
                                    read_timeout=max(60, settings.read_timeout))
            transcript.append(out)
            say(dev.name, "cmd", f"{prompt}{ln.strip()}")
            tail = [x for x in out.splitlines() if x.strip()]
            if tail and tail[-1].rstrip().endswith("#"):
                prompt = tail[-1].strip()                        # the prompt changes with the config mode
            errors = [x for x in tail if x.strip().startswith(_ERR)]
            if errors:
                say(dev.name, "err", "\n".join(errors))
        c.exit_config_mode()
        say(dev.name, "cmd", f"{prompt}end")
        result = "\n".join(transcript)
        if save:
            say(dev.name, "cmd", f"{c.find_prompt()}write memory")
            saved = c.save_config()
            say(dev.name, "out", saved.strip())
            result += "\n" + saved
        return result


def push_file(dev: Device, path: str, emit: Emit | None = None) -> str:
    with open(path, encoding="utf-8") as fh:
        return push_config(dev, fh.read().splitlines(), emit=emit)

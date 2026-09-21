#!/usr/bin/env python
"""One-time bring-up over the EVE-NG telnet console: hostname, local user,
domain name, RSA key, SSH-only VTY, and the MGMT interface - enough for the
dashboard to reach the node over SSH afterwards. Idempotent.

    docker exec -it bgp-attributes-executor python scripts/bootstrap.py [NODE ...]

Requires the EVE-NG API to be reachable so console ports can be discovered.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from netmiko import ConnectHandler                       # noqa: E402
from app.config import settings                          # noqa: E402
from app.eveng import EveNGClient                        # noqa: E402
from app.inventory import build_devices                  # noqa: E402

BOOTSTRAP = """
hostname {name}
enable secret {secret}
username {user} privilege 15 secret {password}
no ip domain lookup
ip domain name lab.local
ip vrf MGMT
 rd {asn}:99
interface FastEthernet0/0
 ip vrf forwarding MGMT
 ip address {mgmt_ip} 255.255.255.0
 no shutdown
 no shutdown
ip route vrf MGMT 0.0.0.0 0.0.0.0 {gw}
line vty 0 4
 login local
 transport input ssh
""".strip()


def dismiss_setup_dialog(host: str, port: int, timeout: int = 120) -> None:
    """Fresh IOS asks 'initial configuration dialog? [yes/no]' (and later
    'Press RETURN'), which Netmiko's login can't get past. Answer them raw."""
    import socket

    s = socket.create_connection((host, port), timeout=10)
    s.settimeout(2)
    seen = b""
    end = time.time() + timeout
    try:
        while time.time() < end:
            s.sendall(b"\r\n")
            try:
                seen = (seen + s.recv(4096))[-600:]
            except socket.timeout:
                pass
            low = seen.lower()
            if b"[yes/no]" in low:
                s.sendall(b"no\r\n")
                seen = b""
                time.sleep(3)
            elif b"press return" in low or low.rstrip().endswith((b">", b"#")):
                return
            time.sleep(2)
    finally:
        s.close()


def bootstrap_one(dev, gw: str) -> None:
    if not dev.console:
        print(f"-- {dev.name}: no console port from EVE-NG, skipped")
        return
    print(f"== {dev.name}: console {dev.console_host}:{dev.console_port}")
    dismiss_setup_dialog(dev.console_host, dev.console_port)
    conn = ConnectHandler(
        device_type="cisco_ios_telnet",
        host=dev.console_host,
        port=dev.console_port,
        username=dev.username,
        password=dev.password,
        secret=dev.secret,
        fast_cli=False,
    )
    conn.write_channel("\r\n")
    time.sleep(1)
    conn.enable()
    cfg = BOOTSTRAP.format(
        name=dev.name, secret=dev.secret, user=dev.username, password=dev.password,
        asn=dev.asn, mgmt_ip=dev.mgmt_ip, gw=gw,
    )
    conn.send_config_set(cfg.splitlines(), read_timeout=60)
    conn.set_base_prompt()                                # hostname changed the prompt

    # RSA key - needs a non-default hostname + domain (set above). 1024 bits keeps
    # emulated c7200 keygen to seconds; SSHv2 needs >= 768.
    conn.config_mode()
    out = conn.send_command_timing("crypto key generate rsa modulus 1024")
    if "yes/no" in out.lower():
        out += conn.send_command_timing("yes")
    conn.exit_config_mode()
    conn.set_base_prompt()
    for _ in range(60):                                   # wait for SSH to come up
        if "SSH Enabled" in conn.send_command("show ip ssh", read_timeout=60):
            break
        time.sleep(5)
    else:
        raise RuntimeError("SSH still disabled after keygen: " + out.strip()[-200:])
    conn.save_config()
    conn.disconnect()
    print(f"   {dev.name}: OK ({dev.mgmt_ip} reachable over SSH shortly)")


def main(argv: list[str]) -> int:
    from app.config import load_inventory

    gw = load_inventory().get("defaults", {}).get("mgmt_gateway", "192.168.99.1")
    devs = build_devices(EveNGClient())
    targets = argv or list(devs)
    for name in targets:
        if name not in devs:
            print(f"!! unknown device {name}")
            continue
        try:
            bootstrap_one(devs[name], gw)
        except Exception as exc:  # noqa: BLE001
            print(f"   {name}: FAILED {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

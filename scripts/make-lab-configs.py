"""Write labs/<lab>/CONFIGS.md for every lab: every router's full baseline configuration, the links, and the scenario
commands (apply and rollback, rendered from the Jinja templates) with the checks, so a lab can be built by hand on the consoles.

    python scripts/make-lab-configs.py            # all labs
    python scripts/make-lab-configs.py 12_mpls_l3vpn
The baseline .cfg files, inventory.yaml and scenarios/templates are the source of truth; this file is generated from them."""
import pathlib
import sys

import yaml
from jinja2 import Environment, FileSystemLoader

ROOT = pathlib.Path(__file__).resolve().parent.parent
LABS = ROOT / "labs"


def section_lines(cfg: str) -> list[str]:
    return [ln for ln in cfg.splitlines()]


def scenario_block(lab: pathlib.Path, inv: dict, sc_file: pathlib.Path) -> str:
    sc = yaml.safe_load(sc_file.read_text(encoding="utf-8"))
    env = Environment(loader=FileSystemLoader(str(lab / "templates")), keep_trailing_newline=True)
    variables = {**inv.get("globals", {}), **sc.get("vars", {})}

    def render(rollback: bool) -> str:
        text = env.get_template(sc["template"]).render(**variables, rollback=rollback)
        return "\n".join(ln.rstrip() for ln in text.splitlines() if ln.strip())

    out = [f"### Scenario `{sc_file.stem}`: {sc['title']}", "", " ".join(sc.get("summary", "").split()), "",
           f"Push to: **{', '.join(sc['targets'])}** (the same lines on each), in configuration mode.", "",
           "**Apply**", "", "```", render(False), "```", "", "**Roll back**", "", "```", render(True), "```", ""]
    checks = sc.get("verify", [])
    if checks:
        out += ["**Check the result** (after about " + str(sc.get("settle_seconds", 8)) + " s):", ""]
        out += [f"- `{c['device']}# {c['command']}`" for c in checks]
        out.append("")
    return "\n".join(out)


def build(lab: pathlib.Path) -> str:
    inv = yaml.safe_load((lab / "inventory.yaml").read_text(encoding="utf-8"))
    title = next((ln[2:].split(":", 1)[-1].strip() for ln in (lab / "inventory.yaml").read_text(encoding="utf-8").splitlines() if ln.startswith("# Lab")), lab.name)
    md = [f"# {lab.name}: all device configurations", "",
          f"{title}", "",
          "Everything below is generated from `inventory.yaml`, `baseline/*.cfg`, and `scenarios/` + `templates/` of this lab. The topology, README and the",
          "captured output are in `README.md`.", "",
          "## How to use it by hand", "",
          "1. Import and start the lab (`labs/labtool.sh " + lab.name + " import` and `start`, or import the `.zip` in the EVE web UI and start all nodes).",
          "2. Open each router's console. A fresh router asks `Would you like to enter the initial configuration dialog? [yes/no]:`. Answer `no`, press Enter, then type `enable`.",
          "3. Type `configure terminal` and paste that router's block below, then `end` and `write memory`.",
          "4. Routers can be pasted in any order. BGP sessions come up once both ends and the IGP (where the lab has one) are configured.", "",
          "**Management lines.** Every block contains a small management section (`ip vrf MGMT`, `FastEthernet0/0` in that VRF, `ip route vrf MGMT`, `username lab`, `enable secret`, "
          "`line vty`). It lets the dashboard and `labtool.sh` log in over SSH and is not part of the routing design. For a hand-built lab you can leave it out and use only the console. "
          "To use SSH you also need `crypto key generate rsa modulus 1024` once per router (the bootstrap script does that).", "",
          "## Links", "", "| Router A | Interface | Router B | Interface | Note |", "|---|---|---|---|---|"]
    raw = (lab / "inventory.yaml").read_text(encoding="utf-8").splitlines()
    notes = {}
    for ln in raw:
        if ln.strip().startswith("- {a:") and "#" in ln:
            notes[ln.split("#", 1)[0].strip()] = ln.split("#", 1)[1].strip()
    for link in inv["links"]:
        key = next((k for k in notes if f"a: {link['a']}," in k and f"b: {link['b']}," in k and link["a_if"] in k and link["b_if"] in k), None)
        md.append(f"| {link['a']} | {link['a_if']} | {link['b']} | {link['b_if']} | {notes.get(key, '')} |")
    md += ["", "## Devices", "", "| Router | Role | AS | Management IP |", "|---|---|---|---|"]
    for name, d in inv["devices"].items():
        md.append(f"| {name} | {d.get('role', '')} | {d.get('asn', '')} | {d.get('mgmt_ip', '')} |")
    md.append("")
    for cfg in sorted((lab / "baseline").glob("*.cfg")):
        md += [f"## {cfg.stem}", "", "```", cfg.read_text(encoding="utf-8").rstrip(), "```", ""]
    scenarios = sorted((lab / "scenarios").glob("*.yaml"))
    if scenarios:
        md += ["## Scenarios (the change the lab is about)", ""]
        for sc in scenarios:
            md.append(scenario_block(lab, inv, sc))
    probes = lab / "probes.txt"
    if probes.exists():
        md += ["## Commands used to capture the README output", "", "```"]
        md += [f"{d}# {c}" for d, c in (ln.split("|", 1) for ln in probes.read_text(encoding="utf-8").splitlines() if "|" in ln)]
        md += ["```", ""]
    return "\n".join(md)


def main(argv: list[str]) -> int:
    labs = [LABS / a for a in argv] if argv else sorted(p for p in LABS.iterdir() if (p / "baseline").is_dir())
    for lab in labs:
        (lab / "CONFIGS.md").write_text(build(lab), encoding="utf-8", newline="\n")
        print("wrote", lab.relative_to(ROOT) / "CONFIGS.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

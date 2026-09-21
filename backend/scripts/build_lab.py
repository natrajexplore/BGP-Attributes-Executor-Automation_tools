#!/usr/bin/env python
"""Generate an EVE-NG topology file from inventory.yaml.

    python backend/scripts/build_lab.py [--inventory FILE] [--out labs/bgp-attributes.unl] [--image NAME]

--inventory selects another lab definition (default: backend/inventory.yaml), which is how the
per-attribute labs under labs/<NN_attribute>/ are generated.

Produces a Cisco 7206VXR (c7200 / Dynamips) lab: 8 nodes, 12 point-to-point
bridge links and one pnet1 (Cloud1) management bridge. Import it in EVE-NG
(Import, or drop into /opt/unetlab/labs/), then push configs with
scripts/push_baseline.py.
"""
from __future__ import annotations

import argparse
import xml.dom.minidom as minidom
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
INVENTORY = ROOT / "inventory.yaml"


def iface_id(name: str) -> int:
    """fa0/0, e1/2 -> EVE dynamips interface id (slot*16 + port)."""
    import re
    s, p = re.search(r"(\d+)/(\d+)$", name).groups()
    return int(s) * 16 + int(p)


def midpoint(a: list[int], b: list[int], dx: int = 0, dy: int = 0) -> tuple[int, int]:
    return (a[0] + b[0]) // 2 + dx, (a[1] + b[1]) // 2 + dy


def build(inv: dict, image: str | None) -> ET.ElementTree:
    lab_cfg = inv["lab"]
    devices = inv["devices"]
    image = image or lab_cfg["image"]

    lab = ET.Element("lab", {
        "name": lab_cfg["name"], "id": lab_cfg["uuid"], "version": "1",
        "scripttimeout": "300", "lock": "0", "sase": "0",
    })
    topo = ET.SubElement(lab, "topology")
    nodes_el = ET.SubElement(topo, "nodes")
    nets_el = ET.SubElement(topo, "networks")

    node_id = {name: i + 1 for i, name in enumerate(devices)}

    # --- management bridge (Cloud1) --------------------------------------
    mgmt_net_id = 1
    ET.SubElement(nets_el, "network", {
        "id": str(mgmt_net_id), "type": lab_cfg["mgmt_network"]["type"],
        "name": lab_cfg["mgmt_network"]["name"], "left": "900", "top": "50", "visibility": "1",
    })

    # --- per-node interface lists --------------------------------------
    ifaces: dict[str, list[tuple[str, int]]] = {
        n: [(lab_cfg["mgmt_interface"], mgmt_net_id)] for n in devices
    }

    for idx, link in enumerate(inv["links"], start=2):
        a, b = link["a"], link["b"]
        ca, cb = devices[a]["canvas"], devices[b]["canvas"]
        lx, ly = midpoint(ca, cb)
        ET.SubElement(nets_el, "network", {
            "id": str(idx), "type": "bridge", "name": f"{a}--{b}",
            "left": str(lx), "top": str(ly), "visibility": "1",
        })
        ifaces[a].append((link["a_if"], idx))
        ifaces[b].append((link["b_if"], idx))

    # --- nodes ----------------------------------------------------------
    for name, spec in devices.items():
        attrs = {
            "id": str(node_id[name]), "name": name, "type": "dynamips",
            "template": lab_cfg["template"], "image": image, "console": "telnet",
            "delay": "0", "cpu": "0", "ram": str(lab_cfg["ram"]),
            "nvram": str(lab_cfg["nvram"]), "idlepc": lab_cfg["idlepc"],
            "config": "0", "left": str(spec["canvas"][0]), "top": str(spec["canvas"][1]),
        }
        node = ET.SubElement(nodes_el, "node", attrs)
        # EVE reads Dynamips adapters from <slot> child elements (slot 0 = onboard IO from the template);
        # slotN="..." attributes are ignored and the node boots without any data interfaces.
        for i, module in enumerate(lab_cfg["slots"], start=1):
            ET.SubElement(node, "slot", {"id": str(i), "module": module})
        for if_name, net_id in sorted(ifaces[name], key=lambda t: iface_id(t[0])):
            ET.SubElement(node, "interface", {
                "id": str(iface_id(if_name)), "name": if_name.lower(),
                "type": "ethernet", "network_id": str(net_id),
            })

    ET.SubElement(lab, "objects")
    return ET.ElementTree(lab)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT.parent / "labs" / "bgp-attributes.unl"))
    ap.add_argument("--image", default=None)
    ap.add_argument("--inventory", default=str(INVENTORY), help="lab definition YAML (default: backend/inventory.yaml)")
    args = ap.parse_args()

    inv = yaml.safe_load(Path(args.inventory).read_text())
    tree = build(inv, args.image)

    raw = ET.tostring(tree.getroot(), encoding="unicode")
    pretty = minidom.parseString(raw).toprettyxml(indent=" ", encoding="UTF-8").decode()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(pretty)
    n_nodes = len(inv["devices"])
    n_links = len(inv["links"])
    print(f"wrote {out}  ({n_nodes} c7200 nodes, {n_links} links + Cloud1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

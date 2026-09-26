# labs/

## Shared lab

`bgp-attributes.unl` is the 8-router lab that the dashboard's shared-lab scenarios run on
(see `docs/topology.md`). It is generated from `backend/inventory.yaml` by `backend/scripts/build_lab.py`.

## Management addresses

Every lab in this repository uses management addresses **192.168.99.101 to .199** (Fa0/0 in VRF `MGMT`, gateway 192.168.99.1). Other projects on the same EVE
bridge (for example an `ospf-sla` lab on 192.168.99.11 to .14) keep the lower addresses. See [`docs/addressing.md`](../docs/addressing.md).

## Building a lab by hand

Every lab folder has a generated `CONFIGS.md`: the links, every router's full configuration ready to paste on its console, and the scenario
commands (apply and rollback) with the checks. Regenerate them with `python scripts/make-lab-configs.py [lab]` after changing a baseline or scenario.

## Per-attribute labs

Standalone labs sized to one attribute's use case, each in its own folder with an inventory, baseline configs, a
scenario and a generated `.unl`. They are **not** served by the dashboard: you drive them with `labtool.sh`.

| Lab | Use case | Status |
|---|---|---|
| `01_weight/` | Branch with a local ISP and a WAN path to HQ; weight makes it exit locally | Tested on the lab |
| `02_local_pref/` | Dual-homed enterprise with a core router; the whole AS follows one edge, and the transit side effect | Tested on the lab |
| `03_as_path/` | Two ISPs and a content network; a prepend moves inbound traffic | Tested on the lab |
| `04_origin/` | `network` versus `redistribute static` on two edges to one ISP; a real `Origin incomplete` | Tested on the lab |
| `05_med/` | Two data centres linked to two POPs of the same provider (MED is compared between paths from one neighbor AS) | Tested on the lab |
| `06_next_hop/` | ISP link outside the IGP behind a route reflector; `(inaccessible)` next hop | Tested on the lab |
| `07_atomic_aggregate/` | A summary on one edge and not the other, then the fix (two scenarios) | Tested on the lab |
| `08_aggregator/` | Two subsidiary ASes summarised at a hub, showing a real AS_SET | Tested on the lab |
| `09_community/` | no-export and a custom community toward one of two ISPs | Tested on the lab |
| `10_originator_id/` | Route reflector with three clients, plus a duplicate router-ID (two scenarios) | Tested on the lab |
| `11_cluster_list/` | Two-tier reflector hierarchy and a cluster-ID clash between tiers | Tested on the lab |

### MP-BGP and MPLS VPN labs (IPv4 unicast + VPNv4)

Small MPLS cores (PE, P and customer routers, all c7200) for the "MP-BGP and MPLS VPN" section of the Learn tab. Each has
the same folder layout and is driven with the same `labtool.sh` commands. They need `mpls` and VPNv4 support in the image
(checked on `c7200-adventerprisek9-mz.152-4.S6`). Bootstrap of the 5 to 7 routers takes several minutes.

| Lab | Use case | Status |
|---|---|---|
| `12_mpls_l3vpn/` | One customer, two sites over an MPLS core (LDP, VPNv4, VRF); a mistyped import route-target breaks one direction | Tested on the lab |
| `13_mpls_overlap/` | Two customers with the same 10.1.0.0/24 (RD, RT, labels); one extra export route-target leaks a customer into another | Tested on the lab |
| `14_mpls_shared_services/` | Shared-services VRF: two customers reach one service and not each other; a one-way extranet completed by one import RT | Tested on the lab |
| `15_mpls_hub_spoke/` | Hub and spoke through a central firewall (two hub VRFs, a summary); one extra spoke import bypasses the firewall | Tested on the lab |
| `16_mpls_vpnv4_rr/` | Four PEs and a VPNv4 route reflector; two PEs that lose client status stop hearing each other | Tested on the lab |
| `17_mpls_as_override/` | Same customer AS at both sites: the far CE drops the route; fixed with `as-override` on the PEs or `allowas-in` on the CEs (two scenarios) | Tested on the lab |

Each folder's `README.md` has the topology, addressing, commands and the router output captured while testing it.

### Running one

```
# on the EVE VM, from /opt/bgp-attributes-executor
labs/labtool.sh main stop ; docker stop bgp-attributes-executor       # never run two labs at once
labs/labtool.sh <lab> up                        # import + start + bootstrap + baseline
labs/labtool.sh <lab> apply <scenario-id>
...
labs/labtool.sh <lab> stop ; labs/labtool.sh main start ; docker start bgp-attributes-executor
```

Two labs must never run at the same time: EVE keys Dynamips nodes by tenant and node id, so their nodes collide, and
the dashboard container polls the same management addresses.

### Regenerating a `.unl`

```
python backend/scripts/build_lab.py --inventory labs/05_med/inventory.yaml --out labs/05_med/05_med.unl
```

### Reading and downloading them from the dashboard

The dashboard serves each lab's README and its `.unl` to the Learn tab (Practitioner page, section "Lab topology"):

* `GET /api/labs` lists the labs, `GET /api/labs/<id>/readme` returns the README, `GET /api/labs/<id>/unl` downloads the bare topology file and
  `GET /api/labs/<id>/zip` downloads it wrapped in a zip.
* **To import a lab through EVE, use the `.zip`.** EVE's import **rejects a bare `.unl`** (`HTTP 400: Import file must be a Zip file`) but accepts a zip that
  contains the `.unl` at its top level. Tested on 2026-09-21 through EVE's import API with the zips the dashboard serves: all 11 imported, and each
  imported lab matched its source (UUID, node names, networks and router image). The web UI's Import button itself was not clicked, and starting an
  imported lab was not tested (stop the shared lab first, as for any lab).
* To copy the file yourself instead, use the bare `.unl`: put it in `/opt/unetlab/labs` on the EVE VM (`labs/labtool.sh <lab> import` does exactly that).

### Exploring the routers while a lab runs (EVE tenants)

EVE-NG runs each account's nodes in its own **tenant** (the account's pod). The dashboard and `labs/labtool.sh` log in as `bgpapi`, so the labs they start
run in tenant 1. Your own `admin` login is tenant 0: it can open the lab files and their topology, but it does **not** see nodes started by `bgpapi` as
running, and it cannot stop them (and the reverse). Consequences:

* **To look at a configured, running router, use SSH, not the EVE web console.** The EVE-NG card of the Live labs tab gives a copy-ready command that goes through the VM as a jump host
  (`ssh -J root@<vm-ip> -o KexAlgorithms=+diffie-hellman-group14-sha1 -o HostKeyAlgorithms=+ssh-rsa -o Ciphers=+aes128-cbc lab@192.168.99.<n>`). Only an unconfigured router needs its console
  (`GET /api/devices` lists the ports, one client at a time); do not hold one open while `labtool.sh bootstrap` runs.
* **Do not start a lab from the EVE web UI as `admin` while the same lab runs under `bgpapi`.** You would get a second copy in tenant 0 on the same management
  addresses, which is what happened once (two copies of the shared lab, answering the same addresses). A router's saved configuration lives with the tenant,
  so a lab started in a different tenant boots **blank** and needs `labtool.sh <lab> bootstrap` and `baseline` again.
* `bgpapi` allows one session, and the dashboard container uses it too, so stop the dashboard before running `labtool.sh` or an EVE API test (as the steps above do).

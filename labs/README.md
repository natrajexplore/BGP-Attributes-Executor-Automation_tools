# labs/

## Shared lab

`bgp-attributes.unl` is the 8-router lab that the dashboard's Lab tab and all 11 scenarios run on
(see `docs/topology.md`). It is generated from `backend/inventory.yaml` by `backend/scripts/build_lab.py`.

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

* `GET /api/labs` lists the labs, `GET /api/labs/<id>/readme` returns the README, `GET /api/labs/<id>/unl` downloads the topology file.
* To use a downloaded `.unl` yourself, copy it into `/opt/unetlab/labs` on the EVE VM. `labs/labtool.sh <lab> import` does exactly that.
  (Importing a bare `.unl` through the EVE web UI's Import button has not been tested; that button expects EVE's own zip export.)

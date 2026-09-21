# labs/

## Shared lab

`bgp-attributes.unl` is the 8-router lab that the dashboard's Lab tab and all 11 scenarios run on
(see `docs/topology.md`). It is generated from `backend/inventory.yaml` by `backend/scripts/build_lab.py`.

## Per-attribute labs

Standalone labs sized to one attribute's use case, each in its own folder with an inventory, baseline configs, a
scenario and a generated `.unl`. They are **not** served by the dashboard: you drive them with `labtool.sh`.

| Lab | Use case | Status |
|---|---|---|
| `05_med/` | Two data centres linked to two POPs of the same provider (MED is compared between paths from one neighbor AS) | Tested on the lab |
| `08_aggregator/` | Two subsidiary ASes summarised at a hub, showing a real AS_SET | Tested on the lab |

Each folder's `README.md` has the topology, addressing, commands and the router output captured while testing it.

### Running one

```
# on the EVE VM, from /opt/bgp-attributes-executor
labs/labtool.sh main stop ; docker stop bgp-attributes-executor       # never run two labs at once
labs/labtool.sh <lab> import && labs/labtool.sh <lab> start
labs/labtool.sh <lab> bootstrap ; labs/labtool.sh <lab> baseline
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

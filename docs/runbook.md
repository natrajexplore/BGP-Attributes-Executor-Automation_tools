# Runbook

## (Re)generate the EVE-NG topology

```bash
python backend/scripts/build_lab.py            # -> labs/bgp-attributes.unl
```
Run this after editing `inventory.yaml` (`lab:` / `links:` / `devices:`), then
re-import in EVE-NG. Node/link layout only — configs are pushed separately.

## Push the baseline (known-good state)

The baseline configs live in `backend/baseline/<NODE>.cfg` and are full IOS
configs. Push them once after the lab boots, and any time a scenario leaves the
lab dirty.

From the EVE host (container running):

```bash
docker exec -it bgp-attributes-executor python scripts/push_baseline.py            # all nodes
docker exec -it bgp-attributes-executor python scripts/push_baseline.py EDGE1 EDGE2  # subset
```

Or from the dashboard: **Reset lab to baseline** button (calls `POST /api/lab/reset`).

## Health check

```bash
docker exec -it bgp-attributes-executor python scripts/healthcheck.py
```
Pings each MGMT IP, opens SSH, runs `show ip bgp summary`, prints a table.

## Run a scenario

Dashboard → scenario card → **Run**. The backend:

1. captures the verify `show` commands  → **before**
2. renders `templates/<id>.j2` and pushes it to the scenario `targets`
3. `clear ip bgp * soft` on the targets (if `soft_clear: true`)
4. re-captures the verify commands → **after**
5. runs the regex assertions, stores the run under `backend/runs/<run_id>.json`

**Rollback** re-renders the same template with `rollback=true` and repeats 2-5.

## If a scenario wedges the lab

```bash
docker exec -it bgp-attributes-executor python scripts/push_baseline.py <affected nodes>
```
Scenarios 06 and 11 intentionally break reachability for one prefix; rollback or
baseline restores it.

## Adjusting the design

* AS numbers / IPs / router-ids: `backend/inventory.yaml` **and** the matching
  `backend/baseline/*.cfg`. Physical ports / links also live in `inventory.yaml`
  (`links:`) — re-run `build_lab.py` and re-import after changing them.
* c7200 image name: `inventory.yaml` `lab.image`, or `build_lab.py --image`.
* New scenario: add `templates/NN_x.j2` + `scenarios/NN_x.yaml`. No code change.
* Different lab name: set `BGP_LAB_PATH` in `.env`.

#!/usr/bin/env bash
# Drive one per-attribute lab (labs/<NN_attribute>/) on the EVE-NG VM. Run it ON THE VM, from /opt/bgp-attributes-executor:
#
#   labs/labtool.sh <lab> import                 copy <lab>.unl into EVE-NG (/opt/unetlab/labs)
#   labs/labtool.sh <lab> start | stop           start / stop every node of that lab through the EVE API
#   labs/labtool.sh <lab> bootstrap              one-time console bring-up (hostname, SSH, mgmt) of every node
#   labs/labtool.sh <lab> baseline               push baseline/<NODE>.cfg to every node
#   labs/labtool.sh <lab> apply | rollback <id>  run the scenario in the lab's scenarios/ folder
#   labs/labtool.sh <lab> show <DEVICE> "<cmd>"  read-only show command
#   labs/labtool.sh main stop | start            stop / start the shared 8-router lab (see below)
#
# Never run two labs at the same time: EVE keys Dynamips nodes by tenant and node id, so two labs collide.
# Stop the shared lab (and the dashboard container, whose monitor polls the same management addresses) first:
#   labs/labtool.sh main stop ; docker stop bgp-attributes-executor
# and bring them back afterwards:
#   labs/labtool.sh <lab> stop ; labs/labtool.sh main start ; docker start bgp-attributes-executor
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAB="${1:?usage: labtool.sh <lab|main> <command> [args]}"; CMD="${2:?missing command}"; shift 2

if [ "$LAB" = "main" ]; then
  LABPATH="/bgp-attributes.unl"; LABDIR="$ROOT/backend"; INV="/app/inventory.yaml"; BASE="/app/baseline"; SCN="/app/scenarios"; TPL="/app/templates"
else
  LABDIR="$ROOT/labs/$LAB"; [ -d "$LABDIR" ] || { echo "no such lab folder: $LABDIR" >&2; exit 2; }
  LABPATH="/$LAB.unl"; INV="/lab/inventory.yaml"; BASE="/lab/baseline"; SCN="/lab/scenarios"; TPL="/lab/templates"
fi

# a throwaway container from the dashboard image, pointed at this lab (no backend code changes needed)
dock() {
  docker run --rm -i --network host --env-file "$ROOT/.env" \
    -v "$LABDIR:/lab:ro" -v "$ROOT/backend/scripts:/app/scripts:ro" \
    -e BGP_INVENTORY="$INV" -e BGP_BASELINE="$BASE" -e BGP_SCENARIOS="$SCN" -e BGP_TEMPLATES="$TPL" \
    -e BGP_LAB_PATH="$LABPATH" -e BGP_MONITOR=false -e BGP_KAFKA_BOOTSTRAP= -e BGP_RUNS=/tmp/runs \
    bgp-attributes-executor:latest "$@"
}

nodes() {  # $1 = start | stop
  dock python - "$1" <<'PY'
import sys, time
from app.eveng import EveNGClient
c = EveNGClient(); action = sys.argv[1]
nodes = c.enrich()
for name, v in sorted(nodes.items(), key=lambda kv: int(kv[1]["id"])):
    (c.start_node if action == "start" else c.stop_node)(v["id"]); print(f"{action} {name}"); time.sleep(2 if action == "start" else 0)
time.sleep(8)
print({n: v["status"] for n, v in c.enrich().items()})
PY
}

case "$CMD" in
  import)   cp "$LABDIR/$LAB.unl" "/opt/unetlab/labs/$LAB.unl"; chown www-data:www-data "/opt/unetlab/labs/$LAB.unl"; chmod 644 "/opt/unetlab/labs/$LAB.unl"; echo "imported /opt/unetlab/labs/$LAB.unl" ;;
  start|stop) nodes "$CMD" ;;
  bootstrap) dock python scripts/bootstrap.py "$@" ;;
  baseline)  dock python scripts/push_baseline.py "$@" ;;
  apply|rollback|show) dock python scripts/run_scenario.py "$CMD" "$@" ;;
  *) echo "unknown command: $CMD" >&2; exit 2 ;;
esac

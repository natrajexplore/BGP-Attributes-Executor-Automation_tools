#!/usr/bin/env bash
# Set the EVE-NG account that the dashboard and labs/labtool.sh log in with, without echoing the password.
# EVE-NG allows one active session per account, so automation should not share the account you use in the browser.
#
# Run it ON THE VM (needs a terminal, for the hidden password prompt):
#   ssh -t root@<vm> /opt/bgp-attributes-executor/scripts/set-eve-user.sh [username]     (default username: bgpapi)
#
# It changes only BGP_EVENG_USER and BGP_EVENG_PASS in .env, keeps a copy as .env.bak-before-eve-user, and
# recreates the dashboard container so it picks the change up. The password is never printed or logged.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env ] || { echo ".env not found in $(pwd)" >&2; exit 1; }

USER_NAME="${1:-bgpapi}"
read -rsp "EVE-NG password for ${USER_NAME}: " PASS; echo
[ -n "$PASS" ] || { echo "empty password, nothing changed" >&2; exit 1; }

cp -p .env .env.bak-before-eve-user
U="$USER_NAME" P="$PASS" awk '
  /^BGP_EVENG_USER=/ { print "BGP_EVENG_USER=" ENVIRON["U"]; next }
  /^BGP_EVENG_PASS=/ { print "BGP_EVENG_PASS=" ENVIRON["P"]; next }
  { print }' .env > .env.new
chmod --reference=.env .env.new
mv .env.new .env
echo "updated BGP_EVENG_USER and BGP_EVENG_PASS in $(pwd)/.env (previous file kept as .env.bak-before-eve-user)"

docker compose up -d --force-recreate
echo "done. Delete .env.bak-before-eve-user when you no longer need the old values."

# Live labs: run any scenario on its own topology

The **Live labs** tab (the default view of the dashboard, and the only place scenarios are run) lists all 31 scenarios: the 11 BGP attributes, the 6 MPLS VPN use cases, their extra scenarios and the classic
shared-lab scenarios. Clicking **Run** on a scenario makes the VM switch to that scenario's own topology, configure it if needed, run the scenario over SSH and verify it,
while a 3D view and a CLI transcript show what happens.

```
Run 05_med  ─►  stop the running lab ─► start lab 05 (4 routers) ─► wait for SSH ─► check the baseline ─► wait for BGP
                                                                                          │
   3D view: routers, links, BGP sessions   ◄── live state ──   push the config over SSH ◄─┘   verify ─► roll back when asked
   CLI panel: ssh lab@192.168.99.11x, configure terminal, every line, end, write memory, the show commands
```

## What you see

| Area | What it shows |
|---|---|
| **Catalogue** (left) | 18 labs in three groups. Each lab lists its scenarios with **Run** and **Rollback**, and **View in 3D** / **Start this lab**. A dot shows whether a lab is running now (green), configured and saved (blue) or never configured (grey) |
| **3D topology** | The lab's routers on tiers (customers or outside, edge, core), the physical links, and the BGP sessions as arcs: iBGP blue, eBGP orange, MP-BGP VPNv4 magenta, PE-CE sessions in a VRF cyan. Router rings are green when the router answers, amber while starting, red when not answering, grey when stopped. Sessions turn red when down. Every router that receives configuration pulses, and a cyan **SSH executor** sends a beam to it. Drag to orbit, scroll to zoom, click a router to select its CLI tab |
| **Steps** | The stages of the run with their state: roll back what is still applied, stop the running lab, start the routers, wait for the routers, first-time setup, check the baseline, wait for BGP, capture the state before, push, let BGP converge, verify |
| **SSH / CLI** | The real SSH sessions, per router: `$ ssh lab@<address>`, `<router>#configure terminal`, each configuration line with the prompt of the mode it was typed in, `end`, `write memory`, and the show commands of the checks with their output. A box under it runs whitelisted read-only show commands on the selected router |

Anything a scenario needs is done for you. **Only one lab runs at a time** (the VM has 8 GB and EVE-NG cannot run two of these labs together), so a run first stops the lab that is
running. Before leaving a lab, anything still applied there is rolled back, so every lab is stopped at its baseline.

## Seeing the running lab in the EVE-NG web page

The dashboard drives the routers as the EVE-NG account `bgpapi` (pod 1). EVE-NG keeps pods apart, so an account in another pod such as `admin` (pod -1) never sees these routers running, although the commands do run on them.
Create a second account for the web page once (**System -> User management -> Add new user**, role Administrator, **POD 1**, a password you choose), log in with it, and open the lab from the folder list: the routers show as
running and their consoles open. Keep it separate from `bgpapi`: EVE-NG allows one session per account, so `bgpapi` itself would be logged out whenever the dashboard uses it.

### Reaching the routers: SSH only

Routers accept **SSH only** (`line vty`, `transport input ssh`, user `lab`); the EVE-NG telnet consoles are not offered in the dashboard. The management network `192.168.99.0/24` exists inside the EVE-NG VM, so a PC reaches a router
through the VM as a jump host. The **EVE-NG** card lists each router of the shown lab with its EVE-NG state and an **SSH session** button, shown only for routers that answer SSH (so only for the lab that is really running).

### One PuTTY window per router

The **EVE-NG** card of Live labs and the **Credentials** tab have an **SSH session** button on every router. It opens that router in its own PuTTY window (user `lab`, PuTTY asks for the password: see the Credentials tab).
A web page cannot start programs, so the PC needs a small handler, installed once (your Windows user only, no administrator rights):

```
powershell -ExecutionPolicy Bypass -File scripts\putty-setup.ps1            # install
powershell -ExecutionPolicy Bypass -File scripts\putty-setup.ps1 -DryRun    # show what it would do
powershell -ExecutionPolicy Bypass -File scripts\putty-setup.ps1 -Uninstall
```

The script reads the router list from the dashboard and creates one saved PuTTY session per router, named `BGP <lab> <router>`. PuTTY reaches the router through the EVE-NG VM with the Windows OpenSSH client
(`ssh.exe -W`, your existing key for the VM), because the router addresses only exist inside the VM. It also registers a `bgpputty:` link, which `scripts\putty-launch.ps1` turns into `putty.exe -load "BGP <lab> <router>"`.
The first click makes the browser ask once to allow the link. Run the setup again when labs are added. The password is never stored. The first time you open a router, PuTTY shows its **Security Alert** for the router's host key: click **Accept** (a router that was wiped and rebuilt has a new key, so the alert returns). The sessions use only the algorithms that the routers' IOS 15.2 SSH server offers (DH group14, AES/3DES, RSA), and a 32-bit PuTTY starts the 64-bit `ssh.exe` through `C:\Windows\Sysnative`.

Without PuTTY, any terminal works (IOS 15.2 needs the legacy algorithms):
`ssh -J root@<eve-vm-ip> -o KexAlgorithms=+diffie-hellman-group14-sha1 -o HostKeyAlgorithms=+ssh-rsa -o Ciphers=+aes128-cbc lab@192.168.99.111`.

## 3D views in the Learn tab

`frontend/learn3d.js` mounts the same 3D scene on the Learn pages. `frontend/learn-3d.js` holds one entry per page: the lab, the path of the animated packet (it follows real links of the lab, which a test checks), one caption per hop
and a sentence under the view. The routers a scenario configures are highlighted automatically from the scenario's targets (`GET /api/labs/<lab>/graph`, field `lab.targets`). Without WebGL the box shows a short message.

## Times

| Situation | Time |
|---|---|
| Run on the lab that is already running | seconds plus the scenario's own settle time (20 to 75 s) |
| Switch to a lab that was configured before | about 2 to 5 minutes (stop, start, boot, checks) |
| First run on a lab that was never configured | about 10 to 15 minutes (console setup and baseline push) |
| **Prepare all labs** (once) | roughly 2 to 3 hours in the background: every lab is started, set up, saved and stopped in turn |

## Safety rules the dashboard follows

1. **It never talks to a router whose hostname is not the expected one.** Every SSH session checks the hostname first and closes without sending anything if it differs.
2. **It never starts a lab whose management addresses another router already answers on.** The run stops with a message that names the address and the router that answered.
3. **One run at a time.** A second Run gets a "another run is in progress" message.
4. **It only stops labs through the lab that is really running.** EVE-NG reports the routers of every lab with matching node ids as running, and a stop sent through the wrong lab does nothing.

## Management addresses

This project uses **192.168.99.101 to 192.168.99.199** for router management (last octet = 100 + a per-router number). Other projects on the same EVE bridge must not use these addresses,
and this project must not use the ones below .100. See [`addressing.md`](addressing.md).

## HTTP API

| Endpoint | What it does |
|---|---|
| `GET /api/catalog` | Every lab with its scenarios, whether it is active, configured and what is still applied |
| `GET /api/lab/status` | The active lab, `running`, `phase` (`idle` or `switching`), the run that is in progress |
| `GET /api/labs/{lab}/graph` | Routers, links and BGP sessions for the 3D view; live state when the lab is the running one |
| `POST /api/labs/{lab}/scenarios/{id}/run` and `/rollback` | Run or roll back a scenario, switching to the lab first. Returns `run_id` |
| `POST /api/labs/{lab}/activate` | Switch to a lab without running a scenario |
| `POST /api/prewarm` | Configure and save every lab once (long) |
| `GET /api/stream/{run_id}` | Server-sent events of a run: `plan`, `step`, `cli`, `log`, `result`. A client that connects late still receives everything from the start |
| `GET /api/runs/{run_id}` | The record of a run, including the results and diffs |

`{lab}` is `shared` or a lab folder name such as `05_med`. The original endpoints (`/api/scenarios/...`) still exist and drive the shared lab.

## Code

| File | Role |
|---|---|
| `backend/app/labmgr.py` | Lab registry, the switch workflow, the run lock, progress events |
| `backend/app/scenarios.py` | Scenario runs for any lab, with the steps and the CLI stream |
| `backend/app/devices.py` | SSH with the hostname check; streams every command to the CLI panel |
| `backend/app/graph.py` | The 3D graph, read from `inventory.yaml` and `baseline/*.cfg` |
| `backend/app/monitor.py` | Session monitor for the active lab (IPv4 and VPNv4 sessions) |
| `frontend/live.js`, `live3d.js`, `live.css` | The tab; `vendor/` holds Three.js (r128, MIT) |
| `backend/tests/` | Offline tests of the switch workflow and the hostname guard |

Run the tests with `cd backend && ../venv/Scripts/python.exe tests/test_flow.py` (and `test_guard.py`).

## Troubleshooting

| Message | Meaning and fix |
|---|---|
| `another run is in progress` | Wait for the current run, or open the tab again: it follows a run that is in progress |
| `cannot start <lab>: 192.168.99.x is answered by '<name>'` | A router of another lab already uses that address. Stop the other lab, or move one of the projects to different addresses |
| `... answered as 'R1', expected 'DC-EAST'` | The same, seen while logging in: nothing was sent |
| `could not stop the running lab` | EVE-NG still reports a lab running after the stop. Stop it in EVE-NG or with `labs/labtool.sh <lab> stop` |
| `no SSH on <routers> after the console setup` | The console setup did not finish. Check the console of that router, then run **Start this lab** again |
| `baseline still missing on ...` | The push to the router failed; the CLI panel shows the router's own error |

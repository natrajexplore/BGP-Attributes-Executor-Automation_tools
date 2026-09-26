# User guide for a new network engineer

This guide takes you from "I have never used this" to running the labs and understanding what you see. It assumes you know what a router,
an IP address and a routing table are. It does **not** assume you know BGP or MPLS: the labs teach both.

Read [Part 1](#part-1-the-ideas-in-five-minutes) once, then follow [Part 2](#part-2-your-first-hour) step by step. After that use the
[study plan](#part-6-a-study-plan) and come back to the other parts when you need them.

Contents: [1 Ideas](#part-1-the-ideas-in-five-minutes) · [2 First hour](#part-2-your-first-hour) · [3 The Learn tab](#part-3-how-to-use-the-learn-tab) ·
[4 Run a lab by hand](#part-4-run-a-standalone-lab-by-hand) · [5 Reading the output](#part-5-reading-router-output) · [6 Study plan](#part-6-a-study-plan) ·
[7 When something goes wrong](#part-7-when-something-goes-wrong) · [8 Cheat sheets](#part-8-cheat-sheets) · [9 Glossary](#part-9-glossary)

---

## Part 1: The ideas in five minutes

**What this is.** A set of practice networks made of real Cisco IOS routers (running inside EVE-NG on your VM), plus a web dashboard that explains
BGP and can change router configuration for you and show what changed.

**What BGP is, in three sentences.** BGP is the routing protocol between networks (autonomous systems, "AS"). Each route carries *attributes*
(labels such as AS_PATH or LOCAL_PREF), and a router with several routes to the same destination compares those attributes in a fixed order to pick one.
Almost everything you do with BGP in production is influencing that choice.

**The three things you will use**

| Thing | What it is | You use it to |
|---|---|---|
| **Dashboard** (`http://192.168.186.128:8000`) | A web page on the VM | Read the Learn tab, run the 11 scenarios, watch BGP sessions |
| **Shared lab** | 8 routers, always on, used by the dashboard | Try the 11 attributes with buttons |
| **Standalone labs 01 to 17** | Small separate labs, one topic each | Build and break one topic by hand, on the router consoles |

**The ideas behind every lab**

1. **Baseline:** a known-good configuration. Every lab starts from it.
2. **Scenario:** one small change that shows one idea (for example, "raise Local-Pref"). Each has an **apply** and a **rollback**.
3. **Verify:** the `show` commands that prove the change did what you expected.

The habit that makes you fast: **predict first, then apply, then check.** Before you run a scenario, write down what you think will change.

> Replace `192.168.186.128` with your own EVE VM's address if your setup is different. It is written as `<eve-vm-ip>` in other documents.

---

## Part 2: Your first hour

You need: a browser, and the EVE VM running with the dashboard up. Check with `http://192.168.186.128:8000/api/health`, which must show `{"ok":true}`.

### Step 1. Open the dashboard (2 minutes)

Go to `http://192.168.186.128:8000`. You see three tabs at the top: **Live labs** (run any scenario on its own topology, with a 3D view), **Shared lab** (the original view of the 8-router lab) and **Learn** (the course).

### Step 2. Read one attribute page (15 minutes)

1. Click **Learn**, then **01 WEIGHT**. You are on the **Foundations** level.
2. Read *What it is* and *How it works* (the picture). Then answer the **Check your understanding** quiz. Wrong answers explain why, read them.
3. Click **Practitioner**. You see a production example, the configuration, and how to verify it.

### Step 3. Do the hands-on exercise (15 minutes)

Still on the **Practitioner** page, scroll to **Hands-on exercise**. Each step is a button:

* **Run on \<router\>** runs a read-only `show` command on the real router and prints the output. A green tick means it matches what the page expects.
* **Apply scenario** changes the router; **Roll back** puts it back.

Work through the steps in order. When every check is green the exercise is marked complete in your browser.

### Step 4. Run a scenario on the Live labs tab (10 minutes)

1. Click **Live labs**. On the left every lab lists its scenarios. Open **05 MED** and click **View in 3D**: the topology appears with its routers on tiers and the BGP sessions as arcs.
2. Click **Run** on `05_med`. The dashboard stops the lab that is running, starts lab 05, waits for the routers, and then runs the scenario. The **Steps** panel shows each stage; the
   first run on a lab that was never configured takes 10 to 15 minutes, later switches 2 to 5.
3. Watch the **SSH / CLI** panel: it shows the real commands (`configure terminal`, each line, `write memory`) and the router that receives them pulses in the 3D view.
4. When the run ends you see the checks with the **before / after** difference. Click **Rollback** and confirm it goes back.

Only one lab runs at a time, so running a scenario of another lab switches the VM to it. The **Shared lab** tab keeps the original view of the 8-router lab (it also has a
**Reset lab to baseline** button). More detail: [`live-labs.md`](live-labs.md).

### Step 5. Try the simulator (10 minutes)

In **Learn**, open **Best-path simulator**. It shows two routes to the same prefix and the order BGP compares them. Change one attribute and watch which step decides.
This is the single most useful mental model in BGP.

### Step 6. Look at a standalone lab (10 minutes)

On the **Practitioner** page, scroll to **Lab topology** and click **Read the lab README**. You see the small topology for this attribute, its addressing, and real router
output captured from that lab. You are not running anything yet; that is [Part 4](#part-4-run-a-standalone-lab-by-hand).

**You are done with the first hour** when you can say what WEIGHT does, where it sits in best-path selection, and why it changed only one router.

---

## Part 3: How to use the Learn tab

Every topic has three levels. Do them in order the first time.

| Level | What you get | Time |
|---|---|---|
| **1 Foundations** | What it is, the theory, a picture, a worked example, a 3-question quiz | 10 to 15 min |
| **2 Practitioner** | A production use case, configuration, verification, pitfalls, tactics, the hands-on exercise, and the topic's lab | 30 to 45 min |
| **3 Pro** | Tactics and tricks, interactions with other attributes, edge cases, a troubleshooting drill, a harder quiz | 30 min |

Other things on the page:

* **Cheat-sheet** button (top right of a topic): downloads a Markdown summary. Keep them.
* **Troubleshooting drill** (Pro): a real symptom with router output. Answer in your head, then use **Hint** and **Show the answer**.
* **Progress dots** next to each topic show which levels you finished, stored in your browser only.
* **Lab topology** (Practitioner): links to the topic's standalone lab: README, downloads and files on GitHub.

### The two kinds of exercise

| Where | How it works |
|---|---|
| Attributes **01 to 11** | The buttons run on the **live shared lab** |
| **MP-BGP / MPLS pages M1 to M8** | **Guided**: each step shows the output captured from the real lab. Nothing runs from the page. To try it yourself, run the standalone lab ([Part 4](#part-4-run-a-standalone-lab-by-hand)) |

### The MP-BGP track (M1 to M8)

The last group in the left menu, "MP-BGP and MPLS VPN", teaches how a provider sells private networks over a shared core:

| Page | What you learn |
|---|---|
| M1 MP-BGP address families | How one BGP session carries several kinds of routes |
| M2 VRF, RD, RT and labels | The four ideas behind every MPLS VPN |
| M3 to M8 | One use case each: lab 12 to 17 |

Do M1 and M2 first. If MPLS is new, read them twice.

---

## Part 4: Run a standalone lab by hand

This is where you build the network yourself. **Do this after Part 2.** It takes 20 to 40 minutes per lab.

### What you need

* An **SSH terminal to the EVE VM** (for the `labtool.sh` commands), for example Windows Terminal: `ssh root@192.168.186.128`.
* A **Telnet client** to reach the router consoles. On Windows either use PuTTY (Connection type: Telnet), or turn on the Windows feature *Telnet Client* and use `telnet` in a terminal.
* The lab's **CONFIGS.md** open in a browser or editor: [`labs/<lab>/CONFIGS.md`](../labs/) (for example [`labs/12_mpls_l3vpn/CONFIGS.md`](../labs/12_mpls_l3vpn/CONFIGS.md)) next to the lab's `README.md`.

### The rule: one lab at a time

The shared lab and a standalone lab cannot run together, and the dashboard must not run while you start a lab. Do this **before** you start a lab:

```bash
cd /opt/bgp-attributes-executor
docker stop bgp-attributes-executor        # the dashboard
labs/labtool.sh main stop                  # the shared 8-router lab
```

And this **when you are finished**:

```bash
labs/labtool.sh <lab> stop
labs/labtool.sh main start
docker start bgp-attributes-executor
```

(Wait about two minutes after that, then check that the dashboard shows 22 sessions Established.)

### Worked example: lab 12, one customer with two sites

Lab 12 is the best first MPLS lab. It has 5 routers: `CE1 - PE1 - P - PE2 - CE2`. See its [README](../labs/12_mpls_l3vpn/README.md) for the picture.

**1. Start the lab, blank**

```bash
labs/labtool.sh 12_mpls_l3vpn import
labs/labtool.sh 12_mpls_l3vpn start
```

Wait about 3 minutes. The routers boot to `Would you like to enter the initial configuration dialog? [yes/no]:`. That means they are ready for you.

**2. Find each router's console port**

The first router is port `32897`, then `32898`, and so on in the order CE1, PE1, P, PE2, CE2. To confirm on the VM: `ss -ltn | grep 328`.

From your PC:

```
telnet 192.168.186.128 32897        # CE1
```

Only **one** connection per router works at a time. Close a terminal before opening another to the same router.

**3. Configure each router**

On each console:

1. Answer `no` to the initial configuration dialog, press Enter.
2. Type `enable`, then `configure terminal`.
3. Copy that router's block from [`CONFIGS.md`](../labs/12_mpls_l3vpn/CONFIGS.md) (the section named after the router) and paste it.
4. Type `end`, then `write memory`.

Repeat for all five routers, in any order. Read each block before pasting: it is the fastest way to learn what each line does.

> The block contains a management section (`ip vrf MGMT`, `FastEthernet0/0`, `username lab`, `line vty`). It only lets the automation log in. On a console-only lab you can skip it.

**4. Verify in layers.** A VPN is a stack, and each layer depends on the one below. Check from the bottom up and stop at the first thing that is wrong:

| Layer | Command | You expect |
|---|---|---|
| Core IGP | `show ip ospf neighbor` on PE1 | one neighbor, `FULL` |
| Labels | `show mpls ldp neighbor` on PE1 | one neighbor, `State: Oper` |
| VPN session | `show bgp vpnv4 unicast all summary` on PE1 | the PE2 neighbor with a number in `State/PfxRcd` |
| Customer routes | `show ip route vrf CUST` on PE1 | a `B` route for `10.2.1.0/24` |
| End to end | `ping 10.2.1.1 source Loopback1` on CE1 | `!!!!!` |

BGP takes up to a minute after the last router is configured. eBGP updates wait up to 30 seconds, so **if it is not there yet, wait and repeat the command.**

**5. Break it with the scenario.** Open the `Scenarios` section of `CONFIGS.md`. It lists the exact lines to paste, on which router, and which commands to check afterwards.
Predict the result first. In lab 12 the change is on PE2:

```
configure terminal
ip vrf CUST
 no route-target import 65000:1
 route-target import 65000:11
end
```

Wait 20 seconds, then repeat the checks. Expected: `show ip route vrf CUST 10.1.1.0` on PE2 says `% Subnet not in table`, and the ping fails, but every session is still up.
That is the lesson: **a working control plane does not mean a working service.**

**6. Fix it.** Paste the **Roll back** lines from `CONFIGS.md`, wait, and repeat the checks until they pass again.

**7. Compare with the captured output.** The lab's `README.md` shows the real output, so you can compare line by line with what you saw.

**8. Stop the lab** and restore the shared lab (see the rule above).

### Same steps, using the tooling

Once you understand the lab, the same result comes from one command per step:

```bash
labs/labtool.sh 12_mpls_l3vpn bootstrap      # answers the setup dialog and enables SSH on every router
labs/labtool.sh 12_mpls_l3vpn baseline       # pushes every router's configuration
labs/labtool.sh 12_mpls_l3vpn apply 12_mpls_l3vpn      # runs the scenario with checks
labs/labtool.sh 12_mpls_l3vpn rollback 12_mpls_l3vpn
labs/labtool.sh 12_mpls_l3vpn show PE1 "show bgp vpnv4 unicast all summary"
```

Do not run `bootstrap` on routers you already configured by hand; it expects fresh routers. This is the part you will later want to automate.

---

## Part 5: Reading router output

### `show ip bgp` (the route table)

```
   Network          Next Hop            Metric LocPrf Weight Path
*> 10.10.0.0/16     172.16.11.1              0    200      0 65001 i
*  10.10.0.0/16     172.16.12.1              0    100      0 65002 i
```

| Symbol | Meaning |
|---|---|
| `*` | valid route |
| `>` | **the best route** the router chose |
| `i` (in the first columns) | learned by iBGP |
| `Path` | the AS_PATH; `i` at the end is ORIGIN IGP, `?` is incomplete |
| `LocPrf`, `Weight`, `Metric` | LOCAL_PREF, WEIGHT and MED |

To see why one route beat the other, run `show ip bgp <prefix>`: it prints all attributes of every path, marked `best`.

### `show bgp vpnv4 unicast all` (MPLS VPN routes)

```
BGP routing table entry for 65000:1:10.2.1.0/24, version 4
Paths: (1 available, best #1, table CUST)
  65102
    10.255.0.3 (metric 21) from 10.255.0.3 (10.255.0.3)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/19
```

| Part | Meaning |
|---|---|
| `65000:1:10.2.1.0/24` | the **RD** (`65000:1`) in front of the customer prefix |
| `table CUST` | the VRF that received it |
| `10.255.0.3` | the **next hop**: the other PE's loopback |
| `RT:65000:1` | the **route-target**: which VRFs may import it |
| `mpls labels in/out nolabel/19` | the **VPN label** (19) the far PE gave this route |

### Other commands you will use constantly

```
show ip route                       show ip route vrf CUST 10.1.1.0
show ip bgp summary                 show bgp vpnv4 unicast all summary
show ip bgp neighbors 10.0.0.2      show mpls ldp neighbor
show ip ospf neighbor               show ip cef vrf CUST 10.2.1.0 detail
show running-config | section bgp   show ip vrf detail CUST
```

**In `summary`, the last column** is the number of prefixes received when the session is up, or the state (`Idle`, `Active`, `Connect`) when it is not. A number means healthy.

---

## Part 6: A study plan

Follow this order. Times are for one person doing every level and the labs by hand.

| Week | Topics | Do | About |
|---|---|---|---|
| 1 | **Basics and best path**: 01 WEIGHT, 02 LOCAL_PREF, 03 AS_PATH | Learn levels 1 and 2, exercises, simulator. Standalone labs 01, 02, 03 by hand | 6 h |
| 2 | **More attributes**: 04 ORIGIN, 05 MED, 06 NEXT_HOP | Same. Read the lab READMEs first: 05 shows why MED works only with one neighbor AS | 6 h |
| 3 | **Summaries and tags**: 07 ATOMIC_AGGREGATE, 08 AGGREGATOR, 09 COMMUNITY | Same. Labs 07 (two scenarios) and 08 | 6 h |
| 4 | **Route reflectors**: 10 ORIGINATOR_ID, 11 CLUSTER_LIST, then all the **Pro** levels and drills | Labs 10 and 11 | 6 h |
| 5 | **MPLS VPN foundations**: M1, M2, then M3 (lab 12) | Lab 12 by hand ([Part 4](#worked-example-lab-12-one-customer-with-two-sites)) | 5 h |
| 6 | **VPN designs**: M4 (lab 13), M5 (lab 14), M6 (lab 15) | Each lab by hand. Predict the scenario result before applying it | 6 h |
| 7 | **Scale and AS numbers**: M7 (lab 16), M8 (lab 17) | Labs 16 and 17. Try both fixes in lab 17 | 5 h |
| 8 | **Review** | All drills in the Learn tab, then break a lab in a way not in the scenarios and fix it | 4 h |

For each lab, use this loop: **read the README** (5 min) → **predict** → **configure by hand** from `CONFIGS.md` → **verify layer by layer** → **apply the scenario** → **explain to yourself what changed and why** → **roll back**.

Which labs to do by hand, in order of value: 12, 13, 15, 05, 02, 03. The others are good once those feel easy.

---

## Part 7: When something goes wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| Dashboard does not load | Container stopped (for example after running a lab) | `docker start bgp-attributes-executor` on the VM |
| The dashboard shows fewer than 22 sessions after you restored the shared lab | Routers still converging | Wait two minutes; if it persists, click **Reset lab to baseline** |
| `telnet` says connection refused | Nodes are not running, or wrong port | `labs/labtool.sh <lab> start`; check with `ss -ltn \| grep 328` |
| The console prints nothing or you cannot type | Someone else has the console open (one connection per router) | Close the other terminal or press Enter a few times |
| A pasted config gives `% Invalid input` | A line was pasted in the wrong mode, or a typo | Type `configure terminal` first; paste again in smaller pieces |
| An interface has no IP address after pasting | `ip vrf forwarding` was entered **after** the `ip address` (IOS removes the address) | Put `ip vrf forwarding` first, then the address. The `CONFIGS.md` blocks have the right order |
| A BGP session stays `Active` or `Idle` | The far end is not configured yet, or the loopbacks cannot reach each other | Check both routers, then `ping` the neighbor address from the loopback: `ping 10.255.0.3 source Loopback0` |
| The session is up but a route is missing | Timers (up to 30 s for eBGP), or a route-target or policy issue | Wait 30 s, repeat; then compare the route-targets with `show ip vrf detail` on both PEs |
| You were logged out of the EVE web page while a script ran | EVE allows one session per account, the tooling shares an account | Use the dedicated automation account (see the [README](../README.md#things-worth-knowing)) |
| A lab started blank though you configured it before | The lab was started under another EVE account or you did not `write memory` | Use `write memory` after configuring; use `bootstrap` and `baseline` for a fresh start |
| You cannot see the nodes running in the EVE web page | Labs started by the tooling run under another EVE account | Use the telnet ports, as in Part 4 |
| After a VM reboot the routers are stopped | EVE does not restart nodes by itself | `labs/labtool.sh main start` (or `<lab> start`) |

If you get really stuck: **stop the lab and start again.** A fresh boot with the baseline from `CONFIGS.md` is always faster than repairing a half-changed lab.

---

## Part 8: Cheat sheets

### IOS survival kit

```
enable                      # privileged mode
configure terminal          # enter configuration mode (prompt shows (config)#)
end                         # leave configuration mode
write memory                # save the configuration (survives a restart)
show running-config         # what is configured now
no <command>                # remove a command (in configuration mode)
?                           # help, works after any word
Tab                         # complete a word
| include bgp               # filter output
terminal length 0           # stop the --More-- prompts
```

### BGP

```
show ip bgp summary                       sessions and prefix counts
show ip bgp                               the BGP table
show ip bgp 10.10.0.0/16                  every path to one prefix, with all attributes
show ip bgp neighbors <ip> advertised-routes    what I send
show ip bgp neighbors <ip> routes               what I accepted
clear ip bgp * soft                       reapply policy without resetting sessions
```

### MPLS VPN

```
show ip vrf                               the VRFs on this router
show ip vrf detail <name>                 RD, RT import and export
show ip route vrf <name>                  the VRF's routing table
ping vrf <name> <ip> source <interface>   test from inside a VRF
show mpls ldp neighbor                    label neighbors
show mpls forwarding-table                labels the router uses
show bgp vpnv4 unicast all summary        the VPN sessions
```

### Best-path order (Cisco IOS)

1 Weight (higher) · 2 Local-Pref (higher) · 3 Locally originated · 4 AS_PATH (shorter) · 5 ORIGIN (i < e < ?) · 6 MED (lower) · 7 eBGP over iBGP · 8 IGP metric to the next hop (lower) ·
9 Oldest eBGP path · 10 Router-ID (lower) · 11 CLUSTER_LIST (shorter) · 12 Neighbor IP (lower).
The first step that separates the routes decides. The rest are never checked.

---

## Part 9: Glossary

| Term | Meaning |
|---|---|
| **AS / ASN** | Autonomous system: a network under one administration, identified by a number (65000 is a private one) |
| **eBGP / iBGP** | BGP between different ASes / inside one AS |
| **Prefix** | A network such as `10.10.0.0/16` |
| **Best path** | The one route a router picks when it knows several |
| **Attribute** | A property of a route (LOCAL_PREF, AS_PATH, MED, ...) used to compare routes |
| **Route reflector (RR)** | An iBGP router that passes routes between clients, so they do not need a full mesh |
| **Baseline** | The known-good configuration of a lab |
| **Scenario** | One configuration change that shows one idea; it has an apply and a rollback |
| **MPLS** | A way to forward packets by a short label instead of looking at the IP address in every router |
| **LDP** | The protocol that hands out MPLS labels for the core's addresses |
| **PE / P / CE** | Provider edge (has customers) / provider core (no customers) / customer edge (the customer's router) |
| **VRF** | A separate routing table on one router, one per customer |
| **RD** | Route distinguisher: a number added in front of a prefix so two customers can use the same address |
| **RT** | Route-target: a tag that decides which VRFs import a route |
| **VPNv4** | The BGP address family that carries customer routes with their RD, RT and label between PEs |
| **VPN label / transport label** | The inner label (which VRF at the far end) / the outer label (how to cross the core) |
| **Extranet** | A VPN shared by different customers, such as a shared service |
| **Hub and spoke** | A design where sites talk to each other only through a central site |
| **as-override / allowas-in** | Two fixes for a customer using the same AS at several sites |
| **Tenant** | In EVE-NG, the separate space where each account's nodes run |

---

## Where to go next

* [`README.md`](../README.md): the map of the whole repository, with a link to every lab
* [`labs/README.md`](../labs/README.md): the lab index and run routine
* Each lab's `README.md` and `CONFIGS.md`, for example [lab 12](../labs/12_mpls_l3vpn/README.md)
* [`docs/runbook.md`](runbook.md) and [`docs/eve-setup.md`](eve-setup.md): rebuilding and setting up the platform

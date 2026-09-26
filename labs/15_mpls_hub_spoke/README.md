# Lab 15: MPLS L3VPN hub and spoke through a central firewall

**Use case.** A company has many branches (spokes) and one head-office site with a firewall or inspection service (the hub).
Policy says that **all branch-to-branch traffic must pass through the firewall**, even though the MPLS core could connect
the branches directly. In an L3VPN the topology is not fixed by the cables but by the **route-targets**: a full mesh is
"everyone imports everyone", and hub and spoke is "spokes import only the hub".

```
  spoke 1 (AS 65101) 10.1.0.0/24
  +-------+ 172.16.1.0/30  +-----+  10.0.1.0/30
  | CE-S1 |----------------| PE1 |--------------+
  +-------+                +-----+              |
                                            +---+---+  10.0.3.0/30  +-----+  172.16.3.0/30 (HUB-IN)   +--------+
  spoke 2 (AS 65102) 10.2.0.0/24            |   P   |---------------| PE3 |===========================| CE-HUB |
  +-------+ 172.16.2.0/30  +-----+  10.0.2.0/30 +---+---+            +-----+  172.16.4.0/30 (HUB-OUT)  +--------+
  | CE-S2 |----------------| PE2 |--------------+                                             hub site, AS 65900
  +-------+                +-----+                                                            firewall, 10.100.0.0/24
```

| Router | Role | AS | Loopback0 | Management | Links |
|---|---|---|---|---|---|
| CE-S1 | spoke 1 | 65101 | (none) | 192.168.99.111 | e1/0 172.16.1.2/30 to PE1; Loopback1 10.1.0.1/24 |
| CE-S2 | spoke 2 | 65102 | (none) | 192.168.99.112 | e1/0 172.16.2.2/30 to PE2; Loopback1 10.2.0.1/24 |
| CE-HUB | hub / firewall | 65900 | (none) | 192.168.99.115 | e1/0 172.16.3.2/30 to PE3 (HUB-IN); e1/1 172.16.4.2/30 to PE3 (HUB-OUT); Loopback1 10.100.0.1/24 |
| PE1 | provider edge | 65000 | 10.255.0.1 | 192.168.99.121 | e1/0 10.0.1.1/30 to P; e1/1 172.16.1.1/30 (VRF SPOKE) |
| P | provider core | 65000 | 10.255.0.2 | 192.168.99.122 | e1/0 10.0.1.2/30; e1/1 10.0.2.1/30; e1/2 10.0.3.1/30 (no BGP) |
| PE2 | provider edge | 65000 | 10.255.0.3 | 192.168.99.123 | e1/0 10.0.2.2/30 to P; e1/1 172.16.2.1/30 (VRF SPOKE) |
| PE3 | provider edge (hub) | 65000 | 10.255.0.4 | 192.168.99.124 | e1/0 10.0.3.2/30 to P; e1/1 172.16.3.1/30 (VRF HUB-IN); e1/2 172.16.4.1/30 (VRF HUB-OUT) |

Route-target design:

| VRF | Router | RD | Export RT | Import RT | Purpose |
|---|---|---|---|---|---|
| SPOKE | PE1 | 65000:11 | 65000:1001 | 65000:1000 | send spoke routes out, receive only the hub's |
| SPOKE | PE2 | 65000:12 | 65000:1001 | 65000:1000 | the same at the other spoke (the scenario adds import 1001) |
| HUB-IN | PE3 | 65000:21 | none | 65000:1001 | receives every spoke route and gives it to the firewall |
| HUB-OUT | PE3 | 65000:22 | 65000:1000 | none | takes what the firewall sends back and advertises it to the spokes |

The hub PE uses **two VRFs and two links** to the firewall. HUB-IN carries the spokes' routes towards the firewall. HUB-OUT
carries the firewall's answer back into the VPN. On the firewall (CE-HUB), a prefix-list sends nothing on the HUB-IN session
and only `10.0.0.0/8` and `10.100.0.0/24` on the HUB-OUT session. The summary `10.0.0.0/8` is what pulls every spoke's traffic to the
hub. (Using one VRF and sending the routes back on the same session would trip BGP loop prevention on the PE, because the
provider's own AS would be in the path. The two-VRF design avoids that.)

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see
`labs/labtool.sh`; the 7 routers take a long time to bootstrap):

```
labs/labtool.sh 15_mpls_hub_spoke import && labs/labtool.sh 15_mpls_hub_spoke start
labs/labtool.sh 15_mpls_hub_spoke bootstrap
labs/labtool.sh 15_mpls_hub_spoke baseline
labs/labtool.sh 15_mpls_hub_spoke show CE-S2 "show ip route 10.1.0.0"
labs/labtool.sh 15_mpls_hub_spoke apply 15_mpls_hub_spoke      # spoke 2 also imports the spokes' RT
labs/labtool.sh 15_mpls_hub_spoke rollback 15_mpls_hub_spoke
```

## What you should see (captured from this lab)

**1. Baseline: a spoke reaches the other spoke only through the hub.** Spoke 2 has no route to spoke 1's 10.1.0.0/24. The best
match is the hub's summary 10.0.0.0/8, and the hub's own network 10.100.0.0/24 is a normal route:

```
CE-S2# show ip route 10.1.0.0
Routing entry for 10.0.0.0/8
  Known via "bgp 65102", distance 20, metric 0
  Tag 65000, type external
  * 172.16.2.1, from 172.16.2.1, 00:00:18 ago
      AS Hops 2

CE-S2# show ip route 10.100.0.0
Routing entry for 10.100.0.0/24
  Known via "bgp 65102", distance 20, metric 0
  Tag 65000, type external
```

The firewall has the specific spoke route, so it can forward the traffic on, and the provider sees the summary as a route
that came out of HUB-OUT with the hub's label:

```
CE-HUB# show ip route 10.1.0.0
Routing entry for 10.1.0.0/24
  Known via "bgp 65900", distance 20, metric 0
  Tag 65000, type external
  * 172.16.3.1, from 172.16.3.1, 00:00:26 ago

PE3# show ip route vrf HUB-OUT
B        10.0.0.0/8 [20/0] via 172.16.4.2, 00:00:30
B        10.100.0.0/24 [20/0] via 172.16.4.2, 00:00:30

PE2# show ip route vrf SPOKE 10.1.0.0
Routing entry for 10.0.0.0/8
  Known via "bgp 65000", distance 200, metric 0
  Tag 65900, type internal
  * 10.255.0.4 (default), from 10.255.0.4, 00:00:34 ago
      MPLS label: 21
```

So spoke 2's packet for 10.1.0.0 is sent to PE2, labelled for PE3 (VPN label 21), and delivered to the firewall. The firewall applies its policy and
routes the packet back into VRF HUB-IN on PE3, which carries it to spoke 1.

**2. The scenario: one extra import route-target.** `labs/labtool.sh 15_mpls_hub_spoke apply 15_mpls_hub_spoke` adds
`route-target import 65000:1001` to VRF SPOKE on PE2 (the spokes' own export RT). PE2 now imports spoke 1's route directly,
and it is **more specific** than the summary, so it wins:

```
CE-S2# show ip route 10.1.0.0
Routing entry for 10.1.0.0/24
  Known via "bgp 65102", distance 20, metric 0
  Tag 65000, type external
  * 172.16.2.1, from 172.16.2.1, 00:00:50 ago

PE2# show ip route vrf SPOKE 10.1.0.0
Routing entry for 10.1.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65101, type internal
  * 10.255.0.1 (default), from 10.255.0.1, 00:01:07 ago
      MPLS label: 21
```

Spoke 2's traffic to spoke 1 now goes PE2 to PE1 directly and **never visits the firewall**. Nothing broke, no session flapped,
and the firewall's logs simply stop showing spoke-to-spoke traffic. That is the risk of route-target designs: a single line changes
the topology and the security policy that depends on it. (The label in the second output, 21, is the label PE1 announced for its
own route, and happens to have the same number as the hub's label in the first output; they are different labels on different PEs.)

`rollback` removes the import and spoke 2 goes back to the summary through the hub.

## Try it yourself

- On PE1, run `show ip vrf detail SPOKE` and `show bgp vpnv4 unicast all 10.2.0.0/24` and read the RT list.
- Remove the hub's summary (no `network 10.0.0.0 mask 255.0.0.0` on CE-HUB) and see that the spokes then have no route to each other at all.
- Ask why the hub needs **two** VRFs. What happens on PE3 when HUB-IN also exports 1000?

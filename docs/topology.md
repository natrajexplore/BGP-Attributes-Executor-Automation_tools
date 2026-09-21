# Topology

Dual-homed enterprise with a **two-tier route-reflector core**, two ISPs, and a
content network reachable through both ISPs — so every attribute changes a
visible path-selection outcome.

```
                          AS 65100  CONTENT
                    (advertises 100.100.100.0/24)
                       /                     \
              eBGP    /                       \   eBGP
        +-----------+       eBGP peering        +-----------+
        |  ISPA-1   |=========================  |  ISPB-1   |
        | AS 65001  |                           | AS 65002  |
        +-----+-----+                           +-----+-----+
         eBGP |                                       | eBGP
        +-----+-----+                           +-----+-----+
        |   EDGE1   |                           |   EDGE2   |
        | AS 65000  |                           | AS 65000  |
        +--+-----+--+                           +--+-----+--+
           |     \                                /     |
           |      \  iBGP (both edges are        /      |
           |       \ clients of RR1 and RR2)    /       |
      +----+----+   \                          /   +----+----+
      | CORE-RR1|<---+------- iBGP ------------+--->| CORE-RR2|
      |  top RR |<========= RR2 is a client of RR1 =| 2nd RR |
      +----+----+                                   +---------+
           | iBGP (CE-LAN is a client of RR1 only)
      +----+----+
      | CE-LAN  |  originates 10.10.0.0/24 .. 10.10.3.0/24  (Loopback1-4)
      +---------+
```

## Autonomous systems

| AS | Name | Nodes |
|----|------|-------|
| 65000 | Enterprise | CORE-RR1, CORE-RR2, EDGE1, EDGE2, CE-LAN |
| 65001 | ISP-A | ISPA-1 |
| 65002 | ISP-B | ISPB-1 |
| 65100 | Content / "Internet" | CONTENT |

## iBGP design (why the RR hierarchy matters)

* **CORE-RR1** is the top reflector. Clients: CORE-RR2, EDGE1, EDGE2, CE-LAN.
* **CORE-RR2** is a second-tier reflector and itself a client of RR1. Clients: EDGE1, EDGE2.
* **EDGE1 / EDGE2** peer both RR1 and RR2 (redundancy).
* **CE-LAN** peers RR1 only.

A prefix originated by EDGE1 travels `EDGE1 -> RR2 -> RR1 -> EDGE2`, so at EDGE2
it carries **ORIGINATOR_ID = 10.255.0.11** and **CLUSTER_LIST = 10.255.0.2, 10.255.0.1**.
That is what scenarios 10 and 11 inspect and break.

## IGP

OSPF process 1, area 0, on every enterprise P2P link and Loopback0. iBGP sessions
use `update-source Loopback0`. EDGE1/EDGE2 run `neighbor <rr> next-hop-self` so
eBGP-learned prefixes resolve inside the core.

## EVE-NG interface map (Cisco 7206VXR / c7200, Dynamips)

Node profile: NPE-400, 256 MB RAM, `PA-8E` in slot 1. Onboard
`Fa0/0` is management; `Eth1/0 Eth1/1 Eth1/2 Eth1/3` are the topology ports
(formerly Fa1/0 Fa1/1 Fa2/0 Fa2/1).

| Node | Fa0/0 (MGMT) | Eth1/0 | Eth1/1 | Eth1/2 | Eth1/3 |
|------|--------------|-------|-------|-------|-------|
| CORE-RR1 | Cloud1 | CORE-RR2 | EDGE1 | EDGE2 | CE-LAN |
| CORE-RR2 | Cloud1 | CORE-RR1 | EDGE1 | EDGE2 | CE-LAN |
| EDGE1 | Cloud1 | CORE-RR1 | CORE-RR2 | ISPA-1 | – |
| EDGE2 | Cloud1 | CORE-RR1 | CORE-RR2 | ISPB-1 | – |
| CE-LAN | Cloud1 | CORE-RR1 | CORE-RR2 | – | – |
| ISPA-1 | Cloud1 | EDGE1 | ISPB-1 | CONTENT | – |
| ISPB-1 | Cloud1 | EDGE2 | ISPA-1 | CONTENT | – |
| CONTENT | Cloud1 | ISPA-1 | ISPB-1 | – | – |

CE-LAN has a physical link to both reflectors for IGP redundancy but an iBGP
session to CORE-RR1 only (that asymmetry is what scenario 11 exploits).

`scripts/build_lab.py` turns this map + `inventory.yaml` into
`labs/bgp-attributes.unl` — import it in EVE-NG instead of wiring nodes by hand.

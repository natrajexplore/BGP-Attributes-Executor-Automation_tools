# Lab 16: MPLS L3VPN at scale, a VPNv4 route reflector

**Use case.** A provider with many PE routers cannot afford a full iBGP mesh: 4 PEs need 6 sessions, 40 PEs need 780. The
standard answer is a **route reflector (RR)**: every PE peers with the RR only, and the RR passes routes on. For VPNv4 the RR usually
has **no VRFs at all**, it only reflects, and it must keep VPNv4 routes that none of its own VRFs import. This lab builds that
design with four PEs and one RR, and then breaks it in the most common way: PEs that lose their **client** status.

```
                                  RR  (10.255.0.10, no VRFs, OSPF + LDP + iBGP VPNv4)
                           e1/0 /  e1/1 |   | e1/2   \ e1/3
                               /        |   |         \
                            PE1        PE2  PE3       PE4
                          (CUST)     (CUST) (CUST)   (CUST)
                            |                          |
                           CE1 (AS 65101)             CE4 (AS 65104)
                           10.1.0.0/24                10.4.0.0/24
```

| Router | Role | AS | Loopback0 | Management | Links |
|---|---|---|---|---|---|
| CE1 | customer at PE1 | 65101 | (none) | 192.168.99.111 | e1/0 172.16.1.2/30 to PE1; Loopback1 10.1.0.1/24 |
| CE4 | customer at PE4 | 65104 | (none) | 192.168.99.114 | e1/0 172.16.4.2/30 to PE4; Loopback1 10.4.0.1/24 |
| PE1 | provider edge | 65000 | 10.255.0.1 | 192.168.99.121 | e1/0 10.0.1.1/30 to RR; e1/1 172.16.1.1/30 (VRF CUST) |
| PE2 | provider edge | 65000 | 10.255.0.2 | 192.168.99.122 | e1/0 10.0.2.1/30 to RR (VRF CUST, no CE) |
| PE3 | provider edge | 65000 | 10.255.0.3 | 192.168.99.123 | e1/0 10.0.3.1/30 to RR (VRF CUST, no CE) |
| PE4 | provider edge | 65000 | 10.255.0.4 | 192.168.99.124 | e1/0 10.0.4.1/30 to RR; e1/1 172.16.4.1/30 (VRF CUST) |
| RR | route reflector and core | 65000 | 10.255.0.10 | 192.168.99.130 | e1/0 10.0.1.2/30, e1/1 10.0.2.2/30, e1/2 10.0.3.2/30, e1/3 10.0.4.2/30 |

Every PE has VRF `CUST` (RD 65000:<PE number>, RT 65000:1 both ways) and one VPNv4 neighbor: the RR. The RR is also the only core
router (the PEs connect to it), so it runs OSPF and LDP too. On the RR every PE is a `route-reflector-client` in `address-family vpnv4`,
and the RR has `no bgp default route-target filter`.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see
`labs/labtool.sh`; 7 routers, allow 15 minutes for bootstrap):

```
labs/labtool.sh 16_mpls_vpnv4_rr import && labs/labtool.sh 16_mpls_vpnv4_rr start
labs/labtool.sh 16_mpls_vpnv4_rr bootstrap
labs/labtool.sh 16_mpls_vpnv4_rr baseline
labs/labtool.sh 16_mpls_vpnv4_rr show RR "show bgp vpnv4 unicast all summary"
labs/labtool.sh 16_mpls_vpnv4_rr apply 16_mpls_vpnv4_rr      # PE1 and PE4 lose client status
labs/labtool.sh 16_mpls_vpnv4_rr rollback 16_mpls_vpnv4_rr
```

## What you should see (captured from this lab)

**1. The reflector holds routes it has no VRF for.** The RR has neither VRFs nor a route table for them (`no table`), yet it
carries the customer routes from PE1 and PE4 and shows that they came from clients:

```
RR# show bgp vpnv4 unicast all summary
Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.255.0.1      4        65000       5       6        3    0    0 00:01:33        1
10.255.0.2      4        65000       3       6        3    0    0 00:01:32        0
10.255.0.3      4        65000       4       6        3    0    0 00:01:23        0
10.255.0.4      4        65000       5       6        3    0    0 00:01:24        1

RR# show bgp vpnv4 unicast all 10.4.0.0/24
BGP routing table entry for 65000:4:10.4.0.0/24, version 3
Paths: (1 available, best #1, no table)
  65104, (Received from a RR-client)
    10.255.0.4 (metric 11) from 10.255.0.4 (10.255.0.4)
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/23
```

PE1 learned PE4's route **from the reflector** (`from 10.255.0.10`), but the next hop is still PE4 (`10.255.0.4`) with PE4's VPN label 23:
a reflector does not change the next hop, so the traffic goes PE1 to PE4 directly across the core, not through the RR.

```
PE1# show ip route vrf CUST 10.4.0.0
Routing entry for 10.4.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65104, type internal
  * 10.255.0.4 (default), from 10.255.0.10, 00:00:28 ago
      MPLS label: 23
```

PE2 and PE3 have no CE, yet their VRFs hold both customer routes, which shows the scale effect of a reflector: a new PE needs one
session and gets every route.

**2. What did not break the design.** I first planned the scenario as "put the default route-target filter back on the RR",
expecting a reflector without VRFs to discard every VPNv4 route. On this IOS (`c7200-adventerprisek9-mz.152-4.S6`) it did not: with
`route-reflector-client` neighbors in `address-family vpnv4` the RR kept and reflected all routes even after `bgp default route-target filter` and a
refresh. The lab keeps `no bgp default route-target filter` in the baseline (it is what many providers configure, and it does matter on
routers that are not reflectors, such as an inter-AS border router), but the scenario tests something that does fail.

**3. The scenario: PE1 and PE4 stop being clients.** `labs/labtool.sh 16_mpls_vpnv4_rr apply 16_mpls_vpnv4_rr` removes
`route-reflector-client` for PE1 and PE4 only. Reflector rules: a route from a client is reflected to every peer; a route from a non-client
is reflected **only to clients**. PE1 and PE4 are now two non-clients, so neither receives the other's routes. The sessions reset when the
client status changes (`Up/Down` 00:01:20), stay Established, and each still sends its route to the RR:

```
RR# show bgp vpnv4 unicast all 10.4.0.0/24
Paths: (1 available, best #1, no table)
  65104
    10.255.0.4 (metric 11) from 10.255.0.4 (10.255.0.4)
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/23
```

The RR still holds PE4's route, but the `(Received from a RR-client)` note is gone. PE1 and CE1 have lost the route, while PE2
and PE3 (still clients) hear both:

```
PE1# show ip route vrf CUST 10.4.0.0
% Subnet not in table

CE1# show ip route 10.4.0.0
% Subnet not in table

PE2# show ip route vrf CUST
B        10.1.0.0 [200/0] via 10.255.0.1, 00:01:28
B        10.4.0.0 [200/0] via 10.255.0.4, 00:01:27
```

This is the classic reflector failure: nothing is down, every session is Established, the reflector has both routes, and yet two PEs
cannot reach each other's customers. The fix is one line per PE (`neighbor x route-reflector-client`), and `rollback` puts both back.

## Try it yourself

- Remove client status from only PE4 (this lab did not test that case). By the reflector rules PE1 is still a client, so its routes reach PE4, and PE4's route reaches the clients: predict the result, then check it. It should need **two** non-clients to break.
- Read `show bgp vpnv4 unicast all 10.4.0.0/24` on PE1 with a reflector in the path: find `Originator` and `Cluster list` (lab 10 and 11 explain them).
- Add a second RR with the same cluster-id (lab 11) and think about what a shared cluster-id changes for a PE that peers with both.

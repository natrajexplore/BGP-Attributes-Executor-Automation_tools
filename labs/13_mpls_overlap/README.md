# Lab 13: MPLS L3VPN, two customers with the same 10.1.0.0/24

**Use case.** A provider hosts many customers on one MPLS core, and customers pick their own private addresses. Two of
them, A and B, both use `10.1.0.0/24` at their first site. The provider must carry both without mixing them up. Three
mechanisms keep them apart, and this lab shows each one:

- **RD** (route distinguisher) makes the two VPNv4 prefixes different (`65000:100:10.1.0.0/24` versus `65000:200:10.1.0.0/24`).
- **RT** (route-target) decides which VRFs import which routes, so A's routes only reach A's VRFs.
- **VPN label** makes the forwarding separate: each VRF prefix gets its own label.

The scenario then shows the classic RT mistake: one extra export route-target leaks a customer into another customer's VPN.

```
   customer A site 1 (AS 65101)                                        customer A site 2 (AS 65102)
   10.1.0.0/24                                                          10.2.0.0/24
    +-------+  172.16.1.0/30                                  172.16.3.0/30  +-------+
    | CE-A1 |-----------+                                +-----------------| CE-A2 |
    +-------+           |  10.0.1.0/30    10.0.2.0/30    |                 +-------+
                     +-----+--------+  +-----+  +--------+-----+
                     | PE1 |  OSPF/LDP |  P  | OSPF/LDP | PE2 |          AS 65000 provider
                     +-----+--------+  +-----+  +--------+-----+
    +-------+           |                                |                 +-------+
    | CE-B1 |-----------+                                +-----------------| CE-B2 |
    +-------+  172.16.2.0/30                                  172.16.4.0/30  +-------+
   10.1.0.0/24 (same as A!)                                                 10.3.0.0/24
   customer B site 1 (AS 65201)                                        customer B site 2 (AS 65202)
```

| Router | Role | AS | Loopback0 | Management | Links |
|---|---|---|---|---|---|
| CE-A1 | customer A | 65101 | (none) | 192.168.99.111 | e1/0 172.16.1.2/30 to PE1; Loopback1 10.1.0.1/24 |
| CE-A2 | customer A | 65102 | (none) | 192.168.99.112 | e1/0 172.16.3.2/30 to PE2; Loopback1 10.2.0.1/24 |
| CE-B1 | customer B | 65201 | (none) | 192.168.99.113 | e1/0 172.16.2.2/30 to PE1; Loopback1 10.1.0.1/24 (same as A) |
| CE-B2 | customer B | 65202 | (none) | 192.168.99.114 | e1/0 172.16.4.2/30 to PE2; Loopback1 10.3.0.1/24 |
| PE1 | provider edge | 65000 | 10.255.0.1 | 192.168.99.121 | e1/0 10.0.1.1/30 to P; e1/1 172.16.1.1/30 (VRF CUST-A); e1/2 172.16.2.1/30 (VRF CUST-B) |
| P | provider core | 65000 | 10.255.0.2 | 192.168.99.122 | e1/0 10.0.1.2/30; e1/1 10.0.2.1/30 (no BGP) |
| PE2 | provider edge | 65000 | 10.255.0.3 | 192.168.99.123 | e1/0 10.0.2.2/30 to P; e1/1 172.16.3.1/30 (VRF CUST-A); e1/2 172.16.4.1/30 (VRF CUST-B) |

VRF `CUST-A`: `rd 65000:100`, `route-target both 65000:100`. VRF `CUST-B`: `rd 65000:200`, `route-target both 65000:200`.
Both PEs run the same VRFs, so each customer's two sites reach each other and nothing else.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first; this lab has 7
routers and takes longer to bootstrap):

```
labs/labtool.sh 13_mpls_overlap import && labs/labtool.sh 13_mpls_overlap start
labs/labtool.sh 13_mpls_overlap bootstrap
labs/labtool.sh 13_mpls_overlap baseline
labs/labtool.sh 13_mpls_overlap show PE2 "show bgp vpnv4 unicast all 10.1.0.0/24"
labs/labtool.sh 13_mpls_overlap apply 13_mpls_overlap      # PE2 exports B's routes with A's route-target too
labs/labtool.sh 13_mpls_overlap rollback 13_mpls_overlap
```

## What you should see (captured from this lab)

**1. The same prefix, twice, without a clash.** PE2 holds two different VPNv4 routes for `10.1.0.0/24`. Only the RD, the RT
and the VPN label differ, and each lands in its own VRF:

```
PE2# show bgp vpnv4 unicast all 10.1.0.0/24
BGP routing table entry for 65000:100:10.1.0.0/24, version 4
Paths: (1 available, best #1, table CUST-A)
  65101
    10.255.0.1 (metric 21) from 10.255.0.1 (10.255.0.1)
      Extended Community: RT:65000:100
      mpls labels in/out nolabel/19
BGP routing table entry for 65000:200:10.1.0.0/24, version 5
Paths: (1 available, best #1, table CUST-B)
  65201
    10.255.0.1 (metric 21) from 10.255.0.1 (10.255.0.1)
      Extended Community: RT:65000:200
      mpls labels in/out nolabel/20
```

Both come from the same next hop (PE1, 10.255.0.1), yet PE1 gave label 19 to A's route and label 20 to B's. A packet
arriving at PE1 with label 19 goes to CE-A1, with label 20 to CE-B1. That is how two identical addresses are told apart.

**2. Baseline isolation.** Customer B's second site (10.3.0.0/24) exists only in B's VRF. A's VRF and A's router have no
route to it:

```
PE1# show ip route vrf CUST-A 10.3.0.0
% Subnet not in table

PE1# show ip route vrf CUST-B 10.3.0.0
Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:27 ago
      MPLS label: 20

CE-A1# show ip route 10.3.0.0
% Subnet not in table
```

## The scenario: one extra export route-target

`labs/labtool.sh 13_mpls_overlap apply 13_mpls_overlap` adds one line on PE2, in customer B's VRF:
`route-target export 65000:100`. That is customer A's route-target. PE2 now tags B's routes with **both** `65000:200`
and `65000:100`. PE1's `CUST-A` VRF imports `65000:100`, so it accepts B's route:

```
PE1# show ip route vrf CUST-A 10.3.0.0
Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:59 ago
      MPLS label: 20

CE-A1# show ip route 10.3.0.0
Routing entry for 10.3.0.0/24
  Known via "bgp 65101", distance 20, metric 0
  Tag 65000, type external
  * 172.16.1.1, from 172.16.1.1, 00:01:09 ago
```

Customer A's router now has a route to customer B's network, and PE1 would forward traffic for it to PE2 with VPN label 20
(the label of VRF `CUST-B`; this lab does not check the return path or ping it). Nothing on the customer side changed and no session flapped, which is why a leak like this can stay unnoticed
for a long time in production. The mistake is one line and the fix is to remove it; the RT lists of every VRF are the
security boundary of an L3VPN, so change them through review.

`rollback` removes the extra export; the route leaves `CUST-A` and CE-A1 again reports `% Subnet not in table`.

Note also: 10.1.0.0/24 (A and B) never leaks even in this state, because nobody exports B's 10.1.0.0/24 with A's RT.
The scenario leaks the second site of B on purpose. If B's first-site prefix had been leaked instead, VRF `CUST-A` would
hold two paths for the same 10.1.0.0/24 (its own and B's) and BGP best-path selection would pick one, which is the more
dangerous variant of this bug.

## Try it yourself

- On PE1, run `show ip vrf detail CUST-A` and `show bgp vpnv4 unicast all labels` to see both customers' labels side by side.
- Give both customers the **same** RD by editing `rd 65000:200` to `rd 65000:100` on one VRF (both PEs). The two 10.1.0.0/24
  routes now collide as one VPNv4 prefix, which shows why RDs must be unique per customer.
- Add a route-target `65000:200` import to `CUST-A` and see B's whole address space arrive in A.

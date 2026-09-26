# Lab 12: MPLS L3VPN basics, one customer with two sites

**Use case.** A provider (AS 65000) sells a private WAN. One customer has a head office and a branch that must reach each
other over the provider's network, without the customer running MPLS or any tunnel. This is the plain "VPN service" every
provider offers, and it is built from three ideas: **MP-BGP** carries the customer's routes between the provider's edge
routers, a **VRF** keeps the customer's routing table separate from the internet table, and **MPLS labels** carry the
traffic across a core that knows nothing about the customer.

```
 customer site 1        AS 65000 (provider, MPLS core)        customer site 2
   AS 65101                                                      AS 65102
  +-----+  172.16.1.0/30 +-----+  10.0.1.0/30 +-----+  10.0.2.0/30 +-----+  172.16.2.0/30 +-----+
  | CE1 |---------------| PE1 |--------------|  P  |--------------| PE2 |---------------| CE2 |
  +-----+  eBGP (VRF)   +-----+  OSPF + LDP  +-----+  OSPF + LDP  +-----+  eBGP (VRF)   +-----+
  10.1.1.0/24              \___________ iBGP address-family vpnv4 ___________/            10.2.1.0/24
```

| Router | Role | AS | Loopback0 | Management | Links |
|---|---|---|---|---|---|
| CE1 | customer edge | 65101 | (none) | 192.168.99.111 | e1/0 172.16.1.2/30 to PE1; Loopback1 10.1.1.1/24 (the LAN) |
| PE1 | provider edge | 65000 | 10.255.0.1 | 192.168.99.121 | e1/0 10.0.1.1/30 to P (MPLS); e1/1 172.16.1.1/30 to CE1 (VRF CUST) |
| P | provider core | 65000 | 10.255.0.2 | 192.168.99.122 | e1/0 10.0.1.2/30 to PE1; e1/1 10.0.2.1/30 to PE2 (both MPLS) |
| PE2 | provider edge | 65000 | 10.255.0.3 | 192.168.99.123 | e1/0 10.0.2.2/30 to P (MPLS); e1/1 172.16.2.1/30 to CE2 (VRF CUST) |
| CE2 | customer edge | 65102 | (none) | 192.168.99.112 | e1/0 172.16.2.2/30 to PE2; Loopback1 10.2.1.1/24 (the LAN) |

The customer's VRF is `CUST` on both PEs: `rd 65000:1`, `route-target both 65000:1`. The **P router has no BGP at all**:
it only runs OSPF and LDP, so it never learns a customer route. PE1 and PE2 peer with each other over their loopbacks with
`address-family vpnv4` and `send-community extended` (the route-target travels as an extended community).

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see
`labs/labtool.sh`):

```
labs/labtool.sh 12_mpls_l3vpn import && labs/labtool.sh 12_mpls_l3vpn start
labs/labtool.sh 12_mpls_l3vpn bootstrap          # once, takes several minutes
labs/labtool.sh 12_mpls_l3vpn baseline
labs/labtool.sh 12_mpls_l3vpn show PE1 "show bgp vpnv4 unicast all summary"
labs/labtool.sh 12_mpls_l3vpn apply 12_mpls_l3vpn      # PE2 imports a mistyped route-target
labs/labtool.sh 12_mpls_l3vpn rollback 12_mpls_l3vpn
```

## What you should see (captured from this lab)

**1. The core is labelled.** LDP runs between PE1 and P (and P and PE2), so every provider loopback has a transport label:

```
PE1# show mpls ldp neighbor
    Peer LDP Ident: 10.255.0.2:0; Local LDP Ident 10.255.0.1:0
	State: Oper; Msgs sent/rcvd: 9/9; Downstream
	LDP discovery sources:
	  Ethernet1/0, Src IP addr: 10.0.1.2

P# show mpls forwarding-table
Local      Outgoing   Prefix           Bytes Label   Outgoing   Next Hop
Label      Label      or Tunnel Id     Switched      interface              
16         Pop Label  10.255.0.1/32    5452          Et1/0      10.0.1.1
17         Pop Label  10.255.0.3/32    7831          Et1/1      10.0.2.2
```

P knows only the two PE loopbacks. It has no customer routes, which is why a provider core scales.

**2. The VPNv4 session carries the customer route.** PE1 has one VPNv4 neighbor (PE2) and one VRF neighbor (CE1):

```
PE1# show bgp vpnv4 unicast all summary
Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.255.0.3      4        65000       3       5        4    0    0 00:01:41        1
172.16.1.2      4        65101       6       5        4    0    0 00:02:13        1
```

The prefix that PE1 learned from PE2 shows the pieces of an L3VPN route in one place: the **RD** in the NLRI
(`65000:1:10.2.1.0/24`), the **route-target** as an extended community, and the **VPN label** (19) that PE2 assigned:

```
PE1# show bgp vpnv4 unicast all 10.2.1.0/24
BGP routing table entry for 65000:1:10.2.1.0/24, version 4
Paths: (1 available, best #1, table CUST)
  65102
    10.255.0.3 (metric 21) from 10.255.0.3 (10.255.0.3)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/19
```

**3. Two labels on every packet.** The forwarding entry in the VRF shows the stack PE1 pushes: the inner **VPN label 19**
(tells PE2 which VRF the packet belongs to) and the outer **transport label 17** (tells P where to send it):

```
PE1# show ip cef vrf CUST 10.2.1.0 detail
10.2.1.0/24, epoch 0, flags rib defined all labels
  recursive via 10.255.0.3 label 19
    nexthop 10.0.1.2 Ethernet1/0 label 17
```

**4. The customer sees a normal routed network.** CE1 learns site 2 by plain eBGP from PE1 (AS path `65000 65102`, no MPLS
on the customer side) and the ping works:

```
CE1# show ip route 10.2.1.0
Routing entry for 10.2.1.0/24
  Known via "bgp 65101", distance 20, metric 0
  Tag 65000, type external
  * 172.16.1.1, from 172.16.1.1, 00:00:46 ago

CE1# ping 10.2.1.1 source Loopback1
!!!!!
Success rate is 100 percent (5/5), round-trip min/avg/max = 60/72/80 ms
```

## The scenario: a mistyped import route-target

`labs/labtool.sh 12_mpls_l3vpn apply 12_mpls_l3vpn` changes only PE2's VRF: `no route-target import 65000:1`,
`route-target import 65000:11`. Nothing on PE1, P, or the BGP session changes, and the session stays up.

```
PE2# show ip route vrf CUST 10.1.1.0
% Subnet not in table

PE2# show bgp vpnv4 unicast all 10.1.1.0/24
% Network not in table

CE1# ping 10.2.1.1 source Loopback1
.....
Success rate is 0 percent (0/5)
```

Why the whole prefix disappears from the BGP table and not only from the VRF: by default a router that holds VRFs drops any
VPNv4 route whose route-targets it does not import (the route-target filter). PE2 imports only `65000:11` now, and PE1 still
exports `65000:1`, so PE2 throws the route away. (Just after the change you can catch the intermediate state
`Paths: (0 available, no best path)`.) That is also the classic production symptom: the BGP session is up, the
prefix counters look normal on the sending side, and one direction of the VPN is dead.

`rollback` restores `route-target import 65000:1`; the route comes back with its VPN label and the ping passes.

## Try it yourself

- On PE1, run `show ip bgp vpnv4 all labels` and `show mpls forwarding-table vrf CUST`. Find the label 19 that PE2 announced.
- Shut PE1's `Ethernet1/0` and watch LDP, the VPNv4 next hop (10.255.0.3 is reachable only through P) and the VRF route.
- Remove `send-community extended` from PE1's vpnv4 neighbor and clear the session: the routes still arrive, but the RT is
  missing, so PE2 imports nothing. (Put it back afterwards.)
- Change `rd` on PE2's VRF to `65000:2`. The VPN still works, because the RD only needs to make the VPNv4 prefix unique and
  the RT decides who imports it. Then explain why using different RDs per PE is the design most large providers choose.

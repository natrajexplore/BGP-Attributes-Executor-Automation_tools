# Lab 14: MPLS L3VPN shared services (extranet)

**Use case.** A provider or a large enterprise runs several private VPNs and one **shared service** that all of them need:
DNS, a licence server, a managed security service, an Internet gateway. Each customer must reach the service, and the
customers must **not** reach each other. In an L3VPN this is done with route-targets alone: a separate VRF holds the
service, and the customers and the service import each other's RT, while the customers never import each other's.

```
  customer A (AS 65101), 10.1.0.0/24
  +------+  172.16.1.0/30
  | CE-A |-----------+
  +------+           |   10.0.1.0/30    10.0.2.0/30                       172.16.3.0/30
                  +--+--+  OSPF/LDP  +-----+  OSPF/LDP  +-----+  eBGP   +--------+
                  | PE1 |------------|  P  |------------| PE2 |---------| CE-SVC |
                  +--+--+            +-----+            +-----+         +--------+
  +------+           |                                  VRF SHARED       shared services
  | CE-B |-----------+                                                   (AS 65900) 10.9.0.0/24
  +------+  172.16.2.0/30
  customer B (AS 65201), 10.2.0.0/24
```

| Router | Role | AS | Loopback0 | Management | Links |
|---|---|---|---|---|---|
| CE-A | customer A | 65101 | (none) | 192.168.99.111 | e1/0 172.16.1.2/30 to PE1; Loopback1 10.1.0.1/24 |
| CE-B | customer B | 65201 | (none) | 192.168.99.113 | e1/0 172.16.2.2/30 to PE1; Loopback1 10.2.0.1/24 |
| CE-SVC | shared services | 65900 | (none) | 192.168.99.114 | e1/0 172.16.3.2/30 to PE2; Loopback1 10.9.0.1/24 |
| PE1 | provider edge | 65000 | 10.255.0.1 | 192.168.99.121 | e1/0 10.0.1.1/30 to P; e1/1 172.16.1.1/30 (VRF CUST-A); e1/2 172.16.2.1/30 (VRF CUST-B) |
| P | provider core | 65000 | 10.255.0.2 | 192.168.99.122 | e1/0 10.0.1.2/30; e1/1 10.0.2.1/30 (no BGP) |
| PE2 | provider edge | 65000 | 10.255.0.3 | 192.168.99.123 | e1/0 10.0.2.2/30 to P; e1/1 172.16.3.1/30 (VRF SHARED) |

Route-target design (RD in brackets):

| VRF | Router | RD | Export RT | Import RT |
|---|---|---|---|---|
| CUST-A | PE1 | 65000:100 | 65000:100 | 65000:100, **65000:900** |
| CUST-B | PE1 | 65000:200 | 65000:200 | 65000:200 (900 is added by the scenario) |
| SHARED | PE2 | 65000:900 | 65000:900 | 65000:100, 65000:200 |

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see
`labs/labtool.sh`; the 6 routers take several minutes to bootstrap):

```
labs/labtool.sh 14_mpls_shared_services import && labs/labtool.sh 14_mpls_shared_services start
labs/labtool.sh 14_mpls_shared_services bootstrap
labs/labtool.sh 14_mpls_shared_services baseline
labs/labtool.sh 14_mpls_shared_services show CE-B "show ip route 10.9.0.0"
labs/labtool.sh 14_mpls_shared_services apply 14_mpls_shared_services      # B imports the service route-target
labs/labtool.sh 14_mpls_shared_services rollback 14_mpls_shared_services
```

## What you should see (captured from this lab)

**1. Baseline: a one-way extranet.** The service VRF imports both customer RTs, so it has both customer networks and its
own; customer A imports the service RT and has the service network; customer B does **not** import 900, so it has nothing but
itself:

```
PE2# show ip route vrf SHARED
B        10.1.0.0 [200/0] via 10.255.0.1, 00:00:23
B        10.2.0.0 [200/0] via 10.255.0.1, 00:00:23
B        10.9.0.0 [20/0] via 172.16.3.2, 00:00:23

PE1# show ip route vrf CUST-A
B        10.1.0.0 [20/0] via 172.16.1.2, 00:01:10
B        10.9.0.0 [200/0] via 10.255.0.3, 00:00:28

PE1# show ip route vrf CUST-B
B        10.2.0.0 [20/0] via 172.16.2.2, 00:01:14
```

CE-B has no route to the services, although the service side already knows customer B:

```
CE-B# show ip route 10.9.0.0
% Subnet not in table

CE-SVC# show ip route 10.2.0.0
Routing entry for 10.2.0.0/24
  Known via "bgp 65900", distance 20, metric 0
  Tag 65000, type external
```

This is the classic extranet mistake: a route is only useful if the other side can send traffic back, and the reverse is
also true. Both directions need an RT match: the service must import the customer's RT (so it can answer) and the customer must
import the service's RT (so it can ask). Here only the first half is in place.

**2. The scenario: B imports the service route-target.** `labs/labtool.sh 14_mpls_shared_services apply 14_mpls_shared_services` adds
`route-target import 65000:900` to VRF CUST-B on PE1 and nothing else:

```
PE1# show ip route vrf CUST-B
B        10.2.0.0 [20/0] via 172.16.2.2, 00:02:43
B        10.9.0.0 [200/0] via 10.255.0.3, 00:01:02

CE-B# show ip route 10.9.0.0
Routing entry for 10.9.0.0/24
  Known via "bgp 65201", distance 20, metric 0
  Tag 65000, type external
  * 172.16.2.1, from 172.16.2.1, 00:01:05 ago
      AS Hops 2
```

**3. The customers stay isolated.** After the change customer A still has no route to customer B (and the reverse), because
neither imports the other's RT:

```
CE-A# show ip route 10.2.0.0
% Subnet not in table
```

The shared VRF does not act as a bridge. Each customer's routes keep their own RT (65000:100 or 65000:200) and are only imported into VRFs that list that RT, and SHARED exports nothing but its own network with 65000:900. The service VRF is a **meeting point, not a router between tenants.**

`rollback` removes the import; CE-B loses the service route again, and the isolation check on CE-A holds in both states.

## Try it yourself

- Add `route-target export 65000:100` to VRF SHARED and watch what customer A's routers and the services network learn. Then think about why exports on a shared VRF need the same review as any firewall rule.
- Look at the labels with `show bgp vpnv4 unicast all 10.9.0.0/24` on PE1.
- Give the service a second network and see that both customers get it with no change on the customer VRFs.

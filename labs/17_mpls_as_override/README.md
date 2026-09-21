# Lab 17: MPLS L3VPN with the same customer AS at both sites (`as-override` versus `allowas-in`)

**Use case.** A customer has two sites and uses **one BGP AS number (65100) at both of them**: a common choice, because the
customer only owns one private AS. The sites are connected through a provider's L3VPN with eBGP on each PE-CE link. Everything
looks fine (every session is up, every VRF has its routes) and yet the sites cannot reach each other. The cause is BGP's
loop prevention: site 1's route reaches site 2 with AS_PATH `65000 65100`, and CE2 sees **its own AS in the path** and discards the
route. There are two standard fixes, one on the provider's PE (`as-override`) and one on the customer's CE (`allowas-in`).

```
   customer site 1 (AS 65100)          AS 65000 (provider)              customer site 2 (AS 65100)
   10.1.1.0/24                                                          10.2.1.0/24
  +-----+ 172.16.0.0/30 +-----+ 10.0.1.0/30 +-----+ 10.0.2.0/30 +-----+ 172.16.0.0/30 +-----+
  | CE1 |---------------| PE1 |-------------|  P  |-------------| PE2 |---------------| CE2 |
  +-----+   eBGP (VRF) +-----+  OSPF+LDP   +-----+  OSPF+LDP   +-----+   eBGP (VRF)   +-----+
```

| Router | Role | AS | Loopback0 | Management | Links |
|---|---|---|---|---|---|
| CE1 | customer site 1 | 65100 | (none) | 192.168.99.11 | e1/0 172.16.0.2/30 to PE1; Loopback1 10.1.1.1/24 |
| PE1 | provider edge | 65000 | 10.255.0.1 | 192.168.99.21 | e1/0 10.0.1.1/30 to P; e1/1 172.16.0.1/30 (VRF CUST) |
| P | provider core | 65000 | 10.255.0.2 | 192.168.99.22 | e1/0 10.0.1.2/30; e1/1 10.0.2.1/30 (no BGP) |
| PE2 | provider edge | 65000 | 10.255.0.3 | 192.168.99.23 | e1/0 10.0.2.2/30 to P; e1/1 172.16.0.1/30 (VRF CUST) |
| CE2 | customer site 2 | 65100 | (none) | 192.168.99.12 | e1/0 172.16.0.2/30 to PE2; Loopback1 10.2.1.1/24 |

Both PE-CE links use the same subnet, 172.16.0.0/30: each PE holds it inside a VRF and nobody else sees it, so one standard
numbering plan works for every site (and one scenario template fits both PEs and both CEs).

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see
`labs/labtool.sh`):

```
labs/labtool.sh 17_mpls_as_override import && labs/labtool.sh 17_mpls_as_override start
labs/labtool.sh 17_mpls_as_override bootstrap
labs/labtool.sh 17_mpls_as_override baseline
labs/labtool.sh 17_mpls_as_override show CE2 "show ip route 10.1.1.0"
labs/labtool.sh 17_mpls_as_override apply 17_as_override       # fix 1, on the PEs
labs/labtool.sh 17_mpls_as_override rollback 17_as_override
labs/labtool.sh 17_mpls_as_override apply 17_allowas_in        # fix 2, on the CEs (from the baseline, not together with fix 1)
labs/labtool.sh 17_mpls_as_override rollback 17_allowas_in
```

## What you should see (captured from this lab)

**1. Baseline: the VPN is up in the provider and broken for the customer.** PE2 has site 1's route, learned over VPNv4 with the
customer's AS in the path (`65100`) and RT 65000:1, and the VRF has it. CE2 has nothing:

```
PE2# show ip route vrf CUST 10.1.1.0
Routing entry for 10.1.1.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65100, type internal
  * 10.255.0.1 (default), from 10.255.0.1, 00:00:42 ago
      MPLS label: 18

CE2# show ip route 10.1.1.0
% Subnet not in table

CE2# show ip bgp 10.1.1.0/24
% Network not in table

CE1# show ip route 10.2.1.0
% Subnet not in table
```

The reason is not visible on CE2: the PE sends the route with AS_PATH `65000 65100`, and CE2 (AS 65100) drops it during
loop detection, before it is stored. (Without `soft-reconfiguration inbound` the denied route does not even show in
`show ip bgp`.) That is why the VPN "works" on every provider check and fails only on the customer's side.

**2. Fix 1: `as-override` on the PEs (provider side).** `labs/labtool.sh 17_mpls_as_override apply 17_as_override` adds
`neighbor 172.16.0.2 as-override` inside `address-family ipv4 vrf CUST` on both PEs. When the PE sends a route to that CE, it
replaces every occurrence of the CE's AS in the path with the provider's own AS. CE2 now sees `65000 65000` and accepts it:

```
CE2# show ip route 10.1.1.0
Routing entry for 10.1.1.0/24
  Known via "bgp 65100", distance 20, metric 0
  Tag 65000, type external
  * 172.16.0.1, from 172.16.0.1, 00:01:08 ago
      AS Hops 2

CE2# show ip bgp 10.1.1.0/24
  65000 65000
    172.16.0.1 from 172.16.0.1 (10.255.0.3)
      Origin IGP, localpref 100, valid, external, best
```

The customer's AS number is replaced only in the direction PE to CE, and only towards a CE that has that AS.

`rollback` removes the command and CE2 loses the route again.

**3. Fix 2: `allowas-in` on the CEs (customer side).** `labs/labtool.sh 17_mpls_as_override apply 17_allowas_in` adds
`neighbor 172.16.0.1 allowas-in` under `address-family ipv4` on both CEs. The provider does not change. The path stays
`65000 65100`, and each CE now accepts a route that contains its own AS:

```
CE2# show ip bgp 10.1.1.0/24
  65000 65100
    172.16.0.1 from 172.16.0.1 (10.255.0.3)
      Origin IGP, localpref 100, valid, external, best

CE2# show ip route 10.1.1.0
Routing entry for 10.1.1.0/24
  Known via "bgp 65100", distance 20, metric 0
  Tag 65000, type external
```

## Which one to use

| | `as-override` (PE) | `allowas-in` (CE) |
|---|---|---|
| Who configures | the provider, on the PE | the customer, on each CE |
| AS_PATH the CE sees | `65000 65000` (own AS replaced) | `65000 65100` (unchanged) |
| Loop protection on the CE | stays on: no route with the CE's AS reaches it | weakened: the CE accepts its own AS in a path |
| Typical use | a provider service, one setting on the PE for every such site | a customer without provider co-operation |

Do not run both together: use one fix, and keep the other off.

## Try it yourself

- Apply `17_as_override` and read `show ip bgp 10.1.1.0/24` on CE2: the path has the provider's AS twice. Ask what the customer loses
  (the original path information is gone from the AS_PATH).
- Use different AS numbers on the two CEs (65101 and 65102) and see that neither fix is needed: that is lab 12.
- With `allowas-in`, add a number (`allowas-in 1`) and read what changes about how many copies of the CE's own AS a path may contain.

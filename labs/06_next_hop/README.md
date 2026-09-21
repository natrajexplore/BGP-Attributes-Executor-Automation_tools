# Lab 06: NEXT_HOP, an ISP link that the IGP does not know

**Use case.** EDGE learns 100.100.100.0/24 from an ISP over a link (172.16.1.0/30) that is deliberately **not** in the IGP, which is the
normal design. EDGE passes the route to a route reflector (CORE), which passes it on to CLIENT. With `next-hop-self` on EDGE the route
works everywhere. Without it, the ISP's link address travels into iBGP as the next hop, nobody inside the AS can reach it, and the
route silently disappears from the far end of the network, although every BGP session stays up.

```
   ISP (AS 65001)        EDGE                  CORE (route reflector)        CLIENT
   100.100.100.0/24  172.16.1.0/30   10.0.0.0/30 (OSPF)             10.0.0.4/30 (OSPF)
   [--------------eBGP------------][-----------iBGP-----------][----------iBGP----------]
        link not in the IGP           AS 65000 (all three)
```

| Router | AS | Loopback0 | Management | Links |
|---|---|---|---|---|
| ISP | 65001 | none | 192.168.99.31 | e1/0 172.16.1.1/30 to EDGE; Loopback1 100.100.100.1/24 |
| EDGE | 65000 | 10.255.0.11 | 192.168.99.11 | e1/0 172.16.1.2/30 to ISP; e1/1 10.0.0.1/30 to CORE |
| CORE | 65000 | 10.255.0.1 | 192.168.99.21 | e1/0 10.0.0.2/30 to EDGE; e1/1 10.0.0.5/30 to CLIENT |
| CLIENT | 65000 | 10.255.0.20 | 192.168.99.22 | e1/0 10.0.0.6/30 to CORE |

EDGE, CORE and CLIENT run OSPF for their loopbacks and links (the ISP link is left out). CORE is a route reflector with EDGE and
CLIENT as its clients. iBGP runs over loopbacks, and EDGE has `neighbor 10.255.0.1 next-hop-self`.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 06_next_hop up               # takes about 8 minutes
labs/labtool.sh 06_next_hop show CORE "show ip bgp 100.100.100.0/24"
labs/labtool.sh 06_next_hop apply 06_next_hop      # EDGE stops rewriting the next hop toward CORE
labs/labtool.sh 06_next_hop rollback 06_next_hop
```

## What you should see (captured from this lab)

**Baseline.** CORE sees the route with EDGE's loopback as the next hop, which the IGP reaches (metric 11). CLIENT learns it through
the reflector, with the reflection attributes:

```
CORE# show ip bgp 100.100.100.0/24
  65001, (Received from a RR-client)
    10.255.0.11 (metric 11) from 10.255.0.11 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, internal, best

CLIENT# show ip bgp 100.100.100.0/24
  65001
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Originator: 10.255.0.11, Cluster list: 10.255.0.1
```

**After `apply`.** The same route reaches CORE with the ISP's link address as the next hop. CORE has no route to it, so the path is
`(inaccessible)` and the entry says `no best path`. A reflector only reflects its best path, so CLIENT never hears the route:

```
CORE# show ip bgp 100.100.100.0/24
Paths: (1 available, no best path)
  65001, (Received from a RR-client)
    172.16.1.1 (inaccessible) from 10.255.0.11 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, internal

CLIENT# show ip bgp 100.100.100.0/24
% Network not in table
```

## Things to notice

* **`show ip route 172.16.1.1` on CORE says `% Network not in table` in both states.** In the baseline the next hop is EDGE's
  loopback, so CORE never needs that address at all. The route lookup only explains the failure once the BGP entry shows the ISP address
  as its next hop. Always read the BGP entry first.
* **Nothing else breaks.** Every session stays Established, and nothing logs an error. The AS just loses a route.
* **CORE's `Not advertised to any peer`** is the visible sign: with no best path there is nothing to reflect.

## Notes from building this lab

* Putting the ISP link into OSPF as a passive interface is the alternative to `next-hop-self`. It was not built as a second scenario
  because it would also expose the external link to the IGP; the Learn tab (attribute 06) discusses the trade-off.
* `apply` and `rollback` wait 20 seconds before they check; iBGP updates are not delayed like eBGP ones.

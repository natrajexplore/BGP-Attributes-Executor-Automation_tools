# Lab 09: COMMUNITY, tagging a route toward one ISP

**Use case.** An enterprise edge (EDGE) advertises 10.10.0.0/16 to two ISPs, and both ISPs peer with a content network. Toward
ISP-A the edge attaches a custom community (65001:120) and the well-known **no-export** community. ISP-A honours no-export, so it
does not pass the route on to its eBGP peers, and the content network hears the route only through ISP-B.

A community means nothing until a router acts on it. Here the action is built into the protocol for no-export, and ISP-A prints the
custom value so you can see it arrive. Sending a community also needs an explicit `neighbor x send-community` on IOS, which the
scenario configures and the baseline deliberately does not.

```
                 ISP-A (AS 65001)  ip bgp-community new-format
                /                     \
      172.16.1.0/30                    198.51.100.0/30
              /                          \
   EDGE (AS 65000)                        CONTENT (AS 65100)
   10.10.0.0/16   \                       /
      172.16.2.0/30                      203.0.113.0/30
                    \                  /
                       ISP-B (AS 65002)
```

| Router | AS | Management | Links |
|---|---|---|---|
| EDGE | 65000 | 192.168.99.11 | e1/0 172.16.1.2/30 to ISP-A; e1/1 172.16.2.2/30 to ISP-B; originates 10.10.0.0/16 |
| ISP-A | 65001 | 192.168.99.31 | e1/0 172.16.1.1/30 to EDGE; e1/1 198.51.100.1/30 to CONTENT; `ip bgp-community new-format` |
| ISP-B | 65002 | 192.168.99.32 | e1/0 172.16.2.1/30 to EDGE; e1/1 203.0.113.1/30 to CONTENT |
| CONTENT | 65100 | 192.168.99.33 | e1/0 198.51.100.2/30; e1/1 203.0.113.2/30 |

All sessions are eBGP; there is no IGP.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 09_community up              # takes about 8 minutes
labs/labtool.sh 09_community show ISP-A "show ip bgp 10.10.0.0/16"
labs/labtool.sh 09_community apply 09_community    # EDGE tags the route toward ISP-A
labs/labtool.sh 09_community rollback 09_community
```

## What you should see (captured from this lab)

**Baseline.** ISP-A learns the route from EDGE, and CONTENT hears it from both ISPs. No community is present.

**After `apply`.** ISP-A shows the custom community and no-export on the path from EDGE, and the header says the route is not passed on
to eBGP peers. ISP-A also has a second path, through CONTENT and ISP-B, which does not carry the tag:

```
ISP-A# show ip bgp 10.10.0.0/16
Paths: (2 available, best #2, table default, not advertised to EBGP peer)
  Not advertised to any peer
  65100 65002 65000
    198.51.100.2 from 198.51.100.2 (10.255.100.1)
      Origin IGP, localpref 100, valid, external
  65000
    172.16.1.2 from 172.16.1.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, best
      Community: 65001:120 no-export

ISP-A# show ip bgp community no-export
 *>  10.10.0.0/16     172.16.1.2               0             0 65000 i
```

CONTENT has lost the path through ISP-A. ISP-A will not advertise the route, so only ISP-B's path is left:

```
CONTENT# show ip bgp 10.10.0.0/16
Paths: (1 available, best #1, table default)
  65002 65000
    203.0.113.1 from 203.0.113.1 (10.255.2.1)
      Origin IGP, localpref 100, valid, external, best
```

## Things to notice

* **The tag works on the path that carries it.** ISP-B receives the route from EDGE without a community, so it passes it to CONTENT
  unchanged. no-export only limited what ISP-A does with the copy that had the tag.
* **`show ip bgp community no-export` is a quick audit.** It lists every route on the router that carries the community.
* **The community is readable because ISP-A runs `ip bgp-community new-format`.** Without it the value prints as one decimal number
  (65001:120 is 4259905656 in the old format).
* **`EDGE# show ip bgp neighbors 172.16.1.1 advertised-routes` does not show communities.** Look at the receiving router to confirm the tag arrived.

## Notes from building this lab

* The scenario uses `additive` so any communities already on the route are kept, and it enables `send-community` on the neighbor.
  On IOS, without `send-community` the tag does not leave EDGE, whatever the route-map says (documented behaviour, not run in this lab).
* The baseline can show either ISP as CONTENT's best path (two equal paths). Only the applied and rolled-back checks are meaningful.
* `apply` and `rollback` wait 40 seconds before they check.

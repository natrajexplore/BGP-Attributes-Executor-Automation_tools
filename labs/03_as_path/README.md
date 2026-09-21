# Lab 03: AS_PATH, steering inbound traffic with a prepend

**Use case.** An enterprise router (ENT) is dual-homed to two ISPs that both reach a content network. The enterprise wants
traffic from the outside to enter through ISP-B, not ISP-A, and it cannot set anyone else's Local-Pref. It can make the
ISP-A path look longer, by prepending its own AS number on that link.

To make the baseline repeatable, CONTENT runs `bgp bestpath compare-routerid`. The two paths to the enterprise are equally long,
so CONTENT breaks the tie with the neighbor's router-ID, and always chooses ISP-A (the lower router-ID) before the prepend.

```
                 ISP-A (AS 65001)  router-id 10.255.1.1
                /                  \
      172.16.1.0/30                 198.51.100.0/30
              /                      \
   ENT (AS 65000)                     CONTENT (AS 65100)
   10.10.0.0/16   \                   /
      172.16.2.0/30                  203.0.113.0/30
                    \              /
                 ISP-B (AS 65002)  router-id 10.255.2.1
```

| Router | AS | Management | Links |
|---|---|---|---|
| ENT | 65000 | 192.168.99.11 | e1/0 172.16.1.2/30 to ISP-A; e1/1 172.16.2.2/30 to ISP-B; originates 10.10.0.0/16 |
| ISP-A | 65001 | 192.168.99.31 | e1/0 172.16.1.1/30 to ENT; e1/1 198.51.100.1/30 to CONTENT |
| ISP-B | 65002 | 192.168.99.32 | e1/0 172.16.2.1/30 to ENT; e1/1 203.0.113.1/30 to CONTENT |
| CONTENT | 65100 | 192.168.99.33 | e1/0 198.51.100.2/30; e1/1 203.0.113.2/30; `bgp bestpath compare-routerid` |

All sessions are eBGP; there is no IGP.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 03_as_path up                # takes about 10 minutes
labs/labtool.sh 03_as_path show CONTENT "show ip bgp 10.10.0.0/16"
labs/labtool.sh 03_as_path apply 03_as_path  # ENT prepends AS 65000 three extra times toward ISP-A
labs/labtool.sh 03_as_path rollback 03_as_path
```

## What you should see (captured from this lab)

**Baseline.** CONTENT has two two-hop paths and picks ISP-A by router-ID (the header line shows the setting). ISP-B reaches
the enterprise directly over its own link:

```
CONTENT# show ip bgp 10.10.0.0/16
BGP Bestpath: compare-routerid
  65001 65000
    198.51.100.1 from 198.51.100.1 (10.255.1.1)
      Origin IGP, localpref 100, valid, external, best
  65002 65000
    203.0.113.1 from 203.0.113.1 (10.255.2.1)
      Origin IGP, localpref 100, valid, external
```

**After `apply`.** The ISP-A path is now four ASes longer on paper. CONTENT has a single path left, through ISP-B, and ISP-A itself
prefers to reach the enterprise the long way round, through CONTENT and ISP-B:

```
CONTENT# show ip bgp 10.10.0.0/16
  65002 65000
    203.0.113.1 from 203.0.113.1 (10.255.2.1)
      Origin IGP, localpref 100, valid, external, best

ISP-A# show ip bgp 10.10.0.0/16
  65100 65002 65000
    198.51.100.2 from 198.51.100.2 (10.255.100.1)
      Origin IGP, localpref 100, valid, external, best
  65000 65000 65000 65000
    172.16.1.2 from 172.16.1.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external
```

## Things to notice

* **The prepend affects ISP-A too.** The direct path is four hops (`65000` four times), the path through CONTENT is three, so ISP-A's
  own traffic to the enterprise now goes the long way. Prepending changes every network that compares path length, not only the
  remote one you were aiming at.
* **CONTENT lost a path entirely.** ISP-A's best path is now the one it learned from CONTENT, and a router does not advertise a path
  back to the neighbor it came from. So CONTENT no longer hears the ISP-A route at all.
* **Choose the count from the alternatives.** By the path-length rule (not tested with other counts), one prepend is enough to move
  CONTENT (three hops against two), while ISP-A only moves at three prepends, because its alternative through CONTENT is three hops
  long. Look at each network's other paths before you pick a number, and try `set as-path prepend` with one and two ASes to see who moves.

## Notes from building this lab

* `bgp bestpath compare-routerid` on CONTENT is what keeps the baseline stable. Without it, the tie between two equal eBGP paths is
  decided by which was learned first, and the baseline can differ from run to run.
* `apply` and `rollback` wait 40 seconds before they check.

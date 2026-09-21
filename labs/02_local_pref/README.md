# Lab 02: LOCAL_PREF, a dual-homed enterprise choosing its exit

**Use case.** An enterprise has two edge routers, EDGE1 to ISP-A and EDGE2 to ISP-B, and a core router (CORE) that has no ISP link.
Which exit should the whole AS use? Local-Pref answers that with one setting, applied where the route enters. This lab also shows
the two side effects that catch people out: the preferred edge stops advertising its alternative, and the enterprise becomes a
transit network between the ISPs.

```
              CONTENT (AS 65100)  100.100.100.0/24
               /                \
     198.51.100.0/30        203.0.113.0/30
             /                    \
       ISP-A (65001)          ISP-B (65002)
             |  172.16.1.0/30       |  172.16.2.0/30
       +-----+-----+          +-----+-----+
       |   EDGE1   |----------|   EDGE2   |      AS 65000
       +-----+-----+ 10.0.0.8/30 +-----+-----+
             | 10.0.0.0/30           | 10.0.0.4/30
             +-----------+-----------+
                      +--+---+
                      | CORE |
                      +------+
```

| Router | AS | Loopback0 | Management | Links |
|---|---|---|---|---|
| CORE | 65000 | 10.255.0.1 | 192.168.99.21 | e1/0 10.0.0.1/30 to EDGE1; e1/1 10.0.0.5/30 to EDGE2 |
| EDGE1 | 65000 | 10.255.0.11 | 192.168.99.11 | e1/0 10.0.0.2/30 to CORE; e1/1 10.0.0.9/30 to EDGE2; e1/2 172.16.1.2/30 to ISP-A |
| EDGE2 | 65000 | 10.255.0.12 | 192.168.99.12 | e1/0 10.0.0.6/30 to CORE; e1/1 10.0.0.10/30 to EDGE1; e1/2 172.16.2.2/30 to ISP-B |
| ISP-A | 65001 | none | 192.168.99.31 | e1/0 172.16.1.1/30 to EDGE1; e1/1 198.51.100.1/30 to CONTENT |
| ISP-B | 65002 | none | 192.168.99.32 | e1/0 172.16.2.1/30 to EDGE2; e1/1 203.0.113.1/30 to CONTENT |
| CONTENT | 65100 | none | 192.168.99.33 | e1/0 198.51.100.2/30; e1/1 203.0.113.2/30; Loopback1 100.100.100.1/24 |

The three enterprise routers run OSPF and a full iBGP mesh over their loopbacks; the edges use `next-hop-self`.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 02_local_pref up             # takes about 12 minutes
labs/labtool.sh 02_local_pref show CORE "show ip bgp 100.100.100.0/24"
labs/labtool.sh 02_local_pref apply 02_local_pref    # EDGE2 sets Local-Pref 200 on routes from ISP-B
labs/labtool.sh 02_local_pref rollback 02_local_pref
```

## What you should see (captured from this lab)

**Baseline.** Both paths have Local-Pref 100, the same AS_PATH length and the same IGP metric, so CORE falls through to the
router-ID (step 10) and takes EDGE1 (10.255.0.11 is lower). Each edge keeps its own eBGP path (`external, best`):

```
CORE# show ip bgp 100.100.100.0/24
  65002 65100
    10.255.0.12 (metric 11) from 10.255.0.12 (10.255.0.12)
      Origin IGP, metric 0, localpref 100, valid, internal
  65001 65100
    10.255.0.11 (metric 11) from 10.255.0.11 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, internal, best
```

**After `apply`.** EDGE2 gives ISP-B routes Local-Pref 200. CORE follows, and so does EDGE1, which has its own eBGP path but
abandons it: Local-Pref (step 2) is compared before eBGP-over-iBGP (step 7):

```
CORE# show ip bgp 100.100.100.0/24
  65002 65100
    10.255.0.12 (metric 11) from 10.255.0.12 (10.255.0.12)
      Origin IGP, metric 0, localpref 200, valid, internal, best

EDGE1# show ip bgp 100.100.100.0/24
  65002 65100
    10.255.0.12 (metric 11) from 10.255.0.12 (10.255.0.12)
      Origin IGP, metric 0, localpref 200, valid, internal, best
  65001 65100
    172.16.1.1 from 172.16.1.1 (10.255.1.1)
      Origin IGP, localpref 100, valid, external
```

## Two side effects, both visible in this lab

1. **CORE lost its alternative.** After `apply`, CORE has one path where it had two. EDGE1 now prefers the iBGP path, so it no
   longer advertises its own ISP-A path. If ISP-B fails, CORE has nothing ready.
2. **The enterprise became a transit network.** EDGE1's best path is now the one it learned through EDGE2 (from ISP-B), and a BGP
   router advertises its best path to its eBGP neighbors. ISP-A therefore sees a path to the content network through you:

```
ISP-A# show ip bgp 100.100.100.0/24
  65000 65002 65100
    172.16.1.2 from 172.16.1.2 (10.255.0.11)
      Origin IGP, localpref 100, valid, external
  65100
    198.51.100.2 from 198.51.100.2 (10.255.100.1)
      Origin IGP, metric 0, localpref 100, valid, external, best
```

ISP-A still prefers its own direct path, so no traffic flows yet, but the route is offered. The fix is an outbound filter on both
edges that advertises only your own prefixes (see the Learn tab, attribute 02, Pro).

Local-Pref itself never leaves the AS: ISP-A's entries show `localpref 100`.

## Notes from building this lab

* `apply` and `rollback` wait 40 seconds before they check, because eBGP sends updates at most every 30 seconds.
* The baseline snapshot from `labtool capture` was complete here. If yours is not, the rolled-back snapshot is the reliable baseline.

# Lab 07: ATOMIC_AGGREGATE, a summary on one edge and not the other

**Use case.** CE-LAN originates four /24 networks. Two edge routers, EDGE1 (to ISP-A) and EDGE2 (to ISP-B), both learn them. The
enterprise wants the providers to see one summary, 10.10.0.0/16, instead of four small routes. This lab builds the summary in two
steps and shows what goes wrong in the middle: summarising on **one** edge is not enough.

* **Scenario `07_atomic_aggregate`** makes EDGE1 summarise with `summary-only` and no `as-set`. ISP-A receives the /16 flagged
  ATOMIC_AGGREGATE, but still hears the /24 networks through ISP-B, because EDGE2 does not summarise.
* **Scenario `07_fix`** (run after the first) makes EDGE2 summarise too, and the /24 networks disappear from both providers.

```
                     ISP-A (AS 65001) ------------------ ISP-B (AS 65002)
                       |  172.16.1.0/30    192.0.2.0/30      |  172.16.2.0/30
                  +----+----+                           +----+----+
                  |  EDGE1  |----------10.0.0.8/30------|  EDGE2  |      AS 65000
                  +----+----+                           +----+----+
                       | 10.0.0.0/30                         | 10.0.0.4/30
                       +----------------+--------------------+
                                   +----+----+
                                   | CE-LAN  |  10.10.0.0/24 .. 10.10.3.0/24
                                   +---------+
```

| Router | AS | Loopback0 | Management | Links |
|---|---|---|---|---|
| CE-LAN | 65000 | 10.255.0.20 | 192.168.99.120 | e1/0 10.0.0.2/30 to EDGE1; e1/1 10.0.0.6/30 to EDGE2; Loopback1 to 4 are the four /24 networks |
| EDGE1 | 65000 | 10.255.0.11 | 192.168.99.111 | e1/0 10.0.0.1/30 to CE-LAN; e1/1 10.0.0.9/30 to EDGE2; e1/2 172.16.1.2/30 to ISP-A |
| EDGE2 | 65000 | 10.255.0.12 | 192.168.99.112 | e1/0 10.0.0.5/30 to CE-LAN; e1/1 10.0.0.10/30 to EDGE1; e1/2 172.16.2.2/30 to ISP-B |
| ISP-A | 65001 | none | 192.168.99.131 | e1/0 172.16.1.1/30 to EDGE1; e1/1 192.0.2.1/30 to ISP-B |
| ISP-B | 65002 | none | 192.168.99.132 | e1/0 172.16.2.1/30 to EDGE2; e1/1 192.0.2.2/30 to ISP-A |

The three enterprise routers run OSPF and a full iBGP mesh over loopbacks, and the edges use `next-hop-self`. The two ISPs peer with each other.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 07_atomic_aggregate up                        # takes about 12 minutes
labs/labtool.sh 07_atomic_aggregate show ISP-A "show ip bgp 10.10.1.0/24"
labs/labtool.sh 07_atomic_aggregate apply 07_atomic_aggregate # EDGE1 summarises
labs/labtool.sh 07_atomic_aggregate apply 07_fix              # EDGE2 summarises too
labs/labtool.sh 07_atomic_aggregate rollback 07_fix
labs/labtool.sh 07_atomic_aggregate rollback 07_atomic_aggregate
```

## What you should see (captured from this lab)

**Baseline.** ISP-A has no /16 and hears each /24 twice: directly from EDGE1 (best) and through ISP-B.

**After `07_atomic_aggregate`.** ISP-A gets the summary, flagged as atomic and naming the router that built it. EDGE1 keeps the /24
components but marks them `s` (suppressed):

```
ISP-A# show ip bgp 10.10.0.0/16
  65000, (aggregated by 65000 10.255.0.11)
    172.16.1.2 from 172.16.1.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, atomic-aggregate, best

EDGE1# show ip bgp 10.10.0.0/16 longer-prefixes
 s>i 10.10.0.0/24     10.255.0.20              0    100      0 i
 *>  10.10.0.0/16     0.0.0.0                            32768 i
 s>i 10.10.1.0/24     10.255.0.20              0    100      0 i
```

**The catch.** ISP-A no longer hears the /24 from EDGE1, but it still has one, through ISP-B. EDGE2 does not summarise, so it advertises
the /24 to ISP-B, and ISP-B passes it on. Traffic for the /24 matches the more-specific route and takes that path:

```
ISP-A# show ip bgp 10.10.1.0/24
  65002 65000
    192.0.2.2 from 192.0.2.2 (10.255.2.1)
      Origin IGP, localpref 100, valid, external, best

ISP-B# show ip bgp 10.10.1.0/24
  65000
    172.16.2.2 from 172.16.2.2 (10.255.0.12)
      Origin IGP, localpref 100, valid, external, best
```

**After `07_fix`.** EDGE2 builds the same summary with `summary-only`. The /24 disappears from both providers:

```
ISP-A# show ip bgp 10.10.1.0/24     % Network not in table
ISP-B# show ip bgp 10.10.1.0/24     % Network not in table
```

## Things to notice

* **Longest-prefix match beats best-path selection.** The /16 through EDGE1 never gets a say about a /24 that is advertised elsewhere.
* **Two edges now offer the summary.** After the fix ISP-A sees the /16 from EDGE1 (`aggregated by 65000 10.255.0.11`) and, through
  ISP-B, from EDGE2 (`aggregated by 65000 10.255.0.12`). EDGE1's own table shows both a locally originated /16 and the one from EDGE2.
* **ATOMIC_AGGREGATE never changes a decision.** It is only a flag; the effect you see comes from the summary and `summary-only`.

## Notes from building this lab

* The baseline in the shared capture was complete here; `apply` and `rollback` for both scenarios wait 40 seconds because eBGP updates
  are sent at most every 30 seconds.
* `07_fix` assumes `07_atomic_aggregate` is already applied; roll them back in the reverse order.

# Lab 08: AGGREGATOR and AS_SET, summarising two subsidiaries

**Use case.** A group headquarters (AS 65000) connects two subsidiaries that have their own AS numbers (AS 65010 and
AS 65020) and one provider (AS 65001). HQ summarises the subsidiaries' /24 networks into one /16 for the provider.
The question this lab answers: what does the summary look like to everyone else, with and without `as-set`?

The shared 8-router lab cannot show this. There every component lives inside AS 65000, so the AS_SET would be empty.
Here the components come from two different ASes, so the AS_SET holds real numbers.

```
   AS 65010                    AS 65000                       AS 65001
  +--------+  172.16.10.0/30  +---------+  172.16.100.0/30  +-------+
  | SUB-A  |------------------| HQ-EDGE |-------------------|  ISP  |
  +--------+                  +----+----+                   +-------+
  10.10.1.0/24                     |
  +--------+  172.16.20.0/30       |
  | SUB-B  |-----------------------+
  +--------+
  10.10.2.0/24
   AS 65020
```

| Router | AS | Management | Links |
|---|---|---|---|
| SUB-A | 65010 | 192.168.99.111 | e1/0 172.16.10.1/30 to HQ-EDGE; Loopback1 10.10.1.1/24 |
| SUB-B | 65020 | 192.168.99.112 | e1/0 172.16.20.1/30 to HQ-EDGE; Loopback1 10.10.2.1/24 |
| HQ-EDGE | 65000 | 192.168.99.121 | e1/0 172.16.10.2/30, e1/1 172.16.20.2/30, e1/2 172.16.100.2/30 |
| ISP | 65001 | 192.168.99.131 | e1/0 172.16.100.1/30 to HQ-EDGE |

All sessions are eBGP. The baseline summary is `aggregate-address 10.10.0.0 255.255.0.0 summary-only` (no `as-set`).

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see
`labs/labtool.sh`):

```
labs/labtool.sh 08_aggregator import && labs/labtool.sh 08_aggregator start
labs/labtool.sh 08_aggregator bootstrap          # once, takes a few minutes
labs/labtool.sh 08_aggregator baseline
labs/labtool.sh 08_aggregator show ISP "show ip bgp 10.10.0.0/16"
labs/labtool.sh 08_aggregator apply 08_aggregator      # rebuild the summary with as-set
labs/labtool.sh 08_aggregator rollback 08_aggregator
```

## What you should see (captured from this lab)

**Baseline, plain summary.** The provider sees only the AS of the router that built it, the ATOMIC_AGGREGATE flag,
and who aggregated. HQ-EDGE keeps the /24 components but marks them `s` (suppressed). Note that both subsidiaries
*accept* the /16 that covers their own network:

```
ISP# show ip bgp 10.10.0.0/16
  65000, (aggregated by 65000 10.255.0.1)
    172.16.100.2 from 172.16.100.2 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, external, atomic-aggregate, best

HQ-EDGE# show ip bgp 10.10.0.0/16 longer-prefixes
 *>  10.10.0.0/16     0.0.0.0                            32768 i
 s>  10.10.1.0/24     172.16.10.1              0             0 65010 i
 s>  10.10.2.0/24     172.16.20.1              0             0 65020 i

SUB-A# show ip bgp 10.10.0.0/16
  65000, (aggregated by 65000 10.255.0.1)          <- accepted
```

**After `apply` (as-set).** The path now keeps the subsidiaries' AS numbers as an AS_SET, ATOMIC_AGGREGATE is gone,
and AGGREGATOR still names HQ-EDGE:

```
ISP# show ip bgp 10.10.0.0/16
  65000 {65010,65020}, (aggregated by 65000 10.255.0.1)
    172.16.100.2 from 172.16.100.2 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, external, best
```

**Loop prevention comes back.** HQ-EDGE advertises the summary to both subsidiaries too. Each one finds its own AS
number inside the AS_SET and discards the route:

```
SUB-A# show ip bgp 10.10.0.0/16
% Network not in table
SUB-B# show ip bgp 10.10.0.0/16
% Network not in table
```

`rollback` restores the plain summary, and both subsidiaries accept it again.

## Things to notice

* The AS_SET counts as **one** hop for AS_PATH length however many numbers it holds (see attribute 03, AS_PATH, in the Learn tab).
* AGGREGATOR is identical in both states. It is the AS_SET versus ATOMIC_AGGREGATE pair that changes.
* Without `as-set`, the summary hides the subsidiaries from the path, which is what lets them accept a route that
  contains their own prefixes. That is the loop hazard the flag warns about.

## Notes from building this lab

* Regexes inside scenario YAML files must use doubled backslashes in double quotes (`"\\{650"`), or the file does not parse.
* The automatic rollback check (the inverse of the apply checks) is wrong for this scenario, because AGGREGATOR is
  present in both states, so `scenarios/08_aggregator.yaml` defines an explicit `rollback_verify`.
* eBGP sends updates at most every 30 seconds, so `apply` and `rollback` wait 40 seconds before they check.

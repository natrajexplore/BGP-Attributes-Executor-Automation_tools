# Lab 01: WEIGHT, a branch that exits through its own local ISP

**Use case.** A branch router (SITE-R1) has a local Internet link and a WAN link to HQ, which has its own upstream. HQ's
path is shorter, so at baseline the branch sends everything out through HQ. The branch wants local breakout for its own
traffic without changing anything for the rest of the network. WEIGHT does that, because it is local to one router and is
never advertised.

```
                 LOCAL-ISP (AS 64500)
                /                      \
        198.51.100.0/30             192.0.2.0/30
              /                          \
   SITE-R1 (AS 65000, branch)          INTERNET (AS 65100)
              \                          /    100.100.100.0/24
          10.0.0.0/30 (OSPF)        172.16.12.0/30
                \                      /
                  HQ-EDGE (AS 65000)
```

| Router | AS | Loopback0 | Management | Links |
|---|---|---|---|---|
| SITE-R1 | 65000 | 10.255.0.11 | 192.168.99.11 | e1/0 198.51.100.2/30 to LOCAL-ISP; e1/1 10.0.0.1/30 to HQ-EDGE |
| HQ-EDGE | 65000 | 10.255.0.12 | 192.168.99.12 | e1/0 10.0.0.2/30 to SITE-R1; e1/1 172.16.12.2/30 to INTERNET |
| LOCAL-ISP | 64500 | none | 192.168.99.31 | e1/0 198.51.100.1/30 to SITE-R1; e1/1 192.0.2.1/30 to INTERNET |
| INTERNET | 65100 | none | 192.168.99.32 | e1/0 192.0.2.2/30; e1/1 172.16.12.1/30; Loopback1 100.100.100.1/24 |

SITE-R1 and HQ-EDGE run OSPF for their loopbacks and iBGP over them with `next-hop-self`. INTERNET originates 100.100.100.0/24.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 01_weight up                 # import, start, bootstrap, baseline (takes about 10 minutes)
labs/labtool.sh 01_weight show SITE-R1 "show ip bgp 100.100.100.0/24"
labs/labtool.sh 01_weight apply 01_weight    # SITE-R1 gives routes from its local ISP weight 300
labs/labtool.sh 01_weight rollback 01_weight
```

## What you should see (captured from this lab)

**Baseline.** SITE-R1 has two paths. The one through HQ is one AS long and the local ISP path is two, so AS_PATH (step 4)
decides and the branch exits through HQ:

```
SITE-R1# show ip bgp 100.100.100.0/24
  64500 65100
    198.51.100.1 from 198.51.100.1 (10.255.64.1)
      Origin IGP, localpref 100, valid, external
  65100
    10.255.0.12 (metric 11) from 10.255.0.12 (10.255.0.12)
      Origin IGP, metric 0, localpref 100, valid, internal, best
```

**After `apply`.** Weight is step 1, so it decides before AS_PATH is looked at, and the local ISP path wins:

```
SITE-R1# show ip bgp 100.100.100.0/24
  64500 65100
    198.51.100.1 from 198.51.100.1 (10.255.64.1)
      Origin IGP, localpref 100, weight 300, valid, external, best
  65100
    10.255.0.12 (metric 11) from 10.255.0.12 (10.255.0.12)
      Origin IGP, metric 0, localpref 100, valid, internal
```

**Nobody else sees it.** HQ-EDGE's table has no weight anywhere and its own choice (its eBGP path to INTERNET) is unchanged:

```
HQ-EDGE# show ip bgp 100.100.100.0/24
  64500 65100
    10.255.0.11 (metric 11) from 10.255.0.11 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, internal
  65100
    172.16.12.1 from 172.16.12.1 (10.255.100.1)
      Origin IGP, metric 0, localpref 100, valid, external, best
```

## Things to notice

* **The Weight column in `advertised-routes` is misleading.** `show ip bgp neighbors 10.255.0.12 advertised-routes` on SITE-R1 prints
  `300` in the Weight column, but that is SITE-R1's own table entry. Weight is not part of the update, which is why HQ-EDGE's
  output has none.
* **A local setting changes what SITE-R1 advertises.** After `apply`, SITE-R1's best path is the eBGP one, and that is the one it
  offers to HQ-EDGE (`64500 65100`, visible above). LOCAL-ISP itself loses the path it was hearing from SITE-R1.
* **The baseline already leaks.** LOCAL-ISP hears `65000 65100` from SITE-R1, a path to the Internet through the enterprise, because
  nothing filters what SITE-R1 advertises. A real branch would filter outbound (see the Learn tab, attribute 02, Pro).

## Notes from building this lab

* The baseline snapshot taken by `labtool capture` straight after `up` can be early: iBGP had not always converged yet. The
  rolled-back snapshot is the reliable baseline, and `up` now waits 90 seconds.
* `apply` and `rollback` wait 30 seconds before they check.

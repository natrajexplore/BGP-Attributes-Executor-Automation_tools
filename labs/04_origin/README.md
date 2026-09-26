# Lab 04: ORIGIN, the difference between `network` and `redistribute`

**Use case.** Two edge routers of the same AS advertise the same prefix, 10.10.0.0/16, to one ISP. EDGE1 originates it with a
`network` statement (ORIGIN IGP). EDGE2 pulls the same static route in with `redistribute static` (ORIGIN incomplete, shown as `?`).
Nothing else differs, so the ISP prefers EDGE1 only because of ORIGIN, and EDGE2 is a silent second choice. That is the everyday
way ORIGIN bites: an accidental `?` quietly demotes a path.

The lab shows the fix. Setting the origin to `igp` as the route is redistributed makes the two paths equal, and the ISP's next
tie-break decides. The ISP runs `bgp bestpath compare-routerid` so that tie-break is repeatable, and EDGE2 has the lower router-ID.

```
   EDGE1 (AS 65000)                 EDGE2 (AS 65000)
   router-id 10.255.0.11            router-id 10.255.0.2
   network 10.10.0.0/16             redistribute static (10.10.0.0/16 -> Null0)
        \                             /
   172.16.1.0/30                 172.16.2.0/30
          \                         /
               ISP (AS 65001)
```

| Router | AS | Management | Links |
|---|---|---|---|
| EDGE1 | 65000 | 192.168.99.111 | e1/0 172.16.1.2/30 to ISP; static 10.10.0.0/16 to Null0, advertised with `network` |
| EDGE2 | 65000 | 192.168.99.112 | e1/0 172.16.2.2/30 to ISP; static 10.10.0.0/16 to Null0, advertised with `redistribute static` |
| ISP | 65001 | 192.168.99.131 | e1/0 172.16.1.1/30 to EDGE1; e1/1 172.16.2.1/30 to EDGE2; `bgp bestpath compare-routerid` |

The two edges have no session between them; all sessions are eBGP and there is no IGP.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 04_origin up                 # takes about 8 minutes
labs/labtool.sh 04_origin show ISP "show ip bgp 10.10.0.0/16"
labs/labtool.sh 04_origin apply 04_origin    # EDGE2 redistributes with 'set origin igp'
labs/labtool.sh 04_origin rollback 04_origin
```

## What you should see (captured from this lab)

**Baseline.** Same AS_PATH, same everything, but ORIGIN differs. ORIGIN is step 5, so IGP beats incomplete and EDGE1 wins
(the router-ID step is never reached):

```
ISP# show ip bgp 10.10.0.0/16
BGP Bestpath: compare-routerid
  65000
    172.16.2.2 from 172.16.2.2 (10.255.0.2)
      Origin incomplete, metric 0, localpref 100, valid, external
  65000
    172.16.1.2 from 172.16.1.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, best
```

EDGE2's own view shows where the `?` comes from: `Origin incomplete ... sourced`, from the `redistribute static` line in its BGP configuration.

**After `apply`.** EDGE2's redistribution now goes through a route-map with `set origin igp`. Both paths are `Origin IGP`, steps 1 to 9
tie, and step 10 (lowest router-ID, forced by `compare-routerid`) picks EDGE2 (10.255.0.2):

```
ISP# show ip bgp 10.10.0.0/16
  65000
    172.16.2.2 from 172.16.2.2 (10.255.0.2)
      Origin IGP, metric 0, localpref 100, valid, external, best
  65000
    172.16.1.2 from 172.16.1.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external
```

## Things to notice

* **The preference for EDGE1 was accidental.** Nobody configured a preference. It came from how each edge learned the prefix.
* **The change moved traffic to a different edge**, even though the only edit was on the edge that was losing.
* ORIGIN only decides when Weight, Local-Pref and AS_PATH length tie. Here both paths are the same length, which is why it mattered.

## Notes from building this lab

* `rollback` first removes `redistribute static route-map REDIST-STATIC` and then re-adds `redistribute static`, so the
  configuration returns exactly to the baseline (confirmed in `show running-config | section router bgp`).
* `apply` and `rollback` wait 40 seconds before they check, because eBGP sends updates at most every 30 seconds.

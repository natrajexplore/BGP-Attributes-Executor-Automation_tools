# Lab 05: MED, two links to one provider

**Use case.** An enterprise runs two data centres, each linked to a different point of presence (POP) of the *same*
provider (AS 65001). Each site wants the provider to deliver traffic for the site's own prefix over the site's own
link. MED is the tool for this: the enterprise tells its neighbor AS which of several links into it is preferred.

The shared 8-router lab cannot show this. There the two providers are different ASes, and BGP does not compare MED
between paths from different neighbor ASes. Here every path to the enterprise comes from AS 65000, so MED is compared.

```
         AS 65000 (enterprise)                      AS 65001 (provider)
   10.1.0.0/16                                                   
  +-----------+  172.16.1.0/30 eBGP           +---------+
  |  DC-EAST  |-------------------------------|  ISP-E  |
  +-----------+                               +----+----+
        | 10.0.0.0/30 (OSPF, iBGP)                 | 192.0.2.0/30 (OSPF, iBGP)
  +-----------+  172.16.2.0/30 eBGP           +----+----+
  |  DC-WEST  |-------------------------------|  ISP-W  |
  +-----------+                               +---------+
   10.2.0.0/16
```

| Router | AS | Loopback0 | Management | Links |
|---|---|---|---|---|
| DC-EAST | 65000 | 10.255.0.1 | 192.168.99.111 | e1/0 10.0.0.1/30 to DC-WEST; e1/1 172.16.1.2/30 to ISP-E |
| DC-WEST | 65000 | 10.255.0.2 | 192.168.99.112 | e1/0 10.0.0.2/30 to DC-EAST; e1/1 172.16.2.2/30 to ISP-W |
| ISP-E | 65001 | 10.255.1.1 | 192.168.99.131 | e1/0 172.16.1.1/30 to DC-EAST; e1/1 192.0.2.1/30 to ISP-W |
| ISP-W | 65001 | 10.255.1.2 | 192.168.99.132 | e1/0 172.16.2.1/30 to DC-WEST; e1/1 192.0.2.2/30 to ISP-E |

Each DC originates its own /16 (a static route to Null0 plus a `network` statement) and advertises **both** /16s to
its provider router. The routers use OSPF for loopbacks and iBGP over loopbacks with `next-hop-self`.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see
`labs/labtool.sh`):

```
labs/labtool.sh 05_med import && labs/labtool.sh 05_med start
labs/labtool.sh 05_med bootstrap          # once, takes a few minutes
labs/labtool.sh 05_med baseline
labs/labtool.sh 05_med show ISP-E "show ip bgp 10.2.0.0/16"
labs/labtool.sh 05_med apply 05_med       # DC-EAST and DC-WEST send MED 50 for their own prefix, 200 for the other
labs/labtool.sh 05_med rollback 05_med
```

## What you should see (captured from this lab)

**Baseline.** No MED is sent. ISP-E hears 10.2.0.0/16 twice: from DC-EAST (eBGP) and from ISP-W (iBGP). It picks its
own eBGP path, so traffic for the West data centre arrives on the East link:

```
ISP-E# show ip bgp 10.2.0.0/16
  65000
    10.255.1.2 (metric 11) from 10.255.1.2 (10.255.1.2)
      Origin IGP, metric 0, localpref 100, valid, internal
  65000
    172.16.1.2 from 172.16.1.2 (10.255.0.1)
      Origin IGP, localpref 100, valid, external, best
```

**After `apply`.** Each DC sends MED 50 for its own prefix and MED 200 for the other. Both paths come from AS 65000, so
BGP compares the MED (step 6) before it looks at eBGP versus iBGP (step 7). ISP-E now prefers the iBGP path via ISP-W,
so 10.2.0.0/16 is delivered over the West link:

```
ISP-E# show ip bgp 10.2.0.0/16
  65000
    10.255.1.2 (metric 11) from 10.255.1.2 (10.255.1.2)
      Origin IGP, metric 50, localpref 100, valid, internal, best
  65000
    172.16.1.2 from 172.16.1.2 (10.255.0.1)
      Origin IGP, metric 200, localpref 100, valid, external
```

ISP-E keeps using its own East link for 10.1.0.0/16 (metric 50, `external, best`). ISP-W behaves the mirror way.

## Experiments to try (suggestions, not run when this lab was tested)

1. Swap `med_local` and `med_remote` in `scenarios/05_med.yaml` and re-run. By the same rule, each prefix should now
   be delivered to the wrong site.
2. Apply the route-map on one DC router only. A path with no MED counts as 0, the best value, so predict which path
   the provider picks, then check with `show ip bgp`.

## Notes from building this lab

* Under `no bgp default ipv4-unicast`, a peer-group member must be assigned inside `address-family ipv4`
  (`neighbor 172.16.1.1 peer-group ISP`) before `neighbor ISP activate` takes effect. Without it the neighbor never
  appears in `show ip bgp summary` and the session stays down. The baselines already do this.
* The scenario template is identical for both DC routers. That works because each baseline defines a `LOCAL-DC`
  prefix-list (its own prefix) and an `ISP` peer-group.
* eBGP sends updates at most every 30 seconds, so `apply` and `rollback` wait 40 seconds before they check.

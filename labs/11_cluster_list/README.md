# Lab 11: CLUSTER_LIST, a two-tier reflector hierarchy and a cluster-ID clash

**Use case.** A network with regions is built as a hierarchy of route reflectors. RR-TOP is the top reflector. RR-EU and RR-US are its
clients, and each reflects for one leaf router: EU-1 in Europe, US-1 in the US. Every reflector has its own cluster-ID, and every
route collects the cluster-IDs it passes through in CLUSTER_LIST. A reflector that finds its own cluster-ID in a route's list
discards the route, because it has already seen it.

The lab then does what a well-meant clean-up can do: it gives RR-US the same cluster-ID as RR-TOP. Nothing looks wrong (every session
stays up), but the two reflectors now throw away each other's routes, and Europe and the US lose sight of each other.

```
                     RR-TOP  cluster-id 1.1.1.1
                    /                          \
        10.0.0.0/30                              10.0.0.4/30
                  /                                  \
   RR-EU  cluster-id 2.2.2.2               RR-US  cluster-id 3.3.3.3
            |  10.0.0.8/30                            |  10.0.0.12/30
          EU-1  10.1.1.0/24                         US-1  10.2.1.0/24
```

| Router | Loopback0 | Management | Cluster-ID | Links |
|---|---|---|---|---|
| RR-TOP | 10.255.0.1 | 192.168.99.121 | 1.1.1.1 | e1/0 10.0.0.1/30 to RR-EU; e1/1 10.0.0.5/30 to RR-US |
| RR-EU | 10.255.0.2 | 192.168.99.122 | 2.2.2.2 | e1/0 10.0.0.2/30 to RR-TOP; e1/1 10.0.0.9/30 to EU-1 |
| RR-US | 10.255.0.3 | 192.168.99.123 | 3.3.3.3 | e1/0 10.0.0.6/30 to RR-TOP; e1/1 10.0.0.13/30 to US-1 |
| EU-1 | 10.255.0.11 | 192.168.99.111 | none | e1/0 10.0.0.10/30 to RR-EU; Loopback1 10.1.1.1/24 |
| US-1 | 10.255.0.21 | 192.168.99.112 | none | e1/0 10.0.0.14/30 to RR-US; Loopback1 10.2.1.1/24 |

All routers are in AS 65000 and run OSPF and iBGP over loopbacks. RR-TOP has RR-EU and RR-US as clients; RR-EU has EU-1 as a client;
RR-US has US-1 as a client; RR-EU and RR-US treat RR-TOP as an ordinary iBGP peer.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 11_cluster_list up           # takes about 10 minutes
labs/labtool.sh 11_cluster_list show US-1 "show ip bgp 10.1.1.0/24"
labs/labtool.sh 11_cluster_list apply 11_cluster_list    # RR-US takes RR-TOP's cluster-ID
labs/labtool.sh 11_cluster_list rollback 11_cluster_list
```

## What you should see (captured from this lab)

**Baseline.** EU-1's prefix reaches US-1 after three reflections, and each reflector has added its cluster-ID to the list (the newest is
on the left). The originator is EU-1's router-ID:

```
US-1# show ip bgp 10.1.1.0/24
  Local
    10.255.0.11 (metric 41) from 10.255.0.3 (10.255.0.3)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Originator: 10.255.0.11, Cluster list: 3.3.3.3, 1.1.1.1, 2.2.2.2

RR-US# show ip bgp 10.1.1.0/24
      Originator: 10.255.0.11, Cluster list: 1.1.1.1, 2.2.2.2
```

The US prefix takes the mirror route to EU-1, with the list `2.2.2.2, 1.1.1.1, 3.3.3.3`.

**After `apply`.** RR-US now has cluster-ID 1.1.1.1. Every route RR-TOP reflects to it carries 1.1.1.1, so RR-US finds its own ID and
discards them. The routes RR-US reflects up to RR-TOP now also carry 1.1.1.1, so RR-TOP discards those. Both directions break:

```
RR-US#  show ip bgp 10.1.1.0/24     % Network not in table
US-1#   show ip bgp 10.1.1.0/24     % Network not in table
RR-TOP# show ip bgp 10.2.1.0/24     % Network not in table
EU-1#   show ip bgp 10.2.1.0/24     % Network not in table
```

## Things to notice

* **Every BGP session stays up.** Discarding a looping route is normal behaviour, so nothing is logged and no alarm fires. The only sign is
  a route that exists on one router and is missing on the next.
* **The damage is in both directions.** It is not only RR-US that loses the EU route: RR-TOP also stops accepting the US route.
* **Read the cluster list like a journey.** The leftmost cluster-ID is the last reflector, and its length is the number of reflections.
* **Cluster-IDs must be unique across the hierarchy.** Two reflectors in different tiers with the same ID reject each other's routes.
  Sharing an ID is only safe between two reflectors that serve the same clients and are not clients of each other (a general
  reflector design rule; this lab only demonstrates the unsafe case).

## Notes from building this lab

* `apply` and `rollback` wait 40 seconds before they check. The rollback check waits for the cluster list `3.3.3.3, 1.1.1.1, 2.2.2.2` to
  come back at US-1.
* The default cluster-ID is the reflector's router-ID. This lab sets it explicitly on all three reflectors so the values are easy to read.

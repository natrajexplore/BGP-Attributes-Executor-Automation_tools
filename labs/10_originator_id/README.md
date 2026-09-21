# Lab 10: ORIGINATOR_ID, following a route through a route reflector

**Use case.** One route reflector (RR) serves three clients (C1, C2, C3) in the same AS. When C1 advertises a new prefix, the reflector
copies it to C2 and C3 and stamps it with ORIGINATOR_ID, the router-ID of the router that first sent it. That stamp is how a client
recognises a route that has come back around to its own origin, and how you can tell, from any router, where a route entered the AS.

The lab has two scenarios:

* **`10_originator_id`**: C1 originates a prefix. See the attribute appear on C2, C3 and the reflector's copies, and not on C1 itself.
* **`10_duplicate_id`** (run after the first): give C3 the same router-ID as C1. C3 then finds its own router-ID as the originator of
  the reflected route and discards it, while the reflector and C2 still have it.

```
                      C1  10.255.0.11   (originates 10.255.99.1/32)
                       |  10.0.0.0/30
   C2 ---10.0.0.4/30---RR  10.255.0.1 (route reflector)---10.0.0.8/30--- C3
   10.255.0.12                                                          10.255.0.13
```

| Router | Loopback0 | Management | Link to RR |
|---|---|---|---|
| RR | 10.255.0.1 | 192.168.99.21 | e1/0 10.0.0.1/30 to C1; e1/1 10.0.0.5/30 to C2; e1/2 10.0.0.9/30 to C3 |
| C1 | 10.255.0.11 | 192.168.99.11 | e1/0 10.0.0.2/30 |
| C2 | 10.255.0.12 | 192.168.99.12 | e1/0 10.0.0.6/30 |
| C3 | 10.255.0.13 | 192.168.99.13 | e1/0 10.0.0.10/30 |

All routers are in AS 65000 and run OSPF; iBGP runs over the loopbacks, and the RR has C1, C2 and C3 as route-reflector clients.

## Run it

On the EVE VM, from `/opt/bgp-attributes-executor` (stop the shared lab and the dashboard container first, see `labs/labtool.sh`):

```
labs/labtool.sh 10_originator_id up                       # takes about 9 minutes
labs/labtool.sh 10_originator_id apply 10_originator_id   # C1 advertises 10.255.99.1/32
labs/labtool.sh 10_originator_id show C2 "show ip bgp 10.255.99.1/32"
labs/labtool.sh 10_originator_id apply 10_duplicate_id    # C3 takes C1's router-ID (takes about 95 seconds)
labs/labtool.sh 10_originator_id rollback 10_duplicate_id
labs/labtool.sh 10_originator_id rollback 10_originator_id
```

## What you should see (captured from this lab)

**After `10_originator_id`.** At the source the route is `sourced, local` and has no originator. Everywhere else it carries it:

```
C1# show ip bgp 10.255.99.1/32
  Local
    0.0.0.0 from 0.0.0.0 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, weight 32768, valid, sourced, local, best

C2# show ip bgp 10.255.99.1/32
  Local
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Originator: 10.255.0.11, Cluster list: 10.255.0.1
```

C3 shows the same. The reflector's own copy, received straight from its client C1, has no originator yet: it is added only when a route is
reflected.

**After `10_duplicate_id`.** C3's router-ID is now 10.255.0.11. C3's session to the reflector is back up (the scenario checks that),
yet C3 no longer has the route. The reflector and C2 still do:

```
C3# show ip bgp 10.255.99.1/32
% Network not in table

RR# show ip bgp 10.255.99.1/32
  Local, (Received from a RR-client)
    10.255.0.11 (metric 11) from 10.255.0.11 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, internal, best
```

C3 discards the route because the ORIGINATOR_ID in it, 10.255.0.11, is its own router-ID.

## Things to notice

* **Only the first reflector sets it.** The attribute names the router that entered the route into the AS, however many reflectors follow.
* **A duplicate router-ID fails silently.** The sessions are up and no error is logged. The route is present on the reflector and simply
  missing on one client. It is a classic symptom of a cloned configuration.
* **Changing a router-ID resets that router's BGP sessions.** That is why the scenario waits 75 seconds and checks the session before it
  looks at the route.

## Notes from building this lab

* The first version of `10_duplicate_id` passed its checks after 16 seconds, while the sessions were still resetting, so "Network not in
  table" proved nothing. The scenario now waits for the sessions and requires C3's session to be established before it checks for the
  missing route. (The runner only waits inside its soft-clear branch, so this scenario keeps `soft_clear: true`.)
* Run `10_duplicate_id` only after `10_originator_id`, and roll back in the reverse order.

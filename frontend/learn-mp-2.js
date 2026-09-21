/* Learn tab, MP-BGP section, part 2: metadata for labs 14 to 17 (appended to window.LEARN_MP; content in learn-mp-content-2.js). */
window.LEARN_MP.push(
  {
    id: "14_mpls_shared_services", name: "L3VPN: shared services", tag: "Customers reach one service, not each other", mp: true,
    scope: "Route-targets on the PE routers", dflt: "None", type: "Use case (extranet with a service VRF)",
    what: ["A shared service (DNS, a licence server, a managed firewall, an Internet gateway) sits in its own VRF. Each customer VRF imports the service's route-target and the service VRF imports each customer's, so customers and service can talk. The customers never import each other's route-targets, so they stay isolated.",
      "A route is only useful when traffic can come back. Both directions need a route-target match: the service must import the customer's RT (to answer) and the customer must import the service's RT (to ask). In the lab the service side is ready and customer B lacks the second half.",
      "The scenario adds one line, import 65000:900, to customer B's VRF: B reaches the service and still cannot see customer A."],
    mech: {
      topo: {
        h: 250, nodes: [{ id: "a", x: 90, y: 60, label: "Customer A", sub: "RT 100", kind: "ent", w: 120 }, { id: "b", x: 90, y: 190, label: "Customer B", sub: "RT 200", kind: "isp", w: 120 },
        { id: "s", x: 340, y: 125, label: "SHARED VRF", sub: "exports 900, imports 100 + 200", kind: "rr", w: 200, h: 54 }, { id: "svc", x: 590, y: 125, label: "Services", sub: "10.9.0.0/24", kind: "dc", w: 110 }],
        links: [{ a: "a", b: "s", cls: "hl", arrow: 1, label: "imports 900", dy: -6 }, { a: "b", b: "s", cls: "bk", label: "no import of 900 yet", dy: 16 }, { a: "s", b: "svc", cls: "hl" }],
        notes: [{ x: 340, y: 230, text: "A and B never import each other's RT", c: "ok" }]
      }
    },
    useTitle: "A managed service that every tenant of the provider uses",
    useText: "Providers and large enterprises put shared services (DNS, NTP, licence servers, a security service, an Internet gateway) in one VRF and give each tenant the service's route-target. Tenants remain isolated from each other because they never import each other's route-targets, and onboarding a new tenant is one import line on that tenant's VRF.",
    use: {
      topo: {
        h: 250, nodes: [{ id: "t1", x: 80, y: 55, label: "Tenant 1", kind: "ent", w: 100 }, { id: "t2", x: 80, y: 125, label: "Tenant 2", kind: "ent", w: 100 }, { id: "t3", x: 80, y: 195, label: "Tenant 3", kind: "ent", w: 100 },
        { id: "core", x: 340, y: 125, label: "MPLS core", sub: "RT design", kind: "rr", w: 130 }, { id: "svc", x: 590, y: 125, label: "Shared services", sub: "DNS / NTP / gateway", kind: "dc", w: 160 }],
        links: [{ a: "t1", b: "core" }, { a: "t2", b: "core" }, { a: "t3", b: "core" }, { a: "core", b: "svc", cls: "hl" }],
        notes: [{ x: 340, y: 235, text: "Tenants reach the service, never each other", c: "ok" }]
      }
    },
    config: `! PE1: customer B onboards to the shared service
ip vrf CUST-B
 rd 65000:200
 route-target export 65000:200
 route-target import 65000:200
 route-target import 65000:900        ! the line the scenario adds

! PE2: the service VRF (ready before the customers)
ip vrf SHARED
 rd 65000:900
 route-target export 65000:900
 route-target import 65000:100        ! customer A
 route-target import 65000:200        ! customer B`,
    verify: ["show ip route vrf CUST-B 10.9.0.0   ! present only after the import", "show ip route vrf SHARED   ! the service VRF holds every tenant's network", "show ip vrf detail CUST-B   ! read the RT lists", "show ip route 10.2.0.0   ! on customer A's router: must stay '% Subnet not in table'"],
    pitfalls: ["Half an extranet is a support call: the service can answer but the customer cannot ask. Always check both directions after an RT change.",
      "The service VRF is a meeting point, not a bridge. Do not give it an export RT that a customer imports unless you want that customer to learn everything the service VRF exports.",
      "Overlapping tenant addresses cannot both be imported into the service VRF: two tenants with the same prefix collide there, so the shared service needs tenants with unique addresses (or NAT)."]
  },
  {
    id: "15_mpls_hub_spoke", name: "L3VPN: hub and spoke", tag: "Route-targets decide the topology", mp: true,
    scope: "Route-targets on the PE routers", dflt: "None", type: "Use case (hub and spoke through a firewall)",
    what: ["An L3VPN topology is decided by route-targets, not by cabling. Full mesh: every VRF imports what every VRF exports. Hub and spoke: spokes import only the hub's RT, and the hub imports the spokes' RT.",
      "The hub PE uses two VRFs: HUB-IN imports the spokes' routes and passes them to the firewall, HUB-OUT exports the firewall's routes back to the spokes. The firewall sends a summary (10.0.0.0/8) so every spoke's traffic to another spoke follows the summary to the hub.",
      "The scenario makes one spoke import the spokes' RT. That spoke then learns the other spoke's more specific route directly, and its traffic bypasses the firewall."],
    mech: {
      topo: {
        h: 250, nodes: [{ id: "s1", x: 80, y: 55, label: "Spoke 1", sub: "export 1001", kind: "ent", w: 110 }, { id: "s2", x: 80, y: 195, label: "Spoke 2", sub: "export 1001", kind: "ent", w: 110 },
        { id: "in", x: 320, y: 55, label: "HUB-IN", sub: "imports 1001", kind: "rr", w: 110 }, { id: "fw", x: 470, y: 125, label: "Firewall", sub: "10.0.0.0/8", kind: "dc", w: 110 }, { id: "out", x: 320, y: 195, label: "HUB-OUT", sub: "exports 1000", kind: "rr", w: 110 }],
        links: [{ a: "s1", b: "in", cls: "hl", arrow: 1, label: "RT 1001", dy: -10 }, { a: "in", b: "fw", cls: "hl", arrow: 1 }, { a: "fw", b: "out", cls: "hl", arrow: 1 }, { a: "out", b: "s2", cls: "hl", arrow: 1, label: "RT 1000", dy: 16 }],
        notes: [{ x: 560, y: 235, text: "Spokes import only 1000", c: "warn" }]
      }
    },
    useTitle: "All branch traffic inspected at head office",
    useText: "A retailer or a bank forces every branch-to-branch flow through a central firewall for inspection. The RT design makes that structural: spokes have no route to each other, only to the hub's summary. It also means an added import on a spoke removes the inspection, so RT changes on the spoke VRFs are security changes.",
    use: {
      topo: {
        h: 250, nodes: [{ id: "b1", x: 70, y: 55, label: "Branch 1", kind: "ent", w: 100 }, { id: "b2", x: 70, y: 125, label: "Branch 2", kind: "ent", w: 100 }, { id: "b3", x: 70, y: 195, label: "Branch 3", kind: "ent", w: 100 },
        { id: "core", x: 330, y: 125, label: "MPLS core", kind: "rr", w: 120 }, { id: "hq", x: 580, y: 125, label: "HQ firewall", sub: "inspects all", kind: "dc", w: 130 }],
        links: [{ a: "b1", b: "core", cls: "hl" }, { a: "b2", b: "core", cls: "hl" }, { a: "b3", b: "core", cls: "hl" }, { a: "core", b: "hq", cls: "hl", label: "everything", dy: -10 }],
        notes: [{ x: 330, y: 235, text: "No branch-to-branch route in the core", c: "ok" }]
      }
    },
    config: `! spoke PE (both spokes look the same)
ip vrf SPOKE
 rd 65000:11
 route-target export 65000:1001       ! spoke routes go to the hub
 route-target import 65000:1000       ! only the hub's routes come back

! hub PE: two VRFs
ip vrf HUB-IN
 rd 65000:21
 route-target import 65000:1001       ! receive every spoke route
ip vrf HUB-OUT
 rd 65000:22
 route-target export 65000:1000       ! send the firewall's routes to the spokes`,
    verify: ["show ip route 10.1.0.0   ! on a spoke: '10.0.0.0/8' through the hub, not '10.1.0.0/24'", "show ip route vrf HUB-OUT   ! the summary and the hub's own network", "show ip route vrf SPOKE 10.1.0.0   ! on the other spoke's PE", "show ip vrf detail SPOKE   ! read the import list"],
    pitfalls: ["The hub needs a summary or default that the spokes import: without it the spokes have no route to each other at all, not even through the hub.",
      "One VRF with the same session both ways trips loop prevention on the PE because the provider's own AS is in the path. Use two VRFs (or allowas-in, which weakens the loop check).",
      "A single extra import on one spoke removes the firewall from that spoke's traffic and changes nothing else. Watch the RT lists, not only the sessions."]
  },
  {
    id: "16_mpls_vpnv4_rr", name: "L3VPN: VPNv4 route reflector", tag: "Scale the PE mesh with one reflector", mp: true,
    scope: "iBGP between the PE routers", dflt: "Full mesh of PEs", type: "Use case (route reflector for address-family vpnv4)",
    what: ["A full iBGP mesh of N PEs needs N(N-1)/2 sessions. A VPNv4 route reflector (RR) replaces it: every PE peers with the RR only, and the RR reflects the routes to the other PEs. A new PE needs one session.",
      "The RR normally has no VRFs. It only reflects, so it must keep VPNv4 routes that none of its own VRFs import, and it does not change the next hop: the traffic still goes PE to PE across the core, not through the RR.",
      "The reflector rules matter: a route from a client is reflected to all peers, a route from a non-client only to clients. The scenario removes client status from two PEs and they stop hearing each other, with every session still up."],
    mech: {
      topo: {
        h: 250, nodes: [{ id: "rr", x: 340, y: 125, label: "Route reflector", sub: "no VRFs", kind: "rr", w: 150 }, { id: "p1", x: 90, y: 50, label: "PE1", kind: "ent", w: 80 }, { id: "p2", x: 90, y: 200, label: "PE2", kind: "ent", w: 80 },
        { id: "p3", x: 590, y: 50, label: "PE3", kind: "ent", w: 80 }, { id: "p4", x: 590, y: 200, label: "PE4", kind: "ent", w: 80 }],
        links: [{ a: "p1", b: "rr", cls: "hl" }, { a: "p2", b: "rr", cls: "hl" }, { a: "p3", b: "rr", cls: "hl" }, { a: "p4", b: "rr", cls: "hl" }],
        notes: [{ x: 340, y: 40, text: "4 sessions instead of 6 (40 PEs: 40 instead of 780)", c: "ok" }, { x: 340, y: 230, text: "Next hop is unchanged: traffic goes PE to PE", c: "a" }]
      }
    },
    useTitle: "A provider core that keeps growing",
    useText: "A provider adds PEs every month. With a route reflector (usually two, for redundancy) each new PE needs one or two sessions and the existing PEs do not change. The reflector sits in the core, has no customers, and carries the VPNv4 table for all of them.",
    use: {
      topo: {
        h: 250, nodes: [{ id: "rr1", x: 250, y: 60, label: "RR 1", kind: "rr", w: 90 }, { id: "rr2", x: 430, y: 60, label: "RR 2", kind: "rr", w: 90 },
        { id: "a", x: 90, y: 190, label: "PE", kind: "ent", w: 70 }, { id: "b", x: 230, y: 190, label: "PE", kind: "ent", w: 70 }, { id: "c", x: 370, y: 190, label: "PE", kind: "ent", w: 70 }, { id: "d", x: 510, y: 190, label: "PE", kind: "ent", w: 70 }, { id: "e", x: 630, y: 190, label: "new PE", kind: "dc", w: 80 }],
        links: [{ a: "a", b: "rr1" }, { a: "b", b: "rr1" }, { a: "c", b: "rr2" }, { a: "d", b: "rr2" }, { a: "e", b: "rr1", cls: "hl" }, { a: "e", b: "rr2", cls: "hl" }],
        notes: [{ x: 340, y: 130, text: "Adding a PE = two sessions, nothing else changes", c: "ok" }]
      }
    },
    config: `! the reflector
router bgp 65000
 no bgp default ipv4-unicast
 no bgp default route-target filter        ! common on reflectors, see the lab notes
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 send-community extended
  neighbor 10.255.0.1 route-reflector-client   ! the line the scenario removes

! a PE: one neighbor, the reflector
router bgp 65000
 neighbor 10.255.0.10 remote-as 65000
 address-family vpnv4
  neighbor 10.255.0.10 activate`,
    verify: ["show bgp vpnv4 unicast all summary   ! one line per client, and the prefix count of each", "show bgp vpnv4 unicast all 10.4.0.0/24   ! '(Received from a RR-client)', 'no table' on a VRF-less reflector", "show ip route vrf CUST 10.4.0.0   ! on a PE: 'from <reflector>' with the ORIGINATING PE as next hop", "show bgp vpnv4 unicast all neighbors 10.255.0.1 advertised-routes   ! what the reflector sends to this PE"],
    pitfalls: ["Two PEs that are both non-clients never hear each other through the reflector. Every session is up and the reflector holds both routes. Check the client status after any change.",
      "A reflector does not change the next hop. The PE next hops must be reachable and labelled in the core, or the route is in BGP but traffic is dropped.",
      "Use a second reflector, with a different cluster-id policy chosen on purpose (lab 11), so a reflector failure does not stop every VPN."]
  },
  {
    id: "17_mpls_as_override", name: "L3VPN: same customer AS at both sites", tag: "as-override or allowas-in", mp: true,
    scope: "The PE-CE eBGP session", dflt: "A path containing your own AS is discarded", type: "Use case (AS_PATH loop prevention over an L3VPN)",
    what: ["A customer that uses one BGP AS at both of its sites finds that neither site learns the other's routes. The route arrives with AS_PATH 65000 65100, and the far CE sees its own AS (65100) in the path and drops it as a loop, although every provider check is green.",
      "Fix 1, on the PE: as-override replaces the customer's AS in the path with the provider's own AS when the PE sends a route to that CE, so the CE sees 65000 65000 and accepts it.",
      "Fix 2, on the CE: allowas-in tells the CE to accept its own AS in a path. The provider changes nothing. The lab runs each fix on its own, and rollback restores the broken baseline."],
    mech: {
      topo: {
        h: 250, nodes: [{ id: "c1", x: 70, y: 100, label: "CE1", sub: "AS 65100", kind: "dc", w: 96 }, { id: "p1", x: 210, y: 100, label: "PE1", sub: "AS 65000", kind: "ent", w: 96 },
        { id: "p2", x: 470, y: 100, label: "PE2", sub: "AS 65000", kind: "ent", w: 96 }, { id: "c2", x: 610, y: 100, label: "CE2", sub: "AS 65100", kind: "bad", w: 96 }],
        links: [{ a: "c1", b: "p1" }, { a: "p1", b: "p2", cls: "hl", arrow: 1, label: "VPNv4 core", dy: -12 }, { a: "p2", b: "c2", cls: "bad", arrow: 1 }],
        notes: [{ x: 340, y: 40, text: "CE2 sees its own AS 65100 in the path", c: "bad" }, { x: 340, y: 175, text: "as-override on PE2: path becomes 65000 65000", c: "ok" }, { x: 340, y: 215, text: "or allowas-in on CE2: accept 65000 65100", c: "a" }]
      }
    },
    useTitle: "A customer with one AS number and many sites",
    useText: "Most customers get one private AS (or use one public one) and run it at every site. Providers therefore configure as-override on the PE-CE session of such customers as a standard option, and the customer does nothing. Where the provider will not, the customer uses allowas-in on each CE.",
    use: {
      topo: {
        h: 250, nodes: [{ id: "s1", x: 90, y: 55, label: "Site 1", sub: "AS 65100", kind: "dc", w: 100 }, { id: "s2", x: 90, y: 125, label: "Site 2", sub: "AS 65100", kind: "dc", w: 100 }, { id: "s3", x: 90, y: 195, label: "Site 3", sub: "AS 65100", kind: "dc", w: 100 },
        { id: "core", x: 420, y: 125, label: "Provider MPLS VPN", sub: "as-override on every PE-CE", kind: "isp", w: 250 }],
        links: [{ a: "s1", b: "core", cls: "hl" }, { a: "s2", b: "core", cls: "hl" }, { a: "s3", b: "core", cls: "hl" }],
        notes: [{ x: 420, y: 215, text: "One AS at every site, no changes on the CEs", c: "ok" }]
      }
    },
    config: `! fix 1: on each PE, inside the customer's VRF
router bgp 65000
 address-family ipv4 vrf CUST
  neighbor 172.16.0.2 as-override

! fix 2: on each CE (the provider changes nothing)
router bgp 65100
 address-family ipv4
  neighbor 172.16.0.1 allowas-in`,
    verify: ["show ip route 10.1.1.0   ! on the far CE: '% Subnet not in table' until a fix is applied", "show ip bgp 10.1.1.0/24   ! as-override: '65000 65000'; allowas-in: '65000 65100'", "show ip route vrf CUST 10.1.1.0   ! on the PE: the VPNv4 route is there in every state", "show bgp vpnv4 unicast all neighbors 172.16.0.2 advertised-routes   ! what the PE sends to the CE"],
    pitfalls: ["The provider's VPN looks perfect while the customer's sites cannot reach each other: check the far CE, not only the PEs. A denied route is not even in 'show ip bgp' without soft-reconfiguration inbound.",
      "as-override hides the customer's own AS from the AS_PATH, so the customer loses that path information. allowas-in weakens the customer's loop protection. Choose deliberately, and use only one of them.",
      "Do not use the same AS number at two sites unless the provider agrees to as-override or the customer can run allowas-in: otherwise the fault is invisible from the provider's side."]
  }
);

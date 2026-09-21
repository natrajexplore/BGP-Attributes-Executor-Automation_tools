/* Learn tab, MP-BGP / MPLS VPN section: page metadata (learn.js draws the diagrams from the descriptors below).
   The level content (foundations / practitioner / pro) is in learn-mp-content.js. Pages whose id is a lab folder name
   (12_..., 13_...) get the lab section from learn-labs.js. Router output quoted in the content was captured from those labs. */
window.LEARN_MP = [
  {
    id: "mp_families", name: "MP-BGP address families", tag: "One session, many kinds of routes", mp: true,
    scope: "One BGP session", dflt: "IPv4 unicast (unless 'no bgp default ipv4-unicast')", type: "Capability (RFC 4760) + path attributes MP_REACH_NLRI / MP_UNREACH_NLRI",
    what: ["Classic BGP carries only IPv4 unicast prefixes. Multiprotocol BGP (MP-BGP) lets the same session carry other kinds of routes as well, each in its own address family.",
      "An address family is named by two numbers: AFI (what kind of address, 1 = IPv4) and SAFI (what the route is for: 1 = unicast, 128 = MPLS-labelled VPN). VPNv4 is AFI 1 / SAFI 128.",
      "The two routers agree on the families in the OPEN message, and you switch each family on per neighbor with 'neighbor x activate' inside the address-family block."],
    mech: {
      topo: {
        h: 200, nodes: [{ id: "a", x: 130, y: 36, label: "PE1", sub: "10.255.0.1 · AS 65000", kind: "ent" }, { id: "b", x: 550, y: 36, label: "PE2", sub: "10.255.0.3 · AS 65000", kind: "ent" }],
        links: [{ a: "a", b: "b", cls: "hl", label: "ONE TCP session (loopback to loopback)", dy: -12 }],
        notes: [{ x: 340, y: 100, text: "AFI 1 / SAFI 1: IPv4 unicast (the Internet table)", c: "a" }, { x: 340, y: 132, text: "AFI 1 / SAFI 128: VPNv4 (customer routes with RD + label)", c: "ok" }, { x: 340, y: 164, text: "each family is activated separately per neighbor", c: "warn" }]
      }
    },
    useTitle: "One pair of routers, a public table and a customer VPN table",
    useText: "A provider edge (PE) router holds the Internet routes in the normal IPv4 unicast family and the customers' private routes in VPNv4. Both travel over the same iBGP session between the PE loopbacks, so there is no second protocol to run. The families do not mix: a VPNv4 route never enters the Internet table.",
    use: {
      topo: {
        h: 250, nodes: [{ id: "net", x: 90, y: 60, label: "Internet routes", sub: "IPv4 unicast", kind: "net", w: 130 }, { id: "cust", x: 90, y: 190, label: "Customer VPN routes", sub: "VPNv4", kind: "dc", w: 150 },
        { id: "pe1", x: 340, y: 125, label: "PE1", sub: "MP-BGP speaker", kind: "ent" }, { id: "pe2", x: 590, y: 125, label: "PE2", sub: "MP-BGP speaker", kind: "ent" }],
        links: [{ a: "net", b: "pe1", cls: "bk", label: "global table", dy: -6 }, { a: "cust", b: "pe1", cls: "hl", label: "VRF", dy: 14 }, { a: "pe1", b: "pe2", cls: "hl", label: "iBGP: 2 families", dy: -12 }],
        notes: [{ x: 340, y: 225, text: "Same session, separate route tables", c: "ok" }]
      }
    },
    config: `router bgp 65000
 no bgp default ipv4-unicast          ! nothing is enabled until you activate it
 neighbor 10.255.0.3 remote-as 65000
 neighbor 10.255.0.3 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.3 activate        ! the Internet table (optional on a VPN-only PE)
 exit-address-family
 address-family vpnv4
  neighbor 10.255.0.3 activate
  neighbor 10.255.0.3 send-community extended   ! route-targets are extended communities
 exit-address-family`,
    verify: ["show bgp all summary            ! one block per address family", "show bgp vpnv4 unicast all summary", "show bgp neighbors 10.255.0.3 | include address family|Address family", "show bgp vpnv4 unicast all 10.2.1.0/24   ! the MP_REACH data: RD, next hop, label, RT"],
    pitfalls: ["A family that is not activated for a neighbor carries nothing, and the session still shows Established. Always check the prefix count for each family, not only the session state.",
      "Extended communities are not sent unless configured (IOS normally adds 'send-community extended' when you activate VPNv4, but check). Without them the route-targets are lost and no VRF imports the route.",
      "Under 'no bgp default ipv4-unicast', a neighbor is activated only inside the address-family block, so a neighbor line at the top level does nothing by itself."]
  },
  {
    id: "mp_vpn", name: "VRF, RD, RT and labels", tag: "How one core carries many private networks", mp: true,
    scope: "PE routers (VRF, RD, RT) and the whole core (labels)", dflt: "No VRFs; nothing is exported or imported", type: "VRF + extended community (RT) + MPLS labels",
    what: ["A VRF is a separate routing table on a PE router, one per customer. The customer's interface is placed in the VRF, so the customer's routes never mix with anyone else's.",
      "The route distinguisher (RD) is stuck on the front of the prefix, so two customers can use the same address (65000:100:10.1.0.0/24 and 65000:200:10.1.0.0/24 are different VPNv4 routes). The RD only makes the route unique. It does not decide who receives it.",
      "The route-target (RT) does that: a VRF exports its routes tagged with RTs and imports the routes that carry the RTs it lists. Two MPLS labels carry the traffic: the outer transport label gets it across the core, the inner VPN label picks the VRF at the far PE."],
    mech: {
      topo: {
        w: 680, h: 215, nodes: [{ id: "ce1", x: 58, y: 100, label: "CE1", sub: "10.1.1.0/24", kind: "dc", w: 92 }, { id: "pe1", x: 208, y: 100, label: "PE1", sub: "VRF CUST", kind: "ent", w: 96 },
        { id: "p", x: 350, y: 100, label: "P", sub: "no VRFs", kind: "rr", w: 84 }, { id: "pe2", x: 492, y: 100, label: "PE2", sub: "VRF CUST", kind: "ent", w: 96 }, { id: "ce2", x: 626, y: 100, label: "CE2", sub: "10.2.1.0/24", kind: "dc", w: 92 }],
        links: [{ a: "ce1", b: "pe1" }, { a: "pe1", b: "p", cls: "hl", arrow: 1, label: "17 | 19", dy: -34 }, { a: "p", b: "pe2", cls: "hl", arrow: 1, label: "19", dy: -34 }, { a: "pe2", b: "ce2" }],
        notes: [{ x: 208, y: 26, text: "RD 65000:1 + RT 65000:1", c: "a" }, { x: 340, y: 160, text: "17 = transport label (LDP), 19 = VPN label of the route; P removes 17", c: "ok" }, { x: 340, y: 192, text: "P only reads the outer label, it has no customer routes", c: "warn" }]
      }
    },
    useTitle: "Two customers with the same 10.1.0.0/24 on one provider core",
    useText: "The provider gives each customer its own VRF with its own RD and RT. The core routers carry only the two PE loopbacks, so adding a customer touches only the PE routers. Lab 13 builds exactly this and then breaks the isolation with one extra route-target.",
    use: {
      topo: {
        h: 270, nodes: [{ id: "a1", x: 70, y: 60, label: "A site 1", sub: "10.1.0.0/24", kind: "dc", w: 100 }, { id: "b1", x: 70, y: 200, label: "B site 1", sub: "10.1.0.0/24", kind: "bad", w: 100 },
        { id: "pe1", x: 250, y: 130, label: "PE1", sub: "VRF A + VRF B", kind: "ent", w: 120 }, { id: "pe2", x: 450, y: 130, label: "PE2", sub: "VRF A + VRF B", kind: "ent", w: 120 },
        { id: "a2", x: 620, y: 60, label: "A site 2", sub: "10.2.0.0/24", kind: "dc", w: 100 }, { id: "b2", x: 620, y: 200, label: "B site 2", sub: "10.3.0.0/24", kind: "bad", w: 100 }],
        links: [{ a: "a1", b: "pe1" }, { a: "b1", b: "pe1" }, { a: "pe1", b: "pe2", cls: "hl", label: "core", dy: -12 }, { a: "pe2", b: "a2" }, { a: "pe2", b: "b2" }],
        notes: [{ x: 350, y: 30, text: "A: RD/RT 65000:100", c: "a" }, { x: 350, y: 235, text: "B: RD/RT 65000:200", c: "warn" }]
      }
    },
    config: `ip vrf CUST-A
 rd 65000:100                          ! makes the VPNv4 prefix unique
 route-target export 65000:100         ! tag my routes with this
 route-target import 65000:100         ! accept routes that carry this
!
interface Ethernet1/1
 ip vrf forwarding CUST-A              ! before the address, or IOS removes the address
 ip address 172.16.1.1 255.255.255.252
!
mpls ldp router-id Loopback0 force
interface Ethernet1/0
 mpls ip                               ! labels for the core links`,
    verify: ["show ip vrf detail CUST-A", "show ip route vrf CUST-A", "show bgp vpnv4 unicast all 10.1.0.0/24   ! RD, RT and 'mpls labels in/out'", "show mpls ldp neighbor", "show mpls forwarding-table", "show ip cef vrf CUST-A 10.2.0.0 detail   ! the label stack the PE pushes"],
    pitfalls: ["Putting 'ip vrf forwarding' on an interface after the address removes the address. Set the VRF first, then the address.",
      "The RT lists of the VRFs are the security boundary of the whole service. One extra export or import moves a customer into another customer's VPN, and nothing flaps or logs.",
      "Reusing one RD for two customers merges their prefixes into a single VPNv4 route when they overlap, so give every VRF (or every customer) its own RD.",
      "The next hop of a VPNv4 route must be a labelled path in the core: without LDP (or another label distribution) on every core link the VPN route is in BGP but traffic is dropped."]
  },
  {
    id: "12_mpls_l3vpn", name: "L3VPN: one customer, two sites", tag: "The carrier WAN every enterprise buys", mp: true,
    scope: "Provider edge routers", dflt: "None", type: "Use case (address-family vpnv4 + VRF + LDP)",
    what: ["A provider connects an enterprise's head office and branch over its MPLS core. The enterprise runs plain eBGP (or static routes) to the provider edge and sees a normal routed network.",
      "The provider runs OSPF and LDP in the core, an iBGP VPNv4 session between the two PE routers, and one VRF per customer. The P router in the middle holds no customer routes at all.",
      "This page walks through the lab and its scenario: a mistyped import route-target that breaks one direction of the VPN while every session stays up."],
    mech: {
      topo: {
        h: 250, nodes: [{ id: "ce1", x: 60, y: 125, label: "CE1", sub: "AS 65101", kind: "dc", w: 90 }, { id: "pe1", x: 205, y: 125, label: "PE1", sub: "AS 65000", kind: "ent", w: 96 }, { id: "p", x: 340, y: 125, label: "P", sub: "OSPF + LDP", kind: "rr", w: 90 },
        { id: "pe2", x: 475, y: 125, label: "PE2", sub: "AS 65000", kind: "ent", w: 96 }, { id: "ce2", x: 620, y: 125, label: "CE2", sub: "AS 65102", kind: "dc", w: 90 }],
        links: [{ a: "ce1", b: "pe1", label: "eBGP", dy: -10 }, { a: "pe1", b: "p" }, { a: "p", b: "pe2" }, { a: "pe2", b: "ce2", label: "eBGP", dy: -10 }],
        notes: [{ x: 340, y: 45, text: "PE1 <-> PE2: iBGP address-family vpnv4", c: "ok" }, { x: 340, y: 215, text: "VRF CUST: RD 65000:1, RT 65000:1 on both PEs", c: "a" }]
      }
    },
    useTitle: "Head office and branch over a carrier MPLS VPN",
    useText: "The enterprise does not run MPLS. It runs eBGP (a different private AS at each site) to the carrier's PE and receives the other site's prefixes. The carrier can add a third site by configuring only the new PE. Because the enterprise sees ordinary BGP, all the policy tools in the attribute pages (Local-Pref, AS_PATH prepend, communities) work on the CE side.",
    use: {
      topo: {
        h: 250, nodes: [{ id: "hq", x: 90, y: 125, label: "Head office", sub: "10.1.1.0/24", kind: "dc", w: 120 }, { id: "car", x: 340, y: 125, label: "Carrier MPLS core", sub: "AS 65000", kind: "isp", w: 190 }, { id: "br", x: 590, y: 125, label: "Branch", sub: "10.2.1.0/24", kind: "dc", w: 120 }],
        links: [{ a: "hq", b: "car", cls: "hl", label: "eBGP", dy: -10 }, { a: "car", b: "br", cls: "hl", label: "eBGP", dy: -10 }],
        notes: [{ x: 340, y: 60, text: "Customer sees AS path: 65000 65102", c: "a" }, { x: 340, y: 200, text: "Site-to-site traffic never touches the Internet table", c: "ok" }]
      }
    },
    config: `! PE2 (PE1 mirrors it)
ip vrf CUST
 rd 65000:1
 route-target both 65000:1
interface Ethernet1/1
 ip vrf forwarding CUST
 ip address 172.16.2.1 255.255.255.252
router bgp 65000
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 send-community extended
 address-family ipv4 vrf CUST
  neighbor 172.16.2.2 remote-as 65102
  neighbor 172.16.2.2 activate`,
    verify: ["show mpls ldp neighbor", "show bgp vpnv4 unicast all summary", "show ip route vrf CUST", "show ip cef vrf CUST 10.2.1.0 detail   ! two labels: VPN + transport", "ping vrf CUST 10.2.1.1 source Loopback1   ! from a PE, or ping from the CE"],
    pitfalls: ["When the customer uses the same AS at both sites, the customer's own AS in the path makes the far CE drop the route. That is lab 17's topic (as-override / allowas-in).",
      "A VPN can be dead in one direction only. Check the routes on both PEs, not just the one where the ticket came from.",
      "A wrong import RT looks like a missing route, not an error: the BGP session is up and the sending PE shows the prefix as advertised."]
  },
  {
    id: "13_mpls_overlap", name: "L3VPN: overlapping addresses", tag: "Two customers, the same 10.1.0.0/24", mp: true,
    scope: "Provider edge routers", dflt: "None", type: "Use case (RD uniqueness, RT isolation, RT leak)",
    what: ["Two customers use the same private prefix. The provider keeps them apart with a different RD per customer (unique VPNv4 routes), a different RT per customer (a customer's routes only go into its own VRFs) and a different VPN label per route.",
      "The scenario adds one export route-target: customer A's tag on customer B's VRF at PE2. B's second-site prefix then appears in A's VRF and A's router learns it.",
      "This is the most common L3VPN security incident: a one-line route-target change, no flap, no log message."],
    mech: {
      topo: {
        h: 270, nodes: [{ id: "a1", x: 70, y: 60, label: "CE-A1", sub: "10.1.0.0/24", kind: "dc", w: 96 }, { id: "b1", x: 70, y: 210, label: "CE-B1", sub: "10.1.0.0/24", kind: "bad", w: 96 },
        { id: "pe1", x: 250, y: 135, label: "PE1", sub: "VRF A, VRF B", kind: "ent", w: 116 }, { id: "pe2", x: 450, y: 135, label: "PE2", sub: "VRF A, VRF B", kind: "ent", w: 116 },
        { id: "a2", x: 620, y: 60, label: "CE-A2", sub: "10.2.0.0/24", kind: "dc", w: 96 }, { id: "b2", x: 620, y: 210, label: "CE-B2", sub: "10.3.0.0/24", kind: "bad", w: 96 }],
        links: [{ a: "a1", b: "pe1" }, { a: "b1", b: "pe1" }, { a: "pe1", b: "pe2", cls: "hl", label: "core", dy: -12 }, { a: "pe2", b: "a2" }, { a: "pe2", b: "b2" }, { a: "b2", b: "a2", cls: "bad", arrow: 1, label: "leak", dx: 38, dy: 4 }],
        notes: [{ x: 350, y: 30, text: "A: RD/RT 65000:100", c: "a" }, { x: 350, y: 250, text: "B: RD/RT 65000:200 (+ 65000:100 = leak)", c: "bad" }]
      }
    },
    useTitle: "A shared provider, or an enterprise after an acquisition",
    useText: "Provider case: hundreds of customers all use 10.0.0.0/8 and must never see each other. Enterprise case: after an acquisition both companies use overlapping 10.x space, and an internal MPLS VPN carries both until one is renumbered. In both cases the design rule is one RD and one RT per tenant, and any exception (a shared service, a merger) is a deliberate, reviewed RT import.",
    use: {
      topo: {
        h: 250, nodes: [{ id: "ta", x: 110, y: 70, label: "Company A", sub: "10.0.0.0/8", kind: "ent", w: 130 }, { id: "tb", x: 110, y: 180, label: "Company B (acquired)", sub: "10.0.0.0/8", kind: "isp", w: 170 },
        { id: "core", x: 380, y: 125, label: "Internal MPLS core", sub: "VRF A + VRF B", kind: "rr", w: 170 }, { id: "dc", x: 610, y: 125, label: "Data centre", sub: "2 VRFs", kind: "dc", w: 110 }],
        links: [{ a: "ta", b: "core", cls: "hl" }, { a: "tb", b: "core", cls: "hl" }, { a: "core", b: "dc", cls: "hl" }],
        notes: [{ x: 380, y: 215, text: "Same addresses, isolated, until renumbered", c: "ok" }]
      }
    },
    config: `! PE2: the leak this lab introduces (do NOT do this by accident)
ip vrf CUST-B
 rd 65000:200
 route-target both 65000:200
 route-target export 65000:100        ! customer A's tag on customer B's routes

! the safe design: one RD and one RT per tenant
ip vrf CUST-A
 rd 65000:100
 route-target both 65000:100`,
    verify: ["show bgp vpnv4 unicast all 10.1.0.0/24   ! two routes: RD 65000:100 and 65000:200", "show ip vrf detail CUST-B   ! read the export list", "show ip route vrf CUST-A 10.3.0.0   ! '% Subnet not in table' when isolated", "show bgp vpnv4 unicast rd 65000:200 10.3.0.0/24   ! which RTs the route carries"],
    pitfalls: ["Isolation is decided only by the RT lists. Audit them (a script that prints every VRF's import and export list) and review any change like a firewall rule.",
      "The same RD on two customers' VRFs is legal, but their overlapping prefixes then collide as one VPNv4 route. Use a unique RD per VRF.",
      "A leak of a non-overlapping prefix stays quiet. A leak of an overlapping prefix makes the VRF hold two paths for one prefix, and best-path selection picks one, so some traffic may go to the wrong customer."]
  },
];

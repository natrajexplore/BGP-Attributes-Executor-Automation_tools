/* Learn content for MP-BGP labs 14 to 17 (same format as learn-mp-content.js). Guided exercises quote the output captured from each lab
   (IOS 15.2, c7200); they do not run from the page. */
Object.assign(window.LEARN_CONTENT, {

  /* ================================================================ M5 lab 14 shared services */
  "14_mpls_shared_services": {
    foundations: {
      theory: [
        "An extranet is a VPN whose members come from different customers. The usual case is a shared service: DNS, a licence server, a managed security service, an Internet gateway. Every customer must reach it, and the customers must not reach each other.",
        "You build it with route-targets only. The service lives in its own VRF (SHARED). It exports its own route-target (65000:900). The customers import 900 to learn the service network. For the service to answer, the SHARED VRF must also import each customer's route-target (100 and 200), which is how it learns the customer networks. The customers never import each other's route-targets, so they stay apart.",
        "Both directions matter. A customer that imports the service's RT has a route to the service, but the packets can only come back if the service has a route to the customer. A customer whose VRF does not import the service RT has the reverse problem, and that is the state of customer B in the lab: the service knows B, but B cannot ask. The scenario adds the missing import on B's VRF."
      ],
      example: {
        title: "A one-way extranet, from lab 14",
        text: "In the baseline the service VRF (PE2) holds both customers' networks and its own. Customer A's VRF holds the service network. Customer B's VRF holds only B's own network: nothing imports 900 there.",
        output: `PE2# show ip route vrf SHARED
B        10.1.0.0 [200/0] via 10.255.0.1, 00:00:23
B        10.2.0.0 [200/0] via 10.255.0.1, 00:00:23
B        10.9.0.0 [20/0] via 172.16.3.2, 00:00:23

PE1# show ip route vrf CUST-A
B        10.1.0.0 [20/0] via 172.16.1.2, 00:01:10
B        10.9.0.0 [200/0] via 10.255.0.3, 00:00:28

PE1# show ip route vrf CUST-B
B        10.2.0.0 [20/0] via 172.16.2.2, 00:01:14`
      },
      basicConfig: `ip vrf SHARED
 rd 65000:900
 route-target export 65000:900
 route-target import 65000:100
 route-target import 65000:200
ip vrf CUST-A
 rd 65000:100
 route-target export 65000:100
 route-target import 65000:100
 route-target import 65000:900`,
      quiz: [
        { q: "What makes a shared service reachable from a customer VRF?", options: ["The customer VRF imports the service's route-target", "The customer's AS number", "A static route on the CE", "Using the same RD in both VRFs"], answer: 0, why: "A VRF learns routes that carry a route-target in its import list. The service's routes carry 65000:900, so the customer must import 900." },
        { q: "Customer B's VRF does not import 900, but the service VRF imports B's RT. What is the result?", options: ["The service can reach B, but B cannot reach the service", "B and the service reach each other", "B reaches customer A", "The session to the service goes down"], answer: 0, why: "Each direction needs its own route-target match. The service has a route to B (it imports 200) but B has no route to the service." },
        { q: "Why do the two customers stay isolated from each other?", options: ["Neither imports the other's route-target", "The service VRF filters them", "Their RDs are different", "MPLS labels are encrypted"], answer: 0, why: "Isolation comes from the RT lists. The RD only makes the routes unique." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Build the service VRF first, then onboard tenants", text: "Configure the service VRF and its exports and imports before any customer. Onboarding a customer is then one import line on that customer's VRF (and, if needed, one import line for the customer's RT on the service VRF).", config: `ip vrf CUST-B
 route-target import 65000:900` },
        { title: "Test isolation after every onboarding", text: "After adding a tenant, check that it has the service route and that it has no route to any other tenant. Both checks belong in the change procedure.", config: `show ip route vrf CUST-B 10.9.0.0
show ip route 10.1.0.0   ! on the tenant's own router, other tenant's prefix` },
        { title: "Use a dedicated RT range for services", text: "Keep service RTs (here 900) apart from tenant RTs (100, 200) so a search of 'who imports 900' lists exactly the tenants that use the service." }
      ],
      exercise: {
        title: "Onboard customer B to the shared service (guided)",
        goal: "See the one-way extranet, the single line that completes it, and that isolation between the customers holds. Output is from lab 14 (labs/labtool.sh 14_mpls_shared_services up, then apply 14_mpls_shared_services).",
        steps: [
          { text: "Baseline: customer B has no route to the service.", type: "guided", device: "CE-B", cmd: "show ip route 10.9.0.0", output: `% Subnet not in table` },
          { text: "The service, however, already has a route to customer B, because the SHARED VRF imports B's RT.", type: "guided", device: "CE-SVC", cmd: "show ip route 10.2.0.0", output: `Routing entry for 10.2.0.0/24
  Known via "bgp 65900", distance 20, metric 0
  Tag 65000, type external
  * 172.16.3.1, from 172.16.3.1, 00:00:43 ago
      AS Hops 2` },
          { text: "Apply the scenario: PE1 adds 'route-target import 65000:900' to VRF CUST-B. The service network appears in B's VRF.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST-B", output: `B        10.2.0.0 [20/0] via 172.16.2.2, 00:02:43
B        10.9.0.0 [200/0] via 10.255.0.3, 00:01:02` },
          { text: "And the customer's router now has the service route, learned from the provider over eBGP.", type: "guided", device: "CE-B", cmd: "show ip route 10.9.0.0", output: `Routing entry for 10.9.0.0/24
  Known via "bgp 65201", distance 20, metric 0
  Tag 65000, type external
  * 172.16.2.1, from 172.16.2.1, 00:01:05 ago
      AS Hops 2` },
          { text: "Isolation check: customer A still has no route to customer B's network.", type: "guided", device: "CE-A", cmd: "show ip route 10.2.0.0", output: `% Subnet not in table` }
        ],
        selfCheck: [
          "Which two route-target matches does a working service need for one customer?",
          "Why did the SHARED VRF already hold customer B's route before the scenario?",
          "What would happen to isolation if SHARED exported 65000:100 as well?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Read both VRFs when a tenant says 'I cannot reach the service'", text: "Check the tenant's VRF for the service prefix and the service VRF for the tenant's prefix. A missing route in either one gives the same complaint, and the two checks take a minute." },
        { title: "Export the service with an RT that only services use", text: "If several services exist, give each its own RT, so tenants can be onboarded to one service and not another. Combined with an import map you can also limit a tenant to the services' specific prefixes." },
        { title: "Put NAT or unique tenant addressing in the plan", text: "Two tenants with the same prefix cannot both be reachable from one service VRF, because the service VRF then holds two routes for one prefix. Use unique tenant addresses towards the service, or NAT at the tenant edge." }
      ],
      interactions: [
        "The route-target lists are the only control here. LOCAL_PREF, AS_PATH and the other attributes work as usual inside each VRF, so a customer with two paths to the service (two PEs) can still prefer one of them.",
        "eBGP to the service CE sees the customers' routes with the provider's AS in the path (65000 65101). If the service uses the same AS in several places, it needs as-override or allowas-in (lab 17).",
        "Adding a tenant to the service VRF's import list makes the service network learn the tenant's routes: check that the service's own policy (a prefix-list on the CE) accepts only what it should."
      ],
      edge: [
        "A shared VRF is a meeting point, not a router between tenants: routes learned into it keep their original route-targets, so they do not flow from one tenant to another through it.",
        "If the service network is also announced by a second PE, a tenant's VRF may hold two paths for it (different RDs) and pick one by the usual best-path rules.",
        "An import map on the tenant VRF can restrict which service routes come in, which is safer than importing the whole service RT when a service VRF holds many networks."
      ],
      drill: {
        title: "The service answers, but the tenant cannot ask",
        situation: "A newly onboarded tenant reports that it cannot reach the shared DNS. From the service side you can see the tenant's network, and the tenant router shows this.",
        output: `CE-B# show ip route 10.9.0.0
% Subnet not in table

CE-SVC# show ip route 10.2.0.0
Routing entry for 10.2.0.0/24
  Known via "bgp 65900", distance 20, metric 0`,
        question: "What is missing and where do you add it?",
        hint: "One direction works. Which VRF should import which route-target?",
        answer: ["The tenant's VRF does not import the service's route-target (65000:900). The service already imports the tenant's RT, which is why it sees the tenant, but the tenant has no route to the service.",
          "Add 'route-target import 65000:900' to the tenant's VRF on its PE. Verify that the service prefix appears in the VRF and on the CE, and that the tenant still has no route to any other tenant."]
      },
      quiz: [
        { q: "Which statement about a shared-services VRF is correct?", options: ["It is a meeting point: it does not pass one tenant's routes on to another tenant", "It routes traffic between all tenants", "It replaces the RDs of the tenants", "It needs its own IGP"], answer: 0, why: "Tenants' routes keep their own route-targets, so they are not exported to other tenants through the service VRF." },
        { q: "You add the service's route-target to a tenant's import list but forget the service VRF's import of the tenant's RT. What happens?", options: ["The tenant has a route to the service but the replies cannot return", "Everything works", "The BGP session drops", "The tenant sees other tenants"], answer: 0, why: "Both directions need an RT match. Without the service-side import the service has no route back to the tenant." },
        { q: "Why is a shared VRF a poor fit for two tenants that use the same prefix?", options: ["The service VRF would hold two routes for one prefix and pick one", "RDs cannot be the same", "The core would drop the labels", "OSPF cannot carry it"], answer: 0, why: "Both tenant routes are imported into one VRF where they are the same IPv4 prefix, so best-path selection chooses one and the other tenant is unreachable." }
      ]
    }
  },

  /* ================================================================ M6 lab 15 hub and spoke */
  "15_mpls_hub_spoke": {
    foundations: {
      theory: [
        "The topology of an L3VPN is decided by route-targets, not by where the customer's cables go. If every VRF imports what every other VRF exports, you get a full mesh: any site reaches any other site directly across the core. If the spokes import only the hub's route-target, you get hub and spoke: a spoke has routes to the hub and nothing else.",
        "The usual reason is control. All branch-to-branch traffic must pass a firewall at head office, so the spokes must not be able to reach each other directly. The hub site sends a summary (here 10.0.0.0/8) to the spokes. A spoke's packet for another spoke matches only the summary, goes to the hub, is inspected, and is sent on.",
        "The hub PE needs two VRFs, because the routes that go to the firewall (spoke routes) and the routes that come back from it (the summary) need different route-targets. HUB-IN imports the spokes' RT 1001, HUB-OUT exports the hub RT 1000, and the firewall has one link into each. With one VRF the routes would come back on the same VRF with the provider's own AS in the path, and BGP loop prevention would drop them."
      ],
      example: {
        title: "Spoke 2 reaches spoke 1 only through the hub, from lab 15",
        text: "Spoke 2 has no 10.1.0.0/24 route. Its best match for spoke 1's network is the hub's summary 10.0.0.0/8, learned from the provider, and PE2 shows that the summary comes from the hub PE (10.255.0.4).",
        output: `CE-S2# show ip route 10.1.0.0
Routing entry for 10.0.0.0/8
  Known via "bgp 65102", distance 20, metric 0
  Tag 65000, type external
  * 172.16.2.1, from 172.16.2.1, 00:00:18 ago
      AS Hops 2

PE2# show ip route vrf SPOKE 10.1.0.0
Routing entry for 10.0.0.0/8
  Known via "bgp 65000", distance 200, metric 0
  Tag 65900, type internal
  * 10.255.0.4 (default), from 10.255.0.4, 00:00:34 ago
      MPLS label: 21`
      },
      basicConfig: `ip vrf SPOKE
 rd 65000:11
 route-target export 65000:1001
 route-target import 65000:1000
ip vrf HUB-IN
 rd 65000:21
 route-target import 65000:1001
ip vrf HUB-OUT
 rd 65000:22
 route-target export 65000:1000`,
      quiz: [
        { q: "What defines hub and spoke in an L3VPN?", options: ["Spokes import only the hub's route-target", "Physical cabling to the hub", "Different AS numbers at the spokes", "The IGP metric"], answer: 0, why: "In an L3VPN the RT lists decide who learns what, so spokes that import only the hub's RT have routes to the hub only." },
        { q: "Why does spoke 2's packet for spoke 1 go to the hub in the baseline?", options: ["The only matching route is the hub's summary", "The core routes it there", "The spokes are connected through the hub cable", "MPLS labels force it"], answer: 0, why: "Spoke 2 has no specific route for spoke 1, so it uses the summary 10.0.0.0/8 that the hub advertises." },
        { q: "Why does the hub PE use two VRFs?", options: ["Routes into the firewall and routes back need different route-targets and would otherwise trip loop prevention", "To double the bandwidth", "To run two IGPs", "To have two RDs"], answer: 0, why: "HUB-IN imports the spokes' RT, HUB-OUT exports the hub RT. One VRF would receive the routes back with the provider's AS in the path and BGP would reject them." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Summarise at the hub", text: "Have the hub site advertise a summary (or default) into HUB-OUT. Spokes then need no specific routes for each other, and adding a spoke needs no change on the hub. The firewall keeps the specific routes it learned on the HUB-IN side.", config: `router bgp 65900
 address-family ipv4
  network 10.0.0.0 mask 255.0.0.0` },
        { title: "Filter what the firewall sends where", text: "On the firewall, send nothing back on the HUB-IN session and only the summary and the hub's own network on HUB-OUT. This keeps the two directions clean and stops routes from looping.", config: `ip prefix-list NONE seq 5 deny 0.0.0.0/0 le 32
ip prefix-list HUBOUT seq 5 permit 10.0.0.0/8
neighbor 172.16.3.1 prefix-list NONE out
neighbor 172.16.4.1 prefix-list HUBOUT out` },
        { title: "Treat spoke RT changes as security changes", text: "A spoke that imports the spokes' RT bypasses the firewall. Review every change to a SPOKE VRF's import list the way you review a firewall rule, and audit the lists regularly." }
      ],
      exercise: {
        title: "Bypass the firewall with one import line (guided)",
        goal: "See the hub-and-spoke baseline and how one import route-target lets a spoke reach the other directly. Output is from lab 15 (labs/labtool.sh 15_mpls_hub_spoke up, then apply 15_mpls_hub_spoke).",
        steps: [
          { text: "Baseline. Spoke 2 reaches 10.1.0.0 only through the hub's summary.", type: "guided", device: "CE-S2", cmd: "show ip route 10.1.0.0", output: `Routing entry for 10.0.0.0/8
  Known via "bgp 65102", distance 20, metric 0
  Tag 65000, type external
  * 172.16.2.1, from 172.16.2.1, 00:00:18 ago
      AS Hops 2` },
          { text: "The firewall (hub) has the specific spoke route, so it can forward the traffic on.", type: "guided", device: "CE-HUB", cmd: "show ip route 10.1.0.0", output: `Routing entry for 10.1.0.0/24
  Known via "bgp 65900", distance 20, metric 0
  Tag 65000, type external
  * 172.16.3.1, from 172.16.3.1, 00:00:26 ago` },
          { text: "The hub PE advertises the summary and the hub's network to the spokes from VRF HUB-OUT.", type: "guided", device: "PE3", cmd: "show ip route vrf HUB-OUT", output: `B        10.0.0.0/8 [20/0] via 172.16.4.2, 00:00:30
B        10.100.0.0/24 [20/0] via 172.16.4.2, 00:00:30` },
          { text: "Apply the scenario: PE2 adds 'route-target import 65000:1001' to VRF SPOKE. The specific route appears, learned from PE1, and it is a longer prefix than the summary.", type: "guided", device: "PE2", cmd: "show ip route vrf SPOKE 10.1.0.0", output: `Routing entry for 10.1.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65101, type internal
  * 10.255.0.1 (default), from 10.255.0.1, 00:01:07 ago
      MPLS label: 21` },
          { text: "Spoke 2's router now has the direct route, and its traffic no longer passes the hub.", type: "guided", device: "CE-S2", cmd: "show ip route 10.1.0.0", output: `Routing entry for 10.1.0.0/24
  Known via "bgp 65102", distance 20, metric 0
  Tag 65000, type external
  * 172.16.2.1, from 172.16.2.1, 00:00:50 ago` }
        ],
        selfCheck: [
          "Why does the /24 win over the /8 even though both come from the provider?",
          "Which log would show you that spoke-to-spoke traffic stopped visiting the firewall?",
          "What one command on PE2 would have shown the bypass before anyone complained?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Design hub failover with two hub PEs", text: "Put a second hub PE and firewall in a second site with different RDs. The spokes then hold two summaries and prefer one with LOCAL_PREF or MED, and the other takes over if the first disappears." },
        { title: "Use a default instead of a summary when the hub also does Internet", text: "If the hub is also the Internet exit, a default route from the hub gives the spokes both jobs at once. Remember that a default route matches everything, including addresses you meant to block." },
        { title: "Audit with a negative test", text: "Keep a test on each spoke: the route to another spoke must be the summary and not a /24. A check that the specific route does not exist catches a leaked RT the day it is added." }
      ],
      interactions: [
        "Longest-prefix match beats every BGP attribute here: the /24 learned through the extra import wins over the /8 from the hub no matter what AS_PATH or LOCAL_PREF say, because the router chooses by prefix length first.",
        "The hub's summary is an ordinary eBGP route on the spokes. A spoke that also has a backup path (an Internet VPN) can use LOCAL_PREF to prefer the hub path.",
        "The two hub VRFs use different RDs and different RTs. The RDs keep the two sets of routes distinct in BGP, the RTs decide which VRF imports and which exports."
      ],
      edge: [
        "Spoke-to-spoke traffic through the hub crosses the core twice, once to the hub and once back, so it takes more bandwidth and adds delay. Size the hub links for the sum of all spoke-to-spoke traffic.",
        "If the firewall does not advertise the specific spoke routes back, it can still forward on what it learned on the HUB-IN session, as long as it has a route to each spoke.",
        "A hub that sends a summary hides spoke outages from other spokes: a spoke that goes down is still reachable by the summary until the firewall drops the traffic."
      ],
      drill: {
        title: "The firewall stopped seeing branch-to-branch traffic",
        situation: "The security team notices that flows between two branches no longer appear in the firewall logs. The route on one branch's router is below.",
        output: `CE-S2# show ip route 10.1.0.0
Routing entry for 10.1.0.0/24
  Known via "bgp 65102", distance 20, metric 0
  Tag 65000, type external`,
        question: "What changed and where do you look?",
        hint: "In the design, this branch should have only the hub's summary 10.0.0.0/8.",
        answer: ["The branch has a specific route to the other branch, which means its VRF imports the spokes' route-target (65000:1001) on its PE. Traffic follows the /24 directly and never reaches the hub.",
          "On the branch PE run 'show ip vrf detail SPOKE' and read the import list. Remove 'route-target import 65000:1001' from the SPOKE VRF, and add an audit for the RT lists of every spoke VRF."]
      },
      quiz: [
        { q: "Which route does spoke 2 use for 10.1.0.5 when it has both 10.0.0.0/8 (hub) and 10.1.0.0/24 (direct)?", options: ["10.1.0.0/24, the longest prefix", "10.0.0.0/8, because it is from the hub", "Both, load balanced", "Neither"], answer: 0, why: "Longest prefix match decides before any BGP attribute, so the specific route wins." },
        { q: "What is the cleanest way to stop a spoke from bypassing the hub?", options: ["Keep the spoke VRF's import list to the hub RT only, under review", "Add a static route on the spoke", "Use a bigger MTU", "Change the RD"], answer: 0, why: "Hub and spoke is built by the RT lists. The design holds only while those lists stay as designed." },
        { q: "Why does the firewall get a prefix-list that denies everything on the HUB-IN session?", options: ["It only needs to receive there, and sending routes would create loops", "To save bandwidth", "The PE requires it", "To hide the firewall's address"], answer: 0, why: "HUB-IN is the receiving side. Routes going the other way belong on the HUB-OUT session." }
      ]
    }
  },

  /* ================================================================ M7 lab 16 VPNv4 route reflector */
  "16_mpls_vpnv4_rr": {
    foundations: {
      theory: [
        "iBGP does not re-advertise routes learned from one iBGP peer to another, so every router in an AS must peer with every other one (a full mesh). For N PEs that is N(N-1)/2 sessions: 6 for 4 PEs, 780 for 40. A route reflector (RR) is allowed to break that rule: it re-advertises (reflects) the routes it learns from its clients to the other peers, so each PE needs a session with the RR only.",
        "The reflector rules are short. A route learned from a client is reflected to all clients and non-clients. A route learned from a non-client is reflected only to clients. A route learned from eBGP is sent to everyone. The reflector adds an ORIGINATOR_ID and a CLUSTER_LIST so that loops are detected (lab 10 and 11), and it does not change the next hop.",
        "For VPNv4 the reflector usually has no VRFs: it only passes routes around, so it keeps them even though none of its own VRFs imports them (its BGP table shows 'no table' for them). On this IOS an RR with route-reflector-client neighbors in address-family vpnv4 keeps and reflects every route, and the lab keeps 'no bgp default route-target filter' in its configuration as many providers do. The next hop of the reflected route is still the originating PE, so traffic flows PE to PE across the core and not through the reflector."
      ],
      example: {
        title: "One reflected route, from lab 16",
        text: "PE1 learned PE4's customer route from the reflector (from 10.255.0.10) but its next hop is PE4 (10.255.0.4) and the VPN label is the one PE4 allocated. On the reflector the route is marked as received from a client.",
        output: `RR# show bgp vpnv4 unicast all 10.4.0.0/24
Paths: (1 available, best #1, no table)
  65104, (Received from a RR-client)
    10.255.0.4 (metric 11) from 10.255.0.4 (10.255.0.4)
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/23

PE1# show ip route vrf CUST 10.4.0.0
Routing entry for 10.4.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  * 10.255.0.4 (default), from 10.255.0.10, 00:00:28 ago
      MPLS label: 23`
      },
      basicConfig: `router bgp 65000
 address-family vpnv4
  neighbor 10.255.0.1 activate
  neighbor 10.255.0.1 send-community extended
  neighbor 10.255.0.1 route-reflector-client`,
      quiz: [
        { q: "How many iBGP sessions does a full mesh of 10 PEs need?", options: ["45", "10", "20", "90"], answer: 0, why: "N(N-1)/2 = 10 x 9 / 2 = 45. With a route reflector the same PEs need only 10 (one per PE)." },
        { q: "Does a route reflector change the next hop of the VPNv4 routes it reflects?", options: ["No, the next hop stays the originating PE", "Yes, it sets itself as next hop", "Only for iBGP clients", "Only when it has VRFs"], answer: 0, why: "A reflector leaves the next hop unchanged, so PE-to-PE traffic goes straight across the core." },
        { q: "A route comes from a non-client. To whom does the reflector reflect it?", options: ["Only to clients", "To everyone", "Only to non-clients", "To no one"], answer: 0, why: "Routes from clients go to everyone, routes from non-clients only to clients. Two non-clients therefore never hear each other." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Use two reflectors and decide the cluster-id on purpose", text: "One reflector is a single point of failure for every VPN. Run two, with every PE peering with both, and choose whether the two share a cluster-id (fewer copies of each route) or have different ones (more paths, which some designs need). Lab 11 shows what a wrong choice does." },
        { title: "Keep the reflector out of the data path", text: "It does not change the next hop, so traffic does not flow through it. That lets you size it for the BGP table only, but the PE loopbacks must be reachable and labelled across the core, or the routes are in BGP and the traffic is dropped." },
        { title: "Use different RDs per PE", text: "With a different RD on each PE's VRF, the same customer prefix advertised by two PEs becomes two different VPNv4 routes. The reflector keeps both and other PEs can use either, so a multi-homed customer gets fast failover and load sharing instead of one best path.", config: `ip vrf CUST
 rd 65000:1   ! PE1
ip vrf CUST
 rd 65000:2   ! PE2` }
      ],
      exercise: {
        title: "Reflect, then stop reflecting (guided)",
        goal: "See what a reflector holds, and what happens when two PEs lose client status. Output is from lab 16 (labs/labtool.sh 16_mpls_vpnv4_rr up, then apply 16_mpls_vpnv4_rr).",
        steps: [
          { text: "The reflector has one route from PE1 and one from PE4, and none from PE2 and PE3, which have no customer sites.", type: "guided", device: "RR", cmd: "show bgp vpnv4 unicast all summary", output: `Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.255.0.1      4        65000       5       6        3    0    0 00:01:33        1
10.255.0.2      4        65000       3       6        3    0    0 00:01:32        0
10.255.0.3      4        65000       4       6        3    0    0 00:01:23        0
10.255.0.4      4        65000       5       6        3    0    0 00:01:24        1` },
          { text: "PE4's route on the reflector: 'no table' (it has no VRF for it) and 'Received from a RR-client'.", type: "guided", device: "RR", cmd: "show bgp vpnv4 unicast all 10.4.0.0/24", output: `Paths: (1 available, best #1, no table)
  65104, (Received from a RR-client)
    10.255.0.4 (metric 11) from 10.255.0.4 (10.255.0.4)
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/23` },
          { text: "PE1 has PE4's route from the reflector, with PE4 as next hop.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST 10.4.0.0", output: `Routing entry for 10.4.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  * 10.255.0.4 (default), from 10.255.0.10, 00:00:28 ago
      MPLS label: 23` },
          { text: "Apply the scenario: the RR removes route-reflector-client for PE1 and PE4. The RR still has PE4's route, but the client note is gone.", type: "guided", device: "RR", cmd: "show bgp vpnv4 unicast all 10.4.0.0/24", output: `Paths: (1 available, best #1, no table)
  65104
    10.255.0.4 (metric 11) from 10.255.0.4 (10.255.0.4)
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/23` },
          { text: "PE1 has lost it, and so has customer CE1.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST 10.4.0.0", output: `Routing Table: CUST
% Subnet not in table` },
          { text: "PE2 and PE3 are still clients and still hear both customers.", type: "guided", device: "PE2", cmd: "show ip route vrf CUST", output: `B        10.1.0.0 [200/0] via 10.255.0.1, 00:01:28
B        10.4.0.0 [200/0] via 10.255.0.4, 00:01:27` }
        ],
        selfCheck: [
          "Why do PE2 and PE3 still hear both routes while PE1 and PE4 do not hear each other?",
          "Which two facts on the reflector tell you the problem is client status and not a lost route?",
          "What would happen if only PE4 lost client status?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Check the client flag in the route, not in the config", text: "'show bgp vpnv4 unicast all <prefix>' on the reflector prints '(Received from a RR-client)' for client routes. A missing note next to a route that should be from a client points straight at the client configuration." },
        { title: "Do not rely on a session reset to recover", text: "Changing client status resets the session on IOS. That is useful for a change window, but a design that needs a reset to fix a reflection problem is a fragile one. Keep client status in the template." },
        { title: "Reflect only what you mean to", text: "Everything a reflector holds is visible to its clients. Do not connect a PE that is not supposed to see a customer's VPNv4 routes as a client of the same reflector without RT-based filtering (RT constraint) or a separate reflector." }
      ],
      interactions: [
        "Reflection changes which paths the PEs hear about, so it changes the best-path outcome as well. A reflector passes on only its own best path for each VPNv4 prefix, so with one RD per customer prefix a PE sees one path. With a unique RD per PE it sees each PE's path as a separate route (see the RD tactic).",
        "ORIGINATOR_ID and CLUSTER_LIST are added to reflected routes. A PE that receives a route with its own router-ID as ORIGINATOR_ID, or a CLUSTER_LIST containing its own cluster, discards it as a loop.",
        "The route-targets still decide which VRFs import the reflected route. A route the reflector reflects perfectly can still be dropped by the PE if no VRF there imports its RT."
      ],
      edge: [
        "Hierarchical reflectors (a reflector that is a client of a bigger one) work for VPNv4 too, but each tier must keep the reflector rules and unique cluster-ids (lab 11).",
        "The reflector's own IGP metric to the PEs takes no part in the PEs' decisions, but a reflector that picks one best path can hide a better path from a PE that is closer to another exit (the reason for unique RDs).",
        "If a PE loses its session to the reflector it loses every remote route at once, so the reflector's availability matters more than any single PE's."
      ],
      drill: {
        title: "Two PEs cannot see each other",
        situation: "Customers behind PE1 and PE4 cannot reach each other since a change window. The reflector has both routes and every session is Established. On PE1:",
        output: `PE1# show ip route vrf CUST 10.4.0.0
Routing Table: CUST
% Subnet not in table

RR# show bgp vpnv4 unicast all 10.4.0.0/24
Paths: (1 available, best #1, no table)
  65104
    10.255.0.4 (metric 11) from 10.255.0.4 (10.255.0.4)`,
        question: "What is the most likely cause and how do you confirm it?",
        hint: "Compare this with the earlier output: what is missing next to the route on the reflector?",
        answer: ["PE1 and PE4 are no longer route-reflector clients on the reflector. A route from a non-client is reflected only to clients, and both are non-clients, so they cannot receive each other's routes. The '(Received from a RR-client)' note is missing from PE4's route.",
          "Confirm with 'show bgp vpnv4 unicast all neighbors 10.255.0.4' or the reflector's configuration, and restore 'neighbor 10.255.0.4 route-reflector-client' (and the same for PE1) under address-family vpnv4."]
      },
      quiz: [
        { q: "Only PE4 loses client status; PE1 is still a client. What is the expected result?", options: ["Routes still reach everyone, because PE1's routes go to all peers and PE4's routes go to the clients", "PE1 and PE4 lose each other", "The reflector drops all routes", "The sessions go down"], answer: 0, why: "PE1 is a client so its routes reflect to everyone, including PE4. PE4's routes are reflected to clients, including PE1. It needs two non-clients to break." },
        { q: "Why does the reflector show 'no table' for the customer routes?", options: ["It has no VRF that imports them, and it only reflects", "The route is invalid", "It is waiting for LDP", "The RD is wrong"], answer: 0, why: "The route is held in the VPNv4 table only. With no VRF, there is no routing table to install it in." },
        { q: "PE1's traffic to a customer behind PE4 goes...", options: ["directly to PE4 across the core", "through the reflector", "to the customer's CE first", "through PE2"], answer: 0, why: "The reflector does not change the next hop, so PE1 sends the packet toward PE4 (with PE4's VPN label)." }
      ]
    }
  },

  /* ================================================================ M8 lab 17 as-override / allowas-in */
  "17_mpls_as_override": {
    foundations: {
      theory: [
        "eBGP prevents loops by looking at the AS_PATH: a router that finds its own AS number in the path of an incoming route discards it. On the Internet that is exactly what you want. Over an L3VPN it becomes a problem for a customer that uses one AS at more than one site.",
        "Site 1's CE (AS 65100) sends its route to PE1. PE1 puts the route in the VPN, PE2 sends it to site 2's CE, and each provider hop adds the provider's AS (65000). Site 2's CE receives the route with the path 65000 65100. It is also AS 65100, so it sees its own AS in the path and drops the route. The provider's VPN is complete and correct and the customer still sees nothing.",
        "There are two standard fixes. as-override on the PE-CE neighbor makes the PE replace the customer's AS in the path with the provider's own AS when it sends the route to the CE, so the path is 65000 65000 and it passes the check. allowas-in on the CE makes it accept a path that contains its own AS, so the provider changes nothing. Both cost something: the first hides the customer's AS from the path, the second weakens the CE's loop protection."
      ],
      example: {
        title: "A working VPN and a customer with no routes, from lab 17",
        text: "PE2 holds site 1's route (AS path 65100, from PE1). CE2 has nothing, not even a denied entry, because it drops the route at receipt.",
        output: `PE2# show ip route vrf CUST 10.1.1.0
Routing entry for 10.1.1.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65100, type internal
  * 10.255.0.1 (default), from 10.255.0.1, 00:00:42 ago

CE2# show ip route 10.1.1.0
% Subnet not in table

CE2# show ip bgp 10.1.1.0/24
% Network not in table`
      },
      basicConfig: `router bgp 65000
 address-family ipv4 vrf CUST
  neighbor 172.16.0.2 as-override`,
      quiz: [
        { q: "Why does CE2 discard site 1's route in the baseline?", options: ["Its own AS (65100) is in the AS_PATH", "The route-target is wrong", "LDP is down", "The next hop is unreachable"], answer: 0, why: "eBGP loop prevention: a router drops a route whose AS_PATH contains its own AS. The path is 65000 65100." },
        { q: "What does as-override on the PE do?", options: ["Replaces the CE's AS in the path with the provider's AS when sending to that CE", "Removes the provider's AS", "Adds the customer's AS twice", "Disables loop prevention on the CE"], answer: 0, why: "The path becomes 65000 65000, so the CE no longer sees its own AS." },
        { q: "Where do you configure allowas-in?", options: ["On the CE", "On the PE", "On the P router", "On the route reflector"], answer: 0, why: "allowas-in tells the receiving router (the CE) to accept its own AS in a path. It is the customer-side fix." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Make as-override part of the PE-CE template", text: "If customers may reuse an AS at several sites, put as-override in the standard PE-CE session template. Sites then work without a ticket, and the provider does not need to ask the customer to change anything." , config: `router bgp 65000
 address-family ipv4 vrf CUST
  neighbor 172.16.0.2 as-override` },
        { title: "Use the customer-side fix when the provider will not", text: "If the provider does not offer as-override, the customer can set allowas-in on each CE. It accepts a limited number of copies of the AS in the path, which is a small loss of loop protection.", config: `router bgp 65100
 address-family ipv4
  neighbor 172.16.0.1 allowas-in` },
        { title: "Test from the far CE", text: "The VPN is 'up' on the provider's side in both cases. Check the customer's table (show ip route on the far CE), not only the PE, before you close a ticket." }
      ],
      exercise: {
        title: "Fix a VPN that is up but useless, two ways (guided)",
        goal: "See a same-AS customer with no routes, then both fixes. Output is from lab 17 (labs/labtool.sh 17_mpls_as_override up, then apply 17_as_override and 17_allowas_in one at a time).",
        steps: [
          { text: "Baseline. The provider has the route, the far customer router does not.", type: "guided", device: "CE2", cmd: "show ip route 10.1.1.0", output: `% Subnet not in table` },
          { text: "Apply 17_as_override: both PEs replace the customer's AS. CE2 has the route, with two hops of the provider's AS.", type: "guided", device: "CE2", cmd: "show ip bgp 10.1.1.0/24", output: `BGP routing table entry for 10.1.1.0/24, version 3
Paths: (1 available, best #1, table default)
  65000 65000
    172.16.0.1 from 172.16.0.1 (10.255.0.3)
      Origin IGP, localpref 100, valid, external, best` },
          { text: "The route is installed and the return route works the same way at the other site.", type: "guided", device: "CE1", cmd: "show ip route 10.2.1.0", output: `Routing entry for 10.2.1.0/24
  Known via "bgp 65100", distance 20, metric 0
  Tag 65000, type external
  * 172.16.0.1, from 172.16.0.1, 00:01:16 ago
      AS Hops 2` },
          { text: "Roll it back and apply 17_allowas_in instead: the provider does not change, the path keeps the customer's AS, and the CE accepts it.", type: "guided", device: "CE2", cmd: "show ip bgp 10.1.1.0/24", output: `BGP routing table entry for 10.1.1.0/24, version 5
Paths: (1 available, best #1, table default)
  65000 65100
    172.16.0.1 from 172.16.0.1 (10.255.0.3)
      Origin IGP, localpref 100, valid, external, best` }
        ],
        selfCheck: [
          "Which fix would you choose if the customer cannot change its CE configuration, and why?",
          "What path information does the customer lose with as-override?",
          "Why is the PE the wrong place to look for this fault?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "A denied route leaves no trace by default", text: "Without 'neighbor x soft-reconfiguration inbound' the CE does not keep routes that it drops at receipt, so 'show ip bgp' shows nothing. Turn it on temporarily to see the denied route and its path when you suspect loop prevention." , config: `neighbor 172.16.0.1 soft-reconfiguration inbound
show ip bgp neighbors 172.16.0.1 received-routes` },
        { title: "Limit allowas-in", text: "'allowas-in' takes a count of how many copies of the AS a path may contain. Use the smallest number that works, so a real loop is still caught.", config: `neighbor 172.16.0.1 allowas-in 1` },
        { title: "Prefer different AS numbers when you can", text: "Different private AS numbers per site (lab 12) need neither fix, and keep the path meaningful. Use as-override or allowas-in only when the customer's AS plan cannot change." }
      ],
      interactions: [
        "as-override changes the AS_PATH on the way to the CE, so it changes AS_PATH length for the customer's own decisions (a backup path with a different path length may now look better or worse).",
        "The two fixes must not be combined: with as-override the path no longer contains the CE's AS, so allowas-in has nothing to accept, and running both only hides which one is working.",
        "The PE's own loop check is untouched: the VPN carries the route between PEs without an AS_PATH check at all, because it is iBGP with the customer's AS already in the path."
      ],
      edge: [
        "as-override replaces every occurrence of the CE's AS in the path, not only the first. A customer with a longer path through its own AS loses that structure.",
        "allowas-in on a CE that also has a real eBGP loop elsewhere can let a routing loop through. Keep the count low and watch for the same prefix arriving with more copies of the AS.",
        "Both fixes are per neighbor. A customer with many sites needs the setting on every PE-CE session (or in a template/peer-group), and forgetting one site breaks exactly that site."
      ],
      drill: {
        title: "Only the third site cannot reach the others",
        situation: "A customer uses AS 65100 at three sites. as-override is configured on the PEs of sites 1 and 2, and those two sites reach each other. Site 3 has none of the others' routes, and its PE shows every route in the VRF.",
        output: `CE3# show ip route 10.1.1.0
% Subnet not in table

PE3# show ip route vrf CUST 10.1.1.0
Routing entry for 10.1.1.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65100, type internal`,
        question: "What is missing and where do you look?",
        hint: "as-override is per PE-CE neighbor.",
        answer: ["PE3's session to CE3 has no as-override (or CE3 has no allowas-in), so the routes arrive with 65000 65100 and CE3 drops them. The VPN in the provider core is fine.",
          "Compare 'show run | section vrf CUST' on PE3 with PE1 and add 'neighbor <CE3> as-override' under address-family ipv4 vrf CUST on PE3 (or use a template so it cannot be forgotten)."]
      },
      quiz: [
        { q: "With as-override on the PE, what AS_PATH does the far CE (AS 65100) see for a route that came from the other site?", options: ["65000 65000", "65000 65100", "65100", "Nothing, the route is dropped"], answer: 0, why: "The PE replaces the customer's AS with its own when it sends the route to a CE that has that AS." },
        { q: "You enable allowas-in on the CE and as-override on the PE at the same time. What is true?", options: ["as-override already removed the CE's AS, so allowas-in is unnecessary", "The route is dropped twice", "The session resets", "The path grows longer"], answer: 0, why: "After as-override the path no longer contains the CE's AS, so allowas-in has nothing to accept. Use one fix." },
        { q: "How can you see a route that a CE dropped because of loop prevention?", options: ["Enable soft-reconfiguration inbound and look at received-routes", "Look at show ip route", "Look at the LDP table", "Look at the VRF on the PE"], answer: 0, why: "A route denied on receipt is not stored unless soft-reconfiguration inbound is on, so it does not appear in 'show ip bgp' by default." }
      ]
    }
  }
});

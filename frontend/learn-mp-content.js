/* Learn content for the MP-BGP / MPLS VPN section (same format as learn-content.js).
   Exercises here are GUIDED: each step shows the command and the output captured from the real lab (labs/12_mpls_l3vpn and
   labs/13_mpls_overlap, IOS 15.2 c7200). They do not run on the dashboard, because the dashboard drives only the shared lab. */
Object.assign(window.LEARN_CONTENT, {

  /* ================================================================ M1 address families */
  "mp_families": {
    foundations: {
      theory: [
        "Classic BGP (RFC 4271) carries exactly one thing: IPv4 unicast prefixes, in the NLRI field of the UPDATE message, with the next hop in the NEXT_HOP attribute. To carry anything else, BGP was extended (RFC 4760) with two new optional attributes, MP_REACH_NLRI and MP_UNREACH_NLRI. They carry the address family, the next hop and the prefixes together, and MP_UNREACH_NLRI withdraws them. IPv4 unicast still uses the original fields, so old and new routers stay compatible.",
        "An address family is a pair of numbers. AFI says which kind of address (1 = IPv4, 2 = IPv6). SAFI says what the route is used for (1 = unicast, 128 = MPLS-labelled VPN). VPNv4 is AFI 1 / SAFI 128. The two routers announce the families they support in a capability inside the OPEN message, and only the families both sides announce can be used on that session.",
        "In IOS you turn a family on with a block (address-family vpnv4) and activate each neighbor inside it. Under 'no bgp default ipv4-unicast' nothing is on until you say so, which is the safe style for a provider router. A neighbor is one session but can be active in several families, each with its own policy, its own prefix counters and its own tables.",
        "What makes VPNv4 different from IPv4 is what the NLRI carries: a 12-byte VPNv4 address made of a route distinguisher (RD) and the IPv4 prefix, plus an MPLS label. Everything else (AS_PATH, LOCAL_PREF, MED, next hop, communities) works exactly as in the attribute pages, and the best-path order is the same. That is why the attribute knowledge from the first eleven pages carries over to a provider VPN."
      ],
      example: {
        title: "One session, two families, from lab 12",
        text: "PE1 has two BGP neighbors under the vpnv4 family: PE2 (iBGP, over loopbacks) and the customer router CE1 (in the VRF). The count in the last column is the prefixes received in that family, and it is the number to check, not only the state.",
        output: `PE1# show bgp vpnv4 unicast all summary
Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.255.0.3      4        65000       3       5        4    0    0 00:01:41        1
172.16.1.2      4        65101       6       5        4    0    0 00:02:13        1`
      },
      basicConfig: `router bgp 65000
 no bgp default ipv4-unicast
 neighbor 10.255.0.3 remote-as 65000
 neighbor 10.255.0.3 update-source Loopback0
 address-family vpnv4
  neighbor 10.255.0.3 activate
  neighbor 10.255.0.3 send-community extended
 exit-address-family`,
      quiz: [
        { q: "Which attribute carries a VPNv4 route in a BGP UPDATE?", options: ["MP_REACH_NLRI", "The NLRI field of the base UPDATE", "AS_PATH", "AGGREGATOR"], answer: 0, why: "Anything other than plain IPv4 unicast travels in MP_REACH_NLRI (and is withdrawn in MP_UNREACH_NLRI). It carries the address family, the next hop and the prefixes." },
        { q: "What do AFI 1 and SAFI 128 together mean?", options: ["VPNv4 (MPLS-labelled VPN IPv4)", "IPv4 multicast", "IPv6 unicast", "Flowspec"], answer: 0, why: "AFI 1 is IPv4 and SAFI 128 is the MPLS-labelled VPN family, usually written VPNv4." },
        { q: "The session to a neighbor is Established but no customer routes arrive. What is the first thing to check?", options: ["Whether the neighbor is activated in address-family vpnv4 on both sides", "The MTU of the loopback", "The BGP router-ID", "The LDP hello timer"], answer: 0, why: "A family that is not activated on both sides carries nothing, and the session state does not show it. The per-family prefix count does." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Peer PEs over loopbacks with update-source", text: "The VPNv4 session runs between the PE loopbacks, so the next hop of every VPN route is a loopback that the core reaches over OSPF and that LDP has labelled. If you peer over a physical interface the next hop is not a labelled path and traffic can be dropped after a link change.", config: `neighbor 10.255.0.3 update-source Loopback0` },
        { title: "Check every family with 'show bgp all summary'", text: "One command lists a block per active family. Compare the neighbors and the prefix counts in each block after any change, instead of looking at only one family.", config: `show bgp all summary` },
        { title: "Write send-community extended explicitly", text: "The route-target travels as an extended community, so a VPNv4 neighbor must send them. IOS usually adds the line when you activate a VPNv4 neighbor, but writing it in your standard template means the configuration says what the design needs.", config: `address-family vpnv4
 neighbor 10.255.0.3 send-community extended` },
        { title: "A VPN-only PE does not need the Internet family", text: "If a PE carries only customer VPNs, leave address-family ipv4 unactivated for the PE-to-PE neighbor. The core then carries no Internet routes, which keeps the routers small and the failure domain narrow.", config: `router bgp 65000
 no bgp default ipv4-unicast` }
      ],
      exercise: {
        title: "Read one VPN route from the AFI to the label (guided)",
        goal: "Follow a customer route through the families using the real output captured from lab 12. Nothing here runs on the dashboard: to run the same commands yourself, bring the lab up with labs/labtool.sh 12_mpls_l3vpn up.",
        steps: [
          { text: "Both PEs peer over their loopbacks. First look at the family summary on PE1: the neighbor 10.255.0.3 is PE2 and the count of 1 is CE2's prefix. The second neighbor is the customer router inside the VRF.", type: "guided", device: "PE1", cmd: "show bgp vpnv4 unicast all summary", output: `Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.255.0.3      4        65000       3       5        4    0    0 00:01:41        1
172.16.1.2      4        65101       6       5        4    0    0 00:02:13        1` },
          { text: "Look at the route learned from PE2. The prefix is printed with its RD in front (65000:1:10.2.1.0/24). The next hop is PE2's loopback, 'metric 21' is the OSPF cost to it, 'RT:65000:1' is the route-target and 'mpls labels in/out nolabel/19' means PE2 announced VPN label 19.", type: "guided", device: "PE1", cmd: "show bgp vpnv4 unicast all 10.2.1.0/24", output: `BGP routing table entry for 65000:1:10.2.1.0/24, version 4
Paths: (1 available, best #1, table CUST)
  65102
    10.255.0.3 (metric 21) from 10.255.0.3 (10.255.0.3)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Extended Community: RT:65000:1
      mpls labels in/out nolabel/19` },
          { text: "The path attributes are the ones you already know: AS_PATH 65102 (the customer's AS), origin IGP, local-pref 100 and 'internal' (an iBGP route). Best-path selection compares them in the same order as for an Internet route.", type: "text" },
          { text: "The customer router sees none of this. It receives an ordinary eBGP route with the provider's AS in front of the path, and 'MPLS label: none'.", type: "guided", device: "CE1", cmd: "show ip route 10.2.1.0", output: `Routing entry for 10.2.1.0/24
  Known via "bgp 65101", distance 20, metric 0
  Tag 65000, type external
  Last update from 172.16.1.1 00:00:46 ago
  Routing Descriptor Blocks:
  * 172.16.1.1, from 172.16.1.1, 00:00:46 ago
      Route metric is 0, traffic share count is 1
      AS Hops 2
      Route tag 65000
      MPLS label: none` }
        ],
        selfCheck: [
          "Which two things in the VPNv4 entry are not in an ordinary IPv4 unicast BGP entry?",
          "Why does CE1 see 'AS Hops 2' for a prefix that belongs to the customer's own other site?",
          "The session to PE2 is Established but 'State/PfxRcd' is 0. Where do you look first?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Compare families, not sessions", text: "Automation that checks only 'session up' misses a family that was never activated. Alert on the prefix count per family per neighbor, and on a sudden drop in the VPNv4 count of a PE." },
        { title: "Use 'show bgp vpnv4 unicast all neighbors x advertised-routes'", text: "It shows what this PE sends to a peer, with RDs. Comparing the sender's advertised list with the receiver's received list finds an RT or filter problem in one step.", config: `show bgp vpnv4 unicast all neighbors 10.255.0.3 advertised-routes
show bgp vpnv4 unicast all neighbors 10.255.0.3 routes` },
        { title: "Keep per-family policy separate", text: "Route-maps and prefix-lists can be applied per family on the same neighbor. A filter meant for Internet routes should not be attached to the VPNv4 family by accident: the two families are separate policy attachments." }
      ],
      interactions: [
        "All the path attributes and the best-path order of the earlier pages apply unchanged inside VPNv4. LOCAL_PREF, MED and AS_PATH influence which PE a multi-homed customer's traffic uses.",
        "Communities and extended communities are different attributes. A route-target is an extended community, so 'send-community' (standard) and 'send-community extended' are separate settings.",
        "NEXT_HOP works as usual: a PE sets itself as the next hop for the routes it sends to iBGP peers, and the label that goes with that next hop is what makes the core forward it."
      ],
      edge: [
        "Only IPv4 unicast and VPNv4 are covered in these labs. IPv6, VPNv6 and EVPN use the same MP_REACH mechanism with other AFI/SAFI values.",
        "If one side of a session does not announce the VPNv4 capability, the family is not negotiated and the neighbor is simply not usable for it. Look at the neighbor detail for the received capabilities.",
        "Route refresh is per family: a change to VPNv4 policy needs a VPNv4 refresh, not a clear of the IPv4 table."
      ],
      drill: {
        title: "Established, but the customer has no route",
        situation: "A customer's branch cannot reach head office. The PE-to-PE session is Established, and the prefix count for that neighbor in the VPNv4 summary is 0. PE1 has the customer's prefix in its VRF.",
        output: `PE2# show bgp vpnv4 unicast all summary
Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.255.0.1      4        65000      17      26        1    0    0 00:05:17        0`,
        question: "Give the two most likely causes and the command that separates them.",
        hint: "Compare what PE1 sends with what PE2 receives, and check the family and the extended communities.",
        answer: ["Cause 1: the neighbor is not activated (or has no send-community extended) in address-family vpnv4 on one side. 'show bgp vpnv4 unicast all neighbors 10.255.0.1 advertised-routes' on PE1 shows nothing, or shows routes without an extended community.",
          "Cause 2: PE1 does send the routes, but PE2 drops them because none of its VRFs imports the route-target (the default route-target filter). 'advertised-routes' on PE1 lists the prefix with RT:65000:1 while PE2's 'show ip vrf detail' shows a different import RT. Lab 12's scenario builds exactly this second case."]
      },
      quiz: [
        { q: "A neighbor is active in address-family ipv4 but not in vpnv4. What happens to VPN routes on that session?", options: ["None are exchanged, and the session stays Established", "They are exchanged without labels", "The session goes down", "They are exchanged but not installed"], answer: 0, why: "The family is negotiated and activated per neighbor. Without vpnv4 on both sides nothing in that family is sent, and nothing in the session state tells you." },
        { q: "Which statement is true about IPv4 unicast in classic and multiprotocol BGP?", options: ["It still uses the original NLRI and NEXT_HOP fields", "It moved into MP_REACH_NLRI", "It needs SAFI 128", "It cannot coexist with VPNv4"], answer: 0, why: "For backwards compatibility IPv4 unicast keeps using the base fields. Other families use MP_REACH_NLRI." },
        { q: "You change the import policy of the vpnv4 family. Which refresh applies it?", options: ["A refresh of the vpnv4 family for that neighbor", "clear ip bgp * for ipv4 only", "Reloading the LDP session", "Nothing, it applies on its own after 15 minutes"], answer: 0, why: "Route refresh is per family, so the VPNv4 policy must be re-applied with a VPNv4 refresh (or the session reset)." }
      ]
    }
  },

  /* ================================================================ M2 VRF, RD, RT, labels */
  "mp_vpn": {
    foundations: {
      theory: [
        "A VRF (virtual routing and forwarding instance) is a separate routing table and forwarding table on one router. A customer-facing interface is placed in a VRF with 'ip vrf forwarding NAME', so packets from that interface are looked up in that VRF only. The provider's own core routes live in the global table and are not visible from the VRF.",
        "The route distinguisher (RD) is a 64-bit value put in front of the customer's IPv4 prefix to make a VPNv4 prefix. Its only job is uniqueness: with RD 65000:100 the prefix 10.1.0.0/24 becomes 65000:100:10.1.0.0/24, which cannot be confused with 65000:200:10.1.0.0/24. The RD does not say who may receive the route.",
        "The route-target (RT) does. It is an extended community attached to the VPNv4 route. A VRF exports its routes with the RTs in its export list, and imports every route whose RTs match its import list. If a route carries no RT that any local VRF imports, a PE drops it. That is how one BGP session carries many customers and each one gets only its own routes.",
        "Traffic is forwarded on a stack of two labels. The outer transport label is learned by LDP for the next hop (the far PE's loopback) and carries the packet across the core, where a P router reads only that label. The inner VPN label is the one the far PE advertised with the route in BGP, and it tells that PE which VRF (or interface) the packet belongs to. With the usual penultimate-hop popping, the last P router removes the outer label, so the far PE receives only the VPN label."
      ],
      example: {
        title: "The label stack a PE pushes, from lab 12",
        text: "PE1 sends traffic for the customer prefix 10.2.1.0/24 to PE2's loopback 10.255.0.3 with VPN label 19 (the one PE2 announced in BGP) and, because PE2's loopback is reached through P, the outer transport label 17 (the one P announced through LDP).",
        output: `PE1# show ip cef vrf CUST 10.2.1.0 detail
10.2.1.0/24, epoch 0, flags rib defined all labels
  recursive via 10.255.0.3 label 19
    nexthop 10.0.1.2 Ethernet1/0 label 17

P# show mpls forwarding-table
Local      Outgoing   Prefix           Bytes Label   Outgoing   Next Hop
Label      Label      or Tunnel Id     Switched      interface
17         Pop Label  10.255.0.3/32    7831          Et1/1      10.0.2.2`
      },
      basicConfig: `ip vrf CUST
 rd 65000:1
 route-target both 65000:1
interface Ethernet1/1
 ip vrf forwarding CUST
 ip address 172.16.1.1 255.255.255.252
mpls ldp router-id Loopback0 force
interface Ethernet1/0
 mpls ip`,
      quiz: [
        { q: "What is the route distinguisher for?", options: ["To make overlapping customer prefixes unique as VPNv4 routes", "To decide which VRFs import a route", "To choose the outgoing label", "To set the BGP router-ID"], answer: 0, why: "The RD only makes the VPNv4 prefix unique. Which VRFs import it is decided by the route-target." },
        { q: "Which mechanism decides which VRF accepts a VPNv4 route?", options: ["The route-target import list", "The RD", "The AS number of the customer", "The LDP label"], answer: 0, why: "A VRF imports the routes that carry one of the RTs in its import list. The RD plays no part in that decision." },
        { q: "What does the inner (VPN) label of a packet identify?", options: ["The VRF or interface at the far PE", "The next P router", "The customer's AS", "The OSPF area"], answer: 0, why: "The far PE announced the VPN label with the route in BGP, and uses it to pick the VRF. The outer label is the one for the core." },
        { q: "Why does a P router in the core hold no customer routes?", options: ["It forwards on the outer transport label only", "It runs a separate BGP instance for each customer", "It uses static routes", "It has a VRF for each customer that is empty"], answer: 0, why: "P routers run only the IGP and LDP. The customer routes exist only on the PEs, so the core scales with the number of PEs, not the number of customers." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "One RD per VRF, one RT per customer", text: "The simplest design: a unique RD for every VRF (many providers even use a different RD per PE) and one shared RT per customer. Any exception, such as a shared service, is then an explicit extra import." , config: `ip vrf CUST-A
 rd 65000:100
 route-target both 65000:100` },
        { title: "Put the VRF on the interface before the address", text: "'ip vrf forwarding' removes any IP address that is already on the interface. Type it first, then the address, or the customer link comes up without an address.", config: `interface Ethernet1/1
 ip vrf forwarding CUST-A
 ip address 172.16.1.1 255.255.255.252` },
        { title: "Test with a VRF-aware ping and traceroute", text: "From the PE the customer's world is behind the VRF. Use the vrf keyword and a source that is inside the VRF, otherwise the test uses the global table and proves nothing.", config: `ping vrf CUST-A 10.2.0.1 source Loopback1
traceroute vrf CUST-A 10.2.0.1` },
        { title: "Print every VRF's RT lists for review", text: "The RT lists are the security boundary of the service. Keep a script that prints 'show ip vrf detail' for every VRF and diff it before and after a change, the same way you would review a firewall change." }
      ],
      exercise: {
        title: "Two customers, one prefix, two labels (guided)",
        goal: "See that the same prefix from two customers is two different VPNv4 routes, and that customer A cannot see customer B's second site. Output is from lab 13 (labs/labtool.sh 13_mpls_overlap up brings it up).",
        steps: [
          { text: "Both customers use 10.1.0.0/24 at their first site. On PE2 the two routes have different RDs (65000:100 and 65000:200), different route-targets and different labels (19 and 20), and each sits in its own VRF table.", type: "guided", device: "PE2", cmd: "show bgp vpnv4 unicast all 10.1.0.0/24", output: `BGP routing table entry for 65000:100:10.1.0.0/24, version 4
Paths: (1 available, best #1, table CUST-A)
  65101
    10.255.0.1 (metric 21) from 10.255.0.1 (10.255.0.1)
      Extended Community: RT:65000:100
      mpls labels in/out nolabel/19
BGP routing table entry for 65000:200:10.1.0.0/24, version 5
Paths: (1 available, best #1, table CUST-B)
  65201
    10.255.0.1 (metric 21) from 10.255.0.1 (10.255.0.1)
      Extended Community: RT:65000:200
      mpls labels in/out nolabel/20` },
          { text: "Customer B's second site, 10.3.0.0/24, is present in B's VRF on PE1.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST-B 10.3.0.0", output: `Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:27 ago
      MPLS label: 20` },
          { text: "It is absent from customer A's VRF, and customer A's router has no route to it. This is the isolation the RTs give you.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST-A 10.3.0.0", output: `Routing Table: CUST-A
% Subnet not in table` },
          { text: "The lab's scenario adds one line on PE2 in B's VRF: route-target export 65000:100 (A's tag). After it, PE1's VRF CUST-A imports B's route. No session flaps.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST-A 10.3.0.0", output: `Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:59 ago
      MPLS label: 20` },
          { text: "Customer A's own router now has a route to customer B's network.", type: "guided", device: "CE-A1", cmd: "show ip route 10.3.0.0", output: `Routing entry for 10.3.0.0/24
  Known via "bgp 65101", distance 20, metric 0
  Tag 65000, type external
  * 172.16.1.1, from 172.16.1.1, 00:01:09 ago` },
          { text: "The rollback removes the extra export, and the route leaves customer A's VRF again (PE1 and CE-A1 report '% Subnet not in table').", type: "text" }
        ],
        selfCheck: [
          "Which of RD, RT and label made the two 10.1.0.0/24 routes distinct, and which decided which VRF got them?",
          "What command would show you which RTs the leaked route carries?",
          "Why is this leak invisible to the customer and to a session-state monitor?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Different RD per PE for a dual-homed site", text: "When a customer site connects to two PEs, give each PE's VRF a different RD. The route then arrives as two different VPNv4 prefixes, so a route reflector keeps both and other PEs can use either (fast failover, load sharing) instead of seeing only the reflector's best path." },
        { title: "Import maps for exceptions", text: "Use 'import map' or a route-target on a dedicated shared-services VRF for exceptions, so the standard customer VRFs stay uniform and the exception is one reviewable line.", config: `ip vrf CUST-A
 import map SHARED-ONLY` },
        { title: "Read the whole route, not only the prefix", text: "'show bgp vpnv4 unicast all <prefix>' shows RD, next hop, RT and label in one place. Ask for the RD when you look at a route that exists in two VRFs: 'show bgp vpnv4 unicast rd 65000:200 10.1.0.0/24'." }
      ],
      interactions: [
        "Best-path selection runs inside each VRF like in the global table. If two VPNv4 routes with different RDs are imported into one VRF for the same prefix, the VRF holds two paths for one prefix and BGP best-path picks one. That is why an RT leak of an overlapping prefix is worse than one of a unique prefix.",
        "Multi-homed customers use LOCAL_PREF, MED or AS_PATH prepending on the PE-CE session exactly as in the attribute pages, but the policy applies inside the VRF's address family.",
        "A route reflector holds VPNv4 routes for VRFs it does not have, so it must keep routes that no local VRF imports. Lab 16 covers 'no bgp default route-target filter'."
      ],
      edge: [
        "The RD is not the same as the RT, but many designs make them equal (65000:100 for both), which makes it easy to confuse them. Keep the meanings separate.",
        "The default route-target filter drops a VPNv4 route on a PE that has no VRF importing it. It is a memory and CPU saver, and the reason a wrong RT makes a route vanish completely instead of staying in the table.",
        "Label allocation can be per prefix, per VRF or per CE depending on configuration, and the choice changes how many labels a PE uses. Check 'show mpls forwarding-table' before assuming one label per route."
      ],
      drill: {
        title: "The wrong customer's route in your VRF",
        situation: "Customer A's network team reports a route to 10.3.0.0/24 that is not theirs and asks where it comes from. You are on PE1, and you find the following.",
        output: `PE1# show ip route vrf CUST-A 10.3.0.0
Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:59 ago
      MPLS label: 20`,
        question: "How do you find the cause on PE2 and how do you fix it?",
        hint: "Tag 65202 is customer B's AS. The route reached VRF CUST-A on PE1 because of a route-target.",
        answer: ["The route was learned from PE2 (10.255.0.3) with label 20, which is customer B's label on PE2, and its AS tag is customer B's AS (65202). PE1 puts it in CUST-A because the route carries a route-target that CUST-A imports (65000:100).",
          "On PE2, run 'show ip vrf detail CUST-B' and read the export list: it contains 65000:100 in addition to B's 65000:200. Remove the extra export ('no route-target export 65000:100' in VRF CUST-B). The route leaves customer A's VRF by itself, without clearing any session.",
          "Then find how the line got there (change record, script) and add an audit of every VRF's export list."]
      },
      quiz: [
        { q: "You give two customers' VRFs the same RD. What is the risk?", options: ["Their overlapping prefixes collide as one VPNv4 route", "The route-targets stop working", "LDP fails", "The PE-CE session drops"], answer: 0, why: "The RD is what makes the VPNv4 prefix unique. With the same RD, two identical customer prefixes become one VPNv4 prefix and one replaces the other." },
        { q: "A VPNv4 route is received but appears in no VRF and not in 'show bgp vpnv4 unicast all'. What is the most likely reason?", options: ["No VRF on the PE imports its route-target, so the PE dropped it", "The LDP session is down", "The RD is wrong", "The customer AS is private"], answer: 0, why: "By default a PE drops VPNv4 routes that no local VRF imports (the route-target filter). The lab scenario 12_mpls_l3vpn shows this: the entry disappears completely." },
        { q: "Which single change would let customer A reach customer B's site 2 in lab 13?", options: ["An RT that VRF CUST-A imports added to CUST-B's export list", "A new RD on CUST-A", "A different LDP router-ID", "send-community standard"], answer: 0, why: "Exports decide what a VRF tags its routes with, imports decide what a VRF takes. Adding A's import RT to B's export list makes A's VRF take B's routes." }
      ]
    }
  },

  /* ================================================================ M3 lab 12 */
  "12_mpls_l3vpn": {
    foundations: {
      theory: [
        "This is the plain L3VPN service. The customer has two sites, each behind its own customer edge (CE) router. Each CE runs eBGP to a provider edge (PE) router, and the customer's interface on the PE is in a VRF. The two PEs run an iBGP VPNv4 session and exchange the customer routes with the customer's route-target. The provider core (P) runs OSPF and LDP only.",
        "Each piece has one job. OSPF gives every PE loopback a route. LDP gives every one of those loopbacks a label. The VPNv4 session carries the customer prefixes, RD and VPN label. The VRF keeps the customer separate from the provider's own table. The PE-CE eBGP session hands routes between the customer and the VRF.",
        "You can debug an L3VPN layer by layer, from the bottom up: (1) IGP reachability of the PE loopbacks, (2) LDP labels for them, (3) the PE-to-PE VPNv4 session, (4) route-targets on export and import, (5) the PE-CE session and the customer's routes, (6) the data path. A failure in a lower layer looks like a failure in all higher ones."
      ],
      example: {
        title: "Everything up: the baseline of lab 12",
        text: "The core has LDP, PE1 has the customer's remote prefix with a VPN label, and a ping from CE1's LAN reaches CE2's LAN across the core.",
        output: `PE1# show mpls ldp neighbor
    Peer LDP Ident: 10.255.0.2:0; Local LDP Ident 10.255.0.1:0
	State: Oper; Msgs sent/rcvd: 9/9; Downstream

CE1# ping 10.2.1.1 source Loopback1
!!!!!
Success rate is 100 percent (5/5), round-trip min/avg/max = 60/72/80 ms`
      },
      basicConfig: `! PE (both PEs are the same apart from addresses)
ip vrf CUST
 rd 65000:1
 route-target both 65000:1
router bgp 65000
 address-family vpnv4
  neighbor 10.255.0.3 activate
  neighbor 10.255.0.3 send-community extended
 address-family ipv4 vrf CUST
  neighbor 172.16.1.2 remote-as 65101
  neighbor 172.16.1.2 activate`,
      quiz: [
        { q: "Which router holds no customer routes at all in lab 12?", options: ["P, the core router", "PE1", "PE2", "CE1"], answer: 0, why: "The P router runs only OSPF and LDP. The customer routes are in the VRFs and in BGP on the two PEs." },
        { q: "What does the PE-CE eBGP session carry?", options: ["The customer's own prefixes, into and out of the VRF", "VPNv4 routes", "LDP labels", "The provider's Internet table"], answer: 0, why: "It is a normal IPv4 unicast session inside the VRF (address-family ipv4 vrf CUST). The VPNv4 family is only between the PEs." },
        { q: "In which order do you troubleshoot an L3VPN that does not work?", options: ["IGP, LDP, VPNv4 session, route-targets, PE-CE, data path", "PE-CE first, then everything else at random", "Only the customer's router", "Only the route-reflector"], answer: 0, why: "Each layer depends on the one below. A missing IGP route or LDP label breaks everything above it, so check upward." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Check the layers in the same order every time", text: "1. show ip route (PE loopbacks in the IGP). 2. show mpls ldp neighbor and show mpls forwarding-table. 3. show bgp vpnv4 unicast all summary. 4. show ip vrf detail (RT lists). 5. show ip route vrf NAME. 6. ping vrf NAME. Stop at the first layer that is wrong.", config: `show ip route 10.255.0.3
show mpls ldp neighbor
show bgp vpnv4 unicast all summary
show ip vrf detail CUST
show ip route vrf CUST
ping vrf CUST 10.2.1.1 source Loopback1` },
        { title: "Run eBGP to the customer inside the VRF family", text: "The PE-CE session lives under 'address-family ipv4 vrf NAME'. The neighbor lines there apply only to that VRF, so a policy or filter for one customer never touches another.", config: `router bgp 65000
 address-family ipv4 vrf CUST
  neighbor 172.16.1.2 remote-as 65101
  neighbor 172.16.1.2 activate` },
        { title: "Use different private AS numbers per site", text: "The customer's sites use different AS numbers here (65101 and 65102), so the AS_PATH the far site receives (65000 65101) does not contain its own AS. If both sites use the same AS you need as-override or allowas-in (lab 17)." }
      ],
      exercise: {
        title: "Verify the VPN layer by layer, then break it with one RT (guided)",
        goal: "Follow the layered check on real output from lab 12 and see the effect of a mistyped import route-target. To run it yourself: labs/labtool.sh 12_mpls_l3vpn up, then apply 12_mpls_l3vpn.",
        steps: [
          { text: "Layer 2, LDP: PE1 has an LDP neighbor (P), so the core links carry labels.", type: "guided", device: "PE1", cmd: "show mpls ldp neighbor", output: `    Peer LDP Ident: 10.255.0.2:0; Local LDP Ident 10.255.0.1:0
	TCP connection: 10.255.0.2.25091 - 10.255.0.1.646
	State: Oper; Msgs sent/rcvd: 9/9; Downstream
	Up time: 00:01:05
	LDP discovery sources:
	  Ethernet1/0, Src IP addr: 10.0.1.2` },
          { text: "Layer 3, the VPNv4 session and the customer session: both are Established and each has one prefix.", type: "guided", device: "PE1", cmd: "show bgp vpnv4 unicast all summary", output: `Neighbor        V           AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
10.255.0.3      4        65000       3       5        4    0    0 00:01:41        1
172.16.1.2      4        65101       6       5        4    0    0 00:02:13        1` },
          { text: "Layer 5, the VRF holds the remote site's route. PE2's view of site 1 (learned from PE1, label 19):", type: "guided", device: "PE2", cmd: "show ip route vrf CUST 10.1.1.0", output: `Routing entry for 10.1.1.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65101, type internal
  Last update from 10.255.0.1 00:00:39 ago
  * 10.255.0.1 (default), from 10.255.0.1, 00:00:39 ago
      MPLS label: 19
      MPLS Flags: MPLS Required` },
          { text: "Now the scenario: PE2 changes its import route-target to 65000:11 (a typo). No session changes. The route disappears from the VRF...", type: "guided", device: "PE2", cmd: "show ip route vrf CUST 10.1.1.0", output: `Routing Table: CUST
% Subnet not in table` },
          { text: "...and, because no VRF imports it, from the VPNv4 table as well. A moment after the change you can also catch 'Paths: (0 available, no best path)'.", type: "guided", device: "PE2", cmd: "show bgp vpnv4 unicast all 10.1.1.0/24", output: `% Network not in table` },
          { text: "The customer sees the result. CE1's ping to site 2 fails: site 2 no longer has a route back to site 1, so the replies never return.", type: "guided", device: "CE1", cmd: "ping 10.2.1.1 source Loopback1", output: `Type escape sequence to abort.
Sending 5, 100-byte ICMP Echos to 10.2.1.1, timeout is 2 seconds:
Packet sent with a source address of 10.1.1.1
.....
Success rate is 0 percent (0/5)` },
          { text: "After 'rollback' the import RT is 65000:1 again: the VPNv4 entry returns as '1 available, best #1, table CUST' and the ping succeeds.", type: "text" }
        ],
        selfCheck: [
          "Which layers were fine while the VPN was broken?",
          "Why is the ping from CE1 the wrong first test for finding the cause?",
          "Which single command on PE2 points straight at the cause?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "One command per layer in an alert runbook", text: "Turn the six-step check into a runbook where each step is one show command and one expected answer. The first step that does not match is the layer to fix. It works for the on-call engineer and for automation alike." },
        { title: "Compare RT lists on both PEs", text: "For a two-site VPN the export RT of each PE must appear in the import list of the other. Reading 'show ip vrf detail' on both takes a minute and finds the typo class of error straight away.", config: `show ip vrf detail CUST` },
        { title: "Watch the PE-CE session for the customer's view", text: "The customer sees only BGP. If they report a missing route, check the advertised routes to them: 'show bgp vpnv4 unicast all neighbors 172.16.1.2 advertised-routes' (or the VRF form) shows what the PE gives the CE.", config: `show bgp vpnv4 unicast vrf CUST neighbors 172.16.1.2 advertised-routes` }
      ],
      interactions: [
        "The customer's AS_PATH gets the provider's AS prepended by the PE, so the far site sees 65000 65101. That path is longer by one hop than an internal path would be, which matters when the customer also has a backup path (a second provider or an Internet VPN) and uses AS_PATH to choose.",
        "The IGP metric to the PE loopback (21 in the output) takes part in BGP best-path selection, so an OSPF cost change in the core can move a multi-homed customer's traffic.",
        "LDP reachability comes from the IGP. A route to a PE loopback that is missing or summarised in the IGP breaks the labelled path, even though the BGP session (which can use the summarised route) stays up."
      ],
      edge: [
        "A single mistyped RT breaks one direction only when the other PE's export and import are correct. Always test both directions.",
        "If PE1 exports 65000:1 and PE2 imports 65000:11, PE2 drops the route on receipt, so 'received-routes' or soft-reconfiguration is not a way to see it. Look at the sender's advertised routes.",
        "Penultimate-hop popping means the PE receives only the VPN label. If you capture traffic at the egress PE's core link you will see one label, not two."
      ],
      drill: {
        title: "One direction of a VPN is dead",
        situation: "Head office can reach the branch, but the branch cannot reach head office. Both PE-to-PE and PE-CE sessions are Established. On the branch PE you see this.",
        output: `PE2# show ip route vrf CUST 10.1.1.0
Routing Table: CUST
% Subnet not in table

PE2# show bgp vpnv4 unicast all 10.1.1.0/24
% Network not in table`,
        question: "What is wrong and how do you confirm which router has the mistake?",
        hint: "The route is not in the VPNv4 table at all, not just missing from the VRF.",
        answer: ["PE2 does not import the route-target that PE1 exports for the customer's routes, so PE2 discards the route (the default route-target filter). 'show ip vrf detail CUST' on PE2 shows an import RT that is not 65000:1.",
          "Confirm on PE1 with 'show bgp vpnv4 unicast all neighbors 10.255.0.3 advertised-routes': it does advertise 10.1.1.0/24 with RT:65000:1. The sender is fine, the receiver's import list is wrong. Fix PE2's import RT."]
      },
      quiz: [
        { q: "The PE-CE and PE-PE sessions are up, but one site cannot reach the other. Which check finds a wrong import RT fastest?", options: ["show ip vrf detail on both PEs, and the VRF routing table on the far PE", "show mpls ldp neighbor", "show ip ospf neighbor", "clear ip bgp *"], answer: 0, why: "A wrong RT does not affect the sessions or LDP. It shows in the RT lists and as a route that is missing from the far VRF." },
        { q: "Why does a wrong import RT remove the prefix from the BGP table instead of leaving it there unused?", options: ["The PE discards VPNv4 routes that no local VRF imports (route-target filter)", "The prefix is aged out by BGP", "LDP removes it", "The customer withdraws it"], answer: 0, why: "By default a router with VRFs keeps only the VPNv4 routes that some VRF imports. That is also why a route reflector needs a special setting (lab 16)." },
        { q: "Which of these is NOT a layer in the bottom-up L3VPN check?", options: ["The customer's ISP contract", "IGP reachability of PE loopbacks", "LDP labels", "Route-targets"], answer: 0, why: "The check goes IGP, LDP, VPNv4 session, RTs, PE-CE, data path." }
      ]
    }
  },

  /* ================================================================ M4 lab 13 */
  "13_mpls_overlap": {
    foundations: {
      theory: [
        "Private address space is small, so many organisations use the same ranges. A provider that carries many customers on one network, or a company that has just bought another and must connect the two, will meet the same prefix twice. In an L3VPN this is normal and safe, because the RD, the RT and the label keep the copies apart.",
        "Lab 13 has two customers, A and B, that both use 10.1.0.0/24 at their first site. Each has its own VRF on both PEs: CUST-A with RD and RT 65000:100, CUST-B with RD and RT 65000:200. A's first site and B's first site enter PE1 on different interfaces, in different VRFs. PE1 sends two VPNv4 routes with different RDs, different RTs and different labels. PE2 puts each in the right VRF.",
        "The RT lists are also the security boundary. The lab's scenario adds A's route-target to B's export list on PE2. B's second site (10.3.0.0/24) is then imported into A's VRF on PE1, and A's router learns it. Nothing flaps and nothing is logged, so this kind of change has to be caught by review and by audits of the RT lists, not by monitoring the sessions."
      ],
      example: {
        title: "Same prefix, two routes, from lab 13",
        text: "PE2 holds both 10.1.0.0/24 routes. Only the RD, the RT and the label differ, and the two routes sit in different VRF tables.",
        output: `PE2# show bgp vpnv4 unicast all 10.1.0.0/24
BGP routing table entry for 65000:100:10.1.0.0/24, version 4
Paths: (1 available, best #1, table CUST-A)
  65101
      Extended Community: RT:65000:100
      mpls labels in/out nolabel/19
BGP routing table entry for 65000:200:10.1.0.0/24, version 5
Paths: (1 available, best #1, table CUST-B)
  65201
      Extended Community: RT:65000:200
      mpls labels in/out nolabel/20`
      },
      basicConfig: `ip vrf CUST-A
 rd 65000:100
 route-target both 65000:100
ip vrf CUST-B
 rd 65000:200
 route-target both 65000:200`,
      quiz: [
        { q: "Two customers both use 10.1.0.0/24. What keeps their routes from colliding in BGP?", options: ["Different RDs, which make two different VPNv4 prefixes", "Different AS_PATHs", "Different LOCAL_PREFs", "Different OSPF areas"], answer: 0, why: "The VPNv4 prefixes are 65000:100:10.1.0.0/24 and 65000:200:10.1.0.0/24, so they are two separate routes." },
        { q: "What stops customer A's VRF from importing customer B's routes?", options: ["Customer A's VRF does not import B's route-target", "The RD is different", "The routes are in different address families", "MPLS labels encrypt the traffic"], answer: 0, why: "Import is decided by route-targets. Nothing else prevents it, which is why the RT lists need auditing." },
        { q: "In the scenario, which line causes the leak?", options: ["route-target export 65000:100 in VRF CUST-B", "no bgp default ipv4-unicast", "mpls ip", "neighbor activate"], answer: 0, why: "It tags B's routes with A's route-target, so A's VRF imports them." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Design rule: one RD and one RT per tenant", text: "Keep the tenant's identity in one place. Any exception (a shared service, a merger, a migration) is an explicit import of one extra RT into one VRF, recorded and reviewed." },
        { title: "Audit the RT lists on a schedule", text: "Print import and export lists for every VRF on every PE and compare with the tenant register. A leak is otherwise silent.", config: `show ip vrf detail | include VRF|Export|Import|route-target` },
        { title: "Migrate overlapping ranges with a temporary NAT or renumbering plan", text: "Overlapping addresses are safe inside their own VPNs, but two tenants that must talk to each other need either renumbering or NAT at a controlled point. Do not solve it by importing both into one VRF." }
      ],
      exercise: {
        title: "Isolate, leak, and find the leak (guided)",
        goal: "Use the real output of lab 13 to see the isolation, the leak and the way to find its source. To run it yourself: labs/labtool.sh 13_mpls_overlap up, then apply 13_mpls_overlap.",
        steps: [
          { text: "Baseline: customer B's site 2 (10.3.0.0/24) is in B's VRF on PE1.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST-B 10.3.0.0", output: `Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:27 ago
      MPLS label: 20` },
          { text: "Baseline: it is not in customer A's VRF, and customer A's router has no route to it.", type: "guided", device: "CE-A1", cmd: "show ip route 10.3.0.0", output: `% Subnet not in table` },
          { text: "Apply the scenario: PE2 adds 'route-target export 65000:100' to VRF CUST-B. After the eBGP timers, PE1's VRF CUST-A imports the route.", type: "guided", device: "PE1", cmd: "show ip route vrf CUST-A 10.3.0.0", output: `Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:59 ago
      MPLS label: 20` },
          { text: "The route continues into customer A's network. CE-A1 has a route to customer B's prefix, learned from the provider (AS 65000).", type: "guided", device: "CE-A1", cmd: "show ip route 10.3.0.0", output: `Routing entry for 10.3.0.0/24
  Known via "bgp 65101", distance 20, metric 0
  Tag 65000, type external
  * 172.16.1.1, from 172.16.1.1, 00:01:09 ago` },
          { text: "To find the cause, read the route's tag (65202 is B's AS), the label (20 is B's label) and then the export list of B's VRF on the PE it came from (PE2): it holds 65000:100 as well as 65000:200. Remove the extra export to roll back.", type: "text" }
        ],
        selfCheck: [
          "What would change if the leaked prefix were B's 10.1.0.0/24 instead of 10.3.0.0/24?",
          "Which two audits would have caught this before customer A saw it?",
          "Why did no BGP session flap during the leak?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Detect a leak from the customer side", text: "Give every customer a small set of routes it must never learn (for example a prefix from each other tenant) and check the CE tables for them after every change. A leak then shows up as a failed negative test." },
        { title: "Use distinct RT namespaces", text: "Encode the tenant in the RT (65000:<tenant id>) and keep shared-service RTs in a separate range, so 'which VRFs import tenant 200' is a text search and not a reading exercise." },
        { title: "Automate 'show ip vrf detail' diffs", text: "Snapshot the RT lists before and after every change ticket. A one-line difference in an export list is exactly what this lab's scenario is." }
      ],
      interactions: [
        "If the leaked prefix overlaps a prefix already in the receiving VRF, the VRF holds two paths for it and best-path selection picks one (AS_PATH length, MED, eBGP over iBGP, IGP metric, router-ID). Some sessions may go to the wrong tenant and others not, which looks like a random fault.",
        "The PE-CE eBGP session then advertises the leaked route to the customer like any other, so the customer's own policy (a prefix-list on the CE) is the last line of defence.",
        "Communities or local policy on the CE cannot see the route-target. Only the PE knows why the route was imported."
      ],
      edge: [
        "Import and export RTs are separate lists. A one-way leak (export only, or import only) is possible and easy to miss: 'route-target both' hides that there are two statements.",
        "A VRF can also import through an import map. A review that reads only the route-target lines can miss it.",
        "Route reflectors do not stop a leak: they reflect whatever RTs the routes carry, and the leaking VRF is on the PE."
      ],
      drill: {
        title: "Customer A sees an address it should not",
        situation: "Customer A's security team finds 10.3.0.0/24, which belongs to another tenant, in their router's table. The route on the PE:",
        output: `PE1# show ip route vrf CUST-A 10.3.0.0
Routing entry for 10.3.0.0/24
  Known via "bgp 65000", distance 200, metric 0
  Tag 65202, type internal
  * 10.255.0.3 (default), from 10.255.0.3, 00:00:59 ago
      MPLS label: 20`,
        question: "Which router and which command do you use to find what to remove?",
        hint: "The route came from 10.255.0.3, and the tag is another customer's AS.",
        answer: ["10.255.0.3 is PE2, and 65202 is customer B's AS on the PE2 side. On PE2 run 'show ip vrf detail CUST-B' and read the export list: an export of customer A's route-target (65000:100) is the leak.",
          "Remove it (no route-target export 65000:100 in VRF CUST-B). PE1 withdraws the route from CUST-A within the next update, and the customer's router loses it after the eBGP advertisement timer."]
      },
      quiz: [
        { q: "A leaked prefix does NOT overlap anything in the receiving VRF. What is the visible result?", options: ["A new route appears in the wrong VRF, with no other symptom", "The BGP session flaps", "The core drops the packets", "The route is rejected by the PE"], answer: 0, why: "The route is simply imported. There is no error, so only an audit or a negative test finds it." },
        { q: "Which is the best place to keep isolation guarantees?", options: ["RT lists under change control with regular audits", "The customers' own routers", "The P routers", "LDP filters"], answer: 0, why: "The RT lists decide what is imported. The core and the customers cannot enforce that for you." },
        { q: "Why is a leak of an overlapping prefix more dangerous than one of a unique prefix?", options: ["The VRF holds two paths for one prefix and picks one, so some traffic can go to the wrong tenant", "It always crashes the router", "It removes the RD", "It stops LDP"], answer: 0, why: "Best-path selection chooses between the two paths, and the winner can change with the IGP metric or router-IDs, so the fault looks random." }
      ]
    }
  }
});

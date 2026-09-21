/* Learn content, batch 2: 06 NEXT_HOP, 07 ATOMIC_AGGREGATE, 08 AGGREGATOR. Same format as learn-content.js.
   Router outputs quoted here were captured from the lab (IOS 15.2, c7200). */
Object.assign(window.LEARN_CONTENT, {

  /* ================================================================ 06 NEXT_HOP */
  "06_next_hop": {
    foundations: {
      theory: [
        "NEXT_HOP is the IP address a router must send packets to in order to reach the prefix. It is a well-known mandatory attribute: every route has one. BGP does not carry routes across a network by itself. It carries a prefix and a next hop, and something else (the IGP) has to be able to reach that next hop.",
        "Over eBGP, the router that advertises a route sets NEXT_HOP to its own address on the shared link, so the neighbor always points at a directly connected address. Over iBGP the rule is different: by default a router passes the route on without changing NEXT_HOP. A route learned from an ISP therefore keeps the ISP's link address as its next hop when it is sent to the rest of your AS.",
        "That address is usually on a link your IGP does not know about, so the other routers have no route to it. A BGP route whose next hop is not reachable is marked '(inaccessible)' and is not a candidate for the best path at all, whatever its other attributes are. The route is not used and is not advertised further.",
        "The standard fix is 'neighbor x next-hop-self' on the edge routers, which rewrites NEXT_HOP to the edge router's own loopback address before it goes into iBGP. The loopback is in the IGP, so every router can reach it."
      ],
      example: {
        title: "Without next-hop-self the route becomes inaccessible",
        text: "EDGE1 learns the content prefix from ISP-A at 172.16.12.1. With next-hop-self removed, EDGE1 sends the route into iBGP with that address unchanged. The route reflector cannot reach it (captured from the lab):",
        output: `CORE-RR1# show ip bgp 100.100.100.0/24
  65001 65100, (Received from a RR-client)
    172.16.12.1 (inaccessible) from 10.255.0.11 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, internal

CORE-RR1# show ip route 172.16.12.1
% Network not in table`
      },
      basicConfig: `router bgp 65000
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.1 next-hop-self      ! rewrite NEXT_HOP to this router's loopback`,
      quiz: [
        { q: "EDGE1 learns a route from an ISP at 172.16.12.1 and sends it to an iBGP peer with default settings. What is NEXT_HOP in the update?", options: ["EDGE1's loopback", "Still 172.16.12.1", "The iBGP peer's address", "0.0.0.0"], answer: 1, why: "iBGP does not change NEXT_HOP by default. The route keeps the eBGP peer's address, which is why edge routers need next-hop-self." },
        { q: "What does '(inaccessible)' next to a next hop mean?", options: ["The neighbor is down", "The router has no route to that next hop, so the path cannot be used", "The prefix is filtered", "The path is the backup"], answer: 1, why: "BGP needs a route to the next hop in the routing table. Without one the path is not usable and is not advertised on." },
        { q: "Which command rewrites NEXT_HOP for iBGP peers on an edge router?", options: ["neighbor x next-hop-self", "neighbor x update-source Loopback0", "neighbor x remote-as 65000", "bgp default local-preference 200"], answer: 0, why: "next-hop-self replaces the next hop with the router's own address on that session." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Set next-hop-self on the edge, toward iBGP", text: "The edge routers are where routes enter the AS, so that is where the next hop should be rewritten. Configure it on the sessions to the route reflectors (or to every iBGP peer, if you do not use reflectors). Do not rely on remembering it router by router: put it in your standard edge template." },
        { title: "Or put the external link into the IGP", text: "The alternative is to make the ISP link address reachable inside the AS, by adding the link to the IGP as a passive interface. That keeps the original next hop. The trade-off: the IGP now carries your external links, and the next hop only becomes unreachable when the link itself fails, which some designs want." },
        { title: "Check reachability first", text: "When a path is missing from best-path selection, ask two questions in this order: is the next hop reachable, and what is the next hop? These two commands answer both.", config: `show ip bgp 100.100.100.0/24      ! look for (inaccessible)
show ip route 172.16.12.1        ! is there a route to the next hop?` },
        { title: "Use a loopback for iBGP sessions", text: "Source the iBGP sessions from a loopback and let next-hop-self use it. The next hop is then a stable address that the IGP always reaches, independent of any single physical link." }
      ],
      exercise: {
        title: "Break and restore a next hop",
        goal: "Remove next-hop-self from EDGE1 and find the ISP-A path marked inaccessible on the route reflector.",
        steps: [
          { text: "Baseline. EDGE1 rewrites the next hop toward both route reflectors.", type: "show", device: "EDGE1", cmd: "show running-config | include next-hop-self", expect: "neighbor 10\\.255\\.0\\.1 next-hop-self", expectText: "'neighbor 10.255.0.1 next-hop-self' (and .2)", hint: "roll back scenario 06 first if it was left applied" },
          { text: "Baseline on the route reflector. EDGE1's path has EDGE1's loopback as its next hop, which is reachable.", type: "show", device: "CORE-RR1", cmd: "show ip bgp 100.100.100.0/24", expect: "10\\.255\\.0\\.11 \\(metric 11\\)", expectText: "next hop 10.255.0.11 with a metric, no 'inaccessible'", hint: "wait for the lab to converge and try again" },
          { text: "Apply scenario 06. It removes next-hop-self toward both reflectors on EDGE1.", type: "scenario", id: "06_next_hop", mode: "run" },
          { text: "EDGE1's configuration no longer has the line.", type: "show", device: "EDGE1", cmd: "show running-config | include next-hop-self", expectNot: "next-hop-self", expectText: "no output", hint: "apply the scenario in the previous step and let it finish" },
          { text: "Now the route reflector. The same path arrives with the ISP-A link address as its next hop.", type: "show", device: "CORE-RR1", cmd: "show ip bgp 100.100.100.0/24", expect: "172\\.16\\.12\\.1 \\(inaccessible\\)", expectText: "'172.16.12.1 (inaccessible)'", hint: "wait a few seconds and run it again" },
          { text: "Confirm why: the route reflector has no route to the ISP link address.", type: "show", device: "CORE-RR1", cmd: "show ip route 172.16.12.1", expect: "Network not in table", expectText: "'% Network not in table'", hint: "this is what the scenario is meant to cause" },
          { text: "Look at EDGE2. Because the reflector cannot use the path, it never reflects it, and EDGE2 does not learn it.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expectNot: "10\\.255\\.0\\.11", expectText: "no path through EDGE1 at all, only EDGE2's own ISP-B path", hint: "if a path via 10.255.0.11 is still shown, wait a few seconds and run it again" },
          { text: "Roll the change back.", type: "scenario", id: "06_next_hop", mode: "rollback" },
          { text: "The reflector should have a usable path from EDGE1 again.", type: "show", device: "CORE-RR1", cmd: "show ip bgp 100.100.100.0/24", expectNot: "inaccessible", expectText: "no 'inaccessible' path", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "The BGP session and the ISP link are both up. What does the network lose without any alarm?",
          "Name two ways to make the ISP-A path usable again, and one downside of each."
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Make the next hop a loopback on purpose", text: "With next-hop-self and iBGP sessions sourced from loopbacks, the next hop is an address that stays reachable as long as any IGP path to the router exists. A single physical link failure then does not invalidate the route.", config: `interface Loopback0
 ip address 10.255.0.11 255.255.255.255
router bgp 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.1 next-hop-self` },
        { title: "Keep the next hop when you mean to", text: "On eBGP the next hop is normally rewritten to the sender. 'next-hop-unchanged' keeps the original, which is what route servers and some multihop or MPLS designs need. Use it deliberately: the neighbor must have a route to that address.", config: `router bgp 65000
 neighbor 203.0.113.1 next-hop-unchanged` },
        { title: "Speed up failure detection with BFD", text: "With next-hop-self the next hop is a loopback, which stays up when an ISP link fails. BGP then relies on the eBGP session dying to withdraw the route, which can take a while. BFD on the ISP neighbor detects the failure in a second or less.", config: `router bgp 65000
 neighbor 172.16.12.1 fall-over bfd` },
        { title: "Diagnose with two commands", text: "Whenever a path you expect is missing from the best-path choice, check 'show ip bgp <prefix>' for '(inaccessible)' and 'show ip route <next-hop>'. A large share of missing-path problems end there." }
      ],
      interactions: [
        "NEXT_HOP is not a tie-breaker. It is a gate in front of best-path selection: a path whose next hop is unreachable is excluded before Weight is even compared. A huge Local-Pref cannot rescue it.",
        "The IGP metric to the next hop is step 8. When everything above ties, the router picks the path whose next hop is closest in the IGP, which gives you 'hot-potato' exit selection.",
        "Route reflectors do not change the next hop of reflected routes. What the client's router sees is what the edge router set, so next-hop-self belongs on the edge, not on the reflector.",
        "On the lab, EDGE1's ISP-A path became inaccessible on CORE-RR1 and was never reflected, so EDGE2 was left with only its own ISP-B path. The BGP session and the ISP link were both up, and nothing raised an alarm."
      ],
      edge: [
        "With next-hop-self, a failing ISP link does not change the next hop, because the next hop is EDGE1's loopback. The route stays until the eBGP session fails or is torn down. That is a reason to use BFD or short timers on the ISP session.",
        "On a shared subnet, such as an Internet exchange, eBGP does not rewrite the next hop if it is on the same subnet as the receiving peer. This is called a third-party next hop and it is why route-server designs work.",
        "The next hop has to be resolved through a route in the routing table. If the only route to it comes from BGP itself, it is not accepted, so the IGP or a static route must cover it.",
        "Changing next-hop-self on a live iBGP session changes the routes that are advertised. Apply a soft outbound clear afterwards to send the updated routes without resetting the session."
      ],
      drill: {
        title: "Nothing uses ISP-A any more",
        situation: "During a clean-up, someone removed a 'redundant' line from EDGE1. Since then no alarms have fired, the ISP-A link is up and the eBGP session shows Established. But the rest of the AS never uses ISP-A and EDGE2 does not see the EDGE1 path at all. This is the route reflector's entry for the content prefix:",
        output: `CORE-RR1# show ip bgp 100.100.100.0/24
Paths: (3 available, best #2, table default)
  65002 65100, (Received from a RR-client)
    10.255.0.12 (metric 11) from 10.255.0.2 (10.255.0.2)
      Origin IGP, metric 0, localpref 100, valid, internal
      Originator: 10.255.0.12, Cluster list: 10.255.0.2
  65002 65100, (Received from a RR-client)
    10.255.0.12 (metric 11) from 10.255.0.12 (10.255.0.12)
      Origin IGP, metric 0, localpref 100, valid, internal, best
  65001 65100, (Received from a RR-client)
    172.16.12.1 (inaccessible) from 10.255.0.11 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, internal`,
        question: "What was the removed line, why is the ISP-A path unusable, and what are the two fixes?",
        hint: "Look at the next hop of the last path, then ask whether the reflector's routing table can reach it.",
        answer: [
          "The removed line was 'neighbor <route-reflector> next-hop-self' on EDGE1. Without it EDGE1 sends the ISP-A route into iBGP with the ISP link address 172.16.12.1 as its next hop. That address is not in the IGP, so 'show ip route 172.16.12.1' gives '% Network not in table' and the path is marked inaccessible.",
          "An inaccessible path cannot be best, and only a best path is reflected. So EDGE2 never hears about ISP-A through EDGE1. If ISP-B fails, the AS has no path to the content prefix until someone notices.",
          "Fix one: restore next-hop-self on both reflector sessions on EDGE1 (preferred, because it also isolates iBGP from the ISP link). Fix two: add 172.16.12.0/30 to the IGP as a passive interface so the address becomes reachable. The second exposes the external link to the IGP and ties reachability to the link state."
        ]
      },
      quiz: [
        { q: "A path has an inaccessible next hop and Weight 500. The other paths have weight 0. Which is chosen?", options: ["The weight 500 path", "One of the others: the inaccessible path is excluded before any comparison", "They tie", "The oldest"], answer: 1, why: "A path with an unreachable next hop is not a candidate at all. Weight is never compared for it." },
        { q: "Which is a real downside of adding the ISP link to the IGP instead of using next-hop-self?", options: ["The routes stop being advertised", "The IGP now carries your external links, and the next hop's reachability follows the physical link", "BGP cannot use loopbacks", "It removes ORIGIN"], answer: 1, why: "It works, but you expose external link routes to your IGP, and the next hop's state changes whenever that link flaps." },
        { q: "With next-hop-self, the ISP link fails but the eBGP session takes a long time to drop. What helps?", options: ["BFD on the ISP neighbor", "A higher Local-Pref", "Prepending", "Removing the route-map"], answer: 0, why: "Because the next hop is a loopback that stays reachable, BGP depends on the session to notice the failure. BFD detects link failure in about a second." },
        { q: "Does a route reflector change the NEXT_HOP of the routes it reflects?", options: ["Yes, always to its own loopback", "No, by default it leaves it as the edge router set it", "Only for eBGP routes", "Only if next-hop-self is off"], answer: 1, why: "Reflection does not rewrite the next hop, so the edge router must set it correctly, and the reflector must be able to reach it." }
      ]
    }
  },

  /* ================================================================ 07 ATOMIC_AGGREGATE */
  "07_atomic_aggregate": {
    foundations: {
      theory: [
        "ATOMIC_AGGREGATE is a flag, not a value: it is either present or absent. It means 'this route is a summary, and some AS_PATH information was lost when it was created'. It is a well-known discretionary attribute, so routers that understand it should pass it on but do not have to send it.",
        "You create a summary with 'aggregate-address'. Without the 'as-set' keyword the router builds the aggregate with only its own AS number, dropping the path detail of the more-specific routes it summarised, and marks it ATOMIC_AGGREGATE. The flag warns receivers that the path may be missing ASes and that the route should not be split back into more-specific routes.",
        "It is not a best-path step. Nothing is decided by it. It is information for people and for policy, and it travels with the route to other networks (it is transitive). Its companion, AGGREGATOR, records which router made the summary (see 08).",
        "'summary-only' is a separate option that suppresses the more-specific routes so that neighbors see only the summary. The router marks each suppressed route with an 's' in the BGP table."
      ],
      example: {
        title: "A summary flagged as atomic, and suppressed components",
        text: "EDGE1 summarises CE-LAN's four /24 networks into 10.10.0.0/16 with 'summary-only'. On EDGE1 the /24 components are marked 's', and ISP-A receives the /16 with the flag and the identity of the router that made it (captured from the lab):",
        output: `EDGE1# show ip bgp 10.10.0.0/16 longer-prefixes
     Network          Next Hop            Metric LocPrf Weight Path
 *>  10.10.0.0/16     0.0.0.0                            32768 i
 s i 10.10.1.0/24     10.255.0.20              0    100      0 i
 s>i                  10.255.0.20              0    100      0 i

ISPA-1# show ip bgp 10.10.0.0/16
  65000, (aggregated by 65000 10.255.0.11)
    172.16.12.2 from 172.16.12.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, atomic-aggregate, best`
      },
      basicConfig: `router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 summary-only`,
      quiz: [
        { q: "What does ATOMIC_AGGREGATE tell a receiver?", options: ["The route is the best one", "The route is a summary and some AS_PATH information was lost", "The route must not be advertised to iBGP peers", "The route has a Local-Pref"], answer: 1, why: "It flags a summary route whose path detail is incomplete, so receivers know not to treat the AS_PATH as the complete story." },
        { q: "Is ATOMIC_AGGREGATE used to choose between two paths?", options: ["Yes, as step 3", "Yes, as step 10", "No: it is informational only", "Only with route reflectors"], answer: 2, why: "It is a flag that carries information and takes part in no comparison." },
        { q: "What does 'summary-only' do?", options: ["It makes the aggregate the best path", "It suppresses the more-specific routes so only the summary is advertised", "It adds an AS_SET", "It removes the AS_PATH"], answer: 1, why: "The components stay in the local table, marked 's', but are not advertised to neighbors." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Summarise toward the ISPs, not inside", text: "Advertise one aggregate to each ISP instead of every internal /24. That shrinks what the ISP carries and hides internal changes, so a flapping /24 does not cause updates across the Internet." },
        { title: "Advertise the aggregate and only some specifics", text: "Without 'summary-only' the aggregate goes out together with the more-specifics, which lets you steer some prefixes with longer routes. To leak only chosen specifics to one neighbor while everything else stays summarised, use an unsuppress-map.", config: `ip prefix-list LEAK seq 5 permit 10.10.1.0/24
route-map UNSUPPRESS permit 10
 match ip address prefix-list LEAK
router bgp 65000
 neighbor 172.16.12.1 unsuppress-map UNSUPPRESS` },
        { title: "Know when the aggregate exists", text: "The router only creates an aggregate while at least one more-specific route is in its BGP table. If every component disappears, the aggregate disappears too. If you want the aggregate to be advertised regardless, anchor it with a static route to Null0 and a network statement.", config: `ip route 10.10.0.0 255.255.0.0 Null0
router bgp 65000
 network 10.10.0.0 mask 255.255.0.0` },
        { title: "Check what a neighbor is actually sent", text: "Do not assume. Ask the router what it advertises to that neighbor.", config: `show ip bgp neighbors 172.16.12.1 advertised-routes` }
      ],
      exercise: {
        title: "Summarise and see what is suppressed",
        goal: "Create a summary with summary-only on EDGE1, and see the flag and the aggregator at ISP-A, the suppressed components on EDGE1, and where the /24 still comes from.",
        steps: [
          { text: "Baseline. ISP-A has no route for the /16, because nobody has summarised yet.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "Network not in table", expectText: "'% Network not in table'", hint: "roll back scenario 07 first if it was left applied" },
          { text: "Also on EDGE1: none of the components are suppressed at baseline.", type: "show", device: "EDGE1", cmd: "show ip bgp 10.10.0.0/16 longer-prefixes", expectNot: "^ s ", expectText: "no line starting with an 's' status code", hint: "roll back scenario 07 first if it was left applied" },
          { text: "Apply scenario 07. EDGE1 creates aggregate-address 10.10.0.0/16 with summary-only, without as-set.", type: "scenario", id: "07_atomic_aggregate", mode: "run" },
          { text: "ISP-A now has the summary and it carries the flag.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "atomic-aggregate", expectText: "'atomic-aggregate' in the attribute line", hint: "apply the scenario in the previous step and let it finish" },
          { text: "The same output names the router that formed the aggregate.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "aggregated by 65000 10\\.255\\.0\\.11", expectText: "'aggregated by 65000 10.255.0.11'", hint: "wait a few seconds and run it again" },
          { text: "On EDGE1, the components are still in the table but suppressed.", type: "show", device: "EDGE1", cmd: "show ip bgp 10.10.0.0/16 longer-prefixes", expect: "^ s i +10\\.10\\.1\\.0/24", expectText: "the /24 lines start with 's' (suppressed), under the /16", hint: "the apply step must have finished" },
          { text: "Now the surprise. Does ISP-A still hear about the /24 from anywhere?", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.1.0/24", expectNot: "172\\.16\\.12\\.2 from", expectText: "no path from EDGE1 (172.16.12.2), because EDGE1 now sends only the /16", hint: "wait for the 30 second eBGP advertisement timer and run it again" },
          { text: "Roll the change back.", type: "scenario", id: "07_atomic_aggregate", mode: "rollback" },
          { text: "ISP-A should be back to having no /16.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "Network not in table", expectText: "'% Network not in table'", hint: "wait for the 30 second eBGP advertisement timer and run it again" }
        ],
        selfCheck: [
          "Where is ISP-A still learning the /24 from, and why does that matter for traffic to it?",
          "What would you configure on EDGE2 to make the summary consistent?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Steer with a specific and a summary together", text: "Advertise the aggregate to both ISPs, and additionally advertise a /24 only through the ISP you want that traffic to use. Longest-prefix match sends traffic for that /24 through the ISP that advertises it, and the aggregate keeps everything else reachable if that link fails." },
        { title: "Suppress only some components", text: "'summary-only' hides every component. With 'suppress-map' you choose which ones to hide and leave the rest visible.", config: `ip prefix-list INTERNAL-ONLY seq 5 permit 10.10.3.0/24
route-map HIDE permit 10
 match ip address prefix-list INTERNAL-ONLY
router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 suppress-map HIDE` },
        { title: "Anchor the aggregate", text: "An aggregate that depends on a component route can vanish when that component does. A static route to Null0 plus a network statement gives you an aggregate that stays, at the cost of continuing to attract traffic even when nothing behind it is up." },
        { title: "Inspect the discard route", text: "The router installs a discard route (to Null0) for the aggregate it creates, so it does not send packets for unused parts of the summary back out. If you see traffic disappear into a summary, check 'show ip route 10.10.0.0'." }
      ],
      interactions: [
        "ATOMIC_AGGREGATE takes part in no comparison. It is a marker, and it does not change which path is best. What does change routing is the summary itself: the /16 is a different prefix from the /24s.",
        "Longest-prefix match beats best-path selection. Best-path chooses among routes for the same prefix. A /24 advertised somewhere else is used for traffic to that /24 even if your /16 has a better path.",
        "On the lab, EDGE1 summarised and suppressed the /24s, but EDGE2 did not. EDGE2 kept advertising the /24s to ISP-B, and ISP-B passed them to ISP-A. So ISP-A still had a route to the /24, through ISP-B, and traffic for the /24 arrived through ISP-B, not through the summary on ISP-A.",
        "With 'as-set' the aggregate keeps the AS numbers of its components and ATOMIC_AGGREGATE is not set. The trade-off is in the next attribute, AGGREGATOR."
      ],
      edge: [
        "ATOMIC_AGGREGATE is a hint. Receivers may pass it on unchanged and do nothing else with it, and some networks ignore it entirely.",
        "'summary-only' can black-hole traffic during partial failures. If one internal /24 goes down but the aggregate stays up, ISPs still send traffic for the dead /24 to you.",
        "Summaries created without 'as-set' lose AS_PATH detail, which can hide a loop. An as-set restores the detail but makes the aggregate change every time a component's path changes.",
        "An aggregate originated locally has Weight 32768 on the originating router, which is why it always beats the same prefix learned from elsewhere on that router."
      ],
      drill: {
        title: "ISP-A still lists the /24",
        situation: "You summarised the internal /24s into 10.10.0.0/16 with summary-only on EDGE1, so ISP-A would only see the /16. The ISP-A team says they still have a route for 10.10.1.0/24 and that traffic for it reaches you through ISP-B. This is ISP-A's entry for the /24:",
        output: `ISPA-1# show ip bgp 10.10.1.0/24
Paths: (2 available, best #2, table default)
  65100 65002 65000
    198.51.100.2 from 198.51.100.2 (10.255.100.1)
      Origin IGP, localpref 100, valid, external
  65002 65000
    192.0.2.2 from 192.0.2.2 (10.255.2.1)
      Origin IGP, localpref 100, valid, external, best`,
        question: "Where is this /24 coming from, why did summary-only not remove it, and what should you do?",
        hint: "Look at the AS_PATH of each path, and think about EDGE2.",
        answer: [
          "Both paths go through AS 65002 (ISP-B). EDGE2 has the same /24s from CE-LAN via the route reflectors, and it has no aggregate configured, so it advertises them to ISP-B. ISP-B passes them to ISP-A. 'summary-only' on EDGE1 suppresses the /24s only on EDGE1.",
          "Traffic to the /24 matches the more-specific route, so it goes the way the /24 is advertised, through ISP-B, and the /16 is ignored for that traffic. This is longest-prefix match, which is decided before best-path selection.",
          "Configure the same aggregate with summary-only on EDGE2, or put an outbound filter on both edges that advertises only the aggregate. Verify with 'show ip bgp neighbors <isp> advertised-routes' on each edge before you rely on it. If you want some /24s to go through one specific ISP, advertise those on purpose."
        ]
      },
      quiz: [
        { q: "ISP-A has your /16 through EDGE1. Your /24 inside it is advertised through ISP-B. Where does ISP-A send traffic for the /24?", options: ["Through the /16 path", "Through ISP-B, because the /24 is more specific", "It load-balances", "It drops it"], answer: 1, why: "Longest-prefix match is used to forward packets, before any BGP tie-break. The more-specific route wins." },
        { q: "What must exist in the BGP table for an 'aggregate-address' to be created?", options: ["Nothing: it is always created", "At least one more-specific route", "A static route to Null0", "An as-set"], answer: 1, why: "IOS only creates the aggregate while at least one more-specific route is present. If they all disappear, so does the aggregate." },
        { q: "What does 'neighbor x unsuppress-map' do?", options: ["It removes the aggregate", "It leaks selected suppressed components to that one neighbor", "It clears the BGP table", "It removes the ATOMIC_AGGREGATE flag"], answer: 1, why: "The unsuppress-map lists the suppressed routes that should be advertised to that neighbor anyway." },
        { q: "What is a risk of 'summary-only' during a partial failure?", options: ["It resets sessions", "The aggregate keeps attracting traffic for a component that is down", "It changes Local-Pref", "It adds prepends"], answer: 1, why: "As long as any component exists the summary is advertised, so traffic for a failed component still arrives and is dropped." }
      ]
    }
  },

  /* ================================================================ 08 AGGREGATOR */
  "08_aggregator": {
    foundations: {
      theory: [
        "AGGREGATOR is an optional transitive attribute that names who created a summary. It carries two things: the AS number and the router-ID of the router that formed the aggregate. You will see it in 'show ip bgp' as 'aggregated by 65000 10.255.0.11'. It is added automatically whenever a router builds a route with 'aggregate-address'.",
        "Its value is for troubleshooting and accountability. Looking at a summary route in a router on the other side of the Internet, AGGREGATOR tells you which AS built it and which router inside that AS to go and look at. It takes part in no comparison, so it is not a best-path step.",
        "It is transitive, so it travels with the route through every AS the route crosses. Any network that receives the aggregate can see who made it.",
        "AGGREGATOR pairs with two features of 'aggregate-address'. Without 'as-set' the aggregate loses the AS_PATH detail of its components and carries ATOMIC_AGGREGATE (see 07). With 'as-set' the aggregate keeps the AS numbers of its components in an AS_SET, and the ATOMIC_AGGREGATE flag is not set. AGGREGATOR is present in both cases."
      ],
      example: {
        title: "The same summary with as-set: aggregator stays, atomic flag goes",
        text: "Scenario 07 built the aggregate without as-set and ISP-A saw 'atomic-aggregate'. Building it again with as-set (scenario 08), ISP-A still sees who made it, but the flag is gone (captured from the lab):",
        output: `ISPA-1# show ip bgp 10.10.0.0/16
  65000, (aggregated by 65000 10.255.0.11)
    172.16.12.2 from 172.16.12.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, best

EDGE1# show ip bgp 10.10.0.0/16
  Local, (aggregated by 65000 10.255.0.11)
    0.0.0.0 from 0.0.0.0 (10.255.0.11)
      Origin IGP, localpref 100, weight 32768, valid, aggregated, local, best`
      },
      basicConfig: `router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 as-set summary-only`,
      quiz: [
        { q: "What does the AGGREGATOR attribute contain?", options: ["The list of components", "The AS number and router-ID of the router that formed the aggregate", "The next hop of the aggregate", "The number of components"], answer: 1, why: "It identifies the AS and the router that created the summary, shown as 'aggregated by <AS> <router-id>'." },
        { q: "Which keyword makes an aggregate keep the AS numbers of its components?", options: ["summary-only", "as-set", "atomic", "advertise-map"], answer: 1, why: "'as-set' builds an AS_SET from the component AS_PATHs. It is also why ATOMIC_AGGREGATE is not set." },
        { q: "Is AGGREGATOR used to choose the best path?", options: ["Yes, at step 9", "Yes, at step 12", "No: it is informational", "Only for iBGP"], answer: 2, why: "It records who built the aggregate and takes part in no comparison." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Use AGGREGATOR to find the router", text: "When a summary looks wrong, do not guess where it comes from. 'show ip bgp <prefix>' shows 'aggregated by <AS> <router-id>', and the router-ID leads you straight to the device." },
        { title: "Make router-IDs recognisable", text: "AGGREGATOR shows the router-ID, so set it to the loopback address of the router and record it in your inventory. A random router-ID makes the attribute useless to whoever is troubleshooting at 3 a.m.", config: `router bgp 65000
 bgp router-id 10.255.0.11` },
        { title: "Use as-set when you summarise other ASes", text: "If the components come from different ASes, for example subsidiaries with their own AS numbers, use 'as-set' so the aggregate keeps their AS numbers. Without it, those ASes could accept the summary although their own routes are part of it, which defeats loop detection." },
        { title: "Compare the two forms side by side", text: "Run scenarios 07 and 08 one after the other and look at ISP-A. It is the quickest way to see what 'as-set' changes." }
      ],
      exercise: {
        title: "Build the summary with as-set",
        goal: "Create the aggregate with as-set and see that ISP-A can still tell who made it, but the atomic flag is gone.",
        steps: [
          { text: "Baseline. ISP-A has no route for the /16.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "Network not in table", expectText: "'% Network not in table'", hint: "roll back scenario 08 first if it was left applied" },
          { text: "Apply scenario 08. EDGE1 builds the aggregate with as-set and summary-only.", type: "scenario", id: "08_aggregator", mode: "run" },
          { text: "ISP-A now has the /16, and the AGGREGATOR attribute names the AS and router that made it.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "aggregated by 65000 10\\.255\\.0\\.11", expectText: "'aggregated by 65000 10.255.0.11'", hint: "apply the scenario in the previous step and let it finish" },
          { text: "Now look for the flag you saw in the previous exercise. It should not be there.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expectNot: "atomic-aggregate", expectText: "no 'atomic-aggregate' anywhere", hint: "wait a few seconds and run it again" },
          { text: "On EDGE1 the route is marked as an aggregate that it originated itself.", type: "show", device: "EDGE1", cmd: "show ip bgp 10.10.0.0/16", expect: "valid, aggregated, local, best", expectText: "'valid, aggregated, local, best'", hint: "the apply step must have finished" },
          { text: "Roll the change back.", type: "scenario", id: "08_aggregator", mode: "rollback" },
          { text: "ISP-A should have no /16 again.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "Network not in table", expectText: "'% Network not in table'", hint: "wait for the 30 second eBGP advertisement timer and run it again" }
        ],
        selfCheck: [
          "The path on ISP-A is just '65000', with no AS_SET braces. Why, in this lab?",
          "What would the path look like if the components came from two different subsidiary ASes?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Set attributes on the aggregate itself", text: "'attribute-map' lets you set Local-Pref, communities, origin and more on the aggregate route as it is created, without touching the components.", config: `route-map AGG-ATTR permit 10
 set community 65000:100
router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 as-set summary-only attribute-map AGG-ATTR` },
        { title: "as-set also collects communities", text: "With as-set, the aggregate inherits the communities of its component routes. That can be useful (one tag summarises many) and it can be dangerous: a single component tagged no-export makes the whole aggregate no-export and stops it leaving your AS." },
        { title: "Watch the aggregator change", text: "AGGREGATOR reflects the router that currently builds the summary. If a second router builds it after a failover, remote networks see a different value. Alerting on a change of 'aggregated by' is a cheap way to detect that the summary has moved." },
        { title: "Know the 4-byte AS behavior", text: "AGGREGATOR has a two-byte AS field. For four-byte AS numbers, older routers see a placeholder (AS_TRANS, 23456) and the real value is carried in AS4_AGGREGATOR. If you see 23456 in an AGGREGATOR, that is the reason." }
      ],
      interactions: [
        "AGGREGATOR takes part in no comparison. The pair to remember is as-set versus ATOMIC_AGGREGATE: as-set restores the AS detail and removes the flag, while AGGREGATOR is there in both cases.",
        "An AS_SET counts as one hop for AS_PATH length (see 03), however many AS numbers it holds, so as-set does not make the summary look longer than it is.",
        "Because as-set copies the components' AS numbers, routers in those ASes see their own AS in the path and reject the summary, which restores loop detection. This is the main reason to use it when the components are in other ASes.",
        "In this lab the components are all inside AS 65000, so the AS_SET is empty and the path shows a plain '65000'. If the components came from ASes 65010 and 65020, the path would read '65000 {65010,65020}'."
      ],
      edge: [
        "An as-set aggregate changes whenever a component's AS_PATH changes, which can mean many more updates than a plain aggregate. On unstable components, that is a reason not to use as-set.",
        "AGGREGATOR is copied unchanged across ASes. Every network on the path sees the same original aggregator, which is what makes it useful for tracing a summary back to its source.",
        "If two routers build the same aggregate, remote networks see two paths with different AGGREGATOR values. Some designs do this on purpose for redundancy.",
        "The router-ID in AGGREGATOR is whatever the router uses as its BGP router-ID. If someone changes the router-ID, AGGREGATOR changes, even though the router is the same."
      ],
      drill: {
        title: "Three paths to the same summary",
        situation: "Your monitoring shows ISP-A holding three paths to 10.10.0.0/16, all with the same 'aggregated by' value, and one path starts with AS 65100. A colleague asks which of your routers made the summary and whether the extra paths mean something is wrong. This is ISP-A's entry:",
        output: `ISPA-1# show ip bgp 10.10.0.0/16
Paths: (3 available, best #3, table default)
  65100 65002 65000, (aggregated by 65000 10.255.0.11)
    198.51.100.2 from 198.51.100.2 (10.255.100.1)
      Origin IGP, localpref 100, valid, external
  65002 65000, (aggregated by 65000 10.255.0.11)
    192.0.2.2 from 192.0.2.2 (10.255.2.1)
      Origin IGP, localpref 100, valid, external
  65000, (aggregated by 65000 10.255.0.11)
    172.16.12.2 from 172.16.12.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, best`,
        question: "Which router built the aggregate, and are the extra paths a problem?",
        hint: "Match the router-ID to your inventory, then read the AS_PATH of each path from right to left.",
        answer: [
          "The router-ID 10.255.0.11 belongs to EDGE1, which is where the aggregate is configured. All three paths carry the same AGGREGATOR because it is transitive: the value set by the router that built the summary stays with the route as it crosses ISP-B and CONTENT.",
          "The extra paths are not a fault. EDGE2 learned the summary through iBGP and advertised it to ISP-B like any other route. ISP-B passed it to ISP-A, and to CONTENT, which is why ISP-A also has '65002 65000' and '65100 65002 65000'. ISP-A prefers the direct path because it is the shortest.",
          "They do show that the summary is reachable through ISP-B as well. If you meant to send it to ISP-A only, put an outbound filter on the ISP-B session."
        ]
      },
      quiz: [
        { q: "You aggregate routes from AS 65010 and AS 65020 without as-set. What is lost?", options: ["The router-ID", "The AS numbers of the components", "The prefix length", "The next hop"], answer: 1, why: "Without as-set the aggregate carries only your own AS, so the path information of the components is lost." },
        { q: "You use as-set and one component route carries the no-export community. What happens to the aggregate?", options: ["Nothing", "It inherits no-export and is not advertised outside your AS", "It is deleted", "It becomes the best path"], answer: 1, why: "With as-set the aggregate collects the communities of its components, so one no-export component can stop the whole summary leaving your AS." },
        { q: "Which aggregate-address option sets attributes (for example a community) on the aggregate itself?", options: ["summary-only", "suppress-map", "attribute-map", "as-set"], answer: 2, why: "'attribute-map' applies a route-map's 'set' actions to the aggregate route." },
        { q: "Why might an as-set aggregate cause more updates than a plain one?", options: ["It is larger", "It changes whenever a component's AS_PATH changes", "It is sent to iBGP twice", "It resets sessions"], answer: 1, why: "The AS_SET is built from the components' paths, so a change in any component's path changes the aggregate and triggers a new update." }
      ]
    }
  },

/* END BATCH 2 */
});

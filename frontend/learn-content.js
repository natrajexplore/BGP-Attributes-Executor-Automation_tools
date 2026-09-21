/* Learn tab level content, keyed by scenario id. Each attribute has three levels:
   foundations : theory, worked example, basic config, quiz
   practitioner: tactics + a hands-on exercise (read-only show commands and scenario apply/rollback on the lab)
   pro         : tricks, interactions, edge cases, a troubleshooting drill, a quiz
   Exercise step types: {text} | {type:"show", device, cmd, expect?, expectNot?, expectText, hint} | {type:"scenario", id, mode:"run"|"rollback"}
   Router outputs quoted here were captured from the lab (IOS 15.2, c7200). */
window.LEARN_CONTENT = {

  /* ================================================================ 01 WEIGHT */
  "01_weight": {
    foundations: {
      theory: [
        "WEIGHT is the very first tie-breaker. Because it is checked before Local-Pref, AS_PATH, ORIGIN and MED, a higher weight beats all of them: if two paths differ in weight, nothing else is ever compared.",
        "It is not a real BGP attribute. There is no field for it in a BGP update, so it is never sent to any neighbor. The router attaches a weight to a route when it learns it (from a neighbor statement or a route-map), and that number exists only in that router's memory.",
        "Higher is better. Routes learned from neighbors get weight 0 by default. Routes the router originates itself (network, redistribute, aggregate) get weight 32768, which is why a locally originated route normally beats anything learned, unless you give the learned route a weight above 32768.",
        "You set it in one of two ways: 'neighbor X weight N' gives every route from that neighbor the same weight, and 'set weight N' in an inbound route-map lets you choose per prefix. The valid range is 0 to 65535."
      ],
      example: {
        title: "Weight 200 flips EDGE2's choice",
        text: "EDGE2 has an eBGP path to ISP-B and two iBGP paths to ISP-A (one from each route reflector). At baseline everything is equal except that the eBGP path is preferred. After applying weight 200 to iBGP-learned routes, the same table looks like this (captured from the lab):",
        output: `EDGE2# show ip bgp 100.100.100.0/24
Paths: (3 available, best #2, table default)
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, weight 200, valid, internal, best
  65002 65100
    172.16.34.1 from 172.16.34.1 (10.255.2.1)
      Origin IGP, localpref 100, valid, external`
      },
      basicConfig: `router bgp 65000
 neighbor 198.51.100.1 remote-as 64500
 neighbor 198.51.100.1 weight 300      ! every route from this neighbor gets weight 300`,
      quiz: [
        { q: "Which statement about WEIGHT is true?", options: ["It is sent to iBGP peers together with the route", "It is local to the router and never advertised to any neighbor", "The lowest weight is preferred", "It is only used on eBGP sessions"], answer: 1, why: "Weight is a Cisco-local value that is not part of the BGP update, so no other router can ever see it. Higher weight wins." },
        { q: "Path A (eBGP) has Local-Pref 300 and weight 0. Path B (iBGP) has Local-Pref 100 and weight 50. Which does the router pick?", options: ["Path A, because Local-Pref is 300", "Path B, because weight is checked before Local-Pref", "Neither: they are compared by AS_PATH", "It load-balances across both"], answer: 1, why: "Weight is step 1 and Local-Pref is step 2. The first step that separates the paths decides, so weight 50 beats weight 0 before Local-Pref is even looked at." },
        { q: "What weight does a route created by a 'network' statement on this router carry by default?", options: ["0", "100", "32768", "65535"], answer: 2, why: "Locally originated routes get weight 32768. That is why they beat learned routes (weight 0) at the very first step." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Whole neighbor or per prefix", text: "Use 'neighbor X weight N' when every route from a neighbor should be preferred. Use a route-map with a prefix-list when only some destinations should be, for example only your SaaS ranges going out through the local ISP.", config: `ip prefix-list SAAS seq 5 permit 100.100.100.0/24
route-map LOCAL-ISP-IN permit 10
 match ip address prefix-list SAAS
 set weight 300
route-map LOCAL-ISP-IN permit 20     ! keep everything else, at default weight
router bgp 65000
 neighbor 198.51.100.1 route-map LOCAL-ISP-IN in` },
        { title: "Apply a weight change without resetting the session", text: "Weight is applied when a route is received, so changing the route-map does not touch routes already in the table until you refresh them. A soft inbound clear re-applies the policy without dropping the session.", config: `clear ip bgp 198.51.100.1 soft in` },
        { title: "Keep a list of where weight is set", text: "No other router shows a weight, so the only place to find it is that router's own configuration. Keep a short table of which routers have weight policy and why, and check it before troubleshooting an unexpected exit." }
      ],
      exercise: {
        title: "Watch a router-local setting change one router's choice",
        goal: "Apply weight 200 to iBGP-learned routes on EDGE2 and see that EDGE2 changes its best path, while the route reflector never sees the weight.",
        steps: [
          { text: "Baseline. EDGE2 has its own eBGP path to ISP-B and two iBGP paths via ISP-A. Look at which one is marked best.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expect: "external, best", expectText: "the eBGP path (172.16.34.1, ISP-B) is marked 'external, best'", hint: "run the scenario rollback first, then try again" },
          { text: "Apply scenario 01. It puts a route-map on EDGE2 that sets weight 200 on everything learned from the two route reflectors.", type: "scenario", id: "01_weight", mode: "run" },
          { text: "Look at EDGE2 again. The iBGP paths now carry the weight and one of them is best.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expect: "weight 200[^\\n]*internal, best", expectText: "'weight 200 ... internal, best' on an iBGP path", hint: "apply the scenario in the previous step and wait for it to finish" },
          { text: "Now check a different router. The weight is local to EDGE2, so the route reflector must not show it anywhere.", type: "show", device: "CORE-RR1", cmd: "show ip bgp 100.100.100.0/24", expectNot: "weight 200", expectText: "no 'weight' in any path line", hint: "if weight 200 appears here, something other than the scenario configured it" },
          { text: "Roll the change back.", type: "scenario", id: "01_weight", mode: "rollback" },
          { text: "Confirm EDGE2 is back to preferring its own eBGP path.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expect: "external, best", expectText: "the eBGP path is 'external, best' again", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "Which step of best-path selection made EDGE2 switch, and why did AS_PATH and Local-Pref not matter?",
          "Why can you not see 'weight 200' on CORE-RR1, and what does that mean for how you would audit weight in production?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Test a path preference on one router first", text: "Because weight cannot leak, you can trial a routing preference on a single edge without touching the rest of the AS. If it does what you want, promote it to Local-Pref so the whole AS follows it. If it does not, the blast radius was one router." },
        { title: "Make a learned route beat a locally originated one", text: "Locally originated routes have weight 32768, so a learned route with a lower weight loses to them at step 1. If a branch must prefer a learned default route over a locally created one, the learned route needs a weight above 32768.", config: `route-map PREFER-LEARNED permit 10
 set weight 40000` },
        { title: "Send only chosen destinations out of the local ISP", text: "Combine weight with a prefix-list or AS-path filter so a branch breaks out locally only for the destinations that make sense (SaaS, CDN ranges) and uses the WAN path to HQ for everything else. Everything else stays at the default weight." }
      ],
      interactions: [
        "Weight beats every other attribute. A stray weight silently overrides Local-Pref policy that the rest of the AS follows, which is the classic cause of 'this one router exits the wrong way'.",
        "Weight does not stay local in its effects. Once the router prefers a different path, it advertises that different path onwards. On the lab, weight 200 on EDGE2 made CORE-RR1's table drop from three paths to two: EDGE2 now preferred the iBGP path, so it stopped advertising its own ISP-B path into iBGP.",
        "It also interacts with next-hop reachability: a path with an unreachable next-hop is excluded before weight is even considered."
      ],
      edge: [
        "Weight 0 is not 'disabled'. It is the default for learned routes and the route is still fully valid.",
        "Changing a route-map that sets weight does nothing to routes already in the table until you run a soft inbound clear (or the routes are re-learned).",
        "Weight is Cisco-specific. It is not in the BGP standard, so it disappears from any design you move to another platform. If the preference has to be portable or AS-wide, use Local-Pref.",
        "Be careful with the side effect above: a router that prefers the iBGP path no longer advertises its own external path, so the rest of the AS loses that alternative and fast failover through it."
      ],
      drill: {
        title: "Everything from the branch goes to ISP-A",
        situation: "After a change window, all traffic from the EDGE2 site to 100.100.100.0/24 goes out through ISP-A although ISP-B is the intended primary for this site. Local-Pref is the default 100 everywhere and nobody admits to touching BGP policy. You look at EDGE2:",
        output: `EDGE2# show ip bgp 100.100.100.0/24
Paths: (3 available, best #2, table default)
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.2 (10.255.0.2)
      Origin IGP, metric 0, localpref 100, weight 200, valid, internal
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, weight 200, valid, internal, best
  65002 65100
    172.16.34.1 from 172.16.34.1 (10.255.2.1)
      Origin IGP, localpref 100, valid, external`,
        question: "Why is EDGE2 sending traffic to ISP-A, what else has quietly changed, and how do you fix it?",
        hint: "Compare the attribute line of each path, not only the AS_PATH. Then think about what EDGE2 now advertises to the route reflectors.",
        answer: [
          "The iBGP paths carry weight 200 and the eBGP path has the default 0. Weight is step 1, so it decided before Local-Pref, AS_PATH or anything else. A route-map on EDGE2 that sets weight on routes from the route reflectors is the likely cause: find it with 'show running-config | section router bgp' and 'show route-map'.",
          "The hidden side effect: because EDGE2 now prefers the iBGP path, it no longer advertises its own ISP-B path into iBGP. The route reflectors are down to two paths (both via ISP-A), so if ISP-A fails, the rest of the AS has no alternative from EDGE2 until it re-converges.",
          "Fix: remove the weight from the inbound route-map (or the route-map itself) and run 'clear ip bgp * soft in'. If the intent was to prefer ISP-A, set Local-Pref on the edge that learns it, so the whole AS agrees and the alternative is still advertised."
        ]
      },
      quiz: [
        { q: "EDGE2 sets weight 200 on all iBGP-learned routes. What happens to EDGE2's own ISP-B path in the rest of the AS?", options: ["Nothing: it is still advertised to the route reflectors", "EDGE2 stops advertising it into iBGP because it is no longer its best path", "Every other router also gets weight 200 for it", "The route reflectors mark it as inaccessible"], answer: 1, why: "A BGP router advertises only its best path. Once EDGE2 prefers the iBGP path, its ISP-B path is no longer the best, so it is withdrawn from iBGP. This was visible on the lab: CORE-RR1 dropped from three paths to two." },
        { q: "A learned route has weight 5000. The same prefix is originated locally by an aggregate-address on this router. Which wins?", options: ["The learned route, because 5000 is a high weight", "The local route, because it defaults to weight 32768", "They tie and the router-ID decides", "The one with the shorter AS_PATH"], answer: 1, why: "Locally originated routes default to 32768, which is higher than 5000. To make the learned route win you need a weight above 32768." },
        { q: "You edit the route-map that sets weight on a neighbor. Existing routes still show the old weight. What is the cleanest fix?", options: ["Reload the router", "clear ip bgp <neighbor> soft in", "Wait: weight is refreshed every 60 seconds", "Remove and re-add the neighbor"], answer: 1, why: "A soft inbound clear re-applies the inbound policy to the routes already received, without resetting the session." },
        { q: "You need a routing preference that the whole AS follows. Is weight the right tool?", options: ["Yes, weight is advertised in iBGP", "No: use Local-Pref, because weight is never advertised", "Yes, but only with route reflectors", "No: use ORIGIN"], answer: 1, why: "Weight only affects the router it is configured on. Local-Pref travels in iBGP, so every router in the AS applies the same preference." }
      ]
    }
  },

  /* ================================================================ 02 LOCAL_PREF */
  "02_local_pref": {
    foundations: {
      theory: [
        "LOCAL_PREF is a number carried inside your own AS. It answers the question 'which exit should the whole AS prefer?'. Higher is better and the default is 100. It is step 2 of best-path selection, right after weight.",
        "It is only sent to iBGP peers. When a route leaves your AS over eBGP, Local-Pref is removed, and the neighbor AS assigns its own value. That is why Local-Pref controls how traffic leaves your network, not how it enters.",
        "The normal pattern: set it inbound, on the edge router that learns the route from the ISP. iBGP then carries the value to every other router, so all of them agree on the exit without any per-router configuration.",
        "Compare with weight: weight is one router's private opinion, Local-Pref is the AS-wide policy. Use weight for exceptions and Local-Pref for the rule."
      ],
      example: {
        title: "One setting, every router follows",
        text: "Setting Local-Pref 200 on routes learned from ISP-A at EDGE1 changes what a router two hops away sees. CE-LAN, which has no direct ISP link, before and after (captured from the lab):",
        output: `CE-LAN# show ip bgp 100.100.100.0/24        ! before
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best

CE-LAN# show ip bgp 100.100.100.0/24        ! after
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 200, valid, internal, best`
      },
      basicConfig: `route-map ISPA-IN permit 10
 set local-preference 200
router bgp 65000
 neighbor 172.16.12.1 remote-as 65001
 neighbor 172.16.12.1 route-map ISPA-IN in`,
      quiz: [
        { q: "Where is LOCAL_PREF sent?", options: ["To eBGP and iBGP peers", "Only to iBGP peers inside the AS", "Only to eBGP peers", "Nowhere: it is local to one router"], answer: 1, why: "Local-Pref travels in iBGP updates and is stripped on eBGP. That is what makes it an AS-wide policy, and why it cannot influence another AS." },
        { q: "Which Local-Pref is preferred, and what is the default?", options: ["Lower, default 0", "Lower, default 100", "Higher, default 100", "Higher, default 32768"], answer: 2, why: "Higher wins and the default is 100." },
        { q: "You want every router in your AS to prefer ISP-A. Where do you set Local-Pref?", options: ["On every router in the AS", "On the edge router that learns the ISP-A routes, inbound", "On ISP-A's router", "On the route reflector's outbound"], answer: 1, why: "Set it once, inbound, where the route enters the AS. iBGP carries the value to everyone else." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Leave gaps between values", text: "Use 200 for the primary, 150 for a secondary and 100 for the rest, not 101, 102, 103. Gaps let you slot in a new policy later without renumbering everything." },
        { title: "Set it where the route enters", text: "Put the route-map on the inbound side of the ISP neighbor at the edge router. The intent then sits next to the ISP configuration where the next engineer will look for it, rather than being hidden in a route reflector policy." },
        { title: "Split traffic by destination, not by ISP", text: "To use both links, prefer ISP-A for some prefixes and ISP-B for others with a prefix-list per ISP, instead of picking one primary for everything.", config: `ip prefix-list VIA-A seq 5 permit 100.100.100.0/24
route-map ISPA-IN permit 10
 match ip address prefix-list VIA-A
 set local-preference 200
route-map ISPA-IN permit 20              ! all other routes stay at 100` }
      ],
      exercise: {
        title: "Set the exit for the whole AS in one place",
        goal: "Apply Local-Pref 200 for ISP-A routes at EDGE1 and watch a router with no ISP link, and a router with its own competing ISP link, both follow it.",
        steps: [
          { text: "Baseline. CE-LAN has no ISP connection. All it sees is what iBGP gives it: default Local-Pref.", type: "show", device: "CE-LAN", cmd: "show ip bgp 100.100.100.0/24", expect: "localpref 100", expectText: "'localpref 100' on the path", hint: "roll back scenario 02 first if it was left applied" },
          { text: "Apply scenario 02. It sets Local-Pref 200 inbound from ISP-A on EDGE1.", type: "scenario", id: "02_local_pref", mode: "run" },
          { text: "CE-LAN now sees Local-Pref 200 even though it never talked to ISP-A. This is iBGP carrying the value.", type: "show", device: "CE-LAN", cmd: "show ip bgp 100.100.100.0/24", expect: "localpref 200, valid, internal, best", expectText: "'localpref 200, valid, internal, best'", hint: "wait for the apply step to finish, then run again" },
          { text: "Now EDGE2, which has its own direct eBGP path to ISP-B. Normally eBGP beats iBGP (step 7), but Local-Pref is step 2, so the iBGP path via EDGE1 should win.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expect: "localpref 200, valid, internal, best", expectText: "the iBGP path with localpref 200 is best, not EDGE2's own eBGP path", hint: "the apply step must have completed" },
          { text: "Check that Local-Pref did not leak to another AS. ISPB-1 must not see 200 on any path.", type: "show", device: "ISPB-1", cmd: "show ip bgp 100.100.100.0/24", expectNot: "localpref 200", expectText: "no path with 'localpref 200': eBGP strips it", hint: "if 200 appears, another router in the lab has a stray policy" },
          { text: "Roll the change back.", type: "scenario", id: "02_local_pref", mode: "rollback" },
          { text: "Confirm the AS is back to the default.", type: "show", device: "CE-LAN", cmd: "show ip bgp 100.100.100.0/24", expect: "localpref 100", expectText: "'localpref 100' again", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "Why did EDGE2 stop using its own eBGP path, when eBGP normally beats iBGP?",
          "You set the value on EDGE1 only. How did CE-LAN learn it, and what would you change if you wanted to affect how ISP-B sends traffic to you?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Let the ISP set its Local-Pref for you", text: "Most ISPs publish communities that set the Local-Pref they give your routes, for example 'lower than customer routes' for a backup link. That is how you influence how traffic reaches you, even though your own Local-Pref cannot leave your AS. Check your ISP's community list and tag the routes you advertise to it (see 09 COMMUNITY)." },
        { title: "Lower the backup rather than raise the primary", text: "Set the primary to the default and the backup below it (for example 80) when your policy allows it. A new neighbor added later with no policy then lands at 100, level with the primary, instead of accidentally outranking it." },
        { title: "Use bgp default local-preference as a coarse switch", text: "'bgp default local-preference N' sets the value for everything the router originates or learns from eBGP without a route-map. It is a fast way to push a whole router below or above the rest of the AS during a migration.", config: `router bgp 65000
 bgp default local-preference 150` }
      ],
      interactions: [
        "Only weight beats Local-Pref. It is compared before AS_PATH length, ORIGIN, MED, the eBGP-over-iBGP preference, IGP metric and router-ID, so once Local-Pref differs none of those matter. That is why EDGE2 abandons its own eBGP path in the exercise.",
        "It affects outbound traffic only. To influence how other networks send traffic to you, use AS_PATH prepending, MED (for a neighbor AS with several links) or ISP communities.",
        "On the lab, Local-Pref 200 at EDGE1 made EDGE2 prefer the iBGP path. EDGE2 then advertised that best path to ISP-B, so ISPB-1 received the content prefix as '65000 65001 65100': the enterprise had become a transit network between the two ISPs.",
        "Route reflectors pass Local-Pref along unchanged, but a route-map on a reflector that sets it will overwrite whatever the edge decided."
      ],
      edge: [
        "Local-Pref is a preference, not an exclusive choice. If the preferred exit disappears, the next-best path takes over automatically, which is the point of using it for primary and backup.",
        "A policy change moves live traffic as soon as it is applied. On a busy link, roll it out prefix by prefix rather than to every route at once.",
        "Changing the value needs 'clear ip bgp * soft in' (or a route refresh) to be applied to routes that are already in the table.",
        "Do not mix a route-map on the edge with a different one on the reflectors for the same routes. The last one to apply wins and the result is hard to trace."
      ],
      drill: {
        title: "ISP-B can reach content through you",
        situation: "After raising Local-Pref for ISP-A to 200 on EDGE1, the network team notices that ISP-B now lists your AS on a path to a content network it also reaches directly. This is ISPB-1's table entry for the content prefix:",
        output: `ISPB-1# show ip bgp 100.100.100.0/24
  65000 65001 65100
    172.16.34.2 from 172.16.34.2 (10.255.0.12)
      Origin IGP, localpref 100, valid, external
  65001 65100
    192.0.2.1 from 192.0.2.1 (10.255.1.1)
      Origin IGP, localpref 100, valid, external
  65100
    203.0.113.2 from 203.0.113.2 (10.255.100.1)
      Origin IGP, metric 0, localpref 100, valid, external, best`,
        question: "What caused the first path (via 65000), and how should the edge routers be configured so it cannot happen?",
        hint: "Which path does EDGE2 now consider best, and what does a BGP router do with its best path towards an eBGP neighbor?",
        answer: [
          "EDGE2 now prefers the iBGP path via EDGE1, because Local-Pref 200 beats 'eBGP over iBGP'. A BGP router advertises its best path to its eBGP peers, so EDGE2 advertised a route it learned from ISP-A to ISP-B with your ASN in front. Your AS has become transit between two ISPs, with your link capacity and your firewalls in the path.",
          "Prevention: an outbound policy on every eBGP neighbor that permits only your own prefixes (a prefix-list or an AS-path filter that matches routes originated in AS 65000) and denies everything else. This should exist before any Local-Pref change, not after.",
          "Example on both edges: 'ip prefix-list MINE permit 10.10.0.0/16 le 24' plus 'route-map TO-ISP permit 10 / match ip address prefix-list MINE' applied with 'neighbor <isp> route-map TO-ISP out'."
        ]
      },
      quiz: [
        { q: "EDGE2 has an eBGP path (Local-Pref 100) and an iBGP path (Local-Pref 200). Which does it choose, and why?", options: ["The eBGP path, because eBGP beats iBGP", "The iBGP path, because Local-Pref (step 2) is compared before eBGP-over-iBGP (step 7)", "The eBGP path, because it is older", "It load-balances"], answer: 1, why: "Best-path selection stops at the first step that separates the paths. Local-Pref differs at step 2, so steps 3 to 12 never run." },
        { q: "You want an upstream AS to send return traffic to you over link B. Is Local-Pref the right tool?", options: ["Yes: Local-Pref is sent to the neighbor", "No: it never leaves your AS. Use AS_PATH prepending, MED or an ISP community", "Yes, but only with route reflectors", "No: use weight"], answer: 1, why: "Your Local-Pref is stripped on eBGP and controls only how you leave your network. Inbound traffic engineering needs attributes the neighbor actually sees." },
        { q: "On ISPB-1, what Local-Pref shows for the paths it learned from your AS?", options: ["Your value, 200", "ISPB-1's own value (100 by default)", "0", "It is hidden"], answer: 1, why: "eBGP strips Local-Pref, and the receiving AS assigns its own, 100 by default. The exercise checks exactly this." },
        { q: "You raised Local-Pref for ISP-A on one edge and ISP-B now sees a path through your AS. Which change prevents it?", options: ["Lower Local-Pref again", "An outbound filter on every eBGP neighbor that advertises only your own prefixes", "Set weight on ISPB-1", "Enable route reflection"], answer: 1, why: "The root cause is that a best path learned from one ISP can be advertised to the other. An outbound filter that permits only your prefixes closes that for every future policy change too." }
      ]
    }
  }
};

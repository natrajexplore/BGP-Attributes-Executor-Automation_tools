/* Learn content, batch 1: 03 AS_PATH, 04 ORIGIN, 05 MED. Same format as learn-content.js.
   Router outputs quoted here were captured from the lab (IOS 15.2, c7200). */
Object.assign(window.LEARN_CONTENT, {

  /* ================================================================ 03 AS_PATH */
  "03_as_path": {
    foundations: {
      theory: [
        "AS_PATH is the ordered list of autonomous systems a route has passed through. Every AS adds its own number to the front when it advertises the route over eBGP. Read it left to right: the leftmost number is the neighbor that sent you the route, the rightmost is the AS that originated it. '65002 65001 65000' means origin 65000, then 65001, then 65002, then you.",
        "It has two jobs. First, loop prevention: a router rejects any route whose AS_PATH already contains its own AS number, because the route has been through its network before. Second, path length is a tie-breaker (step 4): after Weight, Local-Pref and locally originated, the shorter AS_PATH wins.",
        "Length is the number of AS numbers in the list. An AS_SET (a curly-brace group, see 08 AGGREGATOR) counts as one, however many numbers are inside it.",
        "Because it travels across the whole Internet and grows by one at each AS, AS_PATH is the classic tool for influencing inbound traffic. You cannot set another network's Local-Pref, but you can make one of your paths look longer, so networks that compare path length choose the other. Adding your own AS number extra times on purpose is called prepending."
      ],
      example: {
        title: "Prepending moves a remote network to the other ISP",
        text: "CONTENT reaches the enterprise prefix through both ISPs, and at baseline both paths are two hops long. After EDGE2 prepends its AS number three extra times toward ISP-B, CONTENT sees a three-hop path via ISP-B and a two-hop path via ISP-A. The result, captured from the lab:",
        output: `CONTENT# show ip bgp 10.10.0.0/24
  65001 65000
    198.51.100.1 from 198.51.100.1 (10.255.1.1)
      Origin IGP, localpref 100, valid, external, best
  65002 65001 65000
    203.0.113.1 from 203.0.113.1 (10.255.2.1)
      Origin IGP, localpref 100, valid, external`
      },
      basicConfig: `route-map PREPEND-OUT permit 10
 set as-path prepend 65000 65000 65000     ! your own AS, repeated
router bgp 65000
 neighbor 172.16.34.1 route-map PREPEND-OUT out`,
      quiz: [
        { q: "A router shows the AS_PATH '65002 65001 65000'. Which AS originated the prefix?", options: ["65002", "65001", "65000", "You cannot tell"], answer: 2, why: "Each AS adds itself at the front, so the rightmost number is the origin. The leftmost is the neighbor the route came from." },
        { q: "How does a router use AS_PATH to prevent loops?", options: ["It rejects routes that already contain its own AS number", "It drops any path longer than 10 hops", "It only accepts paths from directly connected ASes", "It sorts paths alphabetically"], answer: 0, why: "If its own AS number is in the path, the route has already been through its network, so accepting it would create a loop." },
        { q: "Two paths tie on Weight, Local-Pref and origin type. Path A is '65001 65000', path B is '65002 65001 65000'. Which wins?", options: ["Path A, because it is shorter", "Path B, because it is longer and so more reliable", "They tie", "The one with the lower AS numbers"], answer: 0, why: "At step 4 the shorter AS_PATH wins. Path A has 2 ASes, path B has 3." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Prepend outbound, on the link you want to be the backup", text: "The prepend goes in an outbound route-map on the neighbor you want other networks to use less. Only routes advertised through that neighbor get longer, so the other link is untouched." },
        { title: "Start small and measure", text: "One or two prepends is often enough. Each prepend adds one hop, and whether that changes anything depends on how the remote networks see your two paths. Add one, look at the result from the other side (a looking glass or the ISP's router), and only then add more." },
        { title: "Split your prefixes across both ISPs", text: "Instead of making one whole link a backup, prepend some prefixes on link A and other prefixes on link B, so both links carry inbound traffic and each protects the other.", config: `ip prefix-list HALF-A seq 5 permit 10.10.0.0/24
ip prefix-list HALF-A seq 10 permit 10.10.1.0/24
route-map TO-ISPB permit 10
 match ip address prefix-list HALF-A
 set as-path prepend 65000 65000       ! these prefixes prefer ISP-A
route-map TO-ISPB permit 20             ! everything else unchanged` },
        { title: "Re-advertise after a change", text: "Outbound policy is applied when routes are sent. After you edit the route-map, a soft outbound clear sends the updates again without dropping the session.", config: `clear ip bgp 172.16.34.1 soft out` }
      ],
      exercise: {
        title: "Push inbound traffic to the other ISP",
        goal: "Prepend on the EDGE2 to ISP-B link and watch ISP-B's own best path and CONTENT's best path move to ISP-A.",
        steps: [
          { text: "Baseline. ISP-B has a direct one-hop path to the enterprise prefix (just AS 65000) and a longer one through ISP-A. Its direct path should be best.", type: "show", device: "ISPB-1", cmd: "show ip bgp 10.10.0.0/24", expect: "^\\s*65000\\s*\\n.*\\n.*best", expectText: "the one-hop path '65000' is marked best", hint: "roll back scenario 03 first if it was left applied" },
          { text: "Apply scenario 03. EDGE2 now prepends 65000 three extra times on everything it advertises to ISP-B.", type: "scenario", id: "03_as_path", mode: "run" },
          { text: "Look at ISP-B again. The path over its direct link is now four hops long. Compare it with the path through ISP-A.", type: "show", device: "ISPB-1", cmd: "show ip bgp 10.10.0.0/24", expect: "65000 65000 65000 65000", expectText: "a path '65000 65000 65000 65000' (your AS four times)", hint: "apply the scenario in the previous step and let it finish" },
          { text: "ISP-B's best path has moved. Find the one marked best.", type: "show", device: "ISPB-1", cmd: "show ip bgp 10.10.0.0/24", expect: "^\\s*65001 65000\\s*\\n.*\\n.*best", expectText: "'65001 65000' (via ISP-A) is now the best path", hint: "wait a few seconds and run it again" },
          { text: "Now the remote network. CONTENT should choose the two-hop path through ISP-A.", type: "show", device: "CONTENT", cmd: "show ip bgp 10.10.0.0/24", expect: "^\\s*65001 65000\\s*\\n.*\\n.*best", expectText: "'65001 65000' is best on CONTENT", hint: "the apply step must have finished" },
          { text: "Roll the change back.", type: "scenario", id: "03_as_path", mode: "rollback" },
          { text: "ISP-B should prefer its direct link again.", type: "show", device: "ISPB-1", cmd: "show ip bgp 10.10.0.0/24", expect: "^\\s*65000\\s*\\n.*\\n.*best", expectText: "the one-hop path is best again", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "ISP-B is your provider, yet its own traffic now goes through ISP-A. Why, and is that what you wanted?",
          "How many prepends would have been enough to make ISP-B's direct path equal in length to the path through ISP-A?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Prepend only your own AS number", text: "Adding an AS number that is not yours is called AS-path poisoning. Some networks do it deliberately, but many ISPs filter it and it can cause route rejection in other networks. For traffic engineering, repeat your own number." },
        { title: "Use your ISP's communities to prepend further away", text: "A prepend you add is seen by your direct neighbor and everyone beyond it, but it only helps where paths are compared. Many ISPs publish communities such as 'prepend twice towards your peers' that make the ISP add the prepends itself, in the places you cannot reach. Check the ISP's community list (see 09 COMMUNITY)." },
        { title: "Advertise only what you originate", text: "An AS-path filter that matches an empty path (routes that start in your own AS) stops you becoming a transit network by accident. This is the safety net that should exist before any traffic-engineering change.", config: `ip as-path access-list 10 permit ^$
route-map TO-ISP permit 10
 match as-path 10
router bgp 65000
 neighbor 172.16.34.1 route-map TO-ISP out` },
        { title: "Strip private AS numbers towards the Internet", text: "If you use private AS numbers inside (64512 to 65534) they should not leak. 'remove-private-as' removes them from the path you send out.", config: `router bgp 65000
 neighbor 172.16.34.1 remove-private-as` }
      ],
      interactions: [
        "AS_PATH is step 4. Weight, Local-Pref and locally originated beat it, and it beats ORIGIN, MED and every step after. Two paths that differ in Local-Pref are never compared by length.",
        "Prepending fails silently when the receiving network sets Local-Pref by relationship. ISPs commonly give customer routes a higher Local-Pref than peer routes. If ISP-B prefers your route because you are its customer, no number of prepends changes ISP-B's choice, because Local-Pref is decided before AS_PATH length.",
        "On the lab, prepending on the ISP-B link did two things. It moved CONTENT to ISP-A, as intended, and it also made ISPB-1 itself prefer to reach you through ISP-A, so the direct link became a pure backup.",
        "It steers inbound traffic only. How your own traffic leaves is decided by Weight and Local-Pref, which prepending does not touch."
      ],
      edge: [
        "An AS_SET counts as one hop however many numbers it contains, and confederation segments are not counted, so the visible length can differ from the number of ASes.",
        "'bgp bestpath as-path ignore' removes step 4 completely. If you see 'wrong' path choices in a network, check whether it is configured.",
        "Prepending is coarse. It shifts traffic only where the two path lengths were close, and networks far away whose paths already differ by several hops may not move at all.",
        "A new prepend applies to routes as they are advertised. Use 'clear ip bgp <neighbor> soft out' to send the change without resetting the session."
      ],
      drill: {
        title: "ISP-B's direct link went quiet",
        situation: "After adding outbound prepends toward ISP-B on EDGE2, the ISP-B network team reports that the direct link to you is idle, and their traffic to your prefix now goes through ISP-A. This is ISP-B's table entry for your prefix:",
        output: `ISPB-1# show ip bgp 10.10.0.0/24
Paths: (3 available, best #2, table default)
  65100 65001 65000
    203.0.113.2 from 203.0.113.2 (10.255.100.1)
      Origin IGP, localpref 100, valid, external
  65001 65000
    192.0.2.1 from 192.0.2.1 (10.255.1.1)
      Origin IGP, localpref 100, valid, external, best
  65000 65000 65000 65000
    172.16.34.2 from 172.16.34.2 (10.255.0.12)
      Origin IGP, localpref 100, valid, external`,
        question: "Is something broken? Which attribute explains it, and how should you choose the number of prepends?",
        hint: "Count the AS numbers in each path, and remember that ISP-B compares its own alternatives.",
        answer: [
          "Nothing is broken. All three paths have the same Local-Pref, so ISP-B decides on AS_PATH length. The direct link now offers a four-hop path (your AS four times) while the path through ISP-A is two hops, so the shorter one wins. The prepends did what they were told, and they also affected ISP-B's own traffic, not just traffic from the rest of the Internet.",
          "The number of prepends should be chosen from the alternative paths the remote network actually has, not picked as a round number. With one prepend the direct path would be two hops, level with the path through ISP-A, and later steps would decide. You need one more to be sure it loses.",
          "Check from ISP-B's or another network's looking glass before and after, reduce the count if the effect is bigger than intended, and re-advertise with 'clear ip bgp 172.16.34.1 soft out'."
        ]
      },
      quiz: [
        { q: "You prepend three times toward ISP-B. Whose traffic does that influence?", options: ["Traffic that leaves your network", "Traffic that enters your network from other networks", "Both directions", "Only traffic between your two edges"], answer: 1, why: "Prepending changes the path length other networks see, so it influences how they send traffic to you. Your outbound traffic is decided by Weight and Local-Pref." },
        { q: "ISP-B gives routes from customers Local-Pref 200 and routes from peers 100. You prepend heavily toward ISP-B to push its traffic to ISP-A. What happens?", options: ["ISP-B moves its traffic to ISP-A", "Nothing changes: Local-Pref is decided before AS_PATH length", "ISP-B drops your route", "ISP-B load-balances"], answer: 1, why: "Local-Pref (step 2) is compared before AS_PATH length (step 4). If the customer route has the higher Local-Pref, it wins however long the path is." },
        { q: "You edit the outbound route-map that sets the prepend. What is the cleanest way to send the change to the neighbor?", options: ["Reload the router", "clear ip bgp <neighbor> soft out", "clear ip bgp <neighbor> soft in", "Wait 24 hours"], answer: 1, why: "Outbound policy is applied on advertisement, so a soft outbound clear re-sends the updates without resetting the session." },
        { q: "Which AS-path filter permits only routes that start in your own AS?", options: ["ip as-path access-list 10 permit ^$", "ip as-path access-list 10 permit .*", "ip as-path access-list 10 deny ^$", "ip as-path access-list 10 permit _65000_"], answer: 0, why: "^$ matches an empty AS_PATH, which is what a route has before it leaves your AS. It stops you advertising routes learned from one ISP to the other." }
      ]
    }
  },

  /* ================================================================ 04 ORIGIN */
  "04_origin": {
    foundations: {
      theory: [
        "ORIGIN records how a route first entered BGP at the AS that created it. There are three values: 'i' (IGP) for a route created with a network statement, 'e' (EGP) for a route from the old EGP protocol, and '?' (incomplete) for a route that was redistributed from another protocol. It is a well-known mandatory attribute, so every route has one, and it travels with the route across AS boundaries.",
        "In best-path selection ORIGIN is step 5: i beats e, and e beats ?. The idea is that a route you explicitly declared with 'network' is more trustworthy than one that arrived through redistribution, where a leaked or unintended route is easy to create.",
        "In practice you meet '?' all the time, because 'redistribute static' or 'redistribute ospf' into BGP produces it, and you almost never meet 'e' because EGP is obsolete. Because ORIGIN sits below Weight, Local-Pref and AS_PATH length, it only matters when those tie, which is exactly the situation with two similar ISPs.",
        "You can also set it yourself in a route-map with 'set origin', which makes it a small, low-priority lever for demoting a path without touching Local-Pref."
      ],
      example: {
        title: "An incomplete origin demotes a path with everything else equal",
        text: "EDGE1 has a link to ISP-A and hears the same prefix through iBGP from EDGE2, which learned it from ISP-B. Both paths are two ASes long, so at baseline EDGE1 prefers its own eBGP path. After a route-map sets ORIGIN incomplete on the ISP-A path, EDGE1 switches (captured from the lab):",
        output: `EDGE1# show ip bgp 100.100.100.0/24
  65002 65100
    10.255.0.12 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
  65001 65100
    172.16.12.1 from 172.16.12.1 (10.255.1.1)
      Origin incomplete, localpref 100, valid, external`
      },
      basicConfig: `router bgp 65000
 network 10.10.0.0 mask 255.255.0.0     ! ORIGIN = i (IGP)
 redistribute static                    ! ORIGIN = ? (incomplete)`,
      quiz: [
        { q: "Which configuration creates a BGP route with ORIGIN incomplete (?)?", options: ["A 'network' statement", "'redistribute static' or 'redistribute ospf'", "'neighbor x remote-as'", "'aggregate-address'"], answer: 1, why: "Redistribution from another routing source produces ORIGIN incomplete. A network statement produces IGP (i)." },
        { q: "Put the ORIGIN values in order, most preferred first.", options: ["? then e then i", "i then e then ?", "e then i then ?", "They are all equal"], answer: 1, why: "IGP (i) is preferred to EGP (e), which is preferred to incomplete (?)." },
        { q: "Two paths tie on Weight, Local-Pref and AS_PATH length. Path A has ORIGIN ?, path B has ORIGIN i. Which wins?", options: ["Path A", "Path B", "They tie", "The older one"], answer: 1, why: "ORIGIN is step 5, and i beats ?. Path B wins." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Use 'network' for what you own, redistribute only with a filter", text: "A network statement is explicit and gives ORIGIN i. If you must redistribute, put a route-map with a prefix-list on it so only the prefixes you mean to advertise leave the AS." },
        { title: "Normalise redistributed routes", text: "Routes redistributed into BGP carry ORIGIN ?, so they lose to any competing route with ORIGIN i. If they should compete on equal terms, reset the origin as you redistribute.", config: `ip prefix-list OURS seq 5 permit 10.10.0.0/16 le 24
route-map REDIST-STATIC permit 10
 match ip address prefix-list OURS
 set origin igp
router bgp 65000
 redistribute static route-map REDIST-STATIC` },
        { title: "Demote a backup path softly", text: "Setting ORIGIN incomplete on a backup path only breaks ties, so it is a gentle way to prefer one path when Local-Pref and AS_PATH are equal. It does nothing if the paths differ at an earlier step, so it cannot replace Local-Pref." },
        { title: "Read the origin code", text: "In the plain 'show ip bgp' table the last column is the origin code (i, e or ?). When a prefix unexpectedly loses to an equal path, check that column first." }
      ],
      exercise: {
        title: "Demote a path with the origin code",
        goal: "Set ORIGIN incomplete on the ISP-A path at EDGE1 and watch EDGE1 and a router two hops away move to the ISP-B path.",
        steps: [
          { text: "Baseline. EDGE1 has its own eBGP path to ISP-A with ORIGIN IGP. It is the best path.", type: "show", device: "EDGE1", cmd: "show ip bgp 100.100.100.0/24", expect: "Origin IGP[^\\n]*external, best", expectText: "'Origin IGP ... external, best'", hint: "roll back scenario 04 first if it was left applied" },
          { text: "Apply scenario 04. A route-map on EDGE1 sets ORIGIN incomplete on the content prefix learned from ISP-A.", type: "scenario", id: "04_origin", mode: "run" },
          { text: "The same ISP-A path on EDGE1 now shows a different origin.", type: "show", device: "EDGE1", cmd: "show ip bgp 100.100.100.0/24", expect: "Origin incomplete", expectText: "'Origin incomplete' on the ISP-A path", hint: "apply the scenario in the previous step and let it finish" },
          { text: "It is no longer the best path. EDGE1 prefers the iBGP path from EDGE2 (ISP-B), whose ORIGIN is still IGP.", type: "show", device: "EDGE1", cmd: "show ip bgp 100.100.100.0/24", expect: "Origin IGP[^\\n]*internal, best", expectText: "'Origin IGP ... internal, best'", hint: "wait a few seconds and run it again" },
          { text: "CE-LAN follows, because its best path comes through the routers that just changed their minds.", type: "show", device: "CE-LAN", cmd: "show ip bgp 100.100.100.0/24", expect: "65002 65100", expectText: "the path through ISP-B (65002 65100)", hint: "the apply step must have finished" },
          { text: "Roll the change back.", type: "scenario", id: "04_origin", mode: "rollback" },
          { text: "EDGE1 should prefer its own eBGP path again.", type: "show", device: "EDGE1", cmd: "show ip bgp 100.100.100.0/24", expect: "Origin IGP[^\\n]*external, best", expectText: "'Origin IGP ... external, best' again", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "Why did ORIGIN decide here, when Local-Pref and AS_PATH did not?",
          "What would have happened if the ISP-B path were three ASes long instead of two?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "A route that keeps losing may just be '?'", text: "If routes you redistribute lose to something that looks identical, look at ORIGIN. Two paths with the same Local-Pref and AS_PATH length are separated by ORIGIN before MED or anything else, so a stray '?' is a common, quiet cause." },
        { title: "Normalise at the point of entry", text: "Do the 'set origin igp' where the route enters BGP (the redistribute route-map), not later in an outbound policy, so every router in your AS and every neighbor sees a consistent value." },
        { title: "Use it as a low-priority tie-break tool", text: "Because ORIGIN is checked only after AS_PATH length, it is the right lever when you want to prefer a path only if everything else is level, for example to keep an ISP as second choice without changing Local-Pref policy." },
        { title: "Check what the neighbor sees", text: "ORIGIN is transitive, so it goes to your ISPs and beyond. Redistributed prefixes marked '?' are disadvantaged in every network that compares them with an equal 'i' path, not just yours." }
      ],
      interactions: [
        "ORIGIN is step 5. Weight, Local-Pref and AS_PATH length are all compared first, so once any of them differs, ORIGIN is never looked at. It beats MED, eBGP-over-iBGP, IGP metric and everything after.",
        "It only worked in the lab because both ISPs give a two-AS path to the content network. Change the length of one path and AS_PATH decides before ORIGIN is reached.",
        "On the lab, EDGE1 stopped preferring its own path, so it stopped advertising it into iBGP. CORE-RR1 dropped from three paths to two, both via EDGE2 and ISP-B. Nothing in iBGP now points at ISP-A, so if ISP-B fails the AS has no ready alternative. A demotion changes what is advertised, not only what is chosen.",
        "ORIGIN travels with the route, so the change is visible to other ASes if you demote a route you advertise, not only one you learn."
      ],
      edge: [
        "ORIGIN 'e' (EGP) is obsolete. You will only see it if someone sets it by hand with 'set origin egp <as>'.",
        "'set origin' works in an inbound or outbound route-map, and a change needs a soft clear (in or out) to reach existing routes.",
        "A route with ORIGIN ? is still fully valid and is used if it is the only path, or wins on an earlier step. It is a tie-breaker, not a penalty.",
        "Do not use ORIGIN as your main traffic-engineering tool. It is too easy to override by accident: any change to AS_PATH length or Local-Pref elsewhere silently makes it irrelevant."
      ],
      drill: {
        title: "EDGE1 stopped using its own ISP-A link",
        situation: "After a change window, EDGE1's link to ISP-A is up and the BGP session is Established, but the router sends all traffic for the content prefix through EDGE2 and ISP-B. Weight and Local-Pref are default and both ISPs give a two-AS path. This is EDGE1's table entry:",
        output: `EDGE1# show ip bgp 100.100.100.0/24
Paths: (3 available, best #2, table default)
Flag: 0x820
  Not advertised to any peer
  65002 65100
    10.255.0.12 (metric 21) from 10.255.0.2 (10.255.0.2)
      Origin IGP, metric 0, localpref 100, valid, internal
  65002 65100
    10.255.0.12 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
  65001 65100
    172.16.12.1 from 172.16.12.1 (10.255.1.1)
      Origin incomplete, localpref 100, valid, external`,
        question: "Why is the ISP-A path not best, which step decided, and what does this do to redundancy?",
        hint: "Compare the 'Origin' word on each path, then look at what CORE-RR1 would now receive from EDGE1.",
        answer: [
          "The ISP-A path has ORIGIN incomplete and the iBGP paths have ORIGIN IGP. Weight, Local-Pref and AS_PATH length are equal (two ASes each), so step 5 decides and IGP beats incomplete. Look for an inbound route-map on the ISP-A neighbor ('show running-config | section router bgp' and 'show route-map') that has 'set origin incomplete', or a redistribution that produces '?' for that prefix.",
          "EDGE1 now prefers the iBGP path, so it no longer advertises its ISP-A path into iBGP. CORE-RR1 is left with only EDGE2's paths. If ISP-B fails, the rest of the AS has to wait for EDGE1 to re-advertise before it can use ISP-A.",
          "Fix: remove the 'set origin' from the route-map (or set it to igp if it came from redistribution), then run 'clear ip bgp 172.16.12.1 soft in'."
        ]
      },
      quiz: [
        { q: "The ISP-A path has ORIGIN incomplete and is one AS long. The ISP-B path has ORIGIN IGP and is three ASes long. Everything before that ties. Which wins?", options: ["ISP-B, because IGP beats incomplete", "ISP-A, because AS_PATH length (step 4) is decided before ORIGIN (step 5)", "They tie", "The older path"], answer: 1, why: "The first step that separates the paths decides. AS_PATH length is compared before ORIGIN, and the one-AS path wins." },
        { q: "What ORIGIN does a prefix redistributed from OSPF into BGP get?", options: ["IGP (i)", "EGP (e)", "Incomplete (?)", "None"], answer: 2, why: "Redistribution produces ORIGIN incomplete. Only a 'network' statement gives IGP." },
        { q: "Which change lets redistributed static routes compete with i-origin paths on equal terms?", options: ["Raise Local-Pref", "set origin igp in a route-map on the redistribute command", "Enable always-compare-med", "Add a prepend"], answer: 1, why: "Setting the origin to igp where the route enters BGP removes the disadvantage without touching any other attribute." },
        { q: "Why did CORE-RR1 drop from three paths to two in the exercise?", options: ["The route reflector lost a session", "EDGE1's best path became the iBGP one, so it stopped advertising its own ISP-A path", "MED was compared", "ORIGIN is removed by route reflectors"], answer: 1, why: "A BGP router advertises only its best path. Once EDGE1 prefers the iBGP path, its ISP-A path is no longer best and is withdrawn from iBGP." }
      ]
    }
  },

  /* ================================================================ 05 MULTI_EXIT_DISC */
  "05_med": {
    foundations: {
      theory: [
        "MED (multi-exit discriminator) is a number one AS gives to a neighbor AS to say which of several links into it should be used. Lower is better. The classic case is two links to the same provider in different cities: you send a lower MED on the link you want the provider to use for traffic to you.",
        "It is an optional non-transitive attribute. Optional means not every router has to understand it, and non-transitive means the neighbor AS uses it but does not pass it on to a third AS. It is step 6, after ORIGIN and before the eBGP-over-iBGP preference.",
        "The rule that catches everyone out: by default MED is only compared between paths learned from the same neighboring AS. A MED of 200 from AS 65001 and a MED of 0 from AS 65002 are never compared, because two different networks did not agree on what the numbers mean. The command 'bgp always-compare-med' removes that restriction.",
        "A path with no MED is treated as MED 0, the best possible value, unless 'bgp bestpath med missing-as-worst' is configured."
      ],
      example: {
        title: "A high MED makes EDGE2 prefer the path through EDGE1",
        text: "EDGE2 has an eBGP path to ISP-B and two iBGP paths to ISP-A. With 'always-compare-med' enabled and a route-map giving the ISP-B path MED 200, EDGE2 compares 200 with 0 and switches (captured from the lab):",
        output: `EDGE2# show ip bgp 100.100.100.0/24
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
  65002 65100
    172.16.34.1 from 172.16.34.1 (10.255.2.1)
      Origin IGP, metric 200, localpref 100, valid, external`
      },
      basicConfig: `route-map MED-OUT permit 10
 set metric 50                          ! lower = preferred by the neighbor
router bgp 65000
 neighbor 203.0.113.1 route-map MED-OUT out`,
      quiz: [
        { q: "Which MED is preferred?", options: ["The higher one", "The lower one", "The one closest to 100", "The one that arrived first"], answer: 1, why: "MED is a metric: lower is better. A missing MED counts as 0 by default." },
        { q: "By default, MED is compared between paths that come from...", options: ["Any neighbor AS", "The same neighboring AS only", "The same router only", "iBGP peers only"], answer: 1, why: "MED values from two different ASes are not comparable. Unless 'bgp always-compare-med' is set, paths from different neighbor ASes skip the MED step." },
        { q: "What does 'non-transitive' mean for MED?", options: ["It is never sent to any neighbor", "The neighbor AS uses it but does not pass it on to a third AS", "It is removed by route reflectors", "It only applies to iBGP"], answer: 1, why: "A MED received from a neighbor AS is not advertised on to other ASes. It only says how that one neighbor should reach you." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Send MED outbound to one provider with several links", text: "The normal use is outbound, to a single neighboring AS. Give the link you want used a lower value than the others, and the provider chooses accordingly for traffic towards you, provided it honors MED." },
        { title: "Let the IGP cost drive MED", text: "'set metric-type internal' copies the IGP cost to the next hop into the MED. A provider with two links to you then delivers each packet to the entry closest to its destination inside your network.", config: `route-map MED-IGP permit 10
 set metric-type internal
router bgp 65000
 neighbor 203.0.113.1 route-map MED-IGP out` },
        { title: "Make MED comparison consistent", text: "If you enable 'bgp always-compare-med', enable it on every router in the AS. If only some routers compare across ASes, they can disagree about the best path, and that can create forwarding loops." },
        { title: "Make the result order-independent", text: "'bgp deterministic-med' compares MED within each neighbor AS regardless of the order in which paths arrived. Without it, the same set of paths can produce different results after a reset.", config: `router bgp 65000
 bgp deterministic-med` }
      ],
      exercise: {
        title: "Make a high MED push EDGE2 off its ISP-B link",
        goal: "Give the ISP-B path a high MED with always-compare-med enabled, and see EDGE2 move to the iBGP path and withdraw ISP-B from the route reflectors.",
        steps: [
          { text: "Baseline. EDGE2 prefers its own eBGP path to ISP-B.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expect: "external, best", expectText: "the eBGP path is 'external, best'", hint: "roll back scenario 05 first if it was left applied" },
          { text: "Apply scenario 05. It enables always-compare-med and sets MED 200 on routes from ISP-B.", type: "scenario", id: "05_med", mode: "run" },
          { text: "Check the configuration the scenario added on EDGE2.", type: "show", device: "EDGE2", cmd: "show running-config | section router bgp", expect: "route-map MED-B in", expectText: "'neighbor 172.16.34.1 route-map MED-B in'", hint: "apply the scenario in the previous step and let it finish" },
          { text: "The ISP-B path now carries metric 200, and the iBGP path with metric 0 has won.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expect: "metric 0, localpref 100, valid, internal, best", expectText: "'metric 0 ... internal, best'", hint: "wait a few seconds and run it again" },
          { text: "Now the route reflector. EDGE2 no longer prefers its ISP-B path, so it should have stopped advertising it.", type: "show", device: "CORE-RR1", cmd: "show ip bgp 100.100.100.0/24", expectNot: "65002 65100", expectText: "no path through ISP-B (65002 65100) left on the reflector", hint: "if a 65002 path is still shown, wait a few seconds and run it again" },
          { text: "Roll the change back.", type: "scenario", id: "05_med", mode: "rollback" },
          { text: "EDGE2 should prefer ISP-B again.", type: "show", device: "EDGE2", cmd: "show ip bgp 100.100.100.0/24", expect: "external, best", expectText: "'external, best' again", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "Why is 'bgp always-compare-med' needed here, and what would EDGE2 have done without it?",
          "In production you would set MED outbound to one provider. What is different about what this lab exercise does?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Treat a missing MED as the worst", text: "By default a route with no MED counts as 0, the best value, so a neighbor that sends no MED can beat one that sends a sensible number. 'bgp bestpath med missing-as-worst' reverses that.", config: `router bgp 65000
 bgp bestpath med missing-as-worst` },
        { title: "Use MED for hot-potato versus cold-potato", text: "With 'set metric-type internal', the provider hands each packet to you at the entry point nearest its destination, so the provider carries the traffic further across its own network (called cold-potato routing from the provider's side). It only works if the provider honors MED, which is a contract question as much as a technical one." },
        { title: "Do not mix policy and MED", text: "MED is step 6, after Local-Pref, AS_PATH and ORIGIN. If you want a hard preference, use Local-Pref. Use MED for the soft case where the other attributes tie and you only want to nudge a choice." },
        { title: "Audit where always-compare-med is set", text: "Search every router's BGP configuration for 'always-compare-med' and 'deterministic-med' before you change either. A mixed AS is a common source of paths that flip after a reset." }
      ],
      interactions: [
        "MED is step 6, so Weight, Local-Pref, locally originated, AS_PATH length and ORIGIN all come first. It then beats the eBGP-over-iBGP rule, which is why EDGE2 abandons its own eBGP path in the exercise.",
        "The same-neighbor-AS rule makes MED useless between two different ISPs. In a multihomed enterprise, MED normally only helps when you have two links to one provider.",
        "During testing on this lab, a high MED on the ISP-A path at EDGE1 did nothing on the route reflectors. They received paths from two different ASes, so MED was not compared, and they fell through to the lowest router-ID, which picked EDGE1's path. The route reflector's choice, not EDGE1's, decides what the other edges see.",
        "On the lab in the exercise, EDGE2 moved to the iBGP path and withdrew its ISP-B path, so CORE-RR1 kept only two paths, both via ISP-A."
      ],
      edge: [
        "MED is non-transitive: a MED you receive from a neighbor is not sent on to other ASes. It does go to your own iBGP peers, which is why the whole AS can see it.",
        "Setting a MED on a route you learn, as this exercise does, is a lab simulation. In production the setting normally goes outbound, toward a single neighbor AS.",
        "MED is 32 bits, so the worst value is 4294967295. A MED you set to a large number is not the same as 'unreachable'; the route stays valid.",
        "Comparing MED across neighbor ASes is a policy choice, not a fix: it assumes both providers use MED on the same scale, which they never agreed on."
      ],
      drill: {
        title: "EDGE2 stopped using its ISP-B link",
        situation: "EDGE2 has an eBGP path to ISP-B (AS 65002) and iBGP paths to ISP-A (AS 65001). Someone added a MED of 200 on the ISP-B path and now EDGE2 sends its traffic through ISP-A. The paths come from two different neighbor ASes. This is EDGE2's table entry:",
        output: `EDGE2# show ip bgp 100.100.100.0/24
Paths: (3 available, best #2, table default)
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.2 (10.255.0.2)
      Origin IGP, metric 0, localpref 100, valid, internal
  65001 65100
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
  65002 65100
    172.16.34.1 from 172.16.34.1 (10.255.2.1)
      Origin IGP, metric 200, localpref 100, valid, external`,
        question: "Which configuration line must be present for EDGE2 to compare 200 with 0 here, and what would EDGE2 have chosen without it?",
        hint: "The two paths come from different neighboring ASes. Try the simulator preset 'MED trap: different neighbor AS' and toggle always-compare-med.",
        answer: [
          "'bgp always-compare-med' must be configured. The metric-200 path comes from AS 65002 and the metric-0 paths come from AS 65001. By default BGP does not compare MED between different neighbor ASes, so the MED step would be skipped.",
          "Without it, EDGE2 would have continued to step 7, where eBGP beats iBGP, and it would have kept its own ISP-B path as best. The MED change would have had no effect at all, which is the usual surprise with MED.",
          "If you did not want this behavior, remove 'bgp always-compare-med' (on every router that has it) and use Local-Pref for a hard preference between ISPs."
        ]
      },
      quiz: [
        { q: "A path from AS 65001 has MED 200 and a path from AS 65002 has MED 0. There is no always-compare-med. What happens at the MED step?", options: ["The MED 0 path wins", "MED is not compared, and later steps decide", "The MED 200 path wins", "Both are dropped"], answer: 1, why: "MED is only compared between paths from the same neighboring AS. With different ASes the step is skipped." },
        { q: "One neighbor sends no MED. Another sends MED 10. With default settings, which wins the MED step?", options: ["The one with MED 10", "The one with no MED, which counts as 0", "They tie", "Neither: missing MED is invalid"], answer: 1, why: "A missing MED is treated as 0, which is better than 10. 'bgp bestpath med missing-as-worst' changes that." },
        { q: "You enable always-compare-med on one edge router only. What is the risk?", options: ["None", "Routers can disagree about the best path, which can cause loops or unstable choices", "The session resets", "MED is stripped"], answer: 1, why: "A router that compares MED across ASes and one that does not can pick different exits for the same prefix. Enable it on every router in the AS." },
        { q: "Which route-map command copies the IGP cost to the next hop into the MED?", options: ["set metric 0", "set metric-type internal", "set origin igp", "set local-preference 100"], answer: 1, why: "'set metric-type internal' uses the IGP metric as the MED, so the neighbor delivers traffic to the nearest exit point." }
      ]
    }
  },

/* END BATCH 1 */
});

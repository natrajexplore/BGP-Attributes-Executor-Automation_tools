/* Learn content, batch 3: 09 COMMUNITY, 10 ORIGINATOR_ID, 11 CLUSTER_LIST. Same format as learn-content.js.
   Router outputs quoted here were captured from the lab (IOS 15.2, c7200). */
Object.assign(window.LEARN_CONTENT, {

  /* ================================================================ 09 COMMUNITY */
  "09_community": {
    foundations: {
      theory: [
        "A COMMUNITY is a 32-bit tag you attach to a route. It is written AS:value, for example 65001:120, where the first 16 bits are an AS number and the last 16 are a number that AS defines. A community means nothing on its own. It only has an effect where a router has been configured to act on it, either in your own policy or in your ISP's.",
        "It is an optional transitive attribute, so it can travel with the route to other networks. That is what makes it the standard way to ask another network for something: 'set Local-Pref 80 for this route', 'do not pass this on', 'prepend twice towards your peers'.",
        "Some communities are well known and understood by every router. 'no-export' tells a receiver not to advertise the route to any eBGP peer, so it stays inside its AS. 'no-advertise' tells it not to advertise the route to any peer at all. 'local-AS' keeps it inside the local sub-AS of a confederation.",
        "Two behaviors trip people up. IOS does not send communities to a neighbor unless you configure 'neighbor x send-community'. And 'set community' replaces the communities already on the route unless you add the 'additive' keyword."
      ],
      example: {
        title: "Tagging the summary toward ISP-A",
        text: "EDGE1 tags the 10.10.0.0/16 summary with 65001:120 and no-export when it advertises it to ISP-A. ISP-A shows the community in the old decimal format (4259905656 is 65001 x 65536 + 120), honors no-export, and does not pass the route to its eBGP peers (captured from the lab):",
        output: `ISPA-1# show ip bgp 10.10.0.0/16
Paths: (3 available, best #3, table default, not advertised to EBGP peer)
  Not advertised to any peer
  65000, (aggregated by 65000 10.255.0.11)
    172.16.12.2 from 172.16.12.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, atomic-aggregate, best
      Community: 4259905656 no-export`
      },
      basicConfig: `route-map TAG-OUT permit 10
 set community 65001:120 no-export additive
router bgp 65000
 neighbor 172.16.12.1 send-community        ! required: IOS does not send communities by default
 neighbor 172.16.12.1 route-map TAG-OUT out`,
      quiz: [
        { q: "What does the no-export community tell a receiving router?", options: ["Do not advertise this route to any eBGP peer", "Do not accept this route", "Prefer this route", "Delete this route after 60 seconds"], answer: 0, why: "no-export keeps the route inside the receiving AS: it is not advertised to eBGP neighbors." },
        { q: "On IOS, which command is needed for a neighbor to receive your communities at all?", options: ["neighbor x send-community", "neighbor x soft-reconfiguration inbound", "bgp always-compare-med", "neighbor x weight 100"], answer: 0, why: "Communities are not sent by default on IOS. Without 'send-community' the tag never leaves the router." },
        { q: "How is the community 65001:120 built?", options: ["An AS number and a value, 16 bits each", "A prefix and a length", "A router-ID and a metric", "Two AS numbers"], answer: 0, why: "The first 16 bits are an AS number and the last 16 bits are a value that AS defines." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Keep existing tags with 'additive'", text: "A plain 'set community' overwrites whatever communities the route already has. Add the 'additive' keyword to add yours to the existing ones, otherwise you can remove a no-export or an ISP tag by accident." },
        { title: "Match communities with a community-list", text: "To act on a tag, define a community-list and match it in a route-map. That gives you a name for a policy instead of a hard-coded value.", config: `ip community-list standard FROM-ISPA permit 65000:100
route-map PREFER permit 10
 match community FROM-ISPA
 set local-preference 200` },
        { title: "Show communities as AA:NN", text: "Old-format output prints the community as one large number. Turn on the new format on every router so you can read them.", config: `ip bgp-community new-format` },
        { title: "Read your ISP's community guide first", text: "Communities are agreements. Only the ones your ISP publishes have any effect in their network. Look for the ones that set Local-Pref, prepend, blackhole and geographic scope, and build your policy around those." }
      ],
      exercise: {
        title: "Tag the summary and watch a neighbor obey",
        goal: "Send the summary to ISP-A with a community and no-export, see it honored at ISP-A, and see why CONTENT still has a route.",
        steps: [
          { text: "Baseline. ISP-A has no route for the /16 yet.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "Network not in table", expectText: "'% Network not in table'", hint: "roll back scenario 09 first if it was left applied" },
          { text: "At baseline EDGE1 advertises the four /24 components to ISP-A.", type: "show", device: "EDGE1", cmd: "show ip bgp neighbors 172.16.12.1 advertised-routes", expect: "10\\.10\\.1\\.0/24", expectText: "the four /24 networks listed", hint: "roll back scenario 09 first if it was left applied" },
          { text: "Apply scenario 09. EDGE1 creates the /16 summary and tags it toward ISP-A with 65001:120 and no-export.", type: "scenario", id: "09_community", mode: "run" },
          { text: "Now EDGE1 advertises only the /16.", type: "show", device: "EDGE1", cmd: "show ip bgp neighbors 172.16.12.1 advertised-routes", expect: "\\*>\\s+10\\.10\\.0\\.0/16", expectNot: "10\\.10\\.1\\.0/24", expectText: "the /16 and none of the /24 networks", hint: "apply the scenario in the previous step and let it finish" },
          { text: "ISP-A has the community. It is printed as one decimal number: 4259905656 is 65001:120 in the old format.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "Community:[^\\n]*no-export", expectText: "'Community: 4259905656 no-export'", hint: "wait a few seconds and run it again" },
          { text: "ISP-A honors no-export. Look at the header line of the entry.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "not advertised to EBGP peer", expectText: "'not advertised to EBGP peer'", hint: "wait a few seconds and run it again" },
          { text: "You can also ask ISP-A which routes carry a given community.", type: "show", device: "ISPA-1", cmd: "show ip bgp community no-export", expect: "10\\.10\\.0\\.0/16", expectText: "the /16 is listed", hint: "the apply step must have finished" },
          { text: "CONTENT is behind both ISPs. It should not hear the /16 through ISP-A any more, but does it still have it?", type: "show", device: "CONTENT", cmd: "show ip bgp 10.10.0.0/16", expect: "^\\s*65002 65000", expectNot: "^\\s*65001 65000", expectText: "a path through ISP-B (65002 65000) and none through ISP-A", hint: "wait for the 30 second eBGP advertisement timer and run it again" },
          { text: "Roll the change back.", type: "scenario", id: "09_community", mode: "rollback" },
          { text: "ISP-A should have no /16 again.", type: "show", device: "ISPA-1", cmd: "show ip bgp 10.10.0.0/16", expect: "Network not in table", expectText: "'% Network not in table'", hint: "wait for the 30 second eBGP advertisement timer and run it again" }
        ],
        selfCheck: [
          "Why does CONTENT still have a route to the /16?",
          "What would you have to do on EDGE2 for no-export to cover the ISP-B path as well?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Tag on the way in, act on the way out", text: "Give every route a community that says where it was learned (customer, peer, transit) when it enters your network, and write your outbound policy once in terms of those tags. It scales far better than a prefix-list per neighbor, and a new neighbor only needs its ingress tagging.", config: `ip community-list standard LEARNED-FROM-ISPA permit 65000:100
route-map TAG-ISPA-IN permit 10
 set community 65000:100 additive       ! tag on the way in
route-map TO-ISPB deny 10
 match community LEARNED-FROM-ISPA      ! never send ISP-A routes to ISP-B
route-map TO-ISPB permit 20
router bgp 65000
 neighbor 172.16.12.1 route-map TAG-ISPA-IN in
 neighbor 172.16.34.1 route-map TO-ISPB out` },
        { title: "Ask the ISP to drop attack traffic", text: "Many providers accept a blackhole community. You advertise the attacked /32 with it and the provider drops the traffic at its edge, before it fills your link. The well-known BLACKHOLE community is 65535:666 (RFC 7999), but check the provider's own value." },
        { title: "Remove tags you do not want to leak", text: "Communities are transitive, so internal tags can escape to your ISPs. Strip them on the way out.", config: `ip community-list standard INTERNAL permit 65000:100
route-map TO-ISP permit 10
 set comm-list INTERNAL delete` },
        { title: "Use no-advertise for local-only routes", text: "'no-advertise' keeps a route on the router that holds it, useful for a route that must exist for local policy but must not spread." }
      ],
      interactions: [
        "COMMUNITY is not a best-path step. It is a hook: a route-map that matches a community can set Weight, Local-Pref, AS_PATH prepends or MED. The step that decides is whichever attribute the policy changes.",
        "Providers use communities to change their Local-Pref on your routes, which is how you influence inbound traffic even though your own Local-Pref never leaves your AS. It is the most reliable way to steer traffic that AS_PATH prepending cannot.",
        "On the lab, no-export on the ISP-A path stopped ISP-A passing the /16 to its eBGP peers, but CONTENT still had the route through ISP-B. EDGE2 advertised the summary to ISP-B without the tag, so the tag only covered the path that carried it.",
        "With 'as-set' on an aggregate, the aggregate collects the communities of its components (see 08), so a tag on one component can end up on the summary."
      ],
      edge: [
        "Communities are set per route and sent per neighbor. A missing 'send-community' on one neighbor is the most common reason for 'my community is ignored'.",
        "Providers often clean communities on ingress, allowing only their own defined ones and dropping the rest. A tag you added for a third party may never reach it.",
        "'no-export' is enforced by the receiver. It does not stop iBGP inside the receiving AS from carrying the route, only advertisement to eBGP peers.",
        "A community change on a route needs a soft outbound clear ('clear ip bgp <neighbor> soft out') before the neighbor sees it."
      ],
      drill: {
        title: "no-export, but the route still leaks",
        situation: "You tagged the 10.10.0.0/16 summary with no-export toward ISP-A so ISP-A would not spread it. The ISP-A engineer confirms the tag arrived, but says the community looks wrong ('4259905656'), and CONTENT, which sits behind both ISPs, still has a route to your /16. This is ISP-A's entry:",
        output: `ISPA-1# show ip bgp 10.10.0.0/16
Paths: (3 available, best #3, table default, not advertised to EBGP peer)
  Not advertised to any peer
  65100 65002 65000, (aggregated by 65000 10.255.0.11)
    198.51.100.2 from 198.51.100.2 (10.255.100.1)
      Origin IGP, localpref 100, valid, external, atomic-aggregate
  65002 65000, (aggregated by 65000 10.255.0.11)
    192.0.2.2 from 192.0.2.2 (10.255.2.1)
      Origin IGP, localpref 100, valid, external, atomic-aggregate
  65000, (aggregated by 65000 10.255.0.11)
    172.16.12.2 from 172.16.12.2 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, valid, external, atomic-aggregate, best
      Community: 4259905656 no-export`,
        question: "Is 4259905656 the value you set? And why does CONTENT still have the route?",
        hint: "Convert the number: the high 16 bits are the AS number. Then look at which of the three paths carry a Community line.",
        answer: [
          "Yes. 4259905656 is 65001 x 65536 + 120, which is 65001:120 written as a single number. ISP-A prints communities in the old format. Turning on 'ip bgp-community new-format' on ISP-A would print it as 65001:120. The value you set is correct.",
          "Only the best path (from EDGE1) carries the Community line. The other two paths, through ISP-B, have none. EDGE2 learned the summary over iBGP and advertised it to ISP-B without a tag, and ISP-B passed it on to ISP-A and CONTENT. no-export only limits what ISP-A does with the path that has the tag, so CONTENT still hears it through ISP-B.",
          "To keep the summary out of the other ISP too, apply the same tagging on EDGE2's outbound route-map toward ISP-B, or filter the summary there. Check with 'show ip bgp neighbors <isp> advertised-routes' on both edges."
        ]
      },
      quiz: [
        { q: "A route has the communities no-export and 65001:80. You apply 'set community 65001:120' without 'additive'. What does the route carry afterwards?", options: ["All three", "Only 65001:120: the others are replaced", "no-export and 65001:120", "Nothing"], answer: 1, why: "Without 'additive', 'set community' replaces the existing communities. The no-export tag is lost." },
        { q: "Your community is ignored by an ISP that documents it. What is the first thing to check on your router?", options: ["That 'neighbor x send-community' is configured for that neighbor", "The Local-Pref", "The AS_PATH length", "The router-ID"], answer: 0, why: "IOS does not send communities to a neighbor by default. If the tag never leaves, no policy can act on it." },
        { q: "Which well-known community value is defined for remote blackholing in RFC 7999?", options: ["65535:666", "65535:65281", "0:0", "65000:1"], answer: 0, why: "65535:666 is the BLACKHOLE community. Providers may also define their own value, so check their guide." },
        { q: "You tag a route no-export toward ISP-A. The same route also goes to ISP-B with no tag. What is true?", options: ["ISP-A will not pass the tagged path to its eBGP peers, but the path through ISP-B can still spread", "The route is blocked everywhere", "ISP-B also honors the tag", "The route is deleted"], answer: 0, why: "A community works on the path that carries it. Other paths for the same prefix are unaffected." }
      ]
    }
  },

  /* ================================================================ 10 ORIGINATOR_ID */
  "10_originator_id": {
    foundations: {
      theory: [
        "ORIGINATOR_ID is an attribute added by route reflectors. A route reflector is a router that passes routes between iBGP peers so that you do not need a full mesh. When it reflects a route it adds ORIGINATOR_ID, holding the router-ID of the router that first sent the route into the AS. It is optional and non-transitive: it exists only inside your AS and is never sent over eBGP.",
        "Its job is loop prevention. With reflection, a route can travel from a client to a reflector and back down to other clients, including, if something is wrong, the client that started it. A router that receives a route whose ORIGINATOR_ID is its own router-ID knows the route is its own, come back around, and discards it.",
        "The first reflector to reflect the route sets it. Later reflectors leave it unchanged, so it always names the original source, however many reflectors the route crossed. The originating router itself never shows the attribute for its own route.",
        "It also matters for best-path selection. At step 10 the router compares router-IDs, and for a reflected route it uses the ORIGINATOR_ID in place of the router-ID of the neighbor it heard the route from."
      ],
      example: {
        title: "The same route seen at the source and after reflection",
        text: "EDGE1 originates 10.255.99.1/32. At the source the route is 'sourced, local' and has no ORIGINATOR_ID. Two hops away at EDGE2, after reflection through both reflectors, every copy names EDGE1 (captured from the lab):",
        output: `EDGE1# show ip bgp 10.255.99.1/32
  Local
    0.0.0.0 from 0.0.0.0 (10.255.0.11)
      Origin IGP, metric 0, localpref 100, weight 32768, valid, sourced, local, best

EDGE2# show ip bgp 10.255.99.1/32
  Local
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Originator: 10.255.0.11, Cluster list: 10.255.0.1`
      },
      basicConfig: `router bgp 65000
 neighbor 10.255.0.11 remote-as 65000
 address-family ipv4
  neighbor 10.255.0.11 route-reflector-client   ! this router now reflects routes and adds ORIGINATOR_ID`,
      quiz: [
        { q: "Who adds the ORIGINATOR_ID attribute?", options: ["The router that originates the route", "The first route reflector that reflects the route", "The ISP", "Every router that receives the route"], answer: 1, why: "A route reflector sets it when it reflects a route, using the router-ID of the router that sent the route to it. Later reflectors leave it unchanged." },
        { q: "A router receives a route whose ORIGINATOR_ID equals its own router-ID. What does it do?", options: ["Uses it as best", "Discards it, because the route is its own coming back", "Adds its own AS number", "Sends it to eBGP peers"], answer: 1, why: "That is the loop-prevention rule: the route originated at this router and has been reflected back to it." },
        { q: "Is ORIGINATOR_ID sent to eBGP peers?", options: ["Yes, always", "No: it is non-transitive and stays inside the AS", "Only with next-hop-self", "Only for aggregates"], answer: 1, why: "It is an optional non-transitive attribute, so it exists only in the AS where the reflection happened." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Give every router a unique, fixed router-ID", text: "ORIGINATOR_ID is a router-ID, so router-IDs must be unique across the whole AS. Set 'bgp router-id' to the loopback address explicitly and record it in your inventory, rather than letting the router choose the highest interface address." , config: `router bgp 65000
 bgp router-id 10.255.0.11` },
        { title: "Use it to find the source of a route", text: "In a network with reflectors, the next hop and the neighbor you heard a route from are not always the router that created it. 'show ip bgp <prefix>' shows 'Originator:', which is the source, however many reflectors the route crossed." },
        { title: "Audit router-IDs before adding a reflector", text: "Two routers with the same router-ID will reject each other's reflected routes, and the failure looks like routes that appear on the reflector and never on the client. Check the router-ID of every router first.", config: `show ip bgp summary      ! first line: 'BGP router identifier' and local AS` },
        { title: "Do not try to set it yourself", text: "The reflector manages ORIGINATOR_ID. You configure reflection with 'route-reflector-client' and the attribute follows." }
      ],
      exercise: {
        title: "Follow a new route through the reflectors",
        goal: "Originate a new prefix on EDGE1 and see the ORIGINATOR_ID appear on the reflector, on EDGE2 and on CE-LAN, but not on EDGE1 itself.",
        steps: [
          { text: "Baseline. The prefix 10.255.99.1/32 does not exist yet.", type: "show", device: "EDGE2", cmd: "show ip bgp 10.255.99.1/32", expect: "Network not in table", expectText: "'% Network not in table'", hint: "roll back scenario 10 first if it was left applied" },
          { text: "Apply scenario 10. EDGE1 creates a loopback with that address and advertises it with a network statement.", type: "scenario", id: "10_originator_id", mode: "run" },
          { text: "At the source. EDGE1 originated the route itself, so it is 'sourced, local' and shows no Originator line.", type: "show", device: "EDGE1", cmd: "show ip bgp 10.255.99.1/32", expect: "sourced, local, best", expectNot: "Originator", expectText: "'sourced, local, best' and no 'Originator:'", hint: "apply the scenario in the previous step and let it finish" },
          { text: "On the route reflector, the copy that was reflected by the other reflector carries the ORIGINATOR_ID.", type: "show", device: "CORE-RR1", cmd: "show ip bgp 10.255.99.1/32", expect: "Originator: 10\\.255\\.0\\.11", expectText: "'Originator: 10.255.0.11'", hint: "wait a few seconds and run it again" },
          { text: "On EDGE2, which is a client of both reflectors, both copies name EDGE1 as the source.", type: "show", device: "EDGE2", cmd: "show ip bgp 10.255.99.1/32", expect: "Originator: 10\\.255\\.0\\.11", expectText: "'Originator: 10.255.0.11' on each path", hint: "the apply step must have finished" },
          { text: "On CE-LAN the same.", type: "show", device: "CE-LAN", cmd: "show ip bgp 10.255.99.1/32", expect: "Originator: 10\\.255\\.0\\.11", expectText: "'Originator: 10.255.0.11'", hint: "wait a few seconds and run it again" },
          { text: "EDGE2 has two paths that are identical except for the reflector they came through. Look at which one is best.", type: "show", device: "EDGE2", cmd: "show ip bgp 10.255.99.1/32", expect: "internal, best\\s*\\n\\s*Originator: 10\\.255\\.0\\.11, Cluster list: 10\\.255\\.0\\.1\\s*$", expectText: "the best path is the one through CORE-RR1 (Cluster list: 10.255.0.1)", hint: "wait a few seconds and run it again" },
          { text: "Roll the change back.", type: "scenario", id: "10_originator_id", mode: "rollback" },
          { text: "The prefix should be gone.", type: "show", device: "EDGE2", cmd: "show ip bgp 10.255.99.1/32", expect: "Network not in table", expectText: "'% Network not in table'", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "Why does EDGE1 not show an Originator line for its own route?",
          "The two paths on EDGE2 have the same Originator and the same cluster-list length. What decides the best path, and at which step?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Trace a route across a reflector hierarchy", text: "With several tiers of reflectors, the immediate neighbor tells you nothing about where a route started. ORIGINATOR_ID gives you the injecting router, and the cluster list (see 11) gives you the path of reflectors it took. Together they reconstruct the route's journey from one command." },
        { title: "Use the router-ID as a deterministic tie-break", text: "When every other attribute ties, step 10 picks the lowest router-ID (or ORIGINATOR_ID). You can rely on that on purpose: give the edge you want as the default exit the lowest router-ID. Think carefully before you do it, because changing a router-ID resets the router's BGP sessions." },
        { title: "Check for collisions before an incident", text: "List the router-ID of every router in your AS and look for duplicates. A cloned configuration is the usual cause. A duplicate produces the most confusing failure in reflection: routes that are sent and never accepted." },
        { title: "Read the attribute to decide where to fix", text: "If a route appears on the reflector but not on a client, check whether the client's router-ID equals the ORIGINATOR_ID. If it does, the client is discarding its own route, and the problem is the duplicate router-ID, not the policy." }
      ],
      interactions: [
        "ORIGINATOR_ID belongs to step 10. Weight, Local-Pref, AS_PATH, ORIGIN, MED, eBGP-over-iBGP, IGP metric and (for eBGP) oldest path are all compared first.",
        "After step 10 come CLUSTER_LIST length (step 11) and neighbor IP (step 12). On the lab, EDGE2 hears the new prefix from both reflectors with the same ORIGINATOR_ID and a cluster list of length one each, so steps 10 and 11 tie and step 12 decides: the lower neighbor address, 10.255.0.1 (CORE-RR1), wins.",
        "ORIGINATOR_ID and CLUSTER_LIST are the two halves of reflection loop prevention. ORIGINATOR_ID catches a route that returns to the router that started it. CLUSTER_LIST catches a route that circulates between reflectors.",
        "It is non-transitive, so it disappears at the AS boundary. A network outside your AS cannot use it to find the originating router inside yours."
      ],
      edge: [
        "A full iBGP mesh has no reflectors, so ORIGINATOR_ID never appears. You only meet it once route reflection is configured.",
        "Only the first reflector sets it. If you see an ORIGINATOR_ID that surprises you, the route entered the AS at that router, not at the one you were expecting.",
        "Because it substitutes for the neighbor's router-ID in the comparison, two reflected copies of the same route from different clients are ranked by the originators' router-IDs, not by the reflectors' addresses.",
        "A change of router-ID on any router resets its BGP sessions and changes every ORIGINATOR_ID it produces, so schedule it as a change with an outage window."
      ],
      drill: {
        title: "Two identical paths through two reflectors",
        situation: "The new prefix 10.255.99.1/32 was added on EDGE1. On EDGE2 you see two paths that look identical. Before an upcoming maintenance window on CORE-RR1, the team wants to know which router created the prefix, which path EDGE2 is using and why, and what EDGE2 will do while CORE-RR1 is down. This is EDGE2's table entry:",
        output: `EDGE2# show ip bgp 10.255.99.1/32
Paths: (2 available, best #2, table default)
  Local
    10.255.0.11 (metric 21) from 10.255.0.2 (10.255.0.2)
      Origin IGP, metric 0, localpref 100, valid, internal
      Originator: 10.255.0.11, Cluster list: 10.255.0.2
  Local
    10.255.0.11 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Originator: 10.255.0.11, Cluster list: 10.255.0.1`,
        question: "Which router created the prefix, why is the path through 10.255.0.1 best, and what happens when CORE-RR1 is down?",
        hint: "Compare each attribute of the two paths in the order of best-path selection. Where do they first differ?",
        answer: [
          "The Originator is 10.255.0.11, which is EDGE1. Both paths have the same next hop, the same metric, the same Local-Pref, the same ORIGIN and the same ORIGINATOR_ID, and a cluster list of length one each. They do not differ until step 12, the neighbor IP: 10.255.0.1 is lower than 10.255.0.2, so the path through CORE-RR1 wins.",
          "While CORE-RR1 is down, EDGE2 loses that path and keeps the one through CORE-RR2, whose next hop is the same EDGE1 loopback. Traffic still goes to EDGE1, so nothing changes for the user, and no route is lost.",
          "This is the redundancy reflectors are meant to give. It is also why both paths must be present before the window, not just the best one."
        ]
      },
      quiz: [
        { q: "EDGE2 has the same route from CORE-RR1 (10.255.0.1) and CORE-RR2 (10.255.0.2). Same Originator, cluster list length 1 each, everything else equal. Which wins, and at which step?", options: ["CORE-RR2, at step 10", "CORE-RR1, at step 12 (lowest neighbor IP)", "CORE-RR1, at step 5", "They tie and both are used"], answer: 1, why: "Steps 10 (originator) and 11 (cluster list length) tie, so step 12 decides: the lowest neighbor address wins." },
        { q: "Two routers in your AS share the router-ID 10.255.0.11. What happens to a route one of them originates when it is reflected to the other?", options: ["It is accepted normally", "The receiver sees its own router-ID as ORIGINATOR_ID and discards the route", "It becomes the best path", "It is sent to eBGP peers"], answer: 1, why: "A router that finds its own router-ID in ORIGINATOR_ID assumes the route is its own coming back and discards it." },
        { q: "Where is ORIGINATOR_ID visible?", options: ["Anywhere on the Internet", "Only inside your AS, on reflected routes", "Only on the originating router", "Only on eBGP peers"], answer: 1, why: "It is non-transitive and is added on reflection, so only routers in the AS that received the reflected route can see it." },
        { q: "How does ORIGINATOR_ID affect step 10 of best-path selection?", options: ["It is ignored", "It replaces the router-ID of the neighbor in the comparison, for reflected routes", "It is added to the AS_PATH", "It sets Local-Pref"], answer: 1, why: "For a reflected route the router compares the originator's router-ID instead of the neighbor's." }
      ]
    }
  },

  /* ================================================================ 11 CLUSTER_LIST */
  "11_cluster_list": {
    foundations: {
      theory: [
        "A cluster is a route reflector together with its clients. Every cluster has a CLUSTER_ID, which by default is the reflector's router-ID and can be set with 'bgp cluster-id'. CLUSTER_LIST is an optional non-transitive attribute that records the clusters a route has been reflected through. Each reflector adds its own cluster-ID to the front of the list when it reflects the route.",
        "Its job is loop prevention between reflectors, the same job AS_PATH does between ASes. If a reflector receives a route whose CLUSTER_LIST already contains its own cluster-ID, it has seen this route before and discards it. ORIGINATOR_ID catches a route that returns to the router that started it. CLUSTER_LIST catches a route that circulates between reflectors.",
        "It is also a tie-breaker. At step 11 the path with the shorter CLUSTER_LIST wins, which means the path that was reflected fewer times. It comes after the router-ID or ORIGINATOR_ID step and before the neighbor IP step.",
        "Redundant reflectors can use different cluster-IDs, which gives clients one copy from each reflector, or the same cluster-ID, which saves memory but needs a careful design. The default, a unique cluster-ID per reflector, is the safe one."
      ],
      example: {
        title: "The shorter cluster list wins",
        text: "EDGE2 hears the CE-LAN prefix 10.10.1.0/24 from both reflectors. The copy from CORE-RR2 was reflected twice, first by RR1 and then by RR2, so its cluster list has two entries. The copy from RR1 was reflected once. The shorter one is best (captured from the lab):",
        output: `EDGE2# show ip bgp 10.10.1.0/24
  Local
    10.255.0.20 (metric 21) from 10.255.0.2 (10.255.0.2)
      Origin IGP, metric 0, localpref 100, valid, internal
      Originator: 10.255.0.20, Cluster list: 10.255.0.2, 10.255.0.1
  Local
    10.255.0.20 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Originator: 10.255.0.20, Cluster list: 10.255.0.1`
      },
      basicConfig: `router bgp 65000
 bgp cluster-id 10.255.0.2      ! default is the router-ID; make it explicit and unique`,
      quiz: [
        { q: "What does CLUSTER_LIST contain?", options: ["The AS numbers a route crossed", "The cluster IDs of the reflectors the route was reflected through", "The router-IDs of all clients", "The communities on the route"], answer: 1, why: "Each reflector adds its cluster-ID as it reflects the route, so the list records the reflection path." },
        { q: "A reflector receives a route whose CLUSTER_LIST contains its own cluster-ID. What does it do?", options: ["Uses it as best", "Discards it as a loop", "Adds its cluster-ID again", "Forwards it to eBGP peers"], answer: 1, why: "It has already seen this route. Accepting it would create a reflection loop." },
        { q: "Two otherwise identical paths, one with a cluster list of length 1 and one of length 2. Which is preferred?", options: ["The longer one", "The shorter one", "They tie", "The older one"], answer: 1, why: "At step 11 the shorter CLUSTER_LIST wins: it has been reflected fewer times." }
      ]
    },
    practitioner: {
      tactics: [
        { title: "Leave cluster-IDs unique by default", text: "With the default (each reflector's own router-ID), every reflector reflects every route, so each client hears each route once per reflector. That is real redundancy: if one reflector fails, the client already has the other's copy." },
        { title: "Share a cluster-ID only on purpose", text: "Two reflectors can share a cluster-ID to reduce the number of copies. That only works when both reflectors have exactly the same clients and every client peers with both. In every other case, the reflectors discard each other's routes and clients lose paths." },
        { title: "Give each tier its own IDs in a hierarchy", text: "In a multi-level design (top reflectors, regional reflectors, clients), use a different cluster-ID for each tier and each region, so a route reflected down and back up is recognised as a loop and not mistaken for a new route." },
        { title: "Check with two commands", text: "Compare the configured cluster-ID with what the routes carry.", config: `show running-config | section router bgp   ! 'bgp cluster-id'
show ip bgp 10.10.1.0/24                   ! 'Cluster list:'` }
      ],
      exercise: {
        title: "Make two reflectors share a cluster-ID and lose a path",
        goal: "Give CORE-RR2 the same cluster-ID as CORE-RR1 and watch RR2 discard the route it gets from RR1, so EDGE2 loses a path.",
        steps: [
          { text: "Baseline. EDGE2 hears the CE-LAN prefix from both reflectors. One copy has been reflected twice, so its cluster list has two entries.", type: "show", device: "EDGE2", cmd: "show ip bgp 10.10.1.0/24", expect: "Cluster list: 10\\.255\\.0\\.2, 10\\.255\\.0\\.1", expectText: "a path with 'Cluster list: 10.255.0.2, 10.255.0.1'", hint: "roll back scenario 11 first if it was left applied" },
          { text: "CORE-RR2 has its own cluster-ID.", type: "show", device: "CORE-RR2", cmd: "show running-config | section router bgp", expect: "bgp cluster-id 10\\.255\\.0\\.2", expectText: "'bgp cluster-id 10.255.0.2'", hint: "roll back scenario 11 first if it was left applied" },
          { text: "Apply scenario 11. It gives CORE-RR2 the same cluster-ID as CORE-RR1.", type: "scenario", id: "11_cluster_list", mode: "run" },
          { text: "The new cluster-ID on CORE-RR2.", type: "show", device: "CORE-RR2", cmd: "show running-config | section router bgp", expect: "bgp cluster-id 10\\.255\\.0\\.1", expectText: "'bgp cluster-id 10.255.0.1'", hint: "apply the scenario in the previous step and let it finish" },
          { text: "CORE-RR2 used to receive the CE-LAN prefix from CORE-RR1 with the cluster list '10.255.0.1'. Now that is its own cluster-ID, so it discards the route as a loop.", type: "show", device: "CORE-RR2", cmd: "show ip bgp 10.10.1.0/24", expect: "Network not in table", expectText: "'% Network not in table'", hint: "wait a few seconds and run it again" },
          { text: "EDGE2 has lost the path that came through CORE-RR2.", type: "show", device: "EDGE2", cmd: "show ip bgp 10.10.1.0/24", expect: "from 10\\.255\\.0\\.1 \\(10\\.255\\.0\\.1\\)", expectNot: "from 10\\.255\\.0\\.2 \\(", expectText: "only the path from 10.255.0.1 (CORE-RR1) is left", hint: "the apply step must have finished" },
          { text: "Roll the change back.", type: "scenario", id: "11_cluster_list", mode: "rollback" },
          { text: "Both paths should be back, including the one reflected twice.", type: "show", device: "EDGE2", cmd: "show ip bgp 10.10.1.0/24", expect: "Cluster list: 10\\.255\\.0\\.2, 10\\.255\\.0\\.1", expectText: "the two-entry cluster list is back", hint: "wait a few seconds after the rollback and run it again" }
        ],
        selfCheck: [
          "Why did CORE-RR2 discard the route, and how did it know?",
          "Nothing failed and every session stayed up. What did the network lose, and how would you notice?"
        ]
      }
    },
    pro: {
      tricks: [
        { title: "Shared cluster-IDs the right way", text: "If you want the memory saving, give both reflectors the same cluster-ID, make sure every client peers with both, and do not make the two reflectors clients of each other. Then each client hears each route once per reflector, both copies carry the same cluster list, and neither reflector discards the other's routes." },
        { title: "Choose path count deliberately", text: "Unique cluster-IDs give each client a copy per reflector (more memory, more resilience). Shared cluster-IDs give fewer copies. The choice is memory against resilience, and in a large network it changes table sizes noticeably." },
        { title: "Read the list like a journey", text: "The leftmost entry is the last reflector, and the length is the number of reflections. A long list on a path that should be short is a hint that reflectors are peering with each other more than the design intended." },
        { title: "Test before you standardise", text: "A 'clean-up' that makes all reflector configs identical is exactly how a shared cluster-ID appears. Check cluster-IDs before you apply any common template to reflectors." }
      ],
      interactions: [
        "CLUSTER_LIST is step 11. Weight through the router-ID or ORIGINATOR_ID (step 10) are compared first, and the neighbor IP (step 12) only matters if the cluster lists are also equal.",
        "On the lab, EDGE2's two copies of the CE-LAN prefix have the same ORIGINATOR_ID. The one reflected once (through RR1) wins over the one reflected twice at step 11. Compare the ORIGINATOR_ID exercise, where two equal-length lists were separated by the neighbor IP at step 12 instead.",
        "It is the counterpart of ORIGINATOR_ID: one catches a route returning to its source, the other catches a route going round between reflectors.",
        "With the shared cluster-ID on the lab, CORE-RR2 discarded everything CORE-RR1 reflected to it, so it ended up with no route to the CE-LAN prefix at all. EDGE2 was left with one path and no redundancy, although every session was up."
      ],
      edge: [
        "The default cluster-ID is the reflector's router-ID. If you set a cluster-ID by hand, keep a record: it is easy to forget and hard to spot when reading a configuration.",
        "CLUSTER_LIST is non-transitive. Nothing outside your AS can see it.",
        "A reflector only checks its own cluster-ID. Two reflectors in different tiers with the same ID will reject each other's routes, so IDs need to be unique across the entire hierarchy.",
        "Changing a cluster-ID changes the loop check immediately. Do it in a maintenance window and refresh the sessions afterwards."
      ],
      drill: {
        title: "One reflector has lost the route",
        situation: "After a template was rolled out to all route reflectors, EDGE2 has only one path to the CE-LAN prefix 10.10.1.0/24 instead of two. Every BGP session is up. CORE-RR2 shows no route to the prefix at all, although CORE-RR1 has it. This is the state:",
        output: `CORE-RR2# show ip bgp 10.10.1.0/24
% Network not in table

CORE-RR2# show running-config | section router bgp
router bgp 65000
 bgp cluster-id 10.255.0.1

EDGE2# show ip bgp 10.10.1.0/24
Paths: (1 available, best #1, table default)
  Local
    10.255.0.20 (metric 21) from 10.255.0.1 (10.255.0.1)
      Origin IGP, metric 0, localpref 100, valid, internal, best
      Originator: 10.255.0.20, Cluster list: 10.255.0.1`,
        question: "What is wrong, why does it leave no alarm, and what is the risk if CORE-RR1 fails?",
        hint: "Compare CORE-RR2's cluster-ID with the cluster list that CORE-RR1 puts on the routes it reflects.",
        answer: [
          "CORE-RR2 has been given CORE-RR1's cluster-ID (10.255.0.1). When CORE-RR1 reflects the CE-LAN prefix to CORE-RR2, it puts 10.255.0.1 in the cluster list. CORE-RR2 sees its own cluster-ID there, treats the route as a loop and discards it. That is why the route is not in its table at all.",
          "No session dropped and no error was logged, because discarding a looped route is normal behavior. The only sign is a route that is present on one reflector and missing on the other, and a client with one path instead of two.",
          "If CORE-RR1 fails, EDGE2 has no path at all to the CE-LAN prefix from either reflector, because CORE-RR2 never had it. The fix is to give CORE-RR2 a unique cluster-ID again ('bgp cluster-id 10.255.0.2'), or to redesign both reflectors to share one ID properly with the same clients peering with both."
        ]
      },
      quiz: [
        { q: "Two reflectors share cluster-ID 10.255.0.1. RR1 reflects a client's route to RR2, and RR2 also sees the route directly from a client. What does RR2 do with the copy from RR1?", options: ["Uses it as best", "Discards it because its own cluster-ID is in the cluster list", "Reflects it back to RR1", "Changes its cluster-ID"], answer: 1, why: "The copy reflected by RR1 carries cluster-ID 10.255.0.1, which is also RR2's own, so RR2 sees a loop and discards it." },
        { q: "EDGE2 has two paths with the same ORIGINATOR_ID. The path through RR1 has a cluster list of length 1, the one through RR2 has length 2. Which wins, and at which step?", options: ["RR2 at step 12", "RR1 at step 11", "RR1 at step 5", "They tie"], answer: 1, why: "Step 10 (ORIGINATOR_ID) ties, and step 11 prefers the shorter cluster list." },
        { q: "When is it correct for two reflectors to share a cluster-ID?", options: ["Never", "When they have exactly the same clients and every client peers with both", "Only when they are in different ASes", "Only when they are clients of each other"], answer: 1, why: "A shared cluster-ID is a valid design only when both reflectors serve identical clients that peer with both, so they do not depend on reflecting to each other." },
        { q: "What is the default cluster-ID of a route reflector?", options: ["0.0.0.0", "Its router-ID", "Its AS number", "The router-ID of its first client"], answer: 1, why: "If you do not configure 'bgp cluster-id', the reflector uses its own router-ID." }
      ]
    }
  },

/* END BATCH 3 */
});

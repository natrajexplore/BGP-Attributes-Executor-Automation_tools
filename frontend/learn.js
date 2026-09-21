/* Learn tab: 11 BGP attributes, each with a mechanism diagram, an enterprise
   production use case diagram, config, verify commands and pitfalls.
   Diagrams are generated from data (topo() / decision()) so they stay consistent. */
(() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let uid = 0;

  const KIND = {            // fill, stroke
    ent: ["#1f6feb26", "#4aa3ff"], isp: ["#d2992226", "#d29922"], dc: ["#3fb95026", "#3fb950"],
    rr: ["#a371f726", "#a371f7"], net: ["#8b9bb022", "#8b9bb0"], bad: ["#f8514922", "#f85149"],
  };
  const NOTE = { a: "#4aa3ff", ok: "#3fb950", bad: "#f85149", warn: "#d29922" };

  /* ---------- topology / flow diagram ---------- */
  function topo({ w = 680, h = 260, nodes, links = [], notes = [] }) {
    const id = "m" + (++uid), N = Object.fromEntries(nodes.map(n => [n.id, n]));
    let s = `<svg viewBox="0 0 ${w} ${h}" class="dg" role="img"><defs>`;
    for (const [k, c] of Object.entries({ ok: "#3fb950", bk: "#8b9bb0", bad: "#f85149" }))
      s += `<marker id="${id}${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
    s += `</defs>`;
    for (const l of links) {
      const a = N[l.a], b = N[l.b], cls = l.cls || "bk";
      const dash = cls === "hl" ? "" : ' stroke-dasharray="6 4"';
      const col = cls === "hl" ? "#3fb950" : cls === "bad" ? "#f85149" : "#8b9bb0";
      const mk = l.arrow ? ` marker-end="url(#${id}${cls === "hl" ? "ok" : cls === "bad" ? "bad" : "bk"})"` : "";
      // stop the line at the node edge so the arrowhead is visible
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const trim = l.arrow ? Math.min(len / 2, Math.abs(dx) > Math.abs(dy) * 1.6 ? (b.w || 132) / 2 + 2 : 26) : 0;
      const x2 = b.x - dx / len * trim, y2 = b.y - dy / len * trim;
      s += `<line x1="${a.x}" y1="${a.y}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${cls === "hl" ? 3 : 2}"${dash}${mk}/>`;
      if (l.label) s += `<text x="${(a.x + b.x) / 2 + (l.dx || 0)}" y="${(a.y + b.y) / 2 + (l.dy ?? -8)}" class="lb" fill="${col}" text-anchor="middle">${esc(l.label)}</text>`;
    }
    for (const n of nodes) {
      const [f, st] = KIND[n.kind || "ent"], nw = n.w || 132, nh = n.h || 46;
      const rx = n.kind === "isp" || n.kind === "net" ? 23 : 8;
      s += `<rect x="${n.x - nw / 2}" y="${n.y - nh / 2}" width="${nw}" height="${nh}" rx="${rx}" fill="#0b0f14"/>`;   // opaque backing hides lines behind the node
      s += `<rect x="${n.x - nw / 2}" y="${n.y - nh / 2}" width="${nw}" height="${nh}" rx="${rx}" fill="${f}" stroke="${st}" stroke-width="1.5"/>`;
      s += n.sub
        ? `<text x="${n.x}" y="${n.y - 3}" class="nl" text-anchor="middle">${esc(n.label)}</text><text x="${n.x}" y="${n.y + 12}" class="ns" text-anchor="middle">${esc(n.sub)}</text>`
        : `<text x="${n.x}" y="${n.y + 4}" class="nl" text-anchor="middle">${esc(n.label)}</text>`;
    }
    for (const t of notes) {
      const col = NOTE[t.c || "a"], tw = t.text.length * 5.9 + 18;
      s += `<rect x="${t.x - tw / 2}" y="${t.y - 12}" width="${tw}" height="22" rx="11" fill="#0b0f14" stroke="${col}"/>`;
      s += `<text x="${t.x}" y="${t.y + 3}" class="pl" fill="${col}" text-anchor="middle">${esc(t.text)}</text>`;
    }
    return s + `</svg>`;
  }

  /* ---------- two-route decision diagram ---------- */
  function decision({ a, b, win, why, w = 680 }) {
    const rows = a.rows.length, ch = 46 + rows * 26 + 12, h = ch + 62;
    const card = (c, x, isWin) => {
      let s = `<rect x="${x}" y="14" width="290" height="${ch}" rx="10" fill="#171f29" stroke="${isWin ? "#3fb950" : "#2b3947"}" stroke-width="${isWin ? 2.5 : 1.5}" opacity="${isWin ? 1 : .8}"/>`;
      s += `<text x="${x + 14}" y="38" class="nl">${esc(c.name)}</text>`;
      if (isWin) s += `<rect x="${x + 226}" y="22" width="52" height="20" rx="10" fill="#3fb950"/><text x="${x + 252}" y="36" class="pl" fill="#04140a" text-anchor="middle" font-weight="700">BEST</text>`;
      c.rows.forEach(([k, v, cmp], i) => {
        const y = 56 + i * 26;
        if (cmp) s += `<rect x="${x + 6}" y="${y}" width="278" height="24" rx="5" fill="#d2992233" stroke="#d29922"/>`;
        s += `<text x="${x + 14}" y="${y + 16}" class="ns" fill="#8b9bb0">${esc(k)}</text><text x="${x + 278}" y="${y + 16}" class="ns" fill="#e6edf3" text-anchor="end" ${cmp ? 'font-weight="700"' : ""}>${esc(v)}</text>`;
      });
      return s;
    };
    return `<svg viewBox="0 0 ${w} ${h}" class="dg" role="img">${card(a, 20, win === "a")}${card(b, 370, win === "b")}` +
      `<circle cx="340" cy="${14 + ch / 2}" r="16" fill="#0b0f14" stroke="#2b3947"/><text x="340" y="${14 + ch / 2 + 4}" class="pl" fill="#8b9bb0" text-anchor="middle">vs</text>` +
      `<rect x="20" y="${ch + 24}" width="640" height="34" rx="8" fill="#0b0f14" stroke="#4aa3ff55"/><text x="340" y="${ch + 45}" class="pl" fill="#4aa3ff" text-anchor="middle">${esc(why)}</text></svg>`;
  }

  /* ---------- best-path order ---------- */
  const ORDER = ["Weight ↑", "Local-Pref ↑", "Locally originated", "AS_PATH length ↓", "ORIGIN i<e<?", "MED ↓",
    "eBGP over iBGP", "IGP metric to next-hop ↓", "Oldest eBGP path", "Router-ID / ORIGINATOR_ID ↓", "CLUSTER_LIST length ↓", "Neighbor IP ↓"];

  function orderStrip(step, note) {
    return `<div class="ord">` + ORDER.map((t, i) => `<span class="${step === i + 1 ? "on" : ""}"><b>${i + 1}</b>${esc(t)}</span>`).join("") +
      `</div>` + (note ? `<div class="hint">${esc(note)}</div>` : "");
  }

  /* ---------- content ---------- */
  const ATTRS = [
    {
      id: "01_weight", name: "WEIGHT", tag: "Cisco-only · local to router", step: 1, scope: "This router only", dflt: "0 (32768 if locally originated)", type: "Cisco proprietary (not a BGP attribute on the wire)",
      what: ["A per-router preference number. It is never sent to any neighbor, so it cannot influence other routers.",
        "Checked first in best-path selection: the highest weight wins before Local-Pref, AS_PATH or anything else.",
        "Use it when one specific router needs a different exit than the rest of the AS."],
      mech: () => decision({
        a: { name: "Path 1 · via iBGP (EDGE2 → ISP-B)", rows: [["WEIGHT", "200", 1], ["LOCAL_PREF", "100"], ["AS_PATH", "65002 65100"], ["ORIGIN", "IGP"]] },
        b: { name: "Path 2 · via eBGP (ISP-A)", rows: [["WEIGHT", "0", 1], ["LOCAL_PREF", "100"], ["AS_PATH", "65001 65100"], ["ORIGIN", "IGP"]] },
        win: "a", why: "Weight is step 1: 200 beats 0, so nothing else is even compared."
      }),
      useTitle: "Regional breakout: a site always exits through its own local ISP",
      useText: "A branch/regional hub has a local Internet link and a WAN path to HQ (where the rest of the AS exits). Set a high weight on routes from the local ISP. This router exits locally, and no other router changes behavior because weight is never advertised.",
      use: () => topo({
        h: 250, nodes: [
          { id: "lan", x: 70, y: 125, label: "Site users", sub: "10.20.0.0/16", kind: "net", w: 112 },
          { id: "r1", x: 250, y: 125, label: "SITE-R1", sub: "AS 65000", kind: "ent" },
          { id: "isp", x: 470, y: 55, label: "Local ISP", sub: "AS 64500", kind: "isp" },
          { id: "hq", x: 470, y: 195, label: "HQ edge (iBGP)", sub: "AS 65000", kind: "ent" },
          { id: "net", x: 625, y: 125, label: "Internet", kind: "net", w: 84 }],
        links: [{ a: "lan", b: "r1" }, { a: "r1", b: "isp", cls: "hl", arrow: 1, label: "weight 300", dy: -10, dx: -6 },
        { a: "r1", b: "hq", cls: "bk", label: "iBGP path, weight 0", dy: 14, dx: -46 }, { a: "isp", b: "net" }, { a: "hq", b: "net" }],
        notes: [{ x: 250, y: 60, text: "Weight stays on SITE-R1", c: "warn" }, { x: 560, y: 240, text: "Other sites unaffected", c: "ok" }]
      }),
      config: `route-map LOCAL-ISP-IN permit 10
 set weight 300
router bgp 65000
 neighbor 198.51.100.1 remote-as 64500
 neighbor 198.51.100.1 route-map LOCAL-ISP-IN in`,
      verify: ["show ip bgp 100.100.100.0/24   ! Weight column = 300, marked best (>)", "clear ip bgp * soft in   ! re-apply inbound policy without a reset"],
      pitfalls: ["Not advertised: every router needs its own setting, which is easy to forget and hard to audit.", "Overrides Local-Pref, so a stray weight can silently defeat AS-wide policy.", "Cisco-specific. Juniper/Arista use different knobs (preference), so multi-vendor networks should prefer Local-Pref."],
    },
    {
      id: "02_local_pref", name: "LOCAL_PREF", tag: "AS-wide exit policy", step: 2, scope: "Whole AS (iBGP only)", dflt: "100", type: "Well-known discretionary, iBGP only",
      what: ["Tells every router in your AS which exit is preferred. It is carried in iBGP and never sent to eBGP peers.",
        "Highest value wins (step 2), so it beats AS_PATH length, MED and everything after it.",
        "This is the main tool for choosing your outbound exit, such as primary and backup ISPs."],
      mech: () => decision({
        a: { name: "Path 1 · EDGE1 → ISP-A", rows: [["WEIGHT", "0"], ["LOCAL_PREF", "200", 1], ["AS_PATH", "65001 65050 65100 (3)"], ["MED", "0"]] },
        b: { name: "Path 2 · EDGE2 → ISP-B", rows: [["WEIGHT", "0"], ["LOCAL_PREF", "100", 1], ["AS_PATH", "65002 65100 (2)"], ["MED", "0"]] },
        win: "a", why: "Local-Pref (step 2) wins even though this AS_PATH is longer."
      }),
      useTitle: "Dual-homed enterprise: primary and backup Internet provider",
      useText: "ISP-A is the fast primary link and ISP-B is the cheaper backup. EDGE1 stamps Local-Pref 200 on routes from ISP-A and EDGE2 keeps 100 for ISP-B. iBGP spreads this to every router, so the whole AS exits through ISP-A and fails over to ISP-B only if ISP-A routes disappear.",
      use: () => topo({
        h: 290, nodes: [
          { id: "net", x: 340, y: 30, label: "Internet / SaaS", kind: "net", w: 150 },
          { id: "a", x: 140, y: 100, label: "ISP-A · primary", sub: "AS 65001 · 1 Gbps", kind: "isp", w: 150 },
          { id: "b", x: 540, y: 100, label: "ISP-B · backup", sub: "AS 65002 · 200 Mbps", kind: "isp", w: 150 },
          { id: "e1", x: 140, y: 185, label: "EDGE1", sub: "LP 200 in", kind: "ent" },
          { id: "e2", x: 540, y: 185, label: "EDGE2", sub: "LP 100 (default)", kind: "ent" },
          { id: "core", x: 340, y: 255, label: "Core / RR · users, DC", sub: "AS 65000", kind: "rr", w: 180 }],
        links: [{ a: "a", b: "net" }, { a: "b", b: "net" }, { a: "e1", b: "a", cls: "hl" }, { a: "e2", b: "b", cls: "bk" },
        { a: "core", b: "e1", cls: "hl", label: "iBGP carries LP 200", dx: -36, dy: 6 }, { a: "core", b: "e2", cls: "bk", label: "iBGP LP 100", dx: 30, dy: 6 }],
        notes: [{ x: 340, y: 150, text: "All routers pick ISP-A · ISP-B is failover", c: "ok" }]
      }),
      config: `! EDGE1 (primary)
route-map ISP-A-IN permit 10
 set local-preference 200
router bgp 65000
 neighbor 172.16.12.1 remote-as 65001
 neighbor 172.16.12.1 route-map ISP-A-IN in
! EDGE2 keeps the default 100 (or set it explicitly)`,
      verify: ["show ip bgp 100.100.100.0/24   ! on any router: localpref 200, best, via EDGE1", "show ip bgp neighbors 172.16.12.1 policy   ! confirm the route-map is attached"],
      pitfalls: ["Set it inbound at the edge. Local-Pref set outbound to eBGP peers is meaningless.", "Every edge must be consistent, or two routers can pick different exits and cause asymmetric paths.", "It only applies inside one AS. To steer how others reach you, use AS_PATH prepending or MED."],
    },
    {
      id: "03_as_path", name: "AS_PATH", tag: "Inbound traffic engineering", step: 4, scope: "Everywhere (grows per AS)", dflt: "Empty when locally originated", type: "Well-known mandatory",
      what: ["The ordered list of ASNs a route has crossed. Each eBGP hop adds its own ASN.",
        "Shorter AS_PATH wins (step 4). A router also drops any route whose AS_PATH contains its own ASN: this is BGP's loop prevention.",
        "Prepending (repeating your own ASN) makes a path look longer, so others prefer the other path into your network."],
      mech: () => decision({
        a: { name: "Seen by CONTENT · via ISP-A", rows: [["WEIGHT", "0"], ["LOCAL_PREF", "100"], ["AS_PATH", "65001 65000", 1], ["Length", "2"]] },
        b: { name: "Seen by CONTENT · via ISP-B", rows: [["WEIGHT", "0"], ["LOCAL_PREF", "100"], ["AS_PATH", "65002 65000 ×4", 1], ["Length", "5"]] },
        win: "a", why: "Shortest AS_PATH wins: 2 hops beat 5, so traffic returns via ISP-A."
      }),
      useTitle: "Inbound traffic engineering: make the backup ISP look farther away",
      useText: "You control how you leave with Local-Pref, but the Internet decides how it enters. Prepend your ASN 3 extra times toward the backup ISP-B. Remote networks then see a longer path via ISP-B and send return traffic through ISP-A.",
      use: () => topo({
        h: 270, nodes: [
          { id: "net", x: 340, y: 30, label: "Remote networks", sub: "customers, SaaS", kind: "net", w: 160 },
          { id: "a", x: 140, y: 110, label: "ISP-A", sub: "AS 65001", kind: "isp" },
          { id: "b", x: 540, y: 110, label: "ISP-B", sub: "AS 65002", kind: "isp" },
          { id: "ent", x: 340, y: 225, label: "Enterprise AS 65000", sub: "203.0.113.0/24", kind: "ent", w: 170 }],
        links: [{ a: "net", b: "a", cls: "hl" }, { a: "net", b: "b" }, { a: "ent", b: "a", cls: "hl", label: "path: 65000", dx: -44, dy: 4 },
        { a: "ent", b: "b", cls: "bk", label: "prepend ×3: 65000 65000 65000 65000", dx: 62, dy: 24 }],
        notes: [{ x: 120, y: 60, text: "Shorter path preferred", c: "ok" }, { x: 560, y: 60, text: "Longer path = backup", c: "warn" }]
      }),
      config: `route-map ISP-B-OUT permit 10
 set as-path prepend 65000 65000 65000
router bgp 65000
 neighbor 172.16.34.1 remote-as 65002
 neighbor 172.16.34.1 route-map ISP-B-OUT out`,
      verify: ["show ip bgp 10.10.0.0/24   ! on the ISP/remote side: 65002 65000 65000 65000 65000", "show ip bgp neighbors 172.16.34.1 advertised-routes"],
      pitfalls: ["Only a hint: an upstream that sets Local-Pref by customer community can ignore your AS_PATH length.", "Use 2 to 3 prepends. Beyond about 5 there is rarely any extra effect, and it looks like a leak or misconfiguration.", "Never use your neighbor's ASN in a prepend; some networks filter it as a hijack."],
    },
    {
      id: "04_origin", name: "ORIGIN", tag: "Redistribution hygiene", step: 5, scope: "Everywhere (transitive)", dflt: "i via network · ? via redistribute", type: "Well-known mandatory",
      what: ["Records how the route entered BGP: i = IGP (network statement), e = EGP (legacy), ? = incomplete (redistributed).",
        "Lowest wins (step 5): i beats e beats ?.",
        "It is rarely used on purpose. It matters because mixed redistribute/network setups create accidental tie-breaks."],
      mech: () => decision({
        a: { name: "Path 1 · via ISP-A", rows: [["WEIGHT", "0"], ["LOCAL_PREF", "100"], ["AS_PATH", "65001 65100 (2)"], ["ORIGIN", "? incomplete", 1]] },
        b: { name: "Path 2 · via ISP-B", rows: [["WEIGHT", "0"], ["LOCAL_PREF", "100"], ["AS_PATH", "65002 65100 (2)"], ["ORIGIN", "i IGP", 1]] },
        win: "b", why: "AS_PATH ties, so the lowest ORIGIN decides: i (IGP) beats ? (incomplete)."
      }),
      useTitle: "Two edge routers originate the same prefix in different ways",
      useText: "EDGE1 injects the enterprise prefix with a network statement (ORIGIN i). EDGE2 redistributes a static route (ORIGIN ?). The ISP silently prefers EDGE1 on the ORIGIN tie-break, and nobody chose that. Normalize ORIGIN with a route-map or use network statements on both.",
      use: () => topo({
        h: 260, nodes: [
          { id: "isp", x: 340, y: 40, label: "ISP (one AS)", sub: "AS 65001", kind: "isp", w: 150 },
          { id: "e1", x: 160, y: 130, label: "EDGE1", sub: "network stmt → ORIGIN i", kind: "ent", w: 170 },
          { id: "e2", x: 520, y: 130, label: "EDGE2", sub: "redistribute static → ORIGIN ?", kind: "ent", w: 190 },
          { id: "lan", x: 340, y: 215, label: "Enterprise LAN", sub: "10.10.0.0/16", kind: "dc", w: 150 }],
        links: [{ a: "isp", b: "e1", cls: "hl", label: "preferred (i)", dx: -40 }, { a: "isp", b: "e2", cls: "bk", label: "loses (?)", dx: 40 }, { a: "e1", b: "lan" }, { a: "e2", b: "lan" }],
        notes: [{ x: 340, y: 100, text: "Unintended tie-break!", c: "bad" }, { x: 520, y: 178, text: "Fix: set origin igp", c: "ok" }]
      }),
      config: `route-map ISP-OUT permit 10
 set origin igp
router bgp 65000
 neighbor 172.16.34.1 route-map ISP-OUT out
! or originate with: network 10.10.0.0 mask 255.255.0.0`,
      verify: ["show ip bgp 10.10.0.0/16   ! Origin IGP, metric, localpref, valid, best", "show ip bgp | include ^.[ i]?"],
      pitfalls: ["Changing redistribution to network statements flips ORIGIN and can reroute traffic unexpectedly.", "Do not use ORIGIN for traffic engineering: Local-Pref and AS_PATH are clearer to audit.", "ORIGIN e (EGP) is legacy and shows up only on very old designs."],
    },
    {
      id: "05_med", name: "MULTI_EXIT_DISC", tag: "Steer a neighbor AS", step: 6, scope: "Neighbor AS only (non-transitive)", dflt: "0 (or worst if missing-as-worst)", type: "Optional non-transitive",
      what: ["MED (metric) is a hint you send to a neighboring AS about which of several links into your AS is preferred.",
        "Lowest wins (step 6). By default it is only compared between paths from the same neighboring AS.",
        "It is not passed on beyond that neighbor. It only influences how one adjacent network enters yours."],
      mech: () => decision({
        a: { name: "Link 1 · ISP POP-East", rows: [["NEIGHBOR AS", "65001"], ["LOCAL_PREF", "100"], ["AS_PATH", "65001"], ["MED", "50", 1]] },
        b: { name: "Link 2 · ISP POP-West", rows: [["NEIGHBOR AS", "65001"], ["LOCAL_PREF", "100"], ["AS_PATH", "65001"], ["MED", "200", 1]] },
        win: "a", why: "Lower MED wins. Only valid because both paths come from the same AS (65001)."
      }),
      useTitle: "Two links to the same ISP: deliver traffic to the nearest data center",
      useText: "DC-East and DC-West each connect to a different ISP point of presence. For East prefixes, DC-East sends MED 50 and DC-West sends MED 200 (the reverse for West prefixes). The ISP delivers traffic to the correct data center and uses the other link only on failure.",
      use: () => topo({
        h: 290, nodes: [
          { id: "p1", x: 150, y: 50, label: "ISP POP-East", sub: "AS 65001", kind: "isp" },
          { id: "p2", x: 530, y: 50, label: "ISP POP-West", sub: "AS 65001", kind: "isp" },
          { id: "d1", x: 150, y: 220, label: "DC-East", sub: "10.1.0.0/16", kind: "dc" },
          { id: "d2", x: 530, y: 220, label: "DC-West", sub: "10.2.0.0/16", kind: "dc" }],
        links: [{ a: "p1", b: "p2", label: "ISP backbone", dy: -8 }, { a: "d1", b: "p1", cls: "hl", label: "MED 50", dx: -30 }, { a: "d2", b: "p2", cls: "hl", label: "MED 50", dx: 30 },
        { a: "d1", b: "p2", cls: "bk", label: "MED 200 (backup)", dx: -60, dy: 36 }, { a: "d2", b: "p1", cls: "bk", label: "MED 200 (backup)", dx: 60, dy: 36 }],
        notes: [{ x: 340, y: 272, text: "East prefixes enter East, West prefixes enter West", c: "ok" }]
      }),
      config: `! DC-East router: East prefixes prefer the East link
route-map TO-ISP-EAST permit 10
 set metric 50
router bgp 65000
 neighbor 172.16.12.1 route-map TO-ISP-EAST out
! DC-West router advertises the same East prefixes with metric 200
route-map TO-ISP-WEST-BACKUP permit 10
 set metric 200`,
      verify: ["show ip bgp 10.1.0.0/16   ! on the ISP side: metric 50 on East, 200 on West", "show ip bgp neighbors 172.16.12.1 advertised-routes"],
      pitfalls: ["The ISP must honor MED. Many ignore it or override it with their own Local-Pref, so confirm in their contract or docs.", "Different neighbor ASes are not compared unless bgp always-compare-med is set (the lab does this to simulate two providers).", "always-compare-med and inconsistent MED values can cause route flapping (MED oscillation). Use bgp deterministic-med."],
    },
    {
      id: "06_next_hop", name: "NEXT_HOP", tag: "Reachability", step: 8, scope: "Per hop (rewritten by eBGP)", dflt: "Advertising peer's address", type: "Well-known mandatory",
      what: ["The IP address to forward packets to. eBGP sets it to the advertising router; iBGP keeps it unchanged.",
        "A route is only usable if the router can reach its next hop (usually via the IGP). If not, it shows inaccessible.",
        "Step 8 of best-path compares the IGP metric to the next hop, so it also affects which exit is closest."],
      mech: () => topo({
        h: 250, nodes: [
          { id: "a1", x: 80, y: 60, label: "ISP-A", sub: "172.16.12.1", kind: "isp", w: 110 }, { id: "e1", x: 300, y: 60, label: "EDGE1", sub: "next-hop-self", kind: "ent", w: 120 }, { id: "c1", x: 560, y: 60, label: "EDGE2 / CE-LAN", sub: "iBGP peer", kind: "ent", w: 140 },
          { id: "a2", x: 80, y: 180, label: "ISP-A", sub: "172.16.12.1", kind: "isp", w: 110 }, { id: "e2", x: 300, y: 180, label: "EDGE1", sub: "no next-hop-self", kind: "bad", w: 120 }, { id: "c2", x: 560, y: 180, label: "EDGE2 / CE-LAN", sub: "iBGP peer", kind: "ent", w: 140 }],
        links: [{ a: "a1", b: "e1", cls: "hl", arrow: 1, label: "NH 172.16.12.1", dy: -10 }, { a: "e1", b: "c1", cls: "hl", arrow: 1, label: "NH 10.255.0.11", dy: -10 },
        { a: "a2", b: "e2", cls: "hl", arrow: 1, label: "NH 172.16.12.1", dy: -10 }, { a: "e2", b: "c2", cls: "bad", arrow: 1, label: "NH unchanged", dy: -10 }],
        notes: [{ x: 560, y: 100, text: "10.255.0.11 is in OSPF → usable", c: "ok" }, { x: 560, y: 222, text: "172.16.12.1 not in IGP → inaccessible", c: "bad" }]
      }),
      useTitle: "Edge routers use next-hop-self so the core needs only loopbacks",
      useText: "Internal routers do not carry ISP point-to-point subnets in the IGP. Each edge router sets itself as next hop toward the route reflectors, so the core only needs each edge's loopback (already in OSPF). Without it, every Internet route learned on that edge becomes inaccessible everywhere else.",
      use: () => topo({
        h: 290, nodes: [
          { id: "a", x: 130, y: 40, label: "ISP-A", sub: "172.16.12.0/30", kind: "isp", w: 140 }, { id: "b", x: 550, y: 40, label: "ISP-B", sub: "172.16.34.0/30", kind: "isp", w: 140 },
          { id: "e1", x: 130, y: 130, label: "EDGE1", sub: "lo 10.255.0.11", kind: "ent" }, { id: "e2", x: 550, y: 130, label: "EDGE2", sub: "lo 10.255.0.12", kind: "ent" },
          { id: "rr1", x: 250, y: 235, label: "CORE-RR1", sub: "10.255.0.1", kind: "rr" }, { id: "rr2", x: 430, y: 235, label: "CORE-RR2", sub: "10.255.0.2", kind: "rr" }],
        links: [{ a: "a", b: "e1" }, { a: "b", b: "e2" }, { a: "e1", b: "rr1", cls: "hl" }, { a: "e1", b: "rr2", cls: "hl" }, { a: "e2", b: "rr1", cls: "hl" }, { a: "e2", b: "rr2", cls: "hl" }, { a: "rr1", b: "rr2" }],
        notes: [{ x: 340, y: 145, text: "iBGP next hop = edge loopback (IGP)", c: "ok" }, { x: 340, y: 40, text: "ISP /30 subnets stay out of the IGP", c: "a" }]
      }),
      config: `router bgp 65000
 neighbor 10.255.0.1 remote-as 65000
 neighbor 10.255.0.1 update-source Loopback0
 address-family ipv4
  neighbor 10.255.0.1 next-hop-self
  neighbor 10.255.0.2 next-hop-self`,
      verify: ["show ip bgp 100.100.100.0/24   ! Next hop 10.255.0.11, not 'inaccessible'", "show ip route 10.255.0.11   ! the next hop must be reachable via the IGP"],
      pitfalls: ["Removing next-hop-self on edges (or a route reflector rewriting it) blackholes traffic. This is the lab's scenario 06.", "Alternative design: keep the /30 in the IGP as passive interfaces, but that grows the IGP and leaks ISP subnets.", "On shared LANs, eBGP keeps the third-party next hop. Check it with show ip bgp."],
    },
    {
      id: "07_atomic_aggregate", name: "ATOMIC_AGGREGATE", tag: "Summarization flag", step: null, stepNote: "Not a tie-breaker: informational flag set when path detail is lost.", scope: "Everywhere (transitive)", dflt: "Absent", type: "Well-known discretionary",
      what: ["A flag added when a router aggregates routes and drops detail: the AS_PATH information of the components is lost.",
        "It tells the receiver: this prefix is less specific than the originals, so do not de-aggregate it.",
        "It does not change best-path selection. It is a warning that path detail was discarded."],
      mech: () => topo({
        h: 250, nodes: [
          { id: "c1", x: 70, y: 50, label: "10.10.1.0/24", kind: "dc", w: 104, h: 36 }, { id: "c2", x: 70, y: 125, label: "10.10.2.0/24", kind: "dc", w: 104, h: 36 }, { id: "c3", x: 70, y: 200, label: "10.10.3.0/24", kind: "dc", w: 104, h: 36 },
          { id: "e", x: 300, y: 125, label: "EDGE1", sub: "aggregate-address /16", kind: "ent", w: 170 }, { id: "isp", x: 565, y: 125, label: "ISP-A", sub: "sees only the /16", kind: "isp", w: 140 }],
        links: [{ a: "c1", b: "e" }, { a: "c2", b: "e" }, { a: "c3", b: "e" }, { a: "e", b: "isp", cls: "hl", arrow: 1, label: "10.10.0.0/16", dy: -12 }],
        notes: [{ x: 565, y: 60, text: "ATOMIC_AGGREGATE set", c: "warn" }, { x: 565, y: 195, text: "AGGREGATOR 65000 10.255.0.11", c: "a" }, { x: 300, y: 205, text: "summary-only hides the /24s", c: "ok" }]
      }),
      useTitle: "Summarize internal networks to the ISP to keep tables small and hide churn",
      useText: "Sites advertise many /24s internally. EDGE1 summarizes them into one /16 toward the ISP with summary-only. The ISP holds one route, and internal flaps never leave the AS. The receiver sees ATOMIC_AGGREGATE and knows this is a summary.",
      use: () => topo({
        h: 270, nodes: [
          { id: "s1", x: 70, y: 50, label: "Site A", sub: "10.10.1.0/24", kind: "dc", w: 112 }, { id: "s2", x: 70, y: 135, label: "Site B", sub: "10.10.2.0/24", kind: "dc", w: 112 }, { id: "s3", x: 70, y: 220, label: "Site C", sub: "10.10.3.0/24", kind: "dc", w: 112 },
          { id: "e", x: 290, y: 135, label: "EDGE1", sub: "AS 65000", kind: "ent" }, { id: "isp", x: 480, y: 135, label: "ISP-A", kind: "isp", w: 100 }, { id: "net", x: 625, y: 135, label: "Internet", kind: "net", w: 84 }],
        links: [{ a: "s1", b: "e" }, { a: "s2", b: "e" }, { a: "s3", b: "e" }, { a: "e", b: "isp", cls: "hl", label: "/16 only", dy: -12, dx: 12 }, { a: "isp", b: "net" }],
        notes: [{ x: 480, y: 80, text: "ISP table: 1 route, not 3", c: "ok" }, { x: 330, y: 235, text: "Risk: /16 stays up if one site dies → blackhole", c: "bad" }]
      }),
      config: `router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 summary-only`,
      verify: ["show ip bgp 10.10.0.0/16   ! on ISP-A: 'Atomic-aggregate'", "show ip bgp 10.10.1.0/24   ! on ISP-A: not in table (suppressed)"],
      pitfalls: ["Blackhole risk: the aggregate is advertised while any single component exists, even if the others are down. Use per-site tracking or conditional advertisement.", "You lose AS_PATH detail, which weakens loop detection. Use as-set if components come from different ASes (see AGGREGATOR).", "summary-only hides specifics, so multi-homed sites may lose fine-grained traffic engineering."],
    },
    {
      id: "08_aggregator", name: "AGGREGATOR", tag: "Who built the summary", step: null, stepNote: "Not a tie-breaker: identifies the router that formed the aggregate.", scope: "Everywhere (transitive)", dflt: "Absent", type: "Optional transitive",
      what: ["Carries the ASN and router-id of the router that created an aggregate route, so anyone can trace who summarized it.",
        "With as-set, the aggregate also carries an AS_SET of the component ASes. ATOMIC_AGGREGATE is then not set because path information is preserved.",
        "Purely informational, and very useful when two routers both aggregate and you need to tell which one you are seeing."],
      mech: () => topo({
        h: 250, nodes: [
          { id: "c1", x: 80, y: 60, label: "Subsidiary A", sub: "AS 65010", kind: "dc", w: 130 }, { id: "c2", x: 80, y: 190, label: "Subsidiary B", sub: "AS 65020", kind: "dc", w: 130 },
          { id: "e", x: 320, y: 125, label: "EDGE1 · AS 65000", sub: "aggregate as-set", kind: "ent", w: 170 }, { id: "isp", x: 575, y: 125, label: "ISP-A", kind: "isp", w: 100 }],
        links: [{ a: "c1", b: "e" }, { a: "c2", b: "e" }, { a: "e", b: "isp", cls: "hl", arrow: 1, label: "10.10.0.0/16", dy: -12 }],
        notes: [{ x: 540, y: 60, text: "AS_PATH {65010 65020}", c: "ok" }, { x: 540, y: 190, text: "AGGREGATOR 65000 10.255.0.11", c: "a" }, { x: 320, y: 225, text: "No ATOMIC_AGGREGATE (detail kept)", c: "warn" }]
      }),
      useTitle: "Merged enterprise: two edge routers summarize, and NOC must tell them apart",
      useText: "After an acquisition, subsidiary ASes 65010 and 65020 sit behind HQ. EDGE1 and EDGE2 both aggregate to 10.10.0.0/16 with as-set. The AS_SET keeps loop protection, and AGGREGATOR shows the ISP or your NOC which edge (10.255.0.11 vs .12) built the route they are looking at.",
      use: () => topo({
        h: 280, nodes: [
          { id: "s1", x: 80, y: 60, label: "Subsidiary A", sub: "AS 65010", kind: "dc", w: 130 }, { id: "s2", x: 80, y: 200, label: "Subsidiary B", sub: "AS 65020", kind: "dc", w: 130 },
          { id: "e1", x: 320, y: 60, label: "EDGE1", sub: "10.255.0.11", kind: "ent" }, { id: "e2", x: 320, y: 200, label: "EDGE2", sub: "10.255.0.12", kind: "ent" }, { id: "isp", x: 580, y: 130, label: "ISP", kind: "isp", w: 110 }],
        links: [{ a: "s1", b: "e1" }, { a: "s2", b: "e2" }, { a: "s1", b: "e2" }, { a: "s2", b: "e1" }, { a: "e1", b: "isp", cls: "hl", label: "AGGR 65000 .11", dx: -6, dy: -10 }, { a: "e2", b: "isp", cls: "hl", label: "AGGR 65000 .12", dx: -6, dy: 20 }],
        notes: [{ x: 570, y: 235, text: "NOC sees which edge built it", c: "a" }, { x: 570, y: 30, text: "as-set: watch for churn", c: "warn" }]
      }),
      config: `router bgp 65000
 address-family ipv4
  aggregate-address 10.10.0.0 255.255.0.0 as-set summary-only`,
      verify: ["show ip bgp 10.10.0.0/16   ! 'aggregated by 65000 10.255.0.11' and no atomic-aggregate", "show ip bgp 10.10.0.0/16 | include Aggregated|atomic"],
      pitfalls: ["as-set aggregates change (and re-advertise) whenever a component's AS_PATH changes, which creates update churn.", "Private ASNs in the AS_SET can leak; consider remove-private-as toward the ISP.", "Make sure router-ids are unique and stable. AGGREGATOR is only useful if it identifies a router uniquely."],
    },
    {
      id: "09_community", name: "COMMUNITY", tag: "Tag and signal policy", step: null, stepNote: "Not a tie-breaker by itself: a tag that your policy (or your ISP's) acts on.", scope: "As far as it is sent (transitive)", dflt: "None", type: "Optional transitive",
      what: ["A 32-bit tag (usually ASN:value) attached to a route. It changes nothing on its own; routers or ISPs match it and apply policy.",
        "Well-known values: no-export (do not send outside the AS), no-advertise, local-AS, and internet.",
        "Cisco does not send communities by default. You must enable send-community per neighbor."],
      mech: () => topo({
        h: 240, nodes: [
          { id: "e", x: 90, y: 115, label: "EDGE1", sub: "AS 65000", kind: "ent" }, { id: "a", x: 340, y: 115, label: "ISP-A", sub: "AS 65001", kind: "isp" }, { id: "b", x: 590, y: 115, label: "ISP-B / CONTENT", kind: "isp", w: 130 }],
        links: [{ a: "e", b: "a", cls: "hl", arrow: 1, label: "10.10.0.0/16", dy: -14 }, { a: "a", b: "b", cls: "bad", arrow: 1, label: "not re-advertised", dy: -14 }],
        notes: [{ x: 215, y: 60, text: "tags: 65001:120 + no-export", c: "ok" }, { x: 340, y: 175, text: "ISP maps 65001:120 → its own local-pref 120", c: "a" }, { x: 590, y: 175, text: "no-export stops it here", c: "bad" }, { x: 125, y: 195, text: "needs neighbor send-community", c: "warn" }]
      }),
      useTitle: "Use ISP action communities, including remotely triggered blackhole (RTBH) for DDoS",
      useText: "Providers publish communities you can attach to trigger their behavior: 65001:120 sets a chosen local-pref inside the ISP, and 65001:666 blackholes a /32. When a web server is under DDoS, you announce its /32 tagged 65001:666 and the ISP drops the attack traffic at its own edge, before it saturates your link.",
      use: () => topo({
        h: 270, nodes: [
          { id: "dc", x: 80, y: 190, label: "Web server", sub: "203.0.113.50/32", kind: "dc", w: 130 }, { id: "e", x: 270, y: 190, label: "EDGE1", sub: "AS 65000", kind: "ent" },
          { id: "isp", x: 480, y: 190, label: "ISP-A edge", sub: "AS 65001", kind: "isp" }, { id: "atk", x: 590, y: 60, label: "DDoS sources", kind: "bad", w: 120 }],
        links: [{ a: "dc", b: "e" }, { a: "e", b: "isp", cls: "hl", arrow: 1, label: "65001:666", dy: -12 }, { a: "atk", b: "isp", cls: "bad", arrow: 1, label: "dropped at ISP", dx: 40, dy: -2 }],
        notes: [{ x: 270, y: 245, text: "Attack never reaches your uplink", c: "ok" }, { x: 170, y: 100, text: "Tag internal routes too: 65000:100 branch, :200 DC", c: "a" }]
      }),
      config: `ip prefix-list AGG permit 10.10.0.0/16
route-map ISPA-COMM permit 10
 match ip address prefix-list AGG
 set community 65001:120 no-export additive
route-map ISPA-COMM permit 20
router bgp 65000
 address-family ipv4
  neighbor 172.16.12.1 send-community
  neighbor 172.16.12.1 route-map ISPA-COMM out
! RTBH: set community 65001:666 no-export on the attacked /32`,
      verify: ["show ip bgp 10.10.0.0/16   ! Community: 65001:120 no-export", "show ip bgp community 65001:120", "show ip bgp neighbors 172.16.12.1 | include community"],
      pitfalls: ["Forgetting send-community means the tag never leaves the router, and nothing errors.", "Use additive; otherwise set community replaces existing tags.", "Providers scrub or ignore communities they did not publish. Always read their community guide.", "A community without a matching route-map does nothing, so keep an internal convention documented."],
    },
    {
      id: "10_originator_id", name: "ORIGINATOR_ID", tag: "Route reflector loop guard", step: 10, scope: "Inside the AS (non-transitive)", dflt: "Set by the first route reflector", type: "Optional non-transitive",
      what: ["Added by the first route reflector: it carries the router-id of the router that originally introduced the route into the AS.",
        "A router that receives a route with its own router-id as ORIGINATOR_ID discards it. This stops loops when reflectors reflect routes back.",
        "In best-path it replaces router-id in the router-id tie-break (step 10)."],
      mech: () => topo({
        h: 260, nodes: [
          { id: "e1", x: 70, y: 205, label: "EDGE1", sub: "10.255.0.11", kind: "ent", w: 110 }, { id: "r2", x: 250, y: 110, label: "CORE-RR2", sub: "adds ORIGINATOR_ID", kind: "rr", w: 140 },
          { id: "r1", x: 440, y: 110, label: "CORE-RR1", sub: "reflects", kind: "rr", w: 120 }, { id: "e2", x: 620, y: 55, label: "EDGE2", kind: "ent", w: 90 }, { id: "ce", x: 620, y: 165, label: "CE-LAN", kind: "ent", w: 90 }],
        links: [{ a: "e1", b: "r2", cls: "hl", arrow: 1, label: "10.255.99.1/32", dx: -30, dy: -6 }, { a: "r2", b: "r1", cls: "hl", arrow: 1 }, { a: "r1", b: "e2", cls: "hl", arrow: 1 }, { a: "r1", b: "ce", cls: "hl", arrow: 1 },
        { a: "r1", b: "e1", cls: "bad", arrow: 1, label: "own ID → discarded", dx: 30, dy: 12 }],
        notes: [{ x: 300, y: 30, text: "ORIGINATOR_ID = 10.255.0.11", c: "a" }, { x: 380, y: 240, text: "Loop prevented", c: "ok" }]
      }),
      useTitle: "Route reflectors instead of a full iBGP mesh in a large campus or data center",
      useText: "With N routers a full iBGP mesh needs N(N-1)/2 sessions. Two route reflectors cut that to about 2N. ORIGINATOR_ID makes reflection loop-safe and shows, on any router, which leaf really originated a route, which is useful when debugging.",
      use: () => topo({
        h: 260, nodes: [
          { id: "r1", x: 250, y: 55, label: "RR1", sub: "10.255.0.1", kind: "rr", w: 110 }, { id: "r2", x: 430, y: 55, label: "RR2", sub: "10.255.0.2", kind: "rr", w: 110 },
          { id: "l1", x: 80, y: 200, label: "Leaf 1", kind: "ent", w: 100 }, { id: "l2", x: 250, y: 200, label: "Leaf 2", kind: "ent", w: 100 }, { id: "l3", x: 430, y: 200, label: "Leaf 3", kind: "ent", w: 100 }, { id: "l4", x: 600, y: 200, label: "Leaf 4", kind: "ent", w: 100 }],
        links: [{ a: "r1", b: "r2" }, ...["l1", "l2", "l3", "l4"].flatMap(l => [{ a: "r1", b: l, cls: "hl" }, { a: "r2", b: l, cls: "bk" }])],
        notes: [{ x: 340, y: 125, text: "Each leaf peers with both RRs", c: "a" }, { x: 340, y: 245, text: "Duplicate router-IDs → routes silently dropped", c: "bad" }]
      }),
      config: `! On the route reflector
router bgp 65000
 bgp router-id 10.255.0.1
 neighbor 10.255.0.11 remote-as 65000
 neighbor 10.255.0.11 route-reflector-client
! Set explicit, unique router-ids on every router`,
      verify: ["show ip bgp 10.255.99.1/32   ! 'Originator: 10.255.0.11, Cluster list: 10.255.0.1'", "show ip bgp neighbors 10.255.0.11 | include reflector"],
      pitfalls: ["Two routers with the same router-id make each discard the other's routes as if they were its own.", "Set router-id explicitly (a loopback), not automatically. It can change after a reload.", "Do not confuse it with NEXT_HOP: the originator is the source router, not necessarily the forwarding hop."],
    },
    {
      id: "11_cluster_list", name: "CLUSTER_LIST", tag: "Reflector hierarchy", step: 11, scope: "Inside the AS (non-transitive)", dflt: "Empty until reflected", type: "Optional non-transitive",
      what: ["Each route reflector prepends its cluster-id when it reflects a route. The list is the chain of reflection clusters the route passed through.",
        "A reflector that sees its own cluster-id in the list discards the route (loop prevention). A shorter CLUSTER_LIST wins the tie-break (step 11).",
        "Cluster-id defaults to the router-id. Setting the same cluster-id on two reflectors is a design decision with consequences."],
      mech: () => topo({
        h: 240, nodes: [
          { id: "ce", x: 70, y: 115, label: "CE-LAN", sub: "originates prefix", kind: "ent", w: 120 }, { id: "r1", x: 270, y: 115, label: "CORE-RR1", sub: "cluster-id 10.255.0.1", kind: "rr", w: 150 },
          { id: "r2", x: 550, y: 115, label: "CORE-RR2", sub: "same cluster-id", kind: "bad", w: 140 }],
        links: [{ a: "ce", b: "r1", cls: "hl", arrow: 1 }, { a: "r1", b: "r2", cls: "bad", arrow: 1, label: "list: [10.255.0.1]", dy: -14 }],
        notes: [{ x: 400, y: 190, text: "RR2 finds its own cluster-id in the list → drops the route", c: "bad" }, { x: 270, y: 45, text: "prepends 10.255.0.1", c: "a" }]
      }),
      useTitle: "Hierarchical route reflectors for a large multi-region network",
      useText: "A top-level pair of reflectors serves the regional reflectors, each of which serves its own leaf routers. Each regional cluster gets a unique cluster-id so reflected routes never loop between tiers. Use the same cluster-id on two reflectors only when both serve identical clients.",
      use: () => topo({
        h: 300, nodes: [
          { id: "t", x: 340, y: 40, label: "RR-TOP", sub: "cluster-id 1.1.1.1", kind: "rr", w: 150 },
          { id: "eu", x: 170, y: 135, label: "RR-EU", sub: "cluster-id 2.2.2.2", kind: "rr", w: 150 }, { id: "us", x: 510, y: 135, label: "RR-US", sub: "cluster-id 3.3.3.3", kind: "rr", w: 150 },
          { id: "e1", x: 90, y: 245, label: "EU-1", kind: "ent", w: 80 }, { id: "e2", x: 250, y: 245, label: "EU-2", kind: "ent", w: 80 }, { id: "u1", x: 430, y: 245, label: "US-1", kind: "ent", w: 80 }, { id: "u2", x: 590, y: 245, label: "US-2", kind: "ent", w: 80 }],
        links: [{ a: "t", b: "eu", cls: "hl" }, { a: "t", b: "us", cls: "hl" }, { a: "eu", b: "e1" }, { a: "eu", b: "e2" }, { a: "us", b: "u1" }, { a: "us", b: "u2" }],
        notes: [{ x: 340, y: 200, text: "Unique cluster-id per tier and region", c: "ok" }, { x: 340, y: 285, text: "Same id on RRs with different clients = lost paths", c: "bad" }]
      }),
      config: `router bgp 65000
 bgp cluster-id 10.255.0.2
! Same id on 2 RRs only if both serve identical clients`,
      verify: ["show ip bgp 10.10.1.0/24   ! 'Cluster list: 10.255.0.1'", "show ip bgp neighbors 10.255.0.11 | include cluster"],
      pitfalls: ["Two RRs sharing a cluster-id but with different client sets drop each other's reflections and clients lose paths. This is the lab's scenario 11.", "Redundant RRs in one cluster save memory, but if a client loses its session to one RR it can lose routes. Different cluster-ids give more redundancy.", "Every RR must also keep a unique router-id; cluster-id is separate."],
    },
  ];

  /* ---------- rendering ---------- */
  const section = (title, body) => `<section class="ls"><h3>${esc(title)}</h3>${body}</section>`;
  const list = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  const code = t => `<pre class="code">${esc(t)}</pre>`;
  const paras = a => a.map(p => `<p>${esc(p)}</p>`).join("");

  /* level content lives in learn-content.js (window.LEARN_CONTENT[id] = { foundations, practitioner, pro }) */
  const CONTENT = id => (window.LEARN_CONTENT || {})[id] || {};
  const LEVELS = [["foundations", "Foundations"], ["practitioner", "Practitioner"], ["pro", "Pro"]];

  /* progress is browser-local and best effort: private mode or blocked storage just means no ticks */
  const PKEY = "bgp-learn-progress-v1";
  const prog = {
    all() { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch { return {}; } },
    get(k) { return this.all()[k]; },
    set(k, v) { try { const a = this.all(); a[k] = v; localStorage.setItem(PKEY, JSON.stringify(a)); } catch { /* ignore */ } },
  };
  const passMark = n => Math.ceil(n * 0.67);
  function levelDone(id, lv) {
    const c = CONTENT(id)[lv];
    if (!c) return false;
    if (lv === "foundations") return !c.quiz || (prog.get(`${id}:foundations:quiz`) ?? -1) >= passMark(c.quiz.length);
    if (lv === "practitioner") return !c.exercise || !!prog.get(`${id}:exercise`);
    return (!c.quiz || (prog.get(`${id}:pro:quiz`) ?? -1) >= passMark(c.quiz.length)) && (!c.drill || !!prog.get(`${id}:drill`));
  }
  const dots = id => `<span class="pg" title="Foundations / Practitioner / Pro">${LEVELS.map(([lv]) => `<i class="${CONTENT(id)[lv] ? (levelDone(id, lv) ? "d" : "a") : ""}"></i>`).join("")}</span>`;

  /* ---- quiz ---- */
  function quizHtml(items, key) {
    return `<div class="quiz" data-key="${key}">` + items.map((q, qi) => `<fieldset><legend>${qi + 1}. ${esc(q.q)}</legend>` +
      q.options.map((o, oi) => `<label><input type="radio" name="${key}-${qi}" value="${oi}"> ${esc(o)}</label>`).join("") + `<div class="qfb" hidden></div></fieldset>`).join("") +
      `<button class="primary qcheck">Check answers</button> <span class="qscore"></span></div>`;
  }
  function wireQuiz(root, items) {
    const box = root.querySelector(".quiz");
    if (!box) return;
    const key = box.dataset.key, best = prog.get(key);
    if (best != null) box.querySelector(".qscore").textContent = `Best score so far: ${best}/${items.length}`;
    box.querySelector(".qcheck").onclick = () => {
      let score = 0;
      items.forEach((q, qi) => {
        const pick = box.querySelector(`input[name="${key}-${qi}"]:checked`), fb = box.querySelectorAll(".qfb")[qi];
        const ok = pick && +pick.value === q.answer;
        if (ok) score++;
        fb.hidden = false; fb.className = "qfb " + (ok ? "ok" : "no");
        fb.textContent = (pick ? (ok ? "Correct. " : "Not quite. ") : "No answer selected. ") + q.why;
      });
      const prev = prog.get(key);
      if (prev == null || score > prev) prog.set(key, score);
      box.querySelector(".qscore").textContent = `Score: ${score}/${items.length}` + (score >= passMark(items.length) ? " ✓ passed" : " · review the explanations and try again");
      refreshNav();
    };
  }

  /* ---- exercise: read-only show commands and scenario apply/rollback against the real lab ---- */
  /* one retry on a network-level failure (a dropped connection or a brief network blip); HTTP errors are not retried.
     Safe here: show is read-only, and scenario apply/rollback are idempotent and serialised by the backend. */
  const netfetch = async (url, opts) => {
    try { return await fetch(url, opts); }
    catch (e) { await new Promise(r => setTimeout(r, 800)); return fetch(url, opts); }
  };
  function exerciseHtml(ex, id) {
    const steps = ex.steps.map((s, i) => {
      let h = `<li class="st"><p>${esc(s.text)}</p>`;
      if (s.type === "show") {
        h += `<div class="run"><code>${esc(s.device)}# ${esc(s.cmd)}</code><button class="ghost runshow" data-i="${i}">Run on ${esc(s.device)}</button><span class="chk"></span></div>` +
          `<pre class="out" hidden></pre>` + (s.expectText ? `<small class="exp">Expect: ${esc(s.expectText)}</small>` : "");
      } else if (s.type === "scenario") {
        h += `<div class="run"><button class="primary runscn" data-i="${i}">${s.mode === "rollback" ? "Roll back" : "Apply"} scenario ${esc(s.id)}</button><span class="chk"></span></div>`;
      }
      return h + `</li>`;
    }).join("");
    return `<div class="exercise" data-id="${id}"><p><b>Goal:</b> ${esc(ex.goal)}</p><ol class="steps">${steps}</ol>` +
      `<div class="selfcheck"><b>Self-check</b>${list(ex.selfCheck || [])}</div>` +
      `<button class="ghost exdone">${prog.get(id + ":exercise") ? "✓ Exercise completed" : "Mark exercise complete"}</button></div>`;
  }
  function wireExercise(root, ex, id) {
    const box = root.querySelector(".exercise");
    if (!box) return;
    const steps = [...box.querySelectorAll(".st")], passed = new Set();
    const finishIfAll = () => {
      const needed = ex.steps.map((s, i) => (s.type === "show" && (s.expect || s.expectNot) ? i : -1)).filter(i => i >= 0);
      if (needed.length && needed.every(i => passed.has(i))) { prog.set(id + ":exercise", true); box.querySelector(".exdone").textContent = "✓ Exercise completed"; refreshNav(); }
    };
    box.addEventListener("click", async e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("exdone")) { prog.set(id + ":exercise", true); b.textContent = "✓ Exercise completed"; refreshNav(); return; }
      const i = +b.dataset.i, s = ex.steps[i], li = steps[i], chk = li && li.querySelector(".chk");
      if (b.classList.contains("runshow")) {
        const out = li.querySelector(".out");
        b.disabled = true; chk.textContent = "running…"; chk.className = "chk";
        try {
          const r = await netfetch(`/api/devices/${encodeURIComponent(s.device)}/show?cmd=${encodeURIComponent(s.cmd)}`);
          const j = await r.json();
          if (!r.ok) throw new Error(j.detail || r.status);
          out.hidden = false; out.textContent = j.output;
          if (s.expect || s.expectNot) {
            const ok = (!s.expect || new RegExp(s.expect, "im").test(j.output)) && (!s.expectNot || !new RegExp(s.expectNot, "im").test(j.output));
            chk.textContent = ok ? "✓ matches what is expected" : "✗ not what is expected yet: " + (s.hint || "check the earlier steps");
            chk.className = "chk " + (ok ? "ok" : "no");
            if (ok) { passed.add(i); finishIfAll(); } else passed.delete(i);
          } else chk.textContent = "";
        } catch (err) { chk.textContent = "error: " + err.message; chk.className = "chk no"; }
        b.disabled = false;
      }
      if (b.classList.contains("runscn")) {
        b.disabled = true; chk.className = "chk"; chk.textContent = "running…";
        try {
          const r = await netfetch(`/api/scenarios/${s.id}/${s.mode === "rollback" ? "rollback" : "run"}`, { method: "POST" });
          const { run_id } = await r.json();
          let run;
          for (let n = 0; n < 120; n++) {
            run = await (await netfetch(`/api/runs/${run_id}`)).json();
            if (run.state !== "running") break;
            await new Promise(res => setTimeout(res, 2000));
          }
          chk.textContent = `${run.state}` + (run.duration ? ` in ${run.duration}s` : "") + (run.error ? ": " + run.error.slice(0, 120) : "");
          chk.className = "chk " + (run.state === "passed" || run.state === "done" ? "ok" : "no");
        } catch (err) { chk.textContent = "error: " + err.message; chk.className = "chk no"; }
        b.disabled = false;
      }
    });
  }

  /* ---- drill ---- */
  function drillHtml(d) {
    return `<div class="drill"><p>${esc(d.situation)}</p>${d.output ? code(d.output) : ""}<p><b>Question:</b> ${esc(d.question)}</p>` +
      `<details><summary>Hint</summary><p>${esc(d.hint)}</p></details><details class="ans"><summary>Show the answer</summary>${paras(d.answer)}</details></div>`;
  }

  /* ---- cheat-sheets (generated from the same data as the pages) ---- */
  function cheatMd(a) {
    const c = CONTENT(a.id), n = ATTRS.indexOf(a) + 1;
    let m = `# ${String(n).padStart(2, "0")} ${a.name} - cheat sheet\n\n${a.tag}\n\n- Scope: ${a.scope}\n- Default: ${a.dflt}\n- Type: ${a.type}\n- Best-path step: ${a.step || "not a tie-breaker (" + (a.stepNote || "policy / signal") + ")"}\n\n`;
    m += `## What it is\n${a.what.map(x => "- " + x).join("\n")}\n\n## Configuration (IOS)\n\`\`\`\n${a.config}\n\`\`\`\n\n## Verify\n\`\`\`\n${a.verify.join("\n")}\n\`\`\`\n\n## Production pitfalls\n${a.pitfalls.map(x => "- " + x).join("\n")}\n`;
    const tr = (c.pro && c.pro.tricks) || [];
    if (tr.length) m += `\n## Tactics and tricks\n${tr.map(t => `- **${t.title}**: ${t.text}`).join("\n")}\n`;
    return m;
  }
  const bestPathMd = () => `# BGP best-path selection (Cisco IOS order)\n\n${ORDER.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n` +
    `Only the first step that separates the candidate paths decides. Later steps are never evaluated.\n\n## Which attribute is which step\n\n${ATTRS.map(a => `- ${a.name}: ${a.step ? "step " + a.step : "not a tie-breaker (" + (a.stepNote || "policy / signal") + ")"}`).join("\n")}\n\n` +
    `## Traps\n\n- MED is compared only between paths from the same neighboring AS unless \`bgp always-compare-med\` is set.\n- Weight is local to the router and is never advertised.\n- Local-Pref is carried in iBGP only; it is stripped on eBGP.\n- A path with an unreachable next-hop is excluded before step 1.\n- Route reflectors reflect only their best path, so clients may never see an alternative.\n`;
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" })), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---- pages ---- */
  function renderOverview(el) {
    const total = ATTRS.length * 3, done = ATTRS.reduce((s, a) => s + LEVELS.filter(([lv]) => CONTENT(a.id)[lv] && levelDone(a.id, lv)).length, 0);
    el.innerHTML = `<h2>BGP path attributes · from scratch to pro</h2>
      <p class="lead">Eleven attributes, three levels each. <b>Foundations</b> explains what the attribute is and where it sits in path selection. <b>Practitioner</b> is the enterprise use case with config, verification and a hands-on exercise on the lab routers. <b>Pro</b> is tactics and tricks, interactions with other attributes, a troubleshooting drill and a harder quiz. Use the <a href="#learn/simulator">best-path simulator</a> to see why one route beats another.</p>
      <div class="tryit"><span>Progress in this browser: ${done} of ${total} levels completed.</span><a class="btn" href="#learn/simulator">Open the simulator</a>
        <button class="ghost" id="dl-bp">Best-path cheat-sheet</button><button class="ghost" id="dl-all">All cheat-sheets</button></div>
      <h3 style="margin-top:18px">How BGP picks the best path (Cisco order)</h3>${orderStrip(null, "Attributes lower in the list only matter when everything above them ties. NEXT_HOP, ATOMIC_AGGREGATE, AGGREGATOR and COMMUNITY are not decision steps: they signal reachability, path detail, or policy.")}
      <div class="cards">${ATTRS.map((a, i) => `<a class="acard" href="#learn/${a.id}"><b>${String(i + 1).padStart(2, "0")} ${esc(a.name)}</b><span>${esc(a.tag)}</span><small>${a.step ? "Best-path step " + a.step : "Policy / signal"}</small>${dots(a.id)}</a>`).join("")}</div>`;
    el.querySelector("#dl-bp").onclick = () => download("bgp-best-path-cheatsheet.md", bestPathMd());
    el.querySelector("#dl-all").onclick = () => download("bgp-attributes-cheatsheets.md", bestPathMd() + "\n---\n\n" + ATTRS.map(cheatMd).join("\n---\n\n"));
  }

  const soon = name => `<p class="hint">This level for ${esc(name)} is still being written. The Foundations and Practitioner material above is complete.</p>`;

  function foundations(a, c) {
    const f = c.foundations || {};
    return `<div class="facts"><div><small>Scope</small>${esc(a.scope)}</div><div><small>Default</small>${esc(a.dflt)}</div><div><small>Type</small>${esc(a.type)}</div></div>` +
      section("Where it sits in path selection", orderStrip(a.step, a.stepNote)) +
      section("What it is", list(a.what)) + (f.theory ? section("The theory in more depth", paras(f.theory)) : "") +
      section("How it works", `<div class="dgw">${a.mech()}</div>`) +
      (f.example ? section("Worked example · " + f.example.title, `<p>${esc(f.example.text)}</p>` + (f.example.output ? code(f.example.output) : "")) : "") +
      (f.basicConfig ? section("Basic configuration (IOS)", code(f.basicConfig)) : "") +
      (f.quiz ? section("Check your understanding", quizHtml(f.quiz, `${a.id}:foundations:quiz`)) : "");
  }
  function practitioner(a, c) {
    const p = c.practitioner || {};
    return section("Enterprise use case · " + a.useTitle, `<p>${esc(a.useText)}</p><div class="dgw">${a.use()}</div>`) +
      section("Configuration (IOS)", code(a.config)) + section("Verify", code(a.verify.join("\n"))) + section("Production pitfalls", list(a.pitfalls)) +
      (p.tactics ? section("Practical tactics", p.tactics.map(t => `<h4>${esc(t.title)}</h4><p>${esc(t.text)}</p>` + (t.config ? code(t.config) : "")).join("")) : "") +
      (p.exercise ? section("Hands-on exercise · " + p.exercise.title, exerciseHtml(p.exercise, a.id)) : "") +
      `<div class="tryit"><span>Or run the whole scenario from the Lab tab, with before/after diffs.</span><button class="primary" id="tryLab">Open scenario ${esc(a.id)} in Lab</button></div>`;
  }
  function pro(a, c) {
    const p = c.pro;
    if (!p) return soon(a.name);
    return (p.tricks ? section("Tactics and tricks", p.tricks.map(t => `<div class="trick"><h4>${esc(t.title)}</h4><p>${esc(t.text)}</p>${t.config ? code(t.config) : ""}</div>`).join("")) : "") +
      (p.interactions ? section("How it interacts with other attributes", list(p.interactions)) : "") +
      (p.edge ? section("Edge cases and design trade-offs", list(p.edge)) : "") +
      (p.drill ? section("Troubleshooting drill · " + p.drill.title, drillHtml(p.drill)) : "") +
      (p.quiz ? section("Pro quiz", quizHtml(p.quiz, `${a.id}:pro:quiz`)) : "");
  }

  function renderAttr(el, a, level) {
    const i = ATTRS.indexOf(a), prev = ATTRS[i - 1], next = ATTRS[i + 1], c = CONTENT(a.id);
    level = LEVELS.some(([lv]) => lv === level) ? level : "foundations";
    const body = { foundations, practitioner, pro }[level](a, c);
    el.innerHTML = `<div class="crumbs"><a href="#learn">All attributes</a> / ${esc(a.name)}</div>
      <h2>${String(i + 1).padStart(2, "0")} · ${esc(a.name)} <span class="chip">${esc(a.tag)}</span></h2>
      <div class="lvl">${LEVELS.map(([lv, lb], k) => `<a class="${lv === level ? "on" : ""}" href="#learn/${a.id}/${lv}"><b>${k + 1}</b> ${lb}${c[lv] && levelDone(a.id, lv) ? ' <span class="tick">✓</span>' : ""}</a>`).join("")}
        <button class="ghost" id="dl-cs" title="Download a Markdown cheat-sheet for ${esc(a.name)}">Cheat-sheet ↓</button></div>
      ${body}
      <div class="pn">${prev ? `<a href="#learn/${prev.id}/${level}">← ${esc(prev.name)}</a>` : "<span></span>"}${next ? `<a href="#learn/${next.id}/${level}">${esc(next.name)} →</a>` : "<span></span>"}</div>`;
    el.querySelector("#dl-cs").onclick = () => download(`bgp-${a.id}-cheatsheet.md`, cheatMd(a));
    if (level === "foundations" && (c.foundations || {}).quiz) wireQuiz(el, c.foundations.quiz);
    if (level === "practitioner" && (c.practitioner || {}).exercise) wireExercise(el, c.practitioner.exercise, a.id);
    if (level === "pro" && c.pro) {
      if (c.pro.quiz) wireQuiz(el, c.pro.quiz);
      const ans = el.querySelector(".drill .ans");
      if (ans) ans.addEventListener("toggle", () => { if (ans.open) { prog.set(`${a.id}:drill`, true); refreshNav(); } });
    }
    const tl = el.querySelector("#tryLab");
    if (tl) tl.onclick = () => {
      location.hash = "lab";
      setTimeout(() => {
        const card = document.querySelector(`.scn[data-id="${a.id}"]`);
        if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 2500); }
      }, 150);
    };
  }

  function navHtml(id) {
    return `<a class="${!id ? "on" : ""}" href="#learn">Overview</a><a class="${id === "simulator" ? "on" : ""}" href="#learn/simulator">Best-path simulator</a><hr>` +
      ATTRS.map((a, i) => `<a class="${a.id === id ? "on" : ""}" href="#learn/${a.id}"><b>${String(i + 1).padStart(2, "0")}</b> ${esc(a.name)}${dots(a.id)}</a>`).join("");
  }
  const refreshNav = () => {
    const p = location.hash.split("/"); document.getElementById("learn-nav").innerHTML = navHtml(p[1] || "");
    document.querySelectorAll(".lvl a").forEach(l => {          // show a level's tick as soon as it is earned, without a reload
      const [, id, lv] = l.getAttribute("href").split("/");
      if (CONTENT(id)[lv] && levelDone(id, lv) && !l.querySelector(".tick")) l.insertAdjacentHTML("beforeend", ' <span class="tick">✓</span>');
    });
  };

  function renderLearn() {
    const nav = document.getElementById("learn-nav"), body = document.getElementById("learn-body"), parts = location.hash.split("/"), id = parts[1] || "";
    nav.innerHTML = navHtml(id);
    const a = ATTRS.find(x => x.id === id);
    if (id === "simulator" && window.BGPSim) window.BGPSim.mount(body);
    else if (a) renderAttr(body, a, parts[2]);
    else renderOverview(body);
    window.scrollTo({ top: 0 });
  }

  function route() {
    const learn = location.hash.startsWith("#learn");
    document.getElementById("view-lab").hidden = learn;
    document.getElementById("view-learn").hidden = !learn;
    document.getElementById("tab-lab").classList.toggle("on", !learn);
    document.getElementById("tab-learn").classList.toggle("on", learn);
    if (learn) renderLearn();
  }

  window.addEventListener("hashchange", route);
  route();
})();

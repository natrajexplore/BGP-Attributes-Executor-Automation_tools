/* Best-path simulator (Cisco IOS order). Pure engine + a small UI mounted by learn.js.
   Elimination model: at each step the routes that are not best on that criterion are dropped,
   MED is grouped by neighbor AS (like 'bgp deterministic-med'), so results are order-independent. */
(() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ipNum = ip => String(ip || "0.0.0.0").split(".").reduce((a, o) => a * 256 + (+o || 0), 0);
  const asTokens = p => String(p || "").replace(/\{[^}]*\}/g, "S").split(/\s+/).filter(Boolean);
  const asLen = p => asTokens(p).length;
  const neighborAS = r => (asTokens(r.asPath)[0] || null);
  const ORIGIN_RANK = { i: 0, e: 1, "?": 2 };
  const MED_WORST = 4294967295;

  const norm = (r, i) => ({
    name: r.name || "Route " + String.fromCharCode(65 + i), weight: r.weight === "" || r.weight == null ? (r.local ? 32768 : 0) : +r.weight, localPref: r.localPref === "" || r.localPref == null ? 100 : +r.localPref,
    local: !!r.local, asPath: r.asPath || "", origin: r.origin || "i", med: r.med === "" || r.med == null ? null : +r.med,
    type: r.type || "ebgp", igp: +r.igp || 0, age: +r.age || 0, routerId: r.routerId || "0.0.0.0", originatorId: r.originatorId || "",
    clusterLen: +r.clusterLen || 0, neighbor: r.neighbor || "0.0.0.0", reachable: r.reachable !== false, idx: i,
  });

  /* Each step: name, why (one line), show(r) -> text, apply(alive, opts) -> { keep, skip? }.  */
  const bestBy = (alive, key, dir) => {                       // dir 1 = higher wins, -1 = lower wins
    const top = Math.max(...alive.map(r => key(r) * dir));
    return alive.filter(r => key(r) * dir === top);
  };
  const STEPS = [
    { n: 1, name: "Weight", higher: true, show: r => r.weight, apply: a => ({ keep: bestBy(a, r => r.weight, 1) }) },
    { n: 2, name: "Local-Pref", higher: true, show: r => r.localPref, apply: a => ({ keep: bestBy(a, r => r.localPref, 1) }) },
    { n: 3, name: "Locally originated", show: r => (r.local ? "yes" : "no"), apply: a => ({ keep: bestBy(a, r => (r.local ? 1 : 0), 1) }) },
    {
      n: 4, name: "AS_PATH length", show: r => `${asLen(r.asPath)}${r.asPath ? " (" + r.asPath + ")" : ""}`,
      apply: (a, o) => o.ignoreAsPath ? { keep: a, skip: "bgp bestpath as-path ignore is on" } : { keep: bestBy(a, r => asLen(r.asPath), -1) }
    },
    { n: 5, name: "ORIGIN", show: r => r.origin, apply: a => ({ keep: bestBy(a, r => ORIGIN_RANK[r.origin] ?? 2, -1) }) },
    {
      n: 6, name: "MED", show: r => (r.med == null ? "none" : r.med),
      apply: (a, o) => {
        const med = r => (r.med == null ? (o.missingAsWorst ? MED_WORST : 0) : r.med);
        const groups = new Map();
        for (const r of a) {
          const g = o.alwaysCompareMed ? "*" : (neighborAS(r) ? "AS" + neighborAS(r) : "local" + r.idx);
          groups.set(g, [...(groups.get(g) || []), r]);
        }
        if ([...groups.values()].every(g => g.length === 1))
          return { keep: a, skip: "paths come from different neighbor ASes, so MED is not compared (enable always-compare-med)" };
        const keep = [];
        for (const g of groups.values()) { const m = Math.min(...g.map(med)); keep.push(...g.filter(r => med(r) === m)); }
        return { keep };
      }
    },
    { n: 7, name: "eBGP over iBGP", show: r => r.type, apply: a => ({ keep: bestBy(a, r => (r.type === "ebgp" ? 1 : 0), 1) }) },
    { n: 8, name: "IGP metric to next-hop", show: r => r.igp, apply: a => ({ keep: bestBy(a, r => r.igp, -1) }) },
    {
      n: 9, name: "Oldest eBGP path", show: r => (r.type === "ebgp" ? r.age + "s old" : "n/a (iBGP)"),
      apply: (a, o) => {
        if (o.compareRouterId) return { keep: a, skip: "bgp bestpath compare-routerid is on" };
        if (!a.every(r => r.type === "ebgp")) return { keep: a, skip: "only applies when all remaining paths are eBGP" };
        return { keep: bestBy(a, r => r.age, 1) };
      }
    },
    { n: 10, name: "Router-ID / ORIGINATOR_ID", show: r => r.originatorId ? `${r.originatorId} (originator)` : r.routerId, apply: a => ({ keep: bestBy(a, r => ipNum(r.originatorId || r.routerId), -1) }) },
    { n: 11, name: "CLUSTER_LIST length", show: r => r.clusterLen, apply: a => ({ keep: bestBy(a, r => r.clusterLen, -1) }) },
    { n: 12, name: "Neighbor IP", show: r => r.neighbor, apply: a => ({ keep: bestBy(a, r => ipNum(r.neighbor), -1) }) },
  ];

  function best(input, opts = {}) {
    const all = input.map(norm);
    const excluded = all.filter(r => !r.reachable).map(r => ({ idx: r.idx, why: "next-hop unreachable: shown as (inaccessible), never a candidate" }));
    let alive = all.filter(r => r.reachable);
    const trace = []; let decidedAt = null;
    if (!alive.length) return { winner: null, decidedAt, trace, excluded, all };
    for (const s of STEPS) {
      const values = Object.fromEntries(all.map(r => [r.idx, s.show(r)]));
      if (alive.length === 1) { trace.push({ n: s.n, name: s.name, values, state: "unreached", kept: [alive[0].idx], dropped: [] }); continue; }
      const { keep, skip } = s.apply(alive, opts);
      const dropped = alive.filter(r => !keep.includes(r)).map(r => r.idx);
      let state = skip ? "skipped" : dropped.length ? "decided" : "tie";
      if (state === "decided" && keep.length === 1 && decidedAt == null) decidedAt = s.n;
      trace.push({ n: s.n, name: s.name, values, state, note: skip, kept: keep.map(r => r.idx), dropped });
      alive = keep;
      if (alive.length === 1 && decidedAt == null) decidedAt = s.n;
    }
    return { winner: alive[0].idx, tied: alive.map(r => r.idx), decidedAt, trace, excluded, all };
  }

  function explain(res) {
    if (res.winner == null) return "No usable path: every candidate has an unreachable next-hop.";
    const w = res.all[res.winner].name, others = res.all.filter(r => r.idx !== res.winner && r.reachable);
    if (!others.length) return `${w} is the only usable path.`;
    if (res.tied.length > 1) return `${res.tied.length} paths are still tied after all 12 steps; IOS would keep the first learned (or use multipath if configured).`;
    const st = res.trace.find(t => t.n === res.decidedAt);
    const wv = st.values[res.winner], lv = others.map(r => `${r.name}: ${st.values[r.idx]}`).join(", ");
    return `${w} wins at step ${st.n} (${st.name}): ${wv} beats ${lv}. Later steps are never evaluated.`;
  }

  /* ---------- presets ---------- */
  const base = { weight: "", localPref: 100, local: false, asPath: "65001 65100", origin: "i", med: "", type: "ebgp", igp: 0, age: 600, routerId: "10.255.1.1", originatorId: "", clusterLen: 0, neighbor: "172.16.12.1", reachable: true };
  const R = (name, o) => ({ ...base, name, ...o });
  const PRESETS = [
    { id: "weight", label: "01 WEIGHT: 200 vs 0", routes: [R("iBGP via EDGE1 (weight 200)", { weight: 200, type: "ibgp", igp: 21, asPath: "65001 65100", neighbor: "10.255.0.11" }), R("eBGP via ISP-B", { asPath: "65002 65100", neighbor: "172.16.34.1" })] },
    { id: "lp", label: "02 LOCAL_PREF: 200 vs 100", routes: [R("via ISP-A (LP 200)", { localPref: 200 }), R("via ISP-B (LP 100)", { asPath: "65002 65100", neighbor: "172.16.34.1" })] },
    { id: "local", label: "03 Locally originated (default weight 32768)", routes: [R("aggregate on this router", { local: true, asPath: "", neighbor: "0.0.0.0" }), R("learned via eBGP", { asPath: "65001" })] },
    { id: "local-eq", label: "03 Locally originated at equal weight (step 3)", routes: [R("aggregate, weight forced to 0", { local: true, weight: 0, asPath: "", neighbor: "0.0.0.0" }), R("learned via eBGP", { asPath: "65001" })] },
    { id: "aspath", label: "04 AS_PATH: shorter wins (CONTENT)", routes: [R("via ISP-A", { asPath: "65001 65000" }), R("via ISP-B", { asPath: "65002 65001 65000", neighbor: "203.0.113.1" })] },
    { id: "origin", label: "05 ORIGIN: i beats ?", routes: [R("eBGP, origin ? (redistributed)", { origin: "?" }), R("iBGP, origin i", { type: "ibgp", asPath: "65002 65100", igp: 21, neighbor: "10.255.0.12" })] },
    { id: "med-trap", label: "06 MED trap: different neighbor AS", opts: {}, routes: [R("eBGP ISP-A (MED 200)", { med: 200 }), R("iBGP via ISP-B (MED 0)", { med: 0, type: "ibgp", asPath: "65002 65100", igp: 21, neighbor: "10.255.0.12" })] },
    { id: "med-acm", label: "06 MED with always-compare-med", opts: { alwaysCompareMed: true }, routes: [R("eBGP ISP-A (MED 200)", { med: 200 }), R("iBGP via ISP-B (MED 0)", { med: 0, type: "ibgp", asPath: "65002 65100", igp: 21, neighbor: "10.255.0.12" })] },
    { id: "nh", label: "08 NEXT_HOP unreachable", routes: [R("EDGE1 path, next-hop 172.16.12.1 inaccessible", { type: "ibgp", reachable: false, neighbor: "10.255.0.11" }), R("EDGE2 path", { type: "ibgp", asPath: "65002 65100", igp: 21, neighbor: "10.255.0.12" })] },
    { id: "rr", label: "11 Lab: CORE-RR1 picks EDGE1 (router-id)", routes: [R("from EDGE1 10.255.0.11 (MED 200)", { type: "ibgp", med: 200, igp: 11, routerId: "10.255.0.11", neighbor: "10.255.0.11" }), R("from EDGE2 10.255.0.12 (MED 0)", { type: "ibgp", asPath: "65002 65100", med: 0, igp: 11, routerId: "10.255.0.12", neighbor: "10.255.0.12" })] },
    { id: "cl", label: "12 CLUSTER_LIST: shorter wins", routes: [R("via RR1 (cluster list 1)", { type: "ibgp", originatorId: "10.255.0.11", clusterLen: 1, neighbor: "10.255.0.1", igp: 11 }), R("via RR1 then RR2 (cluster list 2)", { type: "ibgp", originatorId: "10.255.0.11", clusterLen: 2, neighbor: "10.255.0.2", igp: 11 })] },
  ];

  /* ---------- UI ---------- */
  const FIELDS = [
    ["weight", "Weight (blank = default: 0, or 32768 if local)", "num"], ["localPref", "Local-Pref", "num"], ["local", "Locally originated", "bool"], ["asPath", "AS_PATH", "text"],
    ["origin", "ORIGIN", ["i", "e", "?"]], ["med", "MED (blank = none)", "num"], ["type", "Learned via", ["ebgp", "ibgp"]], ["igp", "IGP metric to next-hop", "num"],
    ["age", "Age of eBGP path (s)", "num"], ["routerId", "Router-ID", "text"], ["originatorId", "ORIGINATOR_ID (blank = none)", "text"],
    ["clusterLen", "CLUSTER_LIST length", "num"], ["neighbor", "Neighbor IP", "text"], ["reachable", "Next-hop reachable", "bool"],
  ];

  function mount(el) {
    let routes = PRESETS[0].routes.map(r => ({ ...r })), opts = {};
    const cell = (r, i, [k, , t]) => {
      const v = r[k], id = `sim-${i}-${k}`;
      if (t === "bool") return `<input type="checkbox" data-i="${i}" data-k="${k}" ${v ? "checked" : ""}>`;
      if (Array.isArray(t)) return `<select data-i="${i}" data-k="${k}">${t.map(o => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
      return `<input ${t === "num" ? 'type="number"' : ""} data-i="${i}" data-k="${k}" value="${esc(v ?? "")}" id="${id}">`;
    };
    function form() {
      el.querySelector("#sim-form").innerHTML = `<table class="sim-t"><thead><tr><th></th>${routes.map((r, i) =>
        `<th><input class="sim-name" data-i="${i}" data-k="name" value="${esc(r.name)}">${routes.length > 2 ? `<button class="ghost sim-x" data-del="${i}" title="Remove">&times;</button>` : ""}</th>`).join("")}</tr></thead><tbody>` +
        FIELDS.map(f => `<tr><td>${f[1]}</td>${routes.map((r, i) => `<td>${cell(r, i, f)}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;
    }
    function result() {
      const res = best(routes, opts), name = i => esc(res.all[i].name);
      let h = res.winner == null ? "" : `<div class="sim-win">Best path: <b>${name(res.winner)}</b></div>`;
      h += `<p class="sim-why">${esc(explain(res))}</p>`;
      for (const x of res.excluded) h += `<div class="sim-ex"><b>${name(x.idx)}</b> excluded: ${esc(x.why)}</div>`;
      h += `<table class="sim-tr"><thead><tr><th>#</th><th>Step</th>${routes.map(r => `<th>${esc(r.name)}</th>`).join("")}<th>Result</th></tr></thead><tbody>`;
      for (const t of res.trace) {
        const label = { decided: "eliminates paths", tie: "tie, next step", skipped: "not applied", unreached: "not reached" }[t.state];
        h += `<tr class="${t.state}${t.n === res.decidedAt ? " deciding" : ""}"><td>${t.n}</td><td>${esc(t.name)}</td>` +
          routes.map((_, i) => `<td class="${t.dropped.includes(i) ? "lose" : res.excluded.some(x => x.idx === i) ? "" : t.state === "decided" && t.kept.includes(i) ? "win" : ""}">${esc(t.values[i])}</td>`).join("") +
          `<td>${label}${t.note ? `<small>${esc(t.note)}</small>` : ""}</td></tr>`;
      }
      el.querySelector("#sim-res").innerHTML = h + `</tbody></table>`;
    }
    el.innerHTML = `<h2>Best-path simulator</h2>
      <p class="lead">Edit the attributes of two to four routes to the same prefix and see which one IOS would pick, and at which of the 12 steps. Weight, Local-Pref, MED and the rest are compared strictly in order: the first step that separates the routes decides, and later steps are never looked at. Try the presets, then change one value and watch the winner move.</p>
      <div class="sim-bar"><label>Preset <select id="sim-preset">${PRESETS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join("")}</select></label>
        <label><input type="checkbox" data-o="alwaysCompareMed"> always-compare-med</label>
        <label><input type="checkbox" data-o="missingAsWorst"> bestpath med missing-as-worst</label>
        <label><input type="checkbox" data-o="ignoreAsPath"> bestpath as-path ignore</label>
        <label><input type="checkbox" data-o="compareRouterId"> bestpath compare-routerid</label>
        <button class="ghost" id="sim-add">Add route</button></div>
      <div id="sim-form" class="dgw"></div><div id="sim-res"></div>
      <p class="hint">Not modelled: multipath, confederations, MED between routes learned in different orders (deterministic-med behaviour is assumed). NEXT_HOP unreachable removes a path before step 1.</p>`;
    const sync = () => { el.querySelectorAll("[data-o]").forEach(c => { c.checked = !!opts[c.dataset.o]; }); };
    form(); result(); sync();
    el.addEventListener("input", e => {
      const t = e.target, i = t.dataset.i;
      if (i != null) { routes[i][t.dataset.k] = t.type === "checkbox" ? t.checked : t.value; if (t.dataset.k === "name") { result(); return; } result(); }
      else if (t.dataset.o) { opts[t.dataset.o] = t.checked; result(); }
    });
    el.addEventListener("change", e => {
      if (e.target.id === "sim-preset") {
        const p = PRESETS.find(x => x.id === e.target.value); routes = p.routes.map(r => ({ ...r })); opts = { ...(p.opts || {}) }; form(); result(); sync();
      }
    });
    el.addEventListener("click", e => {
      if (e.target.id === "sim-add" && routes.length < 4) { routes.push({ ...base, name: "Route " + String.fromCharCode(65 + routes.length), asPath: "65003 65100", neighbor: "192.0.2.1" }); form(); result(); }
      if (e.target.dataset.del != null) { routes.splice(+e.target.dataset.del, 1); form(); result(); }
    });
  }

  const api = { best, explain, STEPS, PRESETS, mount };
  if (typeof window !== "undefined") window.BGPSim = api;
  if (typeof module !== "undefined") module.exports = api;
})();

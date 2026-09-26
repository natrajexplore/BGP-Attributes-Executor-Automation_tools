/* Live labs tab. Every scenario (BGP attributes 01-11, MP-BGP 12-17, and the shared lab) can be run from here: clicking Run
   makes the dashboard switch the VM to the scenario's own topology, configure it if needed, run the scenario over SSH and verify.
   The 3D view (live3d.js) shows the topology and the sessions; the CLI panel shows the real SSH commands as they are sent.
   Globals from the page: esc(), renderDiff(), api(). */
(() => {
  const $ = id => document.getElementById(id);
  const S = { cat: null, status: null, shown: null, graph: null, v3: null, es: null, runId: null, steps: [], cli: [], tab: "All",
    routers: new Set(), busy: false, timer: null, t0: 0, states: {}, pulseAt: {}, ready: false, gl: true };
  const KIND = { ibgp: ["iBGP", "#4aa3ff"], ebgp: ["eBGP", "#f0883e"], vpnv4: ["MP-BGP VPNv4", "#e879f9"], vrf: ["PE-CE eBGP (VRF)", "#22d3ee"] };
  const GROUPS = [["attributes", "BGP attributes (labs 01-11)"], ["mpls", "MP-BGP and MPLS VPN (labs 12-17)"], ["shared", "Shared 8-router lab"]];
  const fetchJson = async (u, o) => { const r = await fetch(u, o); let j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ } if (!r.ok) throw new Error(j.detail || r.status); return j; };
  const esch = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // ------------------------------------------------------------------ catalogue
  async function loadCatalog(quiet) {
    S.cat = await fetchJson("/api/catalog");
    S.status = S.cat.status;
    const sig = JSON.stringify(S.cat), same = sig === S.catSig;
    S.catSig = sig;
    if (quiet && same) return S.cat;                  // background refresh with nothing new: leave the buttons alone
    renderStatus(); renderCatalog();
    return S.cat;
  }

  function renderStatus() {
    const st = S.status || {}, box = $("live-status");
    const lab = S.cat && S.cat.labs.find(l => l.id === st.active);
    const switching = st.phase === "switching" || st.busy;
    box.innerHTML = `<div class="row"><span class="pill ${switching ? "warn" : st.running ? "ok" : "bad"}"><i></i>${switching ? "working: " + esch(st.detail || "running") : st.running ? "running" : "no lab running"}</span>
      <span style="color:var(--muted)">active: <b style="color:var(--fg)">${lab ? esch(lab.id) : esch(st.active || "-")}</b></span></div>
      <div style="color:var(--muted);font-size:12px">Run any scenario: the VM switches to its topology automatically. Only one lab runs at a time.</div>
      <div class="row"><button class="ghost" id="live-prewarm" title="Configure and save every lab once, so later switches are only a boot">Prepare all labs</button>
      <button class="ghost" id="live-refresh">Refresh</button></div>`;
    $("live-prewarm").onclick = prewarm; $("live-refresh").onclick = () => refreshAll();
    document.querySelectorAll("#live-cat button[data-act]").forEach(b => { b.disabled = !!switching || S.busy; });
  }

  function renderCatalog() {
    const box = $("live-cat"), open = new Set([...box.querySelectorAll("details.lab[open]")].map(d => d.dataset.id));
    if (!open.size && S.shown) open.add(S.shown);
    box.innerHTML = "";
    for (const [g, title] of GROUPS) {
      const labs = S.cat.labs.filter(l => l.group === g);
      if (!labs.length) continue;
      const h = document.createElement("div"); h.className = "lgroup"; h.textContent = title; box.appendChild(h);
      for (const l of labs) {
        const d = document.createElement("details"); d.className = "lab" + (l.id === S.shown ? " on" : ""); d.dataset.id = l.id; d.open = open.has(l.id);
        const num = l.id === "shared" ? "" : l.id.slice(0, 2);
        d.innerHTML = `<summary><span class="dot ${l.active ? "active" : l.prepared ? "ready" : ""}" title="${l.active ? "running now" : l.prepared ? "configured and saved" : "not configured yet: the first run sets it up"}"></span>
          <span class="num">${num}</span><span class="nm" title="${esch(l.title)}">${esch(l.short)}</span><span class="meta">${l.routers} routers</span></summary>
          <div class="body"><div class="lact"><button class="ghost" data-act="view" data-lab="${l.id}">View in 3D</button><button class="ghost" data-act="start" data-lab="${l.id}" title="Switch to this lab without running a scenario">Start this lab</button>
          ${l.id !== "shared" ? `<a class="btn" style="font-size:12px;padding:3px 9px" href="#learn/${l.id}/lab">README</a>` : ""}</div>
          ${l.scenarios.map(sc => scRow(l, sc)).join("")}</div>`;
        box.appendChild(d);
      }
    }
    box.querySelectorAll("button[data-act]").forEach(b => {
      b.onclick = () => {
        const lab = b.dataset.lab;
        if (b.dataset.act === "view") showLab(lab);
        else if (b.dataset.act === "start") startLab(lab);
        else runScenario(lab, b.dataset.sid, b.dataset.act);
      };
    });
    box.querySelectorAll("details.lab").forEach(d => d.addEventListener("toggle", () => { if (d.open) showLab(d.dataset.id, true); }));
    const sw = S.status && (S.status.phase === "switching" || S.status.busy);
    box.querySelectorAll("button[data-act]").forEach(b => { b.disabled = !!sw || S.busy; });
  }

  function scRow(l, sc) {
    const key = `${l.id}/${sc.id}`, st = S.states[key] || (l.applied.includes(sc.id) ? "applied" : "");
    return `<div class="lsc" data-key="${key}"><div class="t"><b>${esch(sc.id)}</b>${sc.attribute ? `<span class="pill">${esch(sc.attribute)}</span>` : ""}<span class="st ${st}" data-st>${st}</span></div>
      <div class="s"><b style="color:var(--fg);font-weight:500">${esch(sc.title)}</b>${sc.summary ? "<br>" + esch(sc.summary.slice(0, 190)) + (sc.summary.length > 190 ? "…" : "") : ""}</div>
      <div class="a"><button class="primary" data-act="run" data-lab="${l.id}" data-sid="${sc.id}">Run</button><button data-act="rollback" data-lab="${l.id}" data-sid="${sc.id}">Rollback</button>
      <span style="color:var(--muted);font-size:11.5px">on ${esch(sc.targets.join(", "))} &middot; ${sc.checks} checks</span></div></div>`;
  }

  // ------------------------------------------------------------------ 3D view
  function ensure3D() {
    if (S.v3 || !S.gl) return S.v3;
    const host = $("live-3d");
    try { S.v3 = window.Live3D && window.THREE ? window.Live3D.create(host, { onSelect: name => { S.tab = name; renderCliTabs(); renderCli(); }, onRotate: v => $("t-rot").classList.toggle("on", v) }) : null; }
    catch (e) { console.error(e); S.v3 = null; }
    if (!S.v3) { S.gl = false; host.innerHTML = `<div class="nogl">The 3D view needs WebGL, which this browser does not offer. The catalogue, steps and CLI still work.</div>`; }
    return S.v3;
  }

  async function showLab(id, keepOpen) {
    S.shown = id;
    document.querySelectorAll("#live-cat details.lab").forEach(d => d.classList.toggle("on", d.dataset.id === id));
    if (!keepOpen) { const d = document.querySelector(`#live-cat details.lab[data-id="${id}"]`); if (d) d.open = true; }
    let g;
    try { g = await fetchJson(`/api/labs/${id}/graph`); } catch (e) { $("live-title").innerHTML = "<span style='color:var(--bad)'>" + esch(e.message) + "</span>"; return; }
    if (S.shown !== id) return;
    S.graph = g;
    const v = ensure3D(); if (v) { v.setGraph(g); }
    fillTitle(g); renderEve(g);
    for (const n of g.nodes) S.routers.add(n.name);
    renderCliTabs();
  }

  function fillTitle(g) {
    const lab = g.lab;
    $("live-title").innerHTML = `${esch(lab.short)}<small>${lab.id !== "shared" ? "lab " + lab.id.slice(0, 2) + " · " : ""}${g.nodes.length} routers · ${g.links.length} links · ${g.sessions.length} BGP sessions · ${lab.live ? "live" : lab.active ? (lab.phase === "switching" ? "switching…" : "not running") : "preview: not running"}</small>`;
    const kinds = [...new Set(g.sessions.map(s => s.kind))];
    $("live-legend").innerHTML = kinds.map(k => `<span><i style="border-color:${KIND[k][1]}"></i>${KIND[k][0]}</span>`).join("") +
      `<span><i class="d" style="background:#3fb950"></i>router answers</span><span><i class="d" style="background:#d29922"></i>starting</span><span><i class="d" style="background:#f85149"></i>not answering / session down</span><span><i class="d" style="background:#5b6b7c"></i>stopped / preview</span>
       <span><i class="d" style="background:#22d3ee"></i>SSH executor</span>`;
  }

  /* SSH only: the routers accept SSH on their management address (line vty, transport input ssh). The management network exists inside the
     EVE-NG VM. "SSH session" opens bgpputty:<lab>/<router>, a link handler that scripts/putty-setup.ps1 registers on the Windows PC: it starts a
     dedicated PuTTY window (saved session "BGP <lab> <router>") that reaches the router through the VM. */
  const puttyUrl = (lab, name) => `bgpputty:${lab}/${name}`;

  function renderEve(g) {
    const lab = g.lab, rows = g.nodes, up = rows.some(n => n.reachable);
    $("live-eve-lab").textContent = `${lab.eve_path}  (root folder of EVE-NG)`;
    $("live-eve-note").innerHTML = up
      ? `Lab <code>${esch(lab.eve_path)}</code> is running in EVE-NG under the account <code>bgpapi</code>. Routers are reached by <b>SSH only</b>: <b>SSH session</b> opens the router in its own PuTTY window (user <code>lab</code>, password on the Credentials tab). Set it up once on your PC, see below.`
      : `Lab <code>${esch(lab.eve_path)}</code> is not running. Press <b>Run</b> on one of its scenarios or <b>Start this lab</b>: the routers start, and their SSH sessions appear here.`;
    const html = `<table class="eve-t"><thead><tr><th>Router</th><th>Role</th><th>EVE-NG state</th><th>SSH address</th><th></th></tr></thead><tbody>` +
      rows.map(n => `<tr><td><b>${esch(n.name)}</b></td><td>${esch(n.role)} &middot; AS ${n.asn}</td><td class="${n.reachable ? "st-run" : "st-off"}">${n.reachable ? "running, SSH answers" : esch(n.status === "unknown" ? "not in EVE-NG" : n.status)}</td>
        <td><code>lab@${esch(n.mgmt_ip)}</code></td>
        <td>${n.reachable ? `<a class="btn" href="${esch(puttyUrl(lab.id, n.name))}" title="Open ${esch(n.name)} in its own PuTTY window">SSH session</a>` : ""}<button class="ghost" data-cli="${esch(n.name)}">CLI tab</button></td></tr>`).join("") + `</tbody></table>`;
    if (html === S.eveHtml && $("live-eve-table").firstChild) return;      // unchanged: keep the buttons, a click during a rebuild would be lost
    S.eveHtml = html; $("live-eve-table").innerHTML = html;
    $("live-eve-table").querySelectorAll("button[data-cli]").forEach(b => { b.onclick = () => openCli(b.dataset.cli); });
  }

  /* Select a router in the SSH / CLI card. With nothing in its transcript yet, run one read-only show so the tab visibly answers. */
  function openCli(router) {
    S.tab = router; if (S.v3) S.v3.select(router);
    renderCliTabs(); renderCli();
    const card = $("cli-out").closest(".card"); if (card && card.scrollIntoView) card.scrollIntoView({ block: "center", behavior: "smooth" });
    if (!S.cli.some(e => e.router === router)) { $("cli-cmd").value = "show ip bgp summary"; quickShow(); }
    $("cli-cmd").focus({ preventScroll: true });
  }

  async function pollGraph() {
    if (!S.shown || document.hidden || $("view-live").hidden) return;
    try {
      const g = await fetchJson(`/api/labs/${S.shown}/graph`);
      if (S.shown !== g.lab.id) return;
      S.graph = g; if (S.v3) S.v3.update(g); fillTitle(g); renderEve(g);
    } catch (e) { /* the backend restarts sometimes */ }
  }

  // ------------------------------------------------------------------ running and streaming
  function setBusy(v) {
    S.busy = v;
    document.querySelectorAll("#live-cat button[data-act]").forEach(b => { b.disabled = v; });
    $("live-timer").textContent = "";
    clearInterval(S.timer);
    if (v) { S.t0 = Date.now(); S.timer = setInterval(() => { $("live-timer").textContent = fmt((Date.now() - S.t0) / 1000); }, 1000); }
  }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function resetRun(title) {
    S.steps = []; S.cli = []; S.tab = "All"; $("live-results").innerHTML = ""; $("live-run-title").textContent = title || "";
    renderSteps(); renderCliTabs(); renderCli();
  }

  async function runScenario(lab, sid, mode) {
    if (S.busy) return;
    const l = S.cat.labs.find(x => x.id === lab);
    if (mode === "run" && !l.active && !confirm(`Running "${sid}" switches the VM to lab ${l.id} (${l.short}): the running lab is stopped and ${l.routers} routers are started. ${l.prepared ? "That takes a few minutes." : "This lab was never configured, so the first run also sets it up (about 10 minutes)."} Continue?`)) return;
    setBusy(true);                                        // at once: the buttons must not be usable while the 3D view loads
    resetRun(`${mode === "run" ? "Run" : "Rollback"} ${sid} on ${l.short}`);
    await showLab(lab);
    S.states[`${lab}/${sid}`] = "running"; setRowState(lab, sid, "running");
    try {
      const { run_id } = await fetchJson(`/api/labs/${lab}/scenarios/${sid}/${mode}`, { method: "POST" });
      attach(run_id, { lab, sid, mode });
    } catch (e) { setBusy(false); addCli({ router: "", kind: "err", text: e.message }); setRowState(lab, sid, "error"); loadCatalog(); }
  }

  async function startLab(lab) {
    if (S.busy) return;
    const l = S.cat.labs.find(x => x.id === lab);
    if (!l.active && !confirm(`Switch the VM to lab ${l.id} (${l.short})? The running lab is stopped.`)) return;
    setBusy(true);
    resetRun(`Start ${l.short}`);
    await showLab(lab);
    try { const { run_id } = await fetchJson(`/api/labs/${lab}/activate`, { method: "POST" }); attach(run_id, { lab, activate: true }); }
    catch (e) { setBusy(false); addCli({ router: "", kind: "err", text: e.message }); }
  }

  async function prewarm() {
    if (S.busy) return;
    if (!confirm("Configure and save every lab, one after the other? This takes a long time (roughly 1.5 to 3 hours) because each lab is started, set up and stopped in turn. The dashboard is busy meanwhile.")) return;
    resetRun("Prepare all labs");
    setBusy(true);
    try { const { run_id } = await fetchJson("/api/prewarm", { method: "POST" }); attach(run_id, { prewarm: true }); }
    catch (e) { setBusy(false); addCli({ router: "", kind: "err", text: e.message }); }
  }

  function attach(runId, meta) {
    if (S.es) S.es.close();
    S.runId = runId; S.meta = meta || {};
    const es = S.es = new EventSource(`/api/stream/${runId}`);
    es.addEventListener("plan", e => { S.steps = JSON.parse(e.data).map(s => ({ ...s, status: "pending", detail: "" })); renderSteps(); });
    es.addEventListener("step", e => {
      const d = JSON.parse(e.data), st = S.steps.find(s => s.id === d.id);
      if (st) { st.status = d.status; st.detail = d.detail || st.detail; } else S.steps.push({ id: d.id, label: d.id, status: d.status, detail: d.detail });
      renderSteps();
    });
    es.addEventListener("cli", e => addCli(JSON.parse(e.data)));
    es.addEventListener("log", e => {
      const t = JSON.parse(e.data);
      if (/^(===|ERROR|warning|stop |start |rolling back|baseline missing|still no SSH|targets:)/.test(t)) addCli({ router: "", kind: t.startsWith("ERROR") || t.startsWith("warning") ? "err" : "info", text: t });
    });
    es.addEventListener("result", async e => {
      es.close();
      const state = JSON.parse(e.data);
      setBusy(false);
      try { const run = await fetchJson(`/api/runs/${runId}`); showResults(run); } catch (err) { /* ignore */ }
      if (S.meta.sid) { S.states[`${S.meta.lab}/${S.meta.sid}`] = state; }
      await loadCatalog().catch(() => {});
      if (S.meta.lab) await showLab(S.meta.lab, true);
    });
    es.addEventListener("end", () => es.close());
    es.onerror = () => { /* EventSource retries by itself; a finished run ends with the end event */ };
  }

  function setRowState(lab, sid, st) {
    const el = document.querySelector(`.lsc[data-key="${lab}/${sid}"] [data-st]`);
    if (el) { el.textContent = st; el.className = "st " + st; }
  }

  function renderSteps() {
    const box = $("live-steps");
    if (!S.steps.length) { box.innerHTML = `<li class="live-empty" style="display:block">Press Run on a scenario. The steps appear here: stopping the running lab, starting the routers, waiting for SSH, checking the baseline, pushing the configuration, verifying.</li>`; return; }
    box.innerHTML = S.steps.map(s => `<li class="st-${s.status}"><span class="ic"></span><b>${esch(s.label)}</b>${s.detail ? `<small>${esch(s.detail)}</small>` : ""}</li>`).join("");
    const cur = box.querySelector(".st-running, .st-error"); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }

  function showResults(run) {
    const box = $("live-results");
    if (run.error) { box.innerHTML = `<div class="assert"><div class="h">error <span class="v" style="color:var(--bad)">${esch(run.error)}</span></div></div>`; return; }
    if (!(run.results || []).length) { box.innerHTML = `<div class="live-empty">${run.state === "done" ? "Done." : ""}</div>`; return; }
    box.innerHTML = `<div style="padding-top:10px;font-weight:600;color:${run.state === "passed" ? "var(--ok)" : "var(--bad)"}">${run.state === "passed" ? "All checks passed" : "A check failed"} &middot; ${run.duration || ""}s</div>` +
      run.results.map(r => `<div class="assert"><div class="h"><span>${esch(r.device)}</span><span style="color:var(--muted)">${esch(r.command)}</span>
        <span class="v" style="color:${r.passed ? "var(--ok)" : "var(--bad)"}">${r.passed ? "PASS" : "FAIL"} &middot; ${esch(r.reason)}</span></div><pre class="diff">${renderDiff(r.diff || r.output || "")}</pre></div>`).join("");
  }

  // ------------------------------------------------------------------ CLI transcript
  function addCli(ev) {
    S.cli.push(ev);
    if (ev.router) S.routers.add(ev.router);
    if (S.cli.length > 4000) S.cli.splice(0, 500);
    if (ev.router && S.v3) {
      if (ev.kind === "ssh") S.v3.beam(ev.router);
      const now = Date.now();
      if ((ev.kind === "err" || (ev.kind === "cmd" && /\(config/.test(ev.text))) && now - (S.pulseAt[ev.router] || 0) > 350) { S.pulseAt[ev.router] = now; S.v3.pulse(ev.router, ev.kind === "err" ? "err" : "cmd"); }
    }
    if (!S.tab || S.tab === "All" || S.tab === ev.router) appendCli(ev);
    renderCliTabs(true);
  }

  function cliLine(ev) {
    const t = esch(ev.text);
    let body;
    if (ev.kind === "cmd") { const i = ev.text.indexOf("#"); body = i > 0 ? `<span class="pr">${esch(ev.text.slice(0, i + 1))}</span><span class="cmd">${esch(ev.text.slice(i + 1))}</span>` : `<span class="cmd">${t}</span>`; }
    else body = `<span class="${ev.kind}">${t}</span>`;
    return `<div>${S.tab === "All" && ev.router ? `<span class="r">${esch(ev.router)}</span>` : ""}${body}</div>`;
  }
  function appendCli(ev) {
    const out = $("cli-out"), stick = out.scrollTop + out.clientHeight >= out.scrollHeight - 30;
    const hint = out.firstElementChild; if (hint && hint.tagName === "SPAN") hint.remove();
    out.insertAdjacentHTML("beforeend", cliLine(ev));
    if (stick && $("cli-follow").checked) out.scrollTop = out.scrollHeight;
  }
  function renderCli() {
    const out = $("cli-out"), rows = S.cli.filter(e => S.tab === "All" || e.router === S.tab || (!e.router && S.tab === "All"));
    out.innerHTML = rows.length ? rows.map(cliLine).join("") : S.tab !== "All" ? `<span class="out">Nothing was sent to ${esch(S.tab)} yet. Type a read-only show command below and press Run show, for example: show ip bgp summary</span>` : `<span class="out">The commands sent to the routers appear here, exactly as the executor types them over SSH: login, configure terminal, each configuration line, end, write memory, and the show commands used for the checks.</span>`;
    out.scrollTop = out.scrollHeight;
  }
  function renderCliTabs(soft) {
    const names = ["All", ...[...S.routers].sort()];
    const box = $("cli-tabs");
    if (soft && box.children.length === names.length) return;
    box.innerHTML = names.map(n => `<button class="${n === S.tab ? "on" : ""}" data-tab="${esch(n)}">${esch(n)}</button>`).join("");
    box.querySelectorAll("button").forEach(b => { b.onclick = () => { S.tab = b.dataset.tab; if (S.v3 && S.tab !== "All") S.v3.select(S.tab); renderCliTabs(); renderCli(); }; });
  }

  async function quickShow() {
    const input = $("cli-cmd"), cmd = input.value.trim();
    if (!cmd) return;
    const router = S.tab !== "All" ? S.tab : null;
    if (!router) { addCli({ router: "", kind: "info", text: "Pick a router tab (or click a router in the 3D view), then run the command." }); return; }
    addCli({ router, kind: "cmd", text: `${router}#${cmd}` });
    try { const r = await fetchJson(`/api/devices/${encodeURIComponent(router)}/show?cmd=${encodeURIComponent(cmd)}`); addCli({ router, kind: "out", text: r.output }); }
    catch (e) { addCli({ router, kind: "err", text: e.message }); }
    input.value = "";
  }

  function copyCli() {
    const text = [...$("cli-out").children].map(d => d.textContent).join("\n");
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { /* ignore */ } ta.remove();
    });
  }

  // ------------------------------------------------------------------ start
  async function refreshAll() { await loadCatalog(); if (S.shown) await showLab(S.shown, true); }

  async function init() {
    if (S.ready) return;
    S.ready = true;
    $("t-rot").onclick = e => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); S.v3 && S.v3.setAutoRotate(on); };
    const themeBtn = $("t-theme"), showTheme = () => { themeBtn.textContent = window.Live3D && Live3D.preferred() === "light" ? "Dark" : "Light"; };
    showTheme();
    themeBtn.onclick = () => { const next = Live3D.preferred() === "light" ? "dark" : "light"; Live3D.setPreferred(next); S.v3 && S.v3.setTheme(next); showTheme(); };
    $("t-lab").onclick = e => { const on = !e.currentTarget.classList.contains("on"); e.currentTarget.classList.toggle("on", on); S.v3 && S.v3.setLabels(on); };
    $("t-reset").onclick = () => S.v3 && S.v3.resetCamera();
    $("cli-clear").onclick = () => { S.cli = []; renderCli(); };
    $("cli-copy").onclick = copyCli;
    $("cli-run").onclick = quickShow;
    $("cli-cmd").addEventListener("keydown", e => { if (e.key === "Enter") quickShow(); });
    renderSteps(); renderCli();
    try { await loadCatalog(); } catch (e) { $("live-cat").innerHTML = `<div class="live-empty">Could not load the lab catalogue: ${esch(e.message)}</div>`; return; }
    const want = location.hash.split("/")[1], pick = S.cat.labs.find(l => l.id === want) || S.cat.labs.find(l => l.active) || S.cat.labs.find(l => l.selected) || S.cat.labs[S.cat.labs.length - 1];
    await showLab(pick.id);
    if (S.status.busy) {                                   // a run is in progress (the page was reloaded): follow it from its start
      try { const r = await fetchJson(`/api/runs/${S.status.busy}`); resetRun(r.scenario + " on " + (r.lab || "")); setBusy(true); attach(S.status.busy, { lab: r.lab, sid: r.scenario }); } catch (e) { /* finished meanwhile */ }
    }
    setInterval(pollGraph, 6000);
    setInterval(() => { if (!$("view-live").hidden && !document.hidden) loadCatalog(true).catch(() => {}); }, 15000);
  }

  window.addEventListener("viewchange", e => { if (e.detail === "live") { init(); S.v3 && S.v3.resize(); } });
  if (!$("view-live").hidden) init();
  window.LiveTab = { S, init };
})();

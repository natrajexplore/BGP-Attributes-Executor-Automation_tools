/* 3D views on the Learn pages. A page declares nothing: learn.js renders <div class="l3d" data-l3d="<page id>"></div> and calls
   Learn3D.mountAll(root) after drawing the page. The lab, the path and the captions come from learn-3d.js; the topology, the sessions and
   the routers a scenario configures come from the dashboard (GET /api/labs/<lab>/graph), so the picture is the real lab, live when it runs.
   Learn3D.disposeAll() frees the WebGL contexts (call it before the next page is drawn). */
(() => {
  const views = [];
  const cache = {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function graphOf(lab) {
    const c = cache[lab];
    if (c && Date.now() - c.t < 20000) return c.g;
    const r = await fetch(`/api/labs/${encodeURIComponent(lab)}/graph`);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const g = await r.json();
    cache[lab] = { t: Date.now(), g };
    return g;
  }

  /* the HTML learn.js puts in a page */
  function box(id, title) {
    const cfg = (window.LEARN_3D || {})[id];
    if (!cfg) return "";
    return `<div class="l3d" data-l3d="${esc(id)}">
      <div class="l3d-bar"><b>${esc(title || "3D view")}</b><span class="l3d-lab"></span>
        <span class="l3d-tools"><button class="ghost" data-t="play" title="Pause or play the packet">Pause</button><button class="ghost on" data-t="rot">Rotate</button><button class="ghost on" data-t="names">Names</button><button class="ghost" data-t="theme" title="Light or dark 3D scene">Light</button><button class="ghost" data-t="reset">Reset view</button></span></div>
      <div class="l3d-canvas"></div>
      <div class="l3d-cap"></div>
      <div class="l3d-note">${esc(cfg.note || "")}</div>
      <div class="l3d-foot"><span><i style="background:#fbbf24"></i>configured by the scenario</span><span><i style="background:#3fb950"></i>router answers (lab running)</span><span><i style="background:#5b6b7c"></i>preview (lab not running)</span>
        <a class="btn" href="#live/${esc(cfg.lab)}">Open this lab in Live labs</a></div>
    </div>`;
  }

  /* the box follows the scene: a light scene gets a light frame, the caption strip and the button label */
  function paintTheme(el, name) {
    el.classList.toggle("light", name === "light");
    const b = el.querySelector('[data-t="theme"]'); if (b) b.textContent = name === "light" ? "Dark" : "Light";
  }

  async function mount(el) {
    const id = el.dataset.l3d, cfg = (window.LEARN_3D || {})[id], host = el.querySelector(".l3d-canvas"), cap = el.querySelector(".l3d-cap");
    if (!cfg || !host) return;
    if (!window.THREE || !window.Live3D || !window.Live3D.supported()) {
      host.innerHTML = `<div class="l3d-none">The 3D view needs WebGL, which this browser does not offer. The diagram above shows the same idea.</div>`; return;
    }
    let g;
    try { g = await graphOf(cfg.lab); } catch (e) { host.innerHTML = `<div class="l3d-none">Could not load the lab topology (${esc(e.message)}).</div>`; return; }
    if (!document.body.contains(el)) return;                      // the page was replaced while the topology loaded
    const v = window.Live3D.create(host, { compact: true });
    if (!v) { host.innerHTML = `<div class="l3d-none">The 3D view could not start.</div>`; return; }
    v.setGraph(g);
    v.highlight(g.lab.targets, "configured here");
    const onHop = (i) => { cap.textContent = (cfg.captions || [])[i] || ""; };
    v.tracePath(cfg.path, { captions: [], onHop, speed: 0.045 });
    el.querySelector(".l3d-lab").textContent = `${g.lab.short} · ${g.nodes.length} routers · ${g.lab.live ? "live" : "preview"}`;
    paintTheme(el, v.theme());
    const st = { play: true };
    el.querySelector(".l3d-tools").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const t = b.dataset.t;
      if (t === "rot") { const on = !b.classList.contains("on"); b.classList.toggle("on", on); v.setAutoRotate(on); }
      else if (t === "names") { const on = !b.classList.contains("on"); b.classList.toggle("on", on); v.setLabels(on); }
      else if (t === "reset") v.resetCamera();
      else if (t === "theme") { const next = v.theme() === "light" ? "dark" : "light"; window.Live3D.setPreferred(next); views.forEach(x => x.setTheme(next)); paintTheme(el, next); }
      else if (t === "play") {
        st.play = !st.play; b.textContent = st.play ? "Pause" : "Play";
        if (st.play) v.tracePath(cfg.path, { captions: [], onHop, speed: 0.045 }); else v.stopTrace();
      }
    });
    views.push(v);
  }

  function mountAll(root) { (root || document).querySelectorAll(".l3d[data-l3d]").forEach(el => { mount(el).catch(() => { /* leave the box empty */ }); }); }
  function disposeAll() { while (views.length) { try { views.pop().dispose(); } catch (e) { /* ignore */ } } }

  window.Learn3D = { box, mountAll, disposeAll };
})();

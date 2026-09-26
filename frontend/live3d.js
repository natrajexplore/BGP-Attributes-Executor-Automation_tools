/* 3D view of a lab: routers on tiers, physical links, BGP sessions as arcs, an SSH "executor" that beams configuration to the
   router being configured. Three.js (vendor/three.min.js) + OrbitControls. Data: GET /api/labs/<id>/graph.

   const v = Live3D.create(container, { onSelect(name) {} });
   v.setGraph(graph)        rebuild the scene           v.update(graph)   refresh state (rebuilds only if the topology changed)
   v.pulse(name, kind)      router is being configured  v.beam(name)      an SSH command travels from the executor to a router
   v.select(name)  v.setAutoRotate(bool)  v.resetCamera()  v.setLabels(bool)  v.dispose()                                     */
(() => {
  const TIER = { customer: 0, content: 0, provider: 0, subsidiary: 0, branch: 1, edge: 1, pe: 1, internal: 1, leaf: 1,
    "route-reflector-client": 1, core: 2, "route-reflector": 2 };
  const TIER_NAME = ["Customers / outside", "Edge", "Core"];
  const ROLE_COLOR = { customer: 0x3fb950, content: 0x3fb950, provider: 0xd29922, subsidiary: 0x3fb950, branch: 0x4aa3ff, edge: 0x4aa3ff, pe: 0x4aa3ff,
    internal: 0x8b9bb0, leaf: 0x8b9bb0, "route-reflector-client": 0x8b9bb0, core: 0xa371f7, "route-reflector": 0xa371f7 };
  const SESSION_COLOR = { ibgp: 0x4aa3ff, ebgp: 0xf0883e, vpnv4: 0xe879f9, vrf: 0x22d3ee };
  const UP = 0x3fb950, DOWN = 0xf85149, WAIT = 0xd29922, IDLE = 0x5b6b7c;

  function supported() {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }

  function textSprite(T, lines, opts = {}) {
    const c = document.createElement("canvas"), g = c.getContext("2d"), w = opts.w || 320, h = opts.h || 96;
    c.width = w; c.height = h;
    g.font = `600 ${opts.size || 40}px -apple-system, Segoe UI, Roboto, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 6; g.strokeStyle = "rgba(11,15,20,.92)"; g.fillStyle = opts.color || "#e6edf3";
    g.strokeText(lines[0], w / 2, lines[1] ? h * 0.36 : h / 2); g.fillText(lines[0], w / 2, lines[1] ? h * 0.36 : h / 2);
    if (lines[1]) {
      g.font = `500 ${Math.round((opts.size || 40) * 0.62)}px -apple-system, Segoe UI, Roboto, sans-serif`; g.fillStyle = "#8b9bb0";
      g.strokeText(lines[1], w / 2, h * 0.76); g.fillText(lines[1], w / 2, h * 0.76);
    }
    const tex = new T.CanvasTexture(c); tex.minFilter = T.LinearFilter;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set((opts.scale || 3.2) * (w / 320), (opts.scale || 3.2) * (h / 320), 1);
    sp.renderOrder = 10;
    return sp;
  }

  function create(container, handlers = {}) {
    const T = window.THREE;
    if (!T || !supported()) return null;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0b1017, 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;outline:none";
    const scene = new T.Scene();
    scene.fog = new T.Fog(0x0b1017, 26, 60);
    const camera = new T.PerspectiveCamera(48, 1, 0.1, 200);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 4; controls.maxDistance = 45;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.5;
    controls.addEventListener("start", () => { controls.autoRotate = false; state.rotate = false; handlers.onRotate && handlers.onRotate(false); });
    scene.add(new T.AmbientLight(0x8fa4bd, 0.85));
    const sun = new T.DirectionalLight(0xffffff, 0.9); sun.position.set(6, 14, 8); scene.add(sun);
    const world = new T.Group(); scene.add(world);
    const tip = document.createElement("div");
    tip.style.cssText = "position:absolute;pointer-events:none;display:none;background:rgba(15,20,26,.94);border:1px solid #2b3947;border-radius:6px;padding:6px 9px;font:12px/1.45 -apple-system,Segoe UI,sans-serif;color:#e6edf3;z-index:5;max-width:260px";
    container.style.position = container.style.position || "relative"; container.appendChild(tip);

    const state = { graph: null, sig: "", rotate: true, labels: true, nodes: {}, sessions: [], pulses: [], beams: [], selected: null, extent: 10, center: new T.Vector3(), exec: null };
    const clock = new T.Clock();
    const ray = new T.Raycaster(), mouse = new T.Vector2();
    let raf = 0, disposed = false, hoverName = null;

    const roleTier = r => (r in TIER ? TIER[r] : 1);
    const nodeColor = r => ROLE_COLOR[r] ?? 0x8b9bb0;

    function clearWorld() {
      world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (o.material.map) && o.material.map.dispose(); o.material.dispose && o.material.dispose(); } });
      while (world.children.length) world.remove(world.children[0]);
      state.nodes = {}; state.sessions = []; state.pulses = []; state.beams = []; state.selected = null;
    }

    function layout(graph) {
      const xs = graph.nodes.map(n => n.x), ys = graph.nodes.map(n => n.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const span = Math.max(maxX - minX, maxY - minY, 200), k = 21 / span;
      const pos = {};
      for (const n of graph.nodes) pos[n.name] = new T.Vector3((n.x - (minX + maxX) / 2) * k, roleTier(n.role) * 2.1, (n.y - (minY + maxY) / 2) * k);
      return { pos, w: (maxX - minX) * k, d: (maxY - minY) * k };
    }

    function cylBetween(a, b, r, mat) {
      const d = new T.Vector3().subVectors(b, a), len = d.length();
      const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 8), mat);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize());
      return m;
    }

    function build(graph) {
      clearWorld();
      const { pos, w, d } = layout(graph);
      state.extent = Math.max(w, d, 8);
      const usedTiers = [...new Set(graph.nodes.map(n => roleTier(n.role)))].sort();
      // floor and tier plates
      const grid = new T.GridHelper(Math.max(w, d) + 14, 24, 0x22303d, 0x16212b); grid.position.y = -0.3; world.add(grid);
      for (const t of usedTiers) {
        const plate = new T.Mesh(new T.PlaneGeometry(w + 6, d + 5), new T.MeshBasicMaterial({ color: [0x3fb950, 0x4aa3ff, 0xa371f7][t] || 0x4aa3ff, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false }));
        plate.rotation.x = -Math.PI / 2; plate.position.y = t * 2.1 - 0.28; world.add(plate);
        const lab = textSprite(T, [TIER_NAME[t] || "Tier"], { w: 420, h: 70, size: 34, color: "#8b9bb0", scale: 3.0 });
        lab.position.set(-(w + 6) / 2 - 2.3, t * 2.1 - 0.05, 0); world.add(lab); lab.userData.tier = true;
      }
      // physical links
      const linkMat = new T.MeshStandardMaterial({ color: 0x4b5a6a, roughness: 0.6, metalness: 0.2 });
      for (const lk of graph.links) {
        if (!pos[lk.a] || !pos[lk.b]) continue;
        const m = cylBetween(pos[lk.a], pos[lk.b], 0.045, linkMat); m.userData = { link: lk }; world.add(m);
      }
      // routers
      for (const n of graph.nodes) {
        const g = new T.Group(); g.position.copy(pos[n.name]);
        const col = nodeColor(n.role);
        const body = new T.Mesh(new T.CylinderGeometry(0.62, 0.7, 0.34, 6), new T.MeshStandardMaterial({ color: 0x1b2632, roughness: 0.45, metalness: 0.5 }));
        const cap = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.06, 6), new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55 }));
        cap.position.y = 0.2;
        const ring = new T.Mesh(new T.RingGeometry(0.82, 0.92, 40), new T.MeshBasicMaterial({ color: IDLE, transparent: true, opacity: 0.9, side: T.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = -0.16;
        const sel = new T.Mesh(new T.RingGeometry(1.0, 1.08, 48), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: T.DoubleSide }));
        sel.rotation.x = -Math.PI / 2; sel.position.y = -0.15;
        const label = textSprite(T, [n.name, `AS ${n.asn}`], { size: 44, scale: 3.0 }); label.position.y = 1.05;
        g.add(body, cap, ring, sel, label);
        g.userData = { name: n.name, node: n, cap, ring, sel, label, body, col };
        world.add(g); state.nodes[n.name] = g;
        body.userData.router = n.name; cap.userData.router = n.name; ring.userData.router = n.name;
      }
      // BGP sessions as arcs
      const seen = {};
      for (const s of graph.sessions) {
        const a = pos[s.a], b = pos[s.b];
        if (!a || !b) continue;
        const pair = [s.a, s.b].sort().join("|"), idx = seen[pair] = (seen[pair] || 0) + 1;
        const dist = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
        const side = new T.Vector3().subVectors(b, a).cross(new T.Vector3(0, 1, 0)).normalize().multiplyScalar(0.35 * (idx - 1));
        mid.add(side); mid.y += 0.9 + 0.13 * dist + 0.2 * (idx - 1);
        const curve = new T.QuadraticBezierCurve3(a.clone().add(new T.Vector3(0, 0.3, 0)), mid, b.clone().add(new T.Vector3(0, 0.3, 0)));
        const col = SESSION_COLOR[s.kind] || 0x4aa3ff;
        const mat = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
        const tube = new T.Mesh(new T.TubeGeometry(curve, 28, 0.045, 6, false), mat);
        tube.userData = { session: s };
        world.add(tube);
        const dots = [0, 0.5].map(o => { const dm = new T.Mesh(new T.SphereGeometry(0.1, 10, 10), new T.MeshBasicMaterial({ color: 0xffffff })); world.add(dm); return { mesh: dm, off: o }; });
        state.sessions.push({ s, curve, mat, tube, dots, col, boost: 0 });
      }
      // the SSH executor: where every configuration command comes from
      const ex = new T.Group();
      const box = new T.Mesh(new T.OctahedronGeometry(0.5), new T.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.6 }));
      ex.add(box);
      const exl = textSprite(T, ["SSH executor", "ssh lab@192.168.99.x"], { size: 40, scale: 2.5 }); exl.position.y = 1.0; ex.add(exl);
      ex.position.set(0, 0.9, d / 2 + 4.6); world.add(ex);
      state.exec = ex;
      const ctr = new T.Vector3(0, 1, 0);
      state.center.copy(ctr);
      applyState(graph);
      resetCamera();
    }

    function applyState(graph) {
      const live = graph.lab.live, statuses = {};
      for (const n of graph.nodes) statuses[n.name] = n;
      for (const [name, g] of Object.entries(state.nodes)) {
        const n = statuses[name] || {};
        let ring = IDLE, dim = 0.35;
        if (live) {
          if (n.status === "stopped") { ring = IDLE; dim = 0.2; }
          else if (n.reachable === true) { ring = UP; dim = 0.75; }
          else if (n.reachable === false) { ring = DOWN; dim = 0.5; }
          else { ring = WAIT; dim = 0.55; }
        } else if (n.status && n.status !== "stopped" && n.status !== "unknown") { ring = WAIT; dim = 0.5; }
        g.userData.ring.material.color.setHex(ring);
        g.userData.cap.material.emissiveIntensity = dim;
        g.userData.node = n; g.userData.status = live ? (n.reachable === true ? "reachable" : n.reachable === false ? "not answering" : n.status) : "preview (lab not running)";
      }
      for (const ss of state.sessions) {
        const s = graph.sessions.find(x => x.a === ss.s.a && x.b === ss.s.b && x.kind === ss.s.kind) || ss.s;
        ss.s = s;
        let col = ss.col, op = 0.55;
        if (live && s.established === true) { op = 0.95; }
        else if (live && s.established === false) { col = DOWN; op = 0.9; }
        else if (live) { op = 0.5; }
        ss.mat.color.setHex(col); ss.mat.opacity = op;
        ss.up = live && s.established === true;
        ss.dots.forEach(d => { d.mesh.visible = ss.up || (!live); d.mesh.material.color.setHex(0xffffff); });
      }
    }

    function resetCamera() {
      const e = state.extent;
      camera.position.set(e * 0.3, e * 0.48 + 1.5, e * 0.72 + 2);
      controls.target.copy(state.center); controls.update();
    }

    function setGraph(graph) {
      state.graph = graph;
      state.sig = sigOf(graph);
      build(graph);
    }
    const sigOf = g => g.lab.id + "|" + g.nodes.map(n => n.name).join(",") + "|" + g.links.length + "|" + g.sessions.length;
    function update(graph) {
      if (sigOf(graph) !== state.sig) return setGraph(graph);
      state.graph = graph; applyState(graph);
    }

    // ---- effects
    function pulse(name, kind) {
      const g = state.nodes[name]; if (!g) return;
      const col = kind === "err" ? DOWN : 0x22d3ee;
      const ring = new T.Mesh(new T.RingGeometry(0.8, 0.9, 48), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(g.position); ring.position.y += 0.05; world.add(ring);
      state.pulses.push({ mesh: ring, t0: clock.getElapsedTime(), life: 1.4 });
      g.userData.flash = clock.getElapsedTime();
      state.sessions.forEach(ss => { if (ss.s.a === name || ss.s.b === name) ss.boost = clock.getElapsedTime() + 6; });
    }
    function beam(name) {
      const g = state.nodes[name]; if (!g || !state.exec) return;
      const a = state.exec.position.clone(), b = g.position.clone().add(new T.Vector3(0, 0.3, 0));
      const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 1.6;
      const curve = new T.QuadraticBezierCurve3(a, mid, b);
      const mat = new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.55 });
      const tube = new T.Mesh(new T.TubeGeometry(curve, 24, 0.03, 5, false), mat);
      const pk = new T.Mesh(new T.SphereGeometry(0.13, 10, 10), new T.MeshBasicMaterial({ color: 0xffffff }));
      world.add(tube, pk);
      state.beams.push({ tube, pk, curve, t0: clock.getElapsedTime(), life: 1.6 });
    }
    function select(name) {
      state.selected = name;
      for (const [n, g] of Object.entries(state.nodes)) g.userData.sel.material.opacity = n === name ? 0.95 : 0;
    }

    // ---- interaction
    function pick(ev) {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const targets = Object.values(state.nodes).flatMap(g => [g.userData.body, g.userData.cap, g.userData.ring]);
      const hit = ray.intersectObjects(targets, false)[0];
      if (hit) return { router: hit.object.userData.router };
      const sh = ray.intersectObjects(state.sessions.map(s => s.tube), false)[0];
      return sh ? { session: sh.object.userData.session } : null;
    }
    renderer.domElement.addEventListener("pointermove", ev => {
      const h = pick(ev);
      if (!h) { tip.style.display = "none"; renderer.domElement.style.cursor = "default"; return; }
      renderer.domElement.style.cursor = h.router ? "pointer" : "default";
      const r = container.getBoundingClientRect();
      if (h.router) {
        const g = state.nodes[h.router].userData, n = g.node;
        tip.innerHTML = `<b>${h.router}</b> <span style="color:#8b9bb0">${n.role}</span><br>AS ${n.asn} &middot; ${n.mgmt_ip}<br><span style="color:#8b9bb0">${g.status}</span>`;
      } else {
        const s = h.session;
        tip.innerHTML = `<b>${s.a} &harr; ${s.b}</b><br>${({ ibgp: "iBGP", ebgp: "eBGP", vpnv4: "MP-BGP VPNv4", vrf: "eBGP in VRF (PE-CE)" })[s.kind] || s.kind}<br><span style="color:${s.established === true ? "#3fb950" : s.established === false ? "#f85149" : "#8b9bb0"}">${s.state}${s.established ? " &middot; " + s.prefixes + " prefixes" : ""}</span>`;
      }
      tip.style.display = "block"; tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 270) + "px"; tip.style.top = (ev.clientY - r.top + 14) + "px";
    });
    renderer.domElement.addEventListener("pointerleave", () => { tip.style.display = "none"; });
    let down = null;
    renderer.domElement.addEventListener("pointerdown", ev => { down = [ev.clientX, ev.clientY]; });
    renderer.domElement.addEventListener("pointerup", ev => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4) return;
      const h = pick(ev);
      if (h && h.router) { select(h.router); handlers.onSelect && handlers.onSelect(h.router); }
    });

    // ---- loop
    function resize() {
      const w = container.clientWidth || 600, h = container.clientHeight || 400;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro && ro.observe(container);
    resize();

    function frame() {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden || container.offsetParent === null) return;
      const t = clock.getElapsedTime();
      controls.autoRotate = state.rotate; controls.update();
      for (const g of Object.values(state.nodes)) {
        const f = g.userData.flash ? Math.max(0, 1 - (t - g.userData.flash) / 1.2) : 0;
        if (f > 0) g.userData.cap.material.emissiveIntensity = 0.75 + f * 1.4;
        g.userData.label.visible = state.labels;
        g.userData.label.material.opacity = 1;
        g.userData.ring.rotation.z = t * 0.3;
      }
      if (state.exec) { state.exec.children[0].rotation.y = t * 0.8; state.exec.children[1].visible = state.labels; }
      state.pulses = state.pulses.filter(p => {
        const k = (t - p.t0) / p.life;
        if (k >= 1) { world.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); return false; }
        p.mesh.scale.setScalar(1 + k * 2.2); p.mesh.material.opacity = 0.9 * (1 - k); return true;
      });
      state.beams = state.beams.filter(b => {
        const k = (t - b.t0) / b.life;
        if (k >= 1) { world.remove(b.tube, b.pk); b.tube.geometry.dispose(); b.pk.geometry.dispose(); return false; }
        b.pk.position.copy(b.curve.getPoint(Math.min(1, k * 1.15))); b.tube.material.opacity = 0.6 * (1 - k * 0.6); return true;
      });
      for (const ss of state.sessions) {
        const fast = ss.boost > t ? 2.6 : 1;
        ss.dots.forEach(d => { if (!d.mesh.visible) return; const u = ((t * 0.16 * fast + d.off) % 1); d.mesh.position.copy(ss.curve.getPoint(u)); });
        if (ss.boost > t) ss.mat.opacity = 0.75 + 0.25 * Math.sin(t * 9);
      }
      renderer.render(scene, camera);
    }
    frame();

    return {
      setGraph, update, pulse, beam, select, resize, resetCamera,
      setAutoRotate(v) { state.rotate = !!v; controls.autoRotate = !!v; },
      setLabels(v) { state.labels = !!v; },
      snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); },
      dispose() { disposed = true; cancelAnimationFrame(raf); ro && ro.disconnect(); clearWorld(); renderer.dispose(); renderer.domElement.remove(); tip.remove(); },
    };
  }

  window.Live3D = { create, supported };
})();

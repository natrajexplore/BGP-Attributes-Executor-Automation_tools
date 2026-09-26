/* Credentials tab: the login user, login password and enable secret of every router of every lab. Values are hidden until Reveal.
   They come from GET /api/credentials (the lab inventories, checked against the baselines). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const S = { labs: null, shown: new Set(), all: false, loading: false };
  const key = (lab, r, f) => `${lab}/${r}/${f}`;
  const sshCmd = (ip, user) => `ssh -J root@${location.hostname} -o KexAlgorithms=+diffie-hellman-group14-sha1 -o HostKeyAlgorithms=+ssh-rsa -o Ciphers=+aes128-cbc ${user}@${ip}`;

  async function load() {
    if (S.labs || S.loading) return;
    S.loading = true;
    try {
      const r = await fetch("/api/credentials");
      if (!r.ok) throw new Error("HTTP " + r.status);
      S.labs = (await r.json()).labs;
    } catch (e) { $("cred-body").innerHTML = `<div class="live-empty">Could not load the credentials (${esc(e.message)}).</div>`; }
    S.loading = false;
    render();
  }

  function secretCell(lab, r, f) {
    const k = key(lab, r.name, f), v = r[f], on = S.all || S.shown.has(k);
    return `<td class="pwc"><code class="pw">${on ? esc(v) : "&bull;".repeat(8)}</code> <button class="ghost" data-show="${esc(k)}">${on ? "Hide" : "Reveal"}</button><button class="ghost" data-copy="${esc(v)}">Copy</button></td>`;
  }

  function render() {
    if (!S.labs) return;
    const q = $("cred-filter").value.trim().toLowerCase();
    const openIds = new Set([...document.querySelectorAll("#cred-body details.lab[open]")].map(d => d.dataset.lab));
    let nr = 0, nl = 0, off = 0;
    const html = S.labs.map(l => {
      const rows = l.routers.filter(r => !q || l.id.toLowerCase().includes(q) || l.short.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.mgmt_ip.includes(q));
      if (!rows.length) return "";
      nl++; nr += rows.length; off += rows.filter(r => r.baseline_match === false).length;
      const num = /^\d\d_/.test(l.id) ? l.id.slice(0, 2) : "-";
      return `<details class="lab${q ? " on" : ""}" data-lab="${esc(l.id)}"${q || openIds.has(l.id) ? " open" : ""}><summary><span class="num">${num}</span><span class="nm">${esc(l.short)}</span><span class="meta">${rows.length} routers &middot; ${esc(l.eve_path)}</span></summary>
        <table class="cred-t"><thead><tr><th>Router</th><th>Role</th><th>SSH address</th><th>Login user</th><th>Login password</th><th>Enable secret</th><th></th></tr></thead><tbody>${rows.map(r =>
          `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.role)} &middot; AS ${r.asn}</td><td><code>${esc(r.mgmt_ip)}</code></td><td><code>${esc(r.username)}</code></td>${secretCell(l.id, r, "password")}${secretCell(l.id, r, "secret")}
           <td>${r.baseline_match === false ? `<span class="bad" title="The baseline configures a different login or enable secret than the inventory">baseline differs</span> ` : ""}<button class="ghost" data-copy="${esc(sshCmd(r.mgmt_ip, r.username))}">Copy SSH command</button></td></tr>`).join("")}</tbody></table></details>`;
    }).join("");
    $("cred-body").innerHTML = html || `<div class="live-empty">No router matches the filter.</div>`;
    $("cred-count").textContent = `${nr} routers in ${nl} labs` + (off ? ` · ${off} differ from their baseline` : "");
    $("cred-reveal").textContent = S.all ? "Hide all" : "Reveal all";
    $("cred-note").innerHTML = `Login and enable passwords of every router in all ${S.labs.length} labs, from the lab files in the repository (<code>labs/&lt;lab&gt;/inventory.yaml</code> and the baselines). Routers accept <b>SSH only</b>; after login type <code>enable</code> and the enable secret. Values are hidden until you click <b>Reveal</b>. This is a lab VM: anyone who can open this dashboard can read them.`;
  }

  function init() {
    $("cred-filter").addEventListener("input", render);
    $("cred-reveal").addEventListener("click", () => { S.all = !S.all; if (!S.all) S.shown.clear(); render(); });
    $("cred-body").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.show) { const k = b.dataset.show; if (S.shown.has(k)) S.shown.delete(k); else S.shown.add(k); S.all = false; render(); }
      else if (b.dataset.copy != null) {
        const old = b.textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).catch(() => {});
        b.textContent = "Copied"; setTimeout(() => { b.textContent = old; }, 1200);
      }
    });
    window.addEventListener("viewchange", e => {
      if (e.detail === "cred") load();
      else { S.all = false; S.shown.clear(); if (S.labs) render(); }             // never leave passwords showing on another tab
    });
  }
  init();
})();

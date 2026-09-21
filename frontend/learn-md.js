/* Minimal Markdown renderer for the lab READMEs. Supports exactly what they use: # to ### headings, fenced code, pipe tables,
   bullet lists (* or -) and numbered lists with wrapped continuation lines, paragraphs, **bold**, *italic* and `inline code`.
   All text is HTML-escaped first, so README content can never inject markup. */
(() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });   // keep code spans untouched
    s = esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,:;]|$)/g, "$1<i>$2</i>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
  }

  const isFence = l => /^```/.test(l);
  const isHeading = l => /^#{1,3} +\S/.test(l);
  const isBullet = l => /^[*-] +\S/.test(l);
  const isNumbered = l => /^\d+\. +\S/.test(l);
  const isTableStart = (l, next) => /^\|/.test(l) && next !== undefined && /^\|[ :|-]+\|\s*$/.test(next);
  const cells = l => l.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(c => c.trim());

  function render(md) {
    const lines = String(md).replace(/\r\n?/g, "\n").split("\n"), out = [];
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i];
      if (!ln.trim()) { i++; continue; }
      if (isFence(ln)) {
        const buf = []; i++;
        while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++]);
        i++; out.push(`<pre class="code">${esc(buf.join("\n"))}</pre>`); continue;
      }
      if (isHeading(ln)) { const m = ln.match(/^(#{1,3}) +(.*)$/); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (isTableStart(ln, lines[i + 1])) {
        const head = cells(ln); i += 2; const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<div class="md-tw"><table class="md-t"><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
          rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + `</tbody></table></div>`);
        continue;
      }
      if (isBullet(ln) || isNumbered(ln)) {
        const ordered = isNumbered(ln), test = ordered ? isNumbered : isBullet, items = [];
        while (i < lines.length && test(lines[i])) {
          let text = lines[i].replace(ordered ? /^\d+\. +/ : /^[*-] +/, ""); i++;
          while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !test(lines[i])) text += " " + lines[i++].trim();   // wrapped item
          items.push(text);
        }
        const tag = ordered ? "ol" : "ul";
        out.push(`<${tag}>${items.map(t => `<li>${inline(t)}</li>`).join("")}</${tag}>`); continue;
      }
      const para = [];                                                // paragraph: consecutive lines until a blank line or another block
      while (i < lines.length && lines[i].trim() && !isFence(lines[i]) && !isHeading(lines[i]) && !isBullet(lines[i]) && !isNumbered(lines[i]) && !isTableStart(lines[i], lines[i + 1])) para.push(lines[i++].trim());
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
    return out.join("\n");
  }

  const api = { render, esc };
  if (typeof window !== "undefined") window.MiniMD = api;
  if (typeof module !== "undefined") module.exports = api;
})();

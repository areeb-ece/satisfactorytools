// Save any tool as an image, as PrereqFlow does: PNG at 2–6× or SVG, in the current
// theme, the dark sheet or the light one, with a title block, a legend and the credit.
//
// What can be drawn depends on the tool:
//   - a diagram (the planner's factory, a splitter build): all of it, the highlighted
//     trees, the pinned card with everything that feeds it and everything it feeds, the
//     part on screen, or the build inside the pinned splitter card;
//   - the tool's panels (inputs, results, tables), under the diagram or on their own.
// Tools can describe themselves by setting view.imageInfo to a function returning (all optional):
//   what          the title block's line under the tool name
//   kinds         legend names for card kinds
//   panels        panels of their own, [{ title, blocks }] (blocks as readSections makes them)
//   skip          titles of the page's panels those replace
//   defaults      panels ticked under a diagram; sheet: panels ticked for the panels alone
import { h, btn, closeBtn, seg, toast } from "./ui.js";
import { layout } from "./lib/flowlayout.js";
import { measure, fit, wrap, fitScale, toPNG, toSVG, useFonts } from "./image.js";

const SITE = "areeb-ece.github.io/satisfactorytools";
const N_HL = 6;
const DIRS = { up: "what feeds it", down: "what it feeds", both: "both ways" };

// ── colours ───────────────────────────────────────────────────────────────────
// Read from the master palette through a hidden probe (every theme is also defined on
// [data-theme] elements), so any sheet can be drawn whatever the page shows. Colours are
// often color-mix(); a canvas turns each into plain rgb().
const FALLBACK = {
  dark: { bg: "#0F1114", sheet: "#14161A", sheet2: "#17191E", card: "#1C1F25", ink: "#F1EDE5", ink2: "#CAC5BB", ink3: "#A29E96", ink4: "#6E6B65", rule: "#2E323B", rule2: "#23262D", accent: "#A3B8F0", ok: "#9FD4AB", warn: "#EACB76" },
  light: { bg: "#ECE8DF", sheet: "#F6F3EC", sheet2: "#FAF8F3", card: "#FFFFFF", ink: "#2F2D36", ink2: "#5D5967", ink3: "#77727F", ink4: "#A29DA8", rule: "#DDD7CB", rule2: "#E8E3D9", accent: "#4F67C6", ok: "#3F8D5B", warn: "#A9831B" },
};
export function palette(theme) {
  const root = document.documentElement;
  const probe = h("div", { hidden: true });
  if (theme !== "current") { probe.dataset.theme = theme; probe.dataset.scheme = theme; }
  document.body.append(probe);
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const fb = FALLBACK[theme === "current" ? (root.dataset.scheme === "light" || root.dataset.theme === "light" ? "light" : "dark") : theme] || FALLBACK.dark;
  const master = !!getComputedStyle(probe).getPropertyValue("--master").trim() || !!getComputedStyle(root).getPropertyValue("--sp-4").trim();
  const c = (expr, fallback = "#888") => {
    if (!master) return fallback;
    probe.style.setProperty("color", "");
    probe.style.setProperty("color", expr);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${+(a / 255).toFixed(3)})`;
  };
  const mix = (a, pct, b) => c(`color-mix(in srgb, ${a} ${pct}%, ${b})`);
  const P = {
    bg: c("var(--bg)", fb.bg), sheet: c("var(--sheet)", fb.sheet), sheet2: c("var(--sheet-2)", fb.sheet2), card: c("var(--card)", fb.card),
    well: c("var(--well)", fb.sheet2), grid: c("var(--grid)", "rgba(128,128,128,0.05)"),
    ink: c("var(--ink)", fb.ink), ink2: c("var(--ink-2)", fb.ink2), ink3: c("var(--ink-3)", fb.ink3), ink4: c("var(--ink-4)", fb.ink4),
    rule: c("var(--rule)", fb.rule), rule2: c("var(--rule-2)", fb.rule2), accent: c("var(--accent)", fb.accent), ok: c("var(--ok)", fb.ok), warn: c("var(--warn)", fb.warn),
    tint: c("var(--tint)", fb.sheet2), rowLine: c("var(--row-line)", fb.rule2),
    edge: c("var(--edge)", fb.ink4), edgeDim: c("var(--edge-dim)", fb.rule),
    cc: Array.from({ length: 8 }, (_, i) => c(`var(--c${i})`, fb.accent)),
    h: Array.from({ length: N_HL }, (_, i) => c(`var(--h${i})`, fb.accent)),
  };
  P.hTint = P.h.map((_, i) => master ? mix(`var(--h${i})`, 10, "var(--card)") : P.card);
  P.hRing = P.h.map((_, i) => master ? mix(`var(--h${i})`, 40, "transparent") : P.rule);
  const k = (bg, border, title = P.ink, meta = P.ink3) => ({ bg, border, title, meta });
  P.kind = {
    machine: k(P.card, P.rule),
    src: k(master ? mix("var(--c2)", 12, "var(--card)") : P.card, master ? mix("var(--c2)", 45, "var(--rule)") : P.rule, P.ink, P.ink2),
    out: k(c("var(--tint-ok)", P.card), master ? mix("var(--ok)", 45, "var(--rule)") : P.ok, P.ink, P.ink2),
    extra: k(c("var(--tint-warn)", P.card), master ? mix("var(--warn)", 45, "var(--rule)") : P.warn, P.ink, P.ink2),
    split: k(P.sheet2, master ? mix("var(--accent)", 60, "var(--rule)") : P.accent, P.accent),
    merge: k(P.sheet2, master ? mix("var(--c3)", 60, "var(--rule)") : P.cc[3], P.cc[3]),
  };
  P.kind.bal = P.kind.split;
  // Type: the page's own stacks (Libre Franklin for text, mononoki for figures and cards).
  const cs = getComputedStyle(root);
  useFonts({ mono: cs.getPropertyValue("--font-mono").trim() || undefined, text: cs.getPropertyValue("--font-text").trim() || undefined });
  probe.remove();
  return P;
}

// ── the diagram ───────────────────────────────────────────────────────────────
function closure(start, nbrs) {
  const seen = new Set([start]), stack = [start];
  while (stack.length) for (const y of nbrs.get(stack.pop()) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
  return seen;
}
// Cards and links in highlighted trees, as flowchart.js lights them.
function treeSets(lay, trees) {
  const cards = new Map(), edges = new Map();
  for (const t of trees) {
    if (!lay.nodes.has(t.id)) continue;
    const anc = t.dir !== "down" ? closure(t.id, lay.preds) : new Set([t.id]);
    const desc = t.dir !== "up" ? closure(t.id, lay.succs) : new Set([t.id]);
    for (const c of new Set([...anc, ...desc])) (cards.get(c) ?? cards.set(c, []).get(c)).push(t.color);
    lay.edges.forEach((e, i) => {
      if (!edges.has(i) && ((anc.has(e.from) && anc.has(e.to)) || (desc.has(e.from) && desc.has(e.to)))) edges.set(i, t.color);
    });
  }
  return { cards, edges, roots: new Set(trees.map((t) => t.id)), any: cards.size > 0 };
}
const shiftPath = (d, dx, dy) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (m, x, y) => `${Math.round((+x + dx) * 10) / 10},${Math.round((+y + dy) * 10) / 10}`);
const tipOf = (d) => { const m = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].at(-1); return { x: +m[1], y: +m[2] }; };

// The chart part of an image: { width, height, draw(ops, x0, y0), legend }.
function chartPart(chart, scope, o, P) {
  let graph = chart.graph, lay = chart.layout;
  const st = chart.state;
  let keep = null;
  if (scope === "trees") keep = new Set(st.trees.flatMap((t) => [...(t.dir !== "down" ? closure(t.id, lay.preds) : []), ...(t.dir !== "up" ? closure(t.id, lay.succs) : []), t.id]));
  if (scope === "chain" && st.pinned) keep = new Set([...closure(st.pinned, lay.preds), ...closure(st.pinned, lay.succs)]);
  if (keep) {
    const nodes = graph.nodes.filter((n) => keep.has(n.id));
    graph = { nodes, edges: graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
    lay = layout(graph.nodes, graph.edges);
  }
  // crop (layout coordinates): everything, or the part on screen
  let cx = 0, cy = 0, cw = lay.width, ch = lay.height;
  if (scope === "window" && chart.viewport) {
    ({ x: cx, y: cy, w: cw, h: ch } = chart.viewport());
    if (cx < 0) { cw += cx; cx = 0; } // a small chart sits centred in its view
    if (cy < 0) { ch += cy; cy = 0; }
  }
  cw = Math.max(40, Math.min(cw, lay.width - cx));
  ch = Math.max(40, Math.min(ch, lay.height - cy));
  const trees = o.highlights ? treeSets(lay, st.trees) : { cards: new Map(), edges: new Map(), roots: new Set(), any: false };
  const dim = trees.any && st.dim;
  const kinds = new Set(graph.nodes.map((n) => n.kind));
  const cls = new Set(graph.edges.map((e) => e.cls).filter(Boolean));
  const draw = (ops, x0, y0) => {
    const X = (x) => x - cx + x0, Y = (y) => y - cy + y0;
    ops.push({ t: "rect", x: x0, y: y0, w: cw, h: ch, fill: P.well });
    // the faint 24px grid of the sheet
    let grid = "";
    for (let x = Math.ceil(cx / 24) * 24; x < cx + cw; x += 24) grid += `M${X(x)},${y0} V${y0 + ch} `;
    for (let y = Math.ceil(cy / 24) * 24; y < cy + ch; y += 24) grid += `M${x0},${Y(y)} H${x0 + cw} `;
    if (grid) ops.push({ t: "path", d: grid, stroke: P.grid, sw: 1 });
    // links, plain first, lit on top; then their labels
    const plain = [], lit = [], labels = [];
    lay.edges.forEach((e, i) => {
      const ge = graph.edges[e.i];
      const hc = trees.edges.get(i);
      const fluid = ge.cls === "fluid", loop = ge.cls === "loop";
      const color = hc != null ? P.h[hc] : dim ? P.edgeDim : loop ? P.cc[3] : P.edge;
      const dash = e.kind === "back" ? [5, 4] : fluid ? [1, 3.5] : null;
      const d = shiftPath(e.d, x0 - cx, y0 - cy), tip = tipOf(d);
      const list = hc != null ? lit : plain;
      list.push({ t: "path", d, stroke: color, sw: hc != null || fluid ? 2.2 : 1.4, dash });
      list.push({ t: "arrow", x: tip.x + 1, y: tip.y, color, size: hc != null ? 9 : 8 });
      if (o.labels && ge.label) labels.push({ t: "text", x: X(e.label.x), y: Y(e.label.y - 4), text: ge.label, size: 11, color: hc != null ? P.ink : P.ink3, anchor: "middle", halo: P.well, a: dim && hc == null ? 0.3 : 1 });
    });
    ops.push(...plain, ...lit, ...labels);
    // cards
    for (const n of graph.nodes) {
      const p = lay.nodes.get(n.id);
      const x = X(p.x), y = Y(p.y);
      if (x > x0 + cw || x + p.w < x0 || y > y0 + ch || y + p.h < y0) continue;
      const K = P.kind[n.kind] || P.kind.machine;
      const tc = trees.cards.get(n.id), hc = tc ? tc[0] : null;
      const a = dim && hc == null ? 0.25 : 1;
      if (hc != null && trees.roots.has(n.id)) ops.push({ t: "rect", x: x - 3, y: y - 3, w: p.w + 6, h: p.h + 6, r: 10, fill: P.hRing[hc] });
      ops.push({ t: "rect", x, y, w: p.w, h: p.h, r: 7, fill: hc != null ? P.hTint[hc] : K.bg, a });
      ops.push({ t: "rect", x, y, w: p.w, h: p.h, r: 7, stroke: hc != null ? P.h[hc] : K.border, sw: 1, dash: n.kind === "extra" ? [4, 3] : null, a });
      const lines = [n.title, n.sub, n.note].filter((t) => t != null && t !== "").length;
      let base = y + (p.h - lines * 15.6) / 2 + 11.8, tx = x + 12;
      const right = x + p.w - 12;
      if (n.kind === "machine") {
        ops.push({ t: "rect", x: tx, y: base - 8.6, w: 8, h: 8, r: 2, fill: n.cc != null ? P.cc[n.cc % 8] : P.rule, a });
        tx += 16;
      }
      let tagW = 0;
      if (n.tag) { // the title keeps at least half the room
        const tag = fit(n.tag, (right - tx) / 2 - 8, 13);
        tagW = measure(tag, 13) + 8;
        ops.push({ t: "text", x: right, y: base, text: tag, size: 13, color: K.meta, anchor: "end", a });
      }
      ops.push({ t: "text", x: tx, y: base, text: fit(n.title, right - tx - tagW, 13, 700), size: 13, weight: 700, color: hc != null ? P.h[hc] : K.title, a });
      for (const [t, color] of [[n.sub, P.ink2], [n.note, K.meta === P.ink2 ? P.ink2 : P.ink3]]) {
        if (t == null || t === "") continue;
        base += 15.6;
        ops.push({ t: "text", x: x + 12, y: base, text: fit(t, p.w - 24, 13), size: 13, color, a });
      }
      if (tc) tc.forEach((ci, i) => ops.push({ t: "rect", x: x + p.w - 8 - 10 * (tc.length - i), y: y + p.h - 11, w: 7, h: 7, r: 3.5, fill: P.h[ci] }));
    }
  };
  return { width: cw, height: ch, draw, kinds, cls, back: lay.edges.some((e) => e.kind === "back"), trees: o.highlights ? st.trees.filter((t) => lay.nodes.has(t.id)).map((t) => ({ ...t, title: graph.nodes.find((n) => n.id === t.id)?.title })) : [] };
}

// ── the panels ────────────────────────────────────────────────────────────────
// A tool's sections read back from the page: headings, paragraphs, fields (as
// "label: value"), stat tiles, tables and lists, in order. Buttons, charts and dialogs
// are left out.
const shown = (el) => !el.closest("[hidden], dialog, .fc") && el.getClientRects().length > 0;
const clean = (t) => t.replace(/\s+/g, " ").replace(/(?:\s*·\s*)+/g, " · ").replace(/^\s*·\s*|\s*·\s*$/g, "").trim();
// Text as it reads: a ticked box shows as ✓, and pieces laid out as blocks get a · between them.
function textOf(el) {
  if (el.nodeType === 3) return el.textContent;
  if (el.nodeType !== 1) return "";
  if (el.matches("input[type=checkbox]")) return el.checked ? "✓ " : "";
  if (el.matches("button, .sd-btn, svg, select, input, textarea, datalist, .xbtn, [hidden], [aria-hidden=true]")) return "";
  return [...el.childNodes].map((c) => {
    const t = textOf(c);
    return t && c.nodeType === 1 && (c.classList.contains("sd-tag") || !/^inline/.test(getComputedStyle(c).display)) ? " · " + t + " · " : t;
  }).join("");
}
function valueOf(el) {
  const seg = el.querySelector('.sd-seg [aria-checked="true"]');
  if (seg) return clean(seg.textContent);
  const vals = [];
  for (const c of el.querySelectorAll("input, select, textarea")) {
    if (c.type === "checkbox" || c.type === "radio") { if (c.checked) vals.push("✓"); continue; }
    const v = c.tagName === "SELECT" ? c.selectedOptions[0]?.textContent ?? "" : c.value;
    const u = c.closest(".unit")?.querySelector("i")?.textContent;
    if (clean(v)) vals.push(clean(v) + (u ? " " + u : ""));
  }
  return vals.join(" · ");
}
function walk(el, out) {
  for (const c of el.children) {
    if (!shown(c) || c.matches("button, .sd-btn, dialog, datalist, script, .fc, .xbtn, .sd-error, .sd-tabs, [role=tablist]")) continue;
    if (c.matches("h1, h2, h3, h4")) { const t = clean(textOf(c)); if (t) out.push({ t: "sub", text: t }); }
    else if (c.matches(".sd-field, .fl")) {
      const k = clean(c.querySelector(".sd-label")?.textContent ?? ""), v = valueOf(c);
      if (k || v) out.push({ t: "kv", k, v: v || "—" });
    } else if (c.matches(".irow")) {
      const cells = [...c.querySelectorAll(".cell")].map(valueOf).filter(Boolean);
      if (cells.length) out.push({ t: "kv", k: cells[0], v: cells.slice(1).join(" · ") || "" });
    } else if (c.matches("label.sd-check, label.check")) out.push({ t: "kv", k: clean(textOf(c)), v: c.querySelector("input")?.checked ? "on" : "off" });
    else if (c.matches(".stats")) {
      const items = [...c.querySelectorAll(".stat")].filter(shown).map((x) => ({ v: clean(x.querySelector("b")?.textContent ?? ""), k: clean(x.querySelector("span")?.textContent ?? ""), hi: x.classList.contains("hi") }));
      if (items.length) out.push({ t: "stats", items });
    } else if (c.matches(".tw, table")) {
      const tb = c.matches("table") ? c : c.querySelector("table");
      if (!tb) continue;
      const heads = [...tb.querySelectorAll("thead th")];
      const rows = [...tb.querySelectorAll("tbody tr")].filter(shown).map((tr) => ({ sel: tr.classList.contains("sel"), cells: [...tr.children].map((td) => clean(textOf(td))) }));
      out.push({ t: "table", head: heads.map((x) => clean(x.textContent)), num: heads.map((x) => x.classList.contains("n") || x.classList.contains("sd-num")), rows });
    } else if (c.matches("details")) {
      const sum = c.querySelector("summary");
      const t = clean(sum?.querySelector(".fold-t") ? [sum.querySelector(".fold-t").textContent, sum.querySelector(".fold-s")?.textContent ?? ""].join(" · ") : sum?.textContent ?? "");
      if (t) out.push({ t: "sub", text: t });
      if (c.open) walk(c.querySelector(".fold-b") ?? c, out);
    } else if (c.matches("dl")) {
      for (const dt of c.querySelectorAll("dt")) out.push({ t: "kv", k: clean(textOf(dt)), v: clean(textOf(dt.nextElementSibling ?? dt)) });
    } else if (c.matches("ul, ol")) {
      for (const li of c.children) if (shown(li)) { const t = clean(textOf(li)); if (t) out.push({ t: "p", text: "• " + t }); }
    } else if (c.matches("p, .note, .sd-callout")) {
      const t = clean(textOf(c));
      if (t) out.push({ t: "p", text: t, tone: c.matches(".sd-warn, .warn") ? "warn" : c.matches(".sd-danger, .bad") ? "bad" : "" });
    } else if (c.querySelector("p, table, .stats, .sd-field, .fl, .irow, details, ul, ol, h2, h3, h4, label.sd-check, section, .line")) walk(c, out);
    else {
      const t = clean(textOf(c));
      if (t) out.push({ t: "p", text: t, strong: c.matches(".line, header") });
    }
  }
}
/** The tool's sections, each { title, blocks }. */
export function readSections(root) {
  const out = [];
  const secs = [...root.querySelectorAll("section.card, section.panel")].filter((x) => shown(x) && !x.parentElement.closest("section.card, section.panel"));
  for (const sec of secs) {
    const blocks = [];
    walk(sec, blocks);
    let title = "";
    if (blocks[0]?.t === "sub") title = blocks.shift().text;
    if (!title) title = blocks.find((b) => b.t === "kv")?.k || "Settings";
    if (blocks.length) out.push({ title, blocks, el: sec });
  }
  return out;
}

// ── laying the panels out ────────────────────────────────────────────────────
// Panels flow down columns, each into the shortest one, so a wide image fills its width
// instead of running one narrow column down the middle. A panel with a table too wide for
// one column spans as many as it needs, and a panel taller than its share is split between
// blocks (a long table between rows, with its head repeated) and goes on "(continued)".
const TX = "text";
const GAP = 28, VGAP = 8; // between columns, between panels in a column

// Consecutive fields become one block, so their labels line up.
function runs(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.t === "kv" && out.at(-1)?.t === "kvs") out.at(-1).items.push(b);
    else out.push(b.t === "kv" ? { t: "kvs", items: [b] } : b);
  }
  return out;
}

// One block at (x0, y) in width W; returns the y below it.
function drawBlock(bl, ops, x0, y, W, P) {
  if (bl.t === "sub") {
    y += 22;
    ops.push({ t: "text", x: x0, y, text: fit(bl.text, W, 12.5, 700, TX), size: 12.5, weight: 700, color: P.ink2, font: TX });
    return y + 2;
  }
  if (bl.t === "p") {
    const color = bl.tone === "warn" ? P.warn : bl.tone === "bad" ? P.kind.extra.border : bl.strong ? P.ink : P.ink2;
    for (const line of wrap(bl.text, W, 12.5, bl.strong ? 600 : 400, 30, TX)) { y += 18; ops.push({ t: "text", x: x0, y, text: line, size: 12.5, weight: bl.strong ? 600 : 400, color, font: TX }); }
    return y + 4;
  }
  if (bl.t === "kvs") { // labels in one column, values beside them
    const kw = Math.min(W * 0.45, Math.max(...bl.items.map((r) => measure(r.k, 12, 400, TX))) + 16);
    for (const r of bl.items) {
      const vl = wrap(r.v, W - kw, 12.5, 400, 4);
      y += 18;
      ops.push({ t: "text", x: x0, y, text: fit(r.k, kw - 12, 12, 400, TX), size: 12, color: P.ink3, font: TX });
      vl.forEach((l, i) => { if (i) y += 17; ops.push({ t: "text", x: x0 + kw, y, text: l, size: 12.5, color: P.ink }); });
    }
    return y + 6;
  }
  if (bl.t === "stats") { // tiles that share each row's width evenly
    y += 10;
    const rowH = 52, natural = bl.items.map((it) => Math.max(measure(it.v, 17, 700), measure(it.k, 11.5, 400, TX)) + 28);
    let i = 0;
    while (i < bl.items.length) {
      let j = i, used = 0;
      while (j < bl.items.length && (j === i || used + 8 + natural[j] <= W)) { used += (j > i ? 8 : 0) + natural[j]; j++; }
      // the row's spare width shared out, so no tile is narrower than its text
      const n = j - i, spare = Math.max(0, (W - used) / n);
      let x = x0;
      for (let k = i; k < j; k++) {
        const it = bl.items[k], w = Math.min(W, natural[k] + spare);
        ops.push({ t: "rect", x, y, w, h: rowH, r: 7, fill: it.hi ? P.tint : P.card });
        ops.push({ t: "rect", x, y, w, h: rowH, r: 7, stroke: it.hi ? P.accent : P.rule, sw: 1 });
        ops.push({ t: "text", x: x + 14, y: y + 23, text: fit(it.v, w - 28, 17, 700), size: 17, weight: 700, color: it.hi ? P.accent : P.ink });
        ops.push({ t: "text", x: x + 14, y: y + 41, text: fit(it.k, w - 28, 11.5, 400, TX), size: 11.5, color: P.ink3, font: TX });
        x += w + 8;
      }
      y += rowH + 8;
      i = j;
    }
    return y - 2;
  }
  if (bl.t === "table") return drawTable(bl, ops, x0, y + 10, W, P) + 6;
  return y;
}

const cellFont = (tb, c) => (tb.num[c] ? "mono" : TX);
// A table's columns at their natural widths: the widest header or cell, plus padding.
const naturalCols = (tb) => tb.head.map((hd, c) => Math.max(measure(hd, 11.5, 700, TX), ...tb.rows.map((r) => measure(r.cells[c] ?? "", 12.5, 400, cellFont(tb, c)))) + 20);
// …narrowed to fit W: the widest columns give way first.
function tableCols(tb, W) {
  if (tb.cols) return tb.cols; // a piece of a split table keeps the whole table's columns
  const w = naturalCols(tb);
  let wsum = w.reduce((a, b) => a + b, 0);
  // A table nearly as wide as its panel fills it: the text columns take the slack.
  if (wsum < W && wsum >= 0.7 * W) {
    const text = w.map((_, c) => !tb.num[c]), tw = w.reduce((a, x, c) => a + (text[c] ? x : 0), 0) || wsum;
    return w.map((x, c) => (text[c] || tw === wsum ? x + ((W - wsum) * x) / tw : x));
  }
  while (wsum > W) {
    const big = w.indexOf(Math.max(...w));
    const cut = Math.min(wsum - W, w[big] - Math.max(70, w[big] * 0.6));
    if (cut <= 0.5) { const k = W / wsum; for (let c = 0; c < w.length; c++) w[c] *= k; break; }
    w[big] -= cut; wsum -= cut;
  }
  return w;
}
const rowCells = (tb, r, w) => r.cells.map((t, c) => (c < tb.head.length ? wrap(t, w[c] - 20, 12.5, 400, 4, cellFont(tb, c)) : []));
const rowHeight = (cells) => Math.max(1, ...cells.map((l) => l.length)) * 16 + 10;

function drawTable(tb, ops, x0, y0, W, P) {
  const w = tableCols(tb, W), xs = [];
  w.reduce((x, cw, c) => ((xs[c] = x), x + cw), x0);
  const tw = Math.min(W, w.reduce((a, b) => a + b, 0));
  let y = y0;
  ops.push({ t: "rect", x: x0, y, w: tw, h: 26, fill: P.sheet2 });
  tb.head.forEach((hd, c) => ops.push({ t: "text", x: tb.num[c] ? xs[c] + w[c] - 10 : xs[c] + 10, y: y + 17, text: fit(hd, w[c] - 20, 11.5, 700, TX), size: 11.5, weight: 700, color: P.ink3, anchor: tb.num[c] ? "end" : "start", font: TX }));
  y += 26;
  for (const r of tb.rows) {
    const cells = rowCells(tb, r, w), rh = rowHeight(cells);
    if (r.sel) ops.push({ t: "rect", x: x0, y, w: tw, h: rh, fill: P.tint });
    cells.forEach((ls, c) => ls.forEach((l, i) => ops.push({ t: "text", x: tb.num[c] ? xs[c] + w[c] - 10 : xs[c] + 10, y: y + 17 + i * 16, text: l, size: 12.5, color: c === 0 ? P.ink : P.ink2, anchor: tb.num[c] ? "end" : "start", font: cellFont(tb, c) })));
    y += rh;
    ops.push({ t: "path", d: `M${x0},${y + 0.5} H${x0 + tw}`, stroke: P.rowLine, sw: 1 });
  }
  return y;
}

// A panel: its title over a rule, then its blocks. Returns its height.
function drawPanel(pc, ops, x0, y0, W, P) {
  let y = y0 + 26;
  ops.push({ t: "text", x: x0, y, text: fit(pc.title + (pc.cont ? " (continued)" : ""), W, 15, 700, TX), size: 15, weight: 700, color: P.ink, font: TX });
  y += 8;
  ops.push({ t: "path", d: `M${x0},${y + 0.5} H${x0 + W}`, stroke: P.rule, sw: 1 });
  y += 6;
  for (const bl of pc.blocks) y = drawBlock(bl, ops, x0, y, W, P);
  return y - y0 + 10;
}
const panelHeight = (pc, W, P) => drawPanel(pc, [], 0, 0, W, P);
const blockHeight = (bl, W, P) => drawBlock(bl, [], 0, 0, W, P);
const EMPTY_PANEL = 50; // a panel's title, rule and bottom padding

// Cuts a panel so the first piece fits `room`: between blocks, or a table between rows.
// → [first or null, the rest (continued) or null].
function cutPanel(pc, W, P, room) {
  const first = { ...pc, blocks: [] }, rest = { title: pc.title, cont: true, blocks: [] };
  let h = EMPTY_PANEL, full = false;
  for (const bl of pc.blocks) {
    if (full) { rest.blocks.push(bl); continue; }
    const bh = blockHeight(bl, W, P);
    if (h + bh <= room) { first.blocks.push(bl); h += bh; continue; }
    full = true;
    if (bl.t === "table") {
      const cols = tableCols(bl, W);
      let th = 42, i = 0; // the gap above, the head, the gap below
      while (i < bl.rows.length && h + th + rowHeight(rowCells(bl, bl.rows[i], cols)) <= room) th += rowHeight(rowCells(bl, bl.rows[i++], cols));
      if (i >= 3 && bl.rows.length - i >= 3) { first.blocks.push({ ...bl, rows: bl.rows.slice(0, i), cols }); rest.blocks.push({ ...bl, rows: bl.rows.slice(i), cols }); continue; }
    }
    rest.blocks.push(bl);
  }
  return [first.blocks.length ? first : null, rest.blocks.length ? rest : null];
}

// Panels flowed down n columns of about `target` height, in reading order (down, then
// across), a panel that doesn't fit being cut to fill the column. null when they don't fit.
function flow(items, n, colW, P, target) {
  const place = [];
  let c = 0, y = 0;
  for (const it of items) {
    let pc = it.pc, h = it.h;
    for (;;) {
      if (c >= n) return null;
      if (y + h <= target) { place.push({ pc, x: c * (colW + GAP), y, w: colW, h }); y += h + VGAP; break; }
      if (target - y >= 140 && h > 320) { // a long panel fills the rest of this column; a short one moves on
        const [head, tail] = cutPanel(pc, colW, P, target - y);
        if (head) {
          const hh = panelHeight(head, colW, P);
          place.push({ pc: head, x: c * (colW + GAP), y, w: colW, h: hh });
          if (!tail) { y += hh + VGAP; break; }
          pc = tail; h = panelHeight(tail, colW, P);
        }
      }
      c++; y = 0;
    }
  }
  return place;
}

// How much of a panel's width its content uses: a table only its columns, anything else all of it.
const contentWidth = (pc, W) => Math.max(...pc.blocks.map((b) => (b.t === "table" ? Math.min(W, tableCols(b, W).reduce((a, c) => a + c, 0)) : b.t === "sub" ? W / 2 : W)));

/** Panels laid out in n columns across W: → { place: [{ pc, x, y, w }], height, columns, filled }.
 *  A panel whose table needs more than one column gets the full width, between flows. */
function layoutPanels(secs, W, P, n) {
  const colW = (W - GAP * (n - 1)) / n;
  const items = secs.map((sec) => {
    const pc = { title: sec.title, blocks: runs(sec.blocks), cont: false };
    const wide = n > 1 && Math.max(0, ...pc.blocks.filter((b) => b.t === "table").map((b) => naturalCols(b).reduce((a, c) => a + c, 0))) > colW;
    const w = wide ? W : colW;
    return { pc, wide, w, h: panelHeight(pc, w, P) };
  });
  const place = [];
  let top = 0, used = new Set(), area = 0;
  for (let i = 0; i < items.length;) {
    if (items[i].wide || n === 1) {
      const it = items[i++];
      place.push({ pc: it.pc, x: 0, y: top, w: it.w, h: it.h });
      used.add(0); area += contentWidth(it.pc, it.w) * it.h; top += it.h + VGAP;
      continue;
    }
    const band = [];
    while (i < items.length && !items[i].wide) band.push(items[i++]);
    const total = band.reduce((t, x) => t + x.h + VGAP, 0);
    let target = Math.max(total / n, 160), got = null;
    for (let k = 0; k < 60 && !(got = flow(band, n, colW, P, target)); k++) target *= 1.05;
    got = got || band.map((x) => ({ pc: x.pc, x: 0, y: 0, w: colW, h: x.h }));
    const bandH = Math.max(...got.map((p) => p.y + p.h));
    for (const p of got) { place.push({ ...p, y: top + p.y }); used.add(p.x); area += contentWidth(p.pc, p.w) * p.h; }
    top += bandH + VGAP;
  }
  const height = Math.max(0, top - VGAP), gridW = Math.max(...place.map((p) => p.x + p.w));
  return { place, height, columns: place.some((p) => p.w >= W - 1 && n > 1) ? n : used.size, filled: area / Math.max(1, gridW * height) };
}
// How wide a column should be for these panels: the widest table's natural width, within limits.
const columnWidth = (secs) => Math.min(860, Math.max(460, ...secs.flatMap((s) => s.blocks.filter((b) => b.t === "table").map((b) => naturalCols(b).reduce((a, c) => a + c, 0)))));

// ── the whole image ───────────────────────────────────────────────────────────

function buildSpec(o, ctx) {
  const P = palette(o.theme);
  const info = ctx.info;
  const chart = o.scope === "inner" ? ctx.inner : o.scope === "sheet" ? null : ctx.chart;
  const part = chart ? chartPart(chart, o.scope === "inner" ? "chart" : o.scope, o, P) : null;
  const secs = ctx.sections.filter((x) => o.sections.has(x.title));
  const pad = 28;
  const titleH = o.title ? 86 : 0, footH = 40;
  // The panels' columns. Under a diagram, as many as its width holds; on their own, the
  // number that makes the picture closest to a 4:3 landscape sheet.
  let W = Math.round(Math.max(part ? part.width : 0, 640)), L = null;
  if (secs.length) {
    const col = columnWidth(secs);
    if (part) {
      W = Math.max(W, Math.min(2 * col + GAP, 1200) + 2 * pad);
      const area = W - 2 * pad, n = Math.max(1, Math.min(secs.length + 2, Math.floor((area + GAP) / (col + GAP))));
      L = layoutPanels(secs, Math.min(area, n * 860 + (n - 1) * GAP), P, n);
    } else {
      // One column as wide as the widest table, or several narrower ones (a wide table spans
      // two); the best is near 4:3 and leaves the least empty space beside short panels.
      let best = null;
      for (let n = 1; n <= 4; n++) {
        const cw = n === 1 ? col : Math.max(420, Math.min(col, 520));
        const lay = layoutPanels(secs, n * cw + (n - 1) * GAP, P, n);
        if (n > 1 && lay.columns < n) break; // not enough to fill another column
        const w = n * cw + (n - 1) * GAP + 2 * pad, h = titleH + footH + lay.height + 32;
        const score = Math.abs(Math.log(w / h / 1.33)) + 1.5 * (1 - lay.filled);
        if (!best || score < best.score) best = { score, lay, w };
      }
      L = best.lay;
      W = Math.max(640, Math.round(best.w));
    }
  }
  const ops = [];
  let y = titleH;
  if (part) {
    part.draw(ops, (W - part.width) / 2, y);
    y += part.height;
  }
  if (L) {
    const top = y, gw = Math.max(...L.place.map((p) => p.x + p.w)), gx = (W - gw) / 2;
    const tmp = [];
    for (const p of L.place) drawPanel(p.pc, tmp, gx + p.x, top + 4 + p.y, p.w, P);
    ops.push({ t: "rect", x: 0, y: top, w: W, h: L.height + 24, fill: P.sheet }, ...tmp);
    if (part) ops.push({ t: "path", d: `M0,${top + 0.5} H${W}`, stroke: P.rule2, sw: 1 });
    y += L.height + 24;
  }
  const H = y + footH;

  // title block
  if (o.title) {
    ops.push({ t: "rect", x: 0, y: 0, w: W, h: titleH, fill: P.sheet });
    ops.push({ t: "path", d: `M0,${titleH - 0.5} H${W}`, stroke: P.rule2, sw: 1 });
    const a = "SATISFACTORY", sl = "/";
    ops.push({ t: "text", x: pad, y: 33, text: a, size: 19, weight: 700, color: P.ink, ls: 3 });
    const x1 = pad + measure(a, 19, 700) + a.length * 3 + 3;
    ops.push({ t: "text", x: x1, y: 33, text: sl, size: 19, color: P.accent });
    ops.push({ t: "text", x: x1 + measure(sl, 19) + 4, y: 33, text: "TOOLS", size: 19, weight: 700, color: P.ink, ls: 3 });
    const badgeW = Math.max(measure("made by areeb", 15, 700, "text"), measure(SITE, 12.5)) + 32;
    const room = W - 2 * pad - (W - badgeW - pad > 420 ? badgeW + 16 : 0);
    const what = [ctx.tool.title, info.what].filter(Boolean).join(" · ") + (o.scope === "trees" ? " · highlighted trees" : o.scope === "chain" && part ? ` · chain of ${chart.graph.nodes.find((n) => n.id === chart.state.pinned)?.title ?? "the pinned card"}` : o.scope === "window" ? " · visible area" : o.scope === "inner" ? ` · ${ctx.innerTitle}` : "");
    ops.push({ t: "text", x: pad, y: 56, text: fit(what, room, 13, 400, "text"), size: 13, color: P.ink2, font: "text" });
    if (W - badgeW - pad > 420) {
      const bx = W - pad - badgeW, by = 16;
      ops.push({ t: "rect", x: bx, y: by, w: badgeW, h: 54, r: 12, fill: P.accent, a: 0.12 });
      ops.push({ t: "rect", x: bx, y: by, w: badgeW, h: 54, r: 12, stroke: P.accent, sw: 1.2, a: 0.7 });
      ops.push({ t: "text", x: bx + 16, y: by + 23, text: "made by areeb", size: 15, weight: 700, color: P.ink, font: "text" });
      ops.push({ t: "text", x: bx + 16, y: by + 42, text: SITE, size: 12.5, color: P.accent });
    }
  }

  // footer: the legend (with the title block) and the credit, always
  const fy = H - footH, ly = fy + footH / 2 + 4;
  ops.push({ t: "rect", x: 0, y: fy, w: W, h: footH, fill: P.sheet });
  ops.push({ t: "path", d: `M0,${fy + 0.5} H${W}`, stroke: P.rule2, sw: 1 });
  const creditW = measure("made by areeb · ", 12.5, 700, "text") + measure(SITE, 12.5);
  ops.push({ t: "text", x: W - pad - measure(SITE, 12.5), y: ly, text: SITE, size: 12.5, color: P.accent });
  ops.push({ t: "text", x: W - pad - creditW, y: ly, text: "made by areeb · ", size: 12.5, weight: 700, color: P.ink2, font: "text" });
  if (o.title && part) {
    let lx = pad;
    const room = W - pad - creditW - 24;
    const item = (draw, text) => {
      const w = 30 + measure(text, 11.5, 400, "text");
      if (lx + w > room) return;
      draw(lx);
      ops.push({ t: "text", x: lx + 30, y: ly, text, size: 11.5, color: P.ink3, font: "text" });
      lx += w + 18;
    };
    const names = { machine: "machine", src: "source", out: "product", extra: "surplus", bal: "splitter / merger", split: "splitter", merge: "merger", ...(o.scope === "inner" ? { src: "input belt", out: "output" } : info.kinds) };
    for (const k of ["src", "machine", "bal", "split", "merge", "out", "extra"]) {
      if (!part.kinds.has(k)) continue;
      const K = P.kind[k];
      item((x) => { ops.push({ t: "rect", x: x + 3, y: ly - 10, w: 20, h: 12, r: 3, fill: K.bg }); ops.push({ t: "rect", x: x + 3, y: ly - 10, w: 20, h: 12, r: 3, stroke: K.border, sw: 1.2, dash: k === "extra" ? [3, 2] : null }); }, names[k]);
    }
    item((x) => ops.push({ t: "path", d: `M${x},${ly - 4} H${x + 24}`, stroke: P.edge, sw: 1.6 }), "belt");
    if (part.cls.has("fluid")) item((x) => ops.push({ t: "path", d: `M${x},${ly - 4} H${x + 24}`, stroke: P.edge, sw: 2.2, dash: [1, 3.5] }), "pipe");
    if (part.cls.has("loop") || part.back) item((x) => ops.push({ t: "path", d: `M${x},${ly - 4} H${x + 24}`, stroke: part.cls.has("loop") ? P.cc[3] : P.edge, sw: 1.6, dash: [5, 4] }), "loops back");
    for (const t of part.trees) item((x) => ops.push({ t: "rect", x: x + 8, y: ly - 9, w: 10, h: 10, r: 5, fill: P.h[t.color] }), `${t.title} · ${DIRS[t.dir]}`);
  }
  return { width: W, height: H, bg: part ? P.well : P.sheet, ops };
}

// ── the dialog ────────────────────────────────────────────────────────────────
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

let dlg = null;
const prefs = { scale: "3", theme: "current", format: "png", title: true, labels: true, highlights: true };

/** Opens the export dialog for a mounted tool. */
export function openExport(tool, view) {
  const chartEl = view.querySelector(".ws-stage .fc") ?? [...view.querySelectorAll(".fc")].find((x) => !x.closest(".fc-drawer, .fc-details"));
  const innerEl = chartEl?.querySelector(".fc-drawer .fc, .fc-details .fc");
  const chart = chartEl?.chart ?? null, inner = innerEl?.chart ?? null;
  const info = view.imageInfo?.() ?? {};
  // the tool's own panels for images (the planner's totals), then the page's, less any they replace
  const sections = [...(info.panels || []), ...readSections(view.querySelector(".ws-side") ?? view).filter((x) => !(info.skip || []).includes(x.title))];
  const st = chart?.state;
  const pinned = st?.pinned ? chart.graph.nodes.find((n) => n.id === st.pinned) : null;
  const ctx = { tool, info, chart, inner, innerTitle: pinned ? `${pinned.title}${pinned.tag ? " (" + pinned.tag + ")" : ""}, built` : "", sections };

  const scopes = chart ? [
    { id: "chart", label: "The whole diagram", hint: "Every card and belt on the chart." },
    { id: "trees", label: "Highlighted trees", hint: st.trees.length ? "Only the highlighted trees, laid out on their own." : "Shift+click a card first to highlight its tree.", ok: st.trees.length > 0 },
    { id: "chain", label: pinned ? `${pinned.title}: what feeds it and what it feeds` : "The pinned card's chain", hint: pinned ? "The pinned card with everything upstream and downstream of it, laid out on its own." : "Click a card first to pin it.", ok: !!pinned },
    ...(inner ? [{ id: "inner", label: `${pinned.title}: its build`, hint: "The splitters and mergers inside the pinned card, belt by belt." }] : []),
    { id: "window", label: "The part on screen", hint: "Exactly what the chart shows now, at its current layout." },
    { id: "sheet", label: "Just the panels, no diagram", hint: "The settings and results as a sheet." },
  ] : [];
  const want = inner ? "inner" : st?.trees.length ? "trees" : "chart";
  let scope = chart ? want : "sheet";
  const defaults = new Set(chart ? info.defaults ?? [] : info.sheet ?? sections.map((x) => x.title));
  const picked = new Set(sections.map((x) => x.title).filter((t) => defaults.has(t)));

  dlg?.remove();
  const status = h("span", { class: "sd-hint tiny status", role: "status" });
  const dims = h("p", { class: "sd-hint tiny dims" });
  const scopeHint = h("p", { class: "sd-hint tiny" });
  const check = (label, on, change, { disabled = false, hint } = {}) => {
    const input = h("input", { type: "checkbox", checked: on, disabled, on: { change: () => { change(input.checked); update(); } } });
    return h("label", { class: "sd-check" }, input, h("span", null, label, hint ? h("span", { class: "sd-hint tiny", text: " " + hint }) : null));
  };
  const radios = scopes.map((x) => {
    const input = h("input", { type: "radio", name: "img-scope", value: x.id, checked: x.id === scope, disabled: x.ok === false, on: { change: () => {
      scope = x.id;
      if (scope === "sheet" && !picked.size) for (const [t, box] of boxes) { picked.add(t); box.checked = true; } // panels alone: all of them, to start
      update();
    } } });
    return h("label", { class: "sd-check" }, input, x.label);
  });
  const sectionChecks = sections.map((x) => check(x.title, picked.has(x.title), (v) => (v ? picked.add(x.title) : picked.delete(x.title))));
  const boxes = new Map(sections.map((x, i) => [x.title, sectionChecks[i].querySelector("input")]));
  const chartOnly = h("div", { class: "stack tight" },
    check("Rates on the belts", prefs.labels, (v) => (prefs.labels = v)),
    check("Keep the tree highlights", prefs.highlights && !!st?.trees.length, (v) => (prefs.highlights = v), { disabled: !st?.trees.length }));
  const formatSeg = seg([{ value: "png", label: "PNG" }, { value: "svg", label: "SVG" }], prefs.format, (v) => { prefs.format = v; update(); }, { label: "Format" });
  const scaleSeg = seg(["2", "3", "4", "6"].map((v) => ({ value: v, label: v + "×" })), prefs.scale, (v) => { prefs.scale = v; update(); }, { label: "Resolution" });
  const themeSeg = seg([{ value: "current", label: "Current theme" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light / print" }], prefs.theme, (v) => { prefs.theme = v; update(); }, { label: "Sheet" });
  const fs = (legend, ...kids) => h("fieldset", { class: "sd-fieldset" }, h("legend", { text: legend }), ...kids);
  const go = btn("Save image", () => run(), { kind: "primary", ico: "download" });
  dlg = h("dialog", { class: "sd-dialog dialog export", "aria-labelledby": "img-title" },
    h("header", null, h("h2", { id: "img-title", text: "Save as an image" }), closeBtn("Close", () => dlg.close())),
    h("div", { class: "sd-body stack" },
      chart ? fs("What to draw", ...radios, scopeHint) : null,
      fs(chart ? "Also include" : "What to include",
        check("Title block and legend", prefs.title, (v) => (prefs.title = v), { hint: "(the credit line is always there)" }),
        chart ? chartOnly : null,
        sections.length ? h("p", { class: "sd-hint tiny", text: chart ? "Panels to add under the diagram:" : "Panels:" }) : null,
        ...sectionChecks),
      h("div", { class: "two" }, fs("Format", formatSeg), fs("Resolution", scaleSeg)),
      fs("Sheet", themeSeg),
      dims),
    h("footer", null, status, h("span", { class: "spacer" }), btn("Cancel", () => dlg.close(), { kind: "ghost" }), go));
  const me = dlg;
  document.body.append(me);
  me.addEventListener("close", () => setTimeout(() => me.remove(), 300));

  const options = () => ({ scope, sections: picked, title: prefs.title, labels: prefs.labels, highlights: prefs.highlights && !!st?.trees.length && scope !== "inner", theme: prefs.theme, format: prefs.format, scale: +prefs.scale });
  function update() {
    const o = options();
    scopeHint.textContent = scopes.find((x) => x.id === scope)?.hint ?? "";
    chartOnly.hidden = scope === "sheet";
    scaleSeg.querySelectorAll("button").forEach((b) => (b.disabled = o.format === "svg"));
    const empty = scope === "sheet" && !picked.size;
    go.disabled = empty;
    if (empty) { dims.textContent = "Pick at least one panel to draw."; return; }
    try {
      const spec = buildSpec(o, ctx);
      const f = fitScale(spec.width, spec.height, o.scale);
      dims.textContent = o.format === "svg"
        ? `Vector, ${Math.round(spec.width)} × ${Math.round(spec.height)} units: it scales without loss.`
        : `${Math.round(spec.width * f).toLocaleString()} × ${Math.round(spec.height * f).toLocaleString()} px${f < o.scale ? ` (reduced from ${o.scale}× to stay within what browsers can draw)` : ""}.`;
    } catch (e) { dims.textContent = ""; }
  }
  async function run() {
    const o = options();
    go.disabled = true;
    status.textContent = "Drawing…";
    try {
      const spec = buildSpec(o, ctx);
      const name = ["satisfactorytools", tool.id, scope === "sheet" ? "sheet" : scope === "chart" ? "" : scope, new Date().toISOString().slice(0, 10)].filter(Boolean).map(slug).join("-");
      if (o.format === "svg") {
        saveBlob(new Blob([toSVG(spec)], { type: "image/svg+xml;charset=utf-8" }), name + ".svg");
        toast(`Saved ${name}.svg (it names mononoki and Libre Franklin, so it looks its best where they're installed)`);
      } else {
        const r = await toPNG(spec, o.scale);
        saveBlob(r.blob, name + ".png");
        toast(`Saved ${name}.png · ${r.w.toLocaleString()} × ${r.h.toLocaleString()} px`);
      }
      dlg.close();
    } catch (e) {
      status.textContent = e?.message || String(e);
    } finally {
      go.disabled = false;
      if (status.textContent === "Drawing…") status.textContent = "";
    }
  }
  update();
  dlg.showModal();
  return dlg;
}

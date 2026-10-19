// The planner's factory diagram: raw materials on the left, one box per production
// line, products and surplus on the right, with belts drawn between them.
import { s } from "./ui.js";
import { itemName, fmt, unit, buildings, pct } from "./lib/game.js";

const W = 188, HT = 44, GX = 92, GY = 18, PAD = 20;

export function factoryGraph(res) {
  const nodes = new Map(); // key → node
  const node = (key, props) => nodes.get(key) ?? nodes.set(key, { key, ins: [], outs: [], ...props }).get(key);
  for (const r of res.raw) node("src:" + r.item, { kind: "src", title: itemName(r.item), sub: fmt(r.rate) + " " + unit(r.item) + (r.kind === "input" ? " · input" : ""), col: 0 });
  for (const L of res.lines) node(L.recipe.id, { kind: "line", title: L.recipe.name, sub: `${L.built} × ${buildings[L.recipe.b].name} @ ${pct(L.clock, 1)}`, col: L.depth + 1, alt: L.recipe.alt });
  const last = Math.max(1, ...[...nodes.values()].map((n) => n.col)) + 1;
  for (const t of res.targets) node("out:" + t.item, { kind: "out", title: itemName(t.item), sub: fmt(t.rate) + " " + unit(t.item), col: last });

  const keyOf = (end, item) => (end.kind === "line" ? end.line.recipe.id : end.kind === "target" ? "out:" + item : end.kind === "surplus" ? "extra:" + item : "src:" + item);
  const edges = new Map();
  for (const f of res.flows) {
    if (f.to.kind === "surplus") node("extra:" + f.item, { kind: "extra", title: itemName(f.item), sub: "surplus", col: last });
    const a = keyOf(f.from, f.item), b = keyOf(f.to, f.item);
    const k = a + "→" + b + "|" + f.item;
    const e = edges.get(k) ?? edges.set(k, { a: nodes.get(a), b: nodes.get(b), item: f.item, rate: 0 }).get(k);
    e.rate += f.rate;
  }
  for (const e of edges.values()) { e.a.outs.push(e); e.b.ins.push(e); }
  for (const n of nodes.values()) if (n.kind === "extra") n.sub = fmt(n.ins.reduce((t, e) => t + e.rate, 0)) + " " + unit(n.ins[0]?.item) + " surplus";

  // Columns, ordered by where their inputs come from (a few barycentre sweeps).
  const cols = [];
  for (const n of nodes.values()) (cols[n.col] ??= []).push(n);
  cols.forEach((c, i) => c && c.forEach((n, j) => (n.y = j)));
  for (let pass = 0; pass < 6; pass++) {
    for (const c of cols) {
      if (!c) continue;
      for (const n of c) {
        const nb = pass % 2 ? n.outs.map((e) => e.b) : n.ins.map((e) => e.a);
        n.bc = nb.length ? nb.reduce((t, m) => t + m.y, 0) / nb.length : n.y;
      }
      c.sort((p, q) => p.bc - q.bc).forEach((n, j) => (n.y = j));
    }
  }
  const rows = Math.max(...cols.filter(Boolean).map((c) => c.length));
  const width = PAD * 2 + (cols.length - 1) * (W + GX) + W;
  const height = PAD * 2 + rows * (HT + GY);
  for (const c of cols) {
    if (!c) continue;
    const off = ((rows - c.length) * (HT + GY)) / 2; // centre short columns
    c.forEach((n) => { n.x = PAD + n.col * (W + GX); n.py = PAD + off + n.y * (HT + GY); });
  }

  const max = Math.max(...[...edges.values()].map((e) => e.rate), 1);
  const gE = s("g"), gN = s("g"), gL = s("g");
  const labels = edges.size <= 45;
  for (const e of edges.values()) {
    const share = (list, e2) => (list.indexOf(e2) + 1) / (list.length + 1);
    const x1 = e.a.x + W, y1 = e.a.py + HT * share(e.a.outs, e);
    const x2 = e.b.x, y2 = e.b.py + HT * share(e.b.ins, e);
    const mx = (x1 + x2) / 2;
    const p = s("path", { class: "dg-edge", d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, "stroke-width": (1.2 + 7 * Math.sqrt(e.rate / max)).toFixed(2) },
      s("title", null, `${itemName(e.item)}: ${fmt(e.rate)} ${unit(e.item)}`));
    gE.append(p);
    if (labels) gL.append(s("text", { class: "dg-label bg", x: x2 - 6, y: y2 - 4, "text-anchor": "end" }, `${itemName(e.item)} ${fmt(e.rate, 1)}`));
  }
  for (const n of nodes.values()) {
    gN.append(s("g", { class: "dg-node " + n.kind },
      s("rect", { x: n.x, y: n.py, width: W, height: HT, rx: 7 }),
      s("text", { x: n.x + 10, y: n.py + 18, class: "big" }, clip(n.title, 24) + (n.alt ? " ◆" : "")),
      s("text", { x: n.x + 10, y: n.py + 34, class: "sub" }, clip(n.sub, 30)),
      s("title", null, `${n.title} — ${n.sub}`)));
  }
  return s("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Factory diagram" }, gE, gN, gL);
}

const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

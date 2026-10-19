// Draws a splitter plan (js/lib/belts.js) as a tree: input merger, splitters, and each
// output with the parts it collects. Used by the planner and the belt splitting tool.
import { h, s } from "./ui.js";
import { toWeights, splitPlan } from "./lib/belts.js";
import { fmt, carrier } from "./lib/game.js";

const X = 92, Y = 26, PAD = 18;

/**
 * @param {{label: string, rate: number}[]} outs
 * @param {string} [item]  for belt or pipe sizes
 */
export function splitView(outs, item) {
  const total = outs.reduce((a, o) => a + o.rate, 0);
  const w = toWeights(outs.map((o) => o.rate));
  const plan = w && splitPlan(w.weights);
  if (!plan) return h("p", { class: "tiny", text: "Nothing to split." });
  const D = plan.D;
  const lines = [
    h("p", null, h("b", { text: "Ratio " + w.weights.join(" : ") }),
      w.exact ? "" : h("span", { class: "tag warn", text: "closest small ratio, within " + fmt(w.error * 100, 1) + "%" }),
      " · ", plan.splitters + " splitter" + (plan.splitters === 1 ? "" : "s"), ", ", plan.mergers + " merger" + (plan.mergers === 1 ? "" : "s"),
      plan.loop ? ` · ${plan.loop} of ${plan.N} parts loop back to the input` : ""),
  ];
  if (plan.loop && total > 0) {
    const inner = (total * plan.N) / D;
    const c = item ? carrier(item, inner) : null;
    lines.push(h("p", { class: "tiny", text: `With the loop, the belt after the input merger carries ${fmt(inner)}/min${c ? ` (${c.count > 1 ? c.count + " × " : ""}${c.name})` : ""}.` }));
  }
  lines.push(h("div", { class: "diagram" }, tree(plan, outs, w.weights)));
  return h("div", { class: "stack" }, lines);
}

function tree(plan, outs, weights) {
  const leaves = [];
  let depthMax = 0;
  // Lay out leaves top to bottom; splitters sit at the middle of their children.
  function place(node, depth) {
    depthMax = Math.max(depthMax, depth);
    if (!node.children) { node.y = leaves.length; node.d = depth; leaves.push(node); return node.y; }
    const ys = node.children.map((c) => place(c, depth + 1));
    node.d = depth;
    node.y = (ys[0] + ys[ys.length - 1]) / 2;
    return node.y;
  }
  place(plan.tree, 0);
  const hasLoop = plan.loop > 0;
  const x0 = PAD + (hasLoop ? X : 0);
  const outX = x0 + (depthMax + 1) * X + 40;
  const H = Math.max(2, leaves.length) * Y + PAD * 2 + (hasLoop ? 26 : 0);
  const W = outX + 200;
  const ypx = (y) => PAD + y * Y + Y / 2;
  const g = s("g");
  const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Splitter layout" }, g);

  const edge = (x1, y1, x2, y2, cls) => g.append(s("path", { class: "dg-edge " + (cls || ""), d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`, "stroke-width": 2 }));
  const box = (x, y, w, label, cls, sub) => g.append(s("g", { class: "dg-node " + cls },
    s("rect", { x, y: y - 11, width: w, height: 22, rx: 5 }),
    s("text", { x: x + 7, y: y + 4, class: sub ? "" : "big" }, label)));

  // input (and the merger the loop feeds back into)
  const rootY = ypx(plan.tree.y);
  box(PAD - 4, rootY, 40, "in", "src");
  if (hasLoop) {
    edge(PAD + 36, rootY, x0 - 4, rootY);
    box(x0 - 30, rootY, 26, "M", "merge");
  }
  (function draw(node) {
    const x = x0 + node.d * X, y = ypx(node.y);
    if (!node.children) return;
    for (const c of node.children) {
      const cx = x0 + c.d * X, cy = ypx(c.y);
      edge(x + 26, y, c.children ? cx : outX - 30, cy, c.children ? "" : c.out === weights.length ? "loop" : "o" + (c.out % 8));
      draw(c);
    }
    box(x, y, 26, "÷" + node.ways, "split");
  })(plan.tree);
  if (!plan.tree.children) edge(PAD + 36, rootY, outX, rootY, "o" + (plan.tree.out % 8));

  // outputs: one box per output, gathering its parts (a merger when there are several)
  const pieces = new Map();
  for (const L of leaves) (pieces.get(L.out) ?? pieces.set(L.out, []).get(L.out)).push(L);
  for (const [o, ls] of pieces) {
    if (o === weights.length) continue;
    const ys = ls.map((l) => ypx(l.y));
    const y = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const ly of ys) edge(outX - 30, ly, outX, y, "o" + (o % 8));
    const label = `${outs[o].label} · ${weights[o]}/${plan.D}`;
    box(outX, y, Math.min(190, 16 + label.length * 6.6), label, "out", true);
  }
  // loop parts run back under the tree into the input merger
  const loops = pieces.get(weights.length) ?? [];
  const yb = H - PAD;
  for (const L of loops) {
    const ly = ypx(L.y);
    g.append(s("path", { class: "dg-edge loop", "stroke-width": 2, d: `M${outX - 30},${ly} C${outX},${ly} ${outX},${yb} ${outX - 40},${yb} L${x0 - 17 + 20},${yb} C${x0 - 17},${yb} ${x0 - 17},${rootY + 30} ${x0 - 17},${rootY + 11}` }));
  }
  if (loops.length) g.append(s("text", { class: "dg-label", x: x0 + 10, y: yb - 5 }, `loop back: ${plan.loop}/${plan.N}`));
  return svg;
}

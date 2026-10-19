// A splitter plan (js/lib/belts.js) as a flowchart: input, mergers, splitters and
// outputs, with every belt drawn as an arrow and labelled with what it carries.
// Exact for any ratio: each belt carries a whole number of 1/D shares of the input.
import { h, table } from "./ui.js";
import { toWeights, splitPlan, network } from "./lib/belts.js";
import { fmt, carrier } from "./lib/game.js";
import { flowchart } from "./flowchart.js";

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const frac = (p, q) => { if (!Number.isInteger(p)) return fmt(p / q, 4); const g = gcd(p, q) || 1; return q / g === 1 ? String(p / g) : `${p / g}/${q / g}`; };

/**
 * @param {{label: string, rate: number}[]} outs  shares (rates or ratio parts)
 * @param {string} [item]  for belt sizes
 * @param {{inputs?: {label: string, rate: number}[], total?: number, tol?: number}} [o]
 *   inputs: belts coming in (merged first); total: items/min (else from the inputs);
 *   tol: for rates the planner calculated (see PLAN_TOL)
 */
export function splitView(outs, item, o = {}) {
  let w;
  try { w = toWeights(outs.map((x) => x.rate), o.tol); } catch (e) { return h("p", { class: "note bad", text: "That ratio is too large to build: " + e.message + "." }); }
  const plan = splitPlan(w.weights);
  if (!plan) return h("p", { class: "tiny", text: "Nothing to split." });
  const inputs = o.inputs?.length ? o.inputs : [{ label: "In", rate: o.total || 1 }];
  const net = network(w.weights, plan, inputs.map((i) => i.rate));
  const total = o.total ?? (o.inputs?.length ? inputs.reduce((t, i) => t + i.rate, 0) : null);
  const D = plan.D;
  const amount = (parts) => (total ? fmt((total * parts) / D, 3) : frac(parts, D));
  const unitTxt = total ? "/min" : " of the input";

  const nodes = net.nodes.map((n) => {
    if (n.kind === "in") {
      const i = inputs[n.index];
      return { id: n.id, kind: "src", w: 150, h: 46, title: inputs.length > 1 ? i.label : "In", sub: total ? fmt(i.rate, 3) + "/min" : "the belt to split" };
    }
    if (n.kind === "out") return { id: n.id, kind: "out", w: 168, h: 46, last: true, title: outs[n.out].label || "Output " + (n.out + 1), tag: `${w.weights[n.out]}/${D}`, sub: amount(w.weights[n.out]) + unitTxt };
    if (n.kind === "split") return { id: n.id, kind: "split", w: 124, h: 44, title: "Splitter", tag: "÷" + n.ways, sub: n.ways === 2 ? "middle unused" : "3 ways" };
    return { id: n.id, kind: "merge", w: 124, h: 44, title: "Merger", tag: n.loop ? "loop" : "", sub: "into 1 belt" };
  });
  const edges = net.edges.map((e) => ({ from: e.from, to: e.to, label: amount(e.parts), cls: e.loop ? "loop" : "", title: `${frac(e.parts, D)} of the input${total ? " = " + fmt((total * e.parts) / D, 4) + "/min" : ""}${e.loop ? " (loops back)" : ""}` }));

  const inner = total ? (total * plan.N) / D : null;
  const facts = h("p", null,
    h("b", { text: outs.length <= 10 ? "Ratio " + w.weights.join(" : ") : `${outs.length} outputs, parts adding up to ${D}` }),
    ` · ${plan.splitters} splitter${plan.splitters === 1 ? "" : "s"}, ${plan.mergers} merger${plan.mergers === 1 ? "" : "s"}`,
    plan.loop ? ` · ${plan.loop} of ${plan.N} parts loop back to the input` : " · no loop needed",
    h("span", { class: "tag ok", text: "exact" }));
  const parts = [facts];
  if (plan.loop) {
    const c = item && inner ? carrier(item, inner) : null;
    parts.push(h("p", { class: "tiny", text: `The loop joins the input, so the belt after the first merger carries ${inner ? fmt(inner, 3) + "/min" : `${plan.N}/${D} of the input`}${c ? ` (${c.count > 1 ? c.count + " × " : ""}${c.name})` : ""}. Splitters are built with their outputs in the order shown; a ÷2 splitter leaves its middle output empty.` }));
  }
  if (nodes.length <= 600) parts.push(flowchart({ nodes, edges }, { labels: true }));
  else parts.push(h("p", { class: "note warn", text: `This build has ${nodes.length} splitters and mergers, too many to draw. The counts above and the shares below are exact.` }));
  if (outs.length > 1) {
    parts.push(table([
      { head: "Output", cell: (r) => r.label },
      { head: "Exact share", n: true, cell: (r) => `${r.w}/${D}` },
      { head: total ? "Per minute" : "Of the input", n: true, cell: (r) => (total ? fmt((total * r.w) / D, 4) : fmt((100 * r.w) / D, 4) + "%") },
      ...(item && total ? [{ head: "Needs", cell: (r) => { const c = carrier(item, (total * r.w) / D); return (c.count > 1 ? c.count + " × " : "") + c.name; } }] : []),
    ], outs.map((x, i) => ({ label: x.label || "Output " + (i + 1), w: w.weights[i] })).filter((r) => r.w > 0)));
  }
  return h("div", { class: "stack" }, parts);
}

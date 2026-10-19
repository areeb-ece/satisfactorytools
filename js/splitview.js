// A splitter/merger build (balance in js/lib/belts.js) as a flowchart: the inputs,
// mergers, splitters and outputs, with every belt drawn as an arrow and labelled with
// what it carries. Exact for any inputs and any ratio: each belt is an exact fraction
// of everything coming in.
import { h, table } from "./ui.js";
import { balance } from "./lib/belts.js";
import { fmt, carrier, isLiquid, BELTS, PIPES } from "./lib/game.js";
import { flowchart } from "./flowchart.js";

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const frac = (p, q) => { if (!Number.isInteger(p)) return fmt(p / q, 4); const g = gcd(p, q) || 1; return q / g === 1 ? String(p / g) : `${p / g}/${q / g}`; };

/**
 * @param {{label: string, rate: number}[]} outs  shares (rates, or any ratio of what comes in)
 * @param {string} [item]  for belt sizes
 * @param {{inputs?: {label: string, rate: number}[], total?: number, tol?: number}} [o]
 *   inputs: the belts coming in, any rates; total: one input of this rate instead;
 *   neither: shares only, shown as fractions of the input; tol: for rates the planner
 *   calculated (see PLAN_TOL)
 */
export function splitView(outs, item, o = {}) {
  const p = splitParts(outs, item, o);
  if (p.error) return p.error;
  return h("div", { class: "stack" }, p.summary, p.tooBig ? p.tooBig : flowchart(p.graph, { labels: true }), p.table);
}

/** The same build in pieces, for pages that place them apart: summary, chart graph, shares table. */
export function splitParts(outs, item, o = {}) {
  const inputs = o.inputs?.length ? o.inputs : [{ label: "In", rate: o.total || 0 }];
  const known = inputs.every((i) => i.rate > 0);
  const top = item ? (isLiquid(item) ? PIPES : BELTS).at(-1).rate : null;
  let r;
  try {
    r = balance(known ? inputs.map((i) => i.rate) : [1], outs.map((x) => x.rate), { rel: o.tol, capacity: known ? top : null });
  } catch (e) { return { error: h("p", { class: "note bad", text: "That's too fine to build: " + e.message + "." }) }; }
  const U = r.U;
  const total = known ? inputs.reduce((t, i) => t + i.rate, 0) : null;
  const perMin = (num, den) => (total * num) / (den * U);
  const amount = (num, den) => (total ? fmt(perMin(num, den), 3) : frac(num, den * U));
  const unitTxt = total ? "/min" : " of the input";
  const many = inputs.length > 1;

  const nodes = r.nodes.map((n) => {
    if (n.kind === "in") {
      const i = inputs[n.index];
      return { id: n.id, kind: "src", w: 150, h: 46, title: many ? i.label || "In " + (n.index + 1) : "In", tag: many ? frac(r.A[n.index], U) : "", sub: total ? fmt(i.rate, 3) + "/min" : "the belt to split" };
    }
    if (n.kind === "out") return { id: n.id, kind: "out", w: 168, h: 46, last: true, title: outs[n.index].label || "Output " + (n.index + 1), tag: frac(r.B[n.index], U), sub: amount(r.B[n.index], 1) + unitTxt };
    if (n.kind === "split") return { id: n.id, kind: "split", w: 124, h: 44, title: "Splitter", tag: "÷" + n.ways, sub: n.ways === 2 ? "middle unused" : "3 ways" };
    return { id: n.id, kind: "merge", w: 124, h: 44, title: "Merger", tag: n.loop ? "loop" : "", sub: "into 1 belt" };
  });
  const edges = r.edges.map((e) => ({ from: e.from, to: e.to, label: amount(e.num, e.den), cls: e.loop ? "loop" : "", title: `${frac(e.num, e.den * U)} of the input${total ? " = " + fmt(perMin(e.num, e.den), 4) + "/min" : ""}${e.loop ? " (loops back)" : ""}` }));

  // How it's built, and the busiest belt.
  const busiest = Math.max(...r.edges.map((e) => e.num / e.den));
  const c = item && total ? carrier(item, (total * busiest) / U) : null;
  const shareSum = outs.reduce((t, x) => t + x.rate, 0);
  const summary = [h("p", null,
    h("b", { text: outs.length <= 10 ? "Ratio " + r.B.map((b) => b / gcdAll(r.B)).join(" : ") : `${outs.length} outputs` }),
    ` · ${r.splitters} splitter${r.splitters === 1 ? "" : "s"}, ${r.mergers} merger${r.mergers === 1 ? "" : "s"}`,
    r.loops ? ` · ${r.loops} loop${r.loops === 1 ? "" : "s"} back ` : " · no loops ",
    h("span", { class: "tag ok", text: "exact" }))];
  if (many) summary.push(h("p", { class: "tiny", text: r.strategy === "merge"
    ? `The ${inputs.length} inputs merge into one belt first, then it's split.`
    : "Each input is split on its own and the pieces merge at the outputs, so no belt carries the whole total." }));
  if (total && Math.abs(shareSum - total) > 1e-9 * Math.max(1, total)) {
    summary.push(h("p", { class: "tiny", text: `The outputs add up to ${fmt(shareSum, 3)}, not the ${fmt(total, 3)}/min coming in, so they're used as a ratio of it.` }));
  }
  summary.push(h("p", { class: "tiny", text: `Busiest belt: ${total ? fmt((total * busiest) / U, 3) + "/min" : fmt((100 * busiest) / U, 2) + "% of the input"}${c ? ` (${c.count > 1 ? c.count + " × " : ""}${c.name})` : ""}.${r.loops ? " A loop joins its input again, so that belt carries more than comes in." : ""} Splitters are built with their outputs in the order shown; a ÷2 splitter leaves its middle output empty.` }));
  const tooBig = nodes.length > 600 ? h("p", { class: "note warn", text: `This build has ${nodes.length} splitters and mergers, too many to draw. The counts and the shares are exact.` }) : null;
  const shares = outs.length > 1 ? table([
    { head: "Output", cell: (x) => x.label },
    { head: "Exact share", n: true, cell: (x) => frac(x.b, U) },
    { head: total ? "Per minute" : "Of the input", n: true, cell: (x) => (total ? fmt((total * x.b) / U, 4) : fmt((100 * x.b) / U, 4) + "%") },
    ...(item && total ? [{ head: "Needs", cell: (x) => { const cc = carrier(item, (total * x.b) / U); return (cc.count > 1 ? cc.count + " × " : "") + cc.name; } }] : []),
  ], outs.map((x, i) => ({ label: x.label || "Output " + (i + 1), b: r.B[i] }))) : null;
  return { summary, graph: { nodes, edges }, table: shares, tooBig, build: r };
}

const gcdAll = (list) => list.reduce((a, b) => gcd(a, b), 0) || 1;

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

/** The same build in pieces, for pages that place them apart: summary, chart graph, shares table.
 *  o.capacity: the fastest belt to build with (per minute); by default the fastest there is. */
export function splitParts(outs, item, o = {}) {
  const inputs = o.inputs?.length ? o.inputs : [{ label: "In", rate: o.total || 0 }];
  const known = inputs.every((i) => i.rate > 0);
  const list = item && isLiquid(item) ? PIPES : BELTS;
  const limit = known && (item || o.capacity) ? (item && isLiquid(item) ? list.at(-1).rate : o.capacity || list.at(-1).rate) : null;
  const limitName = limit ? list.find((b) => b.rate === limit)?.name ?? fmt(limit) + "/min" : "";
  let r;
  try {
    r = balance(known ? inputs.map((i) => i.rate) : [1], outs.map((x) => x.rate), { rel: o.tol, capacity: limit });
  } catch (e) { return { error: h("p", { class: "sd-callout sd-danger note bad", role: "alert", text: "That's too fine to build: " + e.message + "." }) }; }
  const U = r.U;
  const total = known ? inputs.reduce((t, i) => t + i.rate, 0) : null;
  const perMin = (num, den) => (total * num) / (den * U);
  const amount = (num, den) => (total ? fmt(perMin(num, den), 3) : frac(num, den * U));
  const unitTxt = total ? "/min" : " of the input";
  const many = inputs.length > 1;
  const inName = (i) => (many ? inputs[i].label || "In " + (i + 1) : "The input");
  const outName = (j) => outs[j].label || "Output " + (j + 1);
  const into = new Map(r.edges.map((e) => [e.to, e]));
  const nth = (n) => (n.of > 1 ? ` ${n.part + 1}/${n.of}` : "");

  const nodes = r.nodes.map((n) => {
    if (n.kind === "in") {
      const i = inputs[n.index];
      return { id: n.id, kind: "src", w: 150, h: 46, first: true, title: (many ? i.label || "In " + (n.index + 1) : "In") + nth(n), tag: many || n.of > 1 ? frac(n.amount, U) : "", sub: total ? fmt(perMin(n.amount, 1), 3) + "/min" : "the belt to split" };
    }
    if (n.kind === "out") {
      const e = into.get(n.id);
      return { id: n.id, kind: "out", w: 168, h: 46, last: true, title: outName(n.index) + nth(n), tag: frac(e.num, e.den * U), sub: amount(e.num, e.den) + unitTxt };
    }
    if (n.kind === "split") return { id: n.id, kind: "split", w: 124, h: 44, title: "Splitter", tag: "÷" + n.ways, sub: n.ways === 2 ? "middle unused" : "3 ways" };
    return { id: n.id, kind: "merge", w: 124, h: 44, title: "Merger", tag: n.loop ? "loop" : "", sub: "into 1 belt" };
  });
  const edges = r.edges.map((e) => ({ from: e.from, to: e.to, label: amount(e.num, e.den), cls: e.loop ? "loop" : "", title: `${frac(e.num, e.den * U)} of the input${total ? " = " + fmt(perMin(e.num, e.den), 4) + "/min" : ""}${e.loop ? " (loops back)" : ""}` }));

  // How it's built: which inputs merge, which go straight through, and the belts.
  const busiest = Math.max(...r.edges.map((e) => e.num / e.den));
  const shareSum = outs.reduce((t, x) => t + x.rate, 0);
  const summary = [h("p", null,
    h("b", { text: outs.length <= 10 ? "Ratio " + r.B.map((b) => b / gcdAll(r.B)).join(" : ") : `${outs.length} outputs` }),
    ` · ${r.splitters} splitter${r.splitters === 1 ? "" : "s"}, ${r.mergers} merger${r.mergers === 1 ? "" : "s"}`,
    r.loops ? ` · ${r.loops} loop${r.loops === 1 ? "" : "s"} back ` : " · no loops ",
    h("span", { class: "sd-tag sd-ok tag ok", text: "exact" }))];
  const how = [];
  // An input on one belt by its name; one on several belts, belt by belt ("North 2/2").
  const names = (g) => [...new Set(g.map((b) => { const x = r.inBelts[b]; return inName(x.index) + (x.of > 1 ? ` ${x.part + 1}/${x.of}` : ""); }))];
  const join = (l) => (l.length > 1 ? l.slice(0, -1).join(", ") + " and " + l.at(-1) : l[0]);
  if (r.strategy === "split") how.push("One belt, split exactly.");
  else if (r.strategy === "merge") how.push(`The ${inputs.length} inputs merge into one belt, then it's split.`);
  else {
    for (const g of r.groups.filter((x) => x.split && x.inputs.length > 1)) how.push(`${join(names(g.inputs))} merge into one belt, then it's split.`);
    const alone = r.groups.filter((x) => x.split && x.inputs.length === 1).flatMap((x) => names(x.inputs));
    if (alone.length) how.push(`${join([...new Set(alone)])} ${alone.length > 1 ? "are each" : "is"} split on ${alone.length > 1 ? "their" : "its"} own.`);
    const direct = r.groups.filter((x) => !x.split), dn = [...new Set(direct.flatMap((x) => names(x.inputs)))];
    if (dn.length) how.push(`${join(dn)} ${dn.length > 1 ? "go" : "goes"} straight to ${join([...new Set(direct.map((x) => outName(x.outputs[0])))])}, with no splitter.`);
    if (r.mergers) how.push("What reaches each output merges there.");
  }
  if (r.tried > 1) how.push(`Of the ${r.tried} ways to build it that were compared, this one has the fewest splitters and mergers.`);
  summary.push(h("p", { class: "sd-hint tiny", text: how.join(" ") }));
  // Inputs and outputs too big for one belt.
  if (limit && total) {
    const notes = [];
    inputs.forEach((x, i) => {
      const bs = r.inBelts.filter((b) => b.index === i);
      if (bs.length > 1) notes.push(`${inName(i)} (${fmt(x.rate, 3)}/min) is more than one ${limitName} carries, so it's taken as ${bs.length} belts of ${fmt(perMin(bs[0].amount, 1), 3)}/min.`);
    });
    outs.forEach((x, j) => {
      const bs = r.outBelts.filter((b) => b.index === j);
      if (bs.length > 1) notes.push(`${outName(j)} gets ${bs.length} belts (${bs.map((b) => fmt(perMin(b.num, b.den), 3)).join(" + ")}/min): more than one ${limitName} carries.`);
    });
    if (notes.length) summary.push(h("p", { class: "sd-callout sd-warn note warn", text: notes.join(" ") }));
  }
  if (total && Math.abs(shareSum - total) > 1e-9 * Math.max(1, total)) {
    summary.push(h("p", { class: "sd-hint tiny", text: `The outputs add up to ${fmt(shareSum, 3)}, not the ${fmt(total, 3)}/min coming in, so they're used as a ratio of it.` }));
  }
  summary.push(h("p", { class: "sd-hint tiny", text: `Busiest belt: ${total ? fmt((total * busiest) / U, 3) + "/min" : fmt((100 * busiest) / U, 2) + "% of the input"}${limit ? ` (the fastest allowed is ${limitName}, ${fmt(limit)}/min)` : ""}.${r.loops ? " A loop joins its belt again, so that belt carries more than comes in." : ""} Splitters are built with their outputs in the order shown; a ÷2 splitter leaves its middle output empty.` }));
  const tooBig = nodes.length > 600 ? h("p", { class: "sd-callout sd-warn note warn", text: `This build has ${nodes.length} splitters and mergers, too many to draw. The counts and the shares are exact.` }) : null;
  const shares = outs.length > 1 ? table([
    { head: "Output", cell: (x) => x.label },
    { head: "Exact share", n: true, cell: (x) => frac(x.b, U) },
    { head: total ? "Per minute" : "Of the input", n: true, cell: (x) => (total ? fmt((total * x.b) / U, 4) : fmt((100 * x.b) / U, 4) + "%") },
    ...(limit && total ? [{ head: "Belts", cell: (x) => { const bs = r.outBelts.filter((b) => b.index === x.j); return bs.length > 1 ? `${bs.length} × ${limitName}` : carrier(item || "IronIngot", (total * x.b) / U, limit).name; } }] : []),
  ], outs.map((x, i) => ({ label: x.label || "Output " + (i + 1), b: r.B[i], j: i }))) : null;
  return { summary, graph: { nodes, edges }, table: shares, tooBig, build: r };
}

const gcdAll = (list) => list.reduce((a, b) => gcd(a, b), 0) || 1;

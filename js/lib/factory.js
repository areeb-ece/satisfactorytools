// The planner's result as a machine-level graph: one node per machine (or per line),
// per raw source, per product and per surplus, and wherever an item's belts split or
// merge, one splitter/merger node that carries the exact plan for that split.
import { isLiquid } from "./game.js";
import { balance } from "./belts.js";

/**
 * @param {object} res  a plan() result
 * @param {{perMachine?: boolean}} [o]  false: one node per production line
 * @returns {{ nodes: object[], edges: {from, to, item, rate}[] }}
 *   node kinds: src, machine, bal (splitter/merger), out (product), extra (surplus)
 */
export function factoryGraph(res, { perMachine = true } = {}) {
  const nodes = [], edges = [];
  const add = (n) => { nodes.push(n); return n.id; };
  for (const r of res.raw) add({ id: "src:" + r.item, kind: "src", item: r.item, rate: r.rate, input: r.kind === "input" });
  const units = new Map();
  res.lines.forEach((L, li) => {
    const n = perMachine ? L.built : 1;
    units.set(L, Array.from({ length: n }, (_, k) => add({ id: `m:${L.recipe.id}:${k}`, kind: "machine", line: L, li, index: k, of: n, count: perMachine ? 1 : L.built })));
  });
  for (const t of res.targets) add({ id: "out:" + t.item, kind: "out", item: t.item, rate: t.rate, last: true });

  for (const e of res.balance.values()) {
    const ins = [], outs = [];
    for (const p of e.producers) {
      if (p.kind === "line") { const ids = units.get(p.line); for (const id of ids) ins.push({ id, rate: p.rate / ids.length }); }
      else ins.push({ id: "src:" + e.item, rate: p.rate });
    }
    for (const c of e.consumers) {
      if (c.kind === "line") { const ids = units.get(c.line); for (const id of ids) outs.push({ id, rate: c.rate / ids.length, line: c.line }); }
      else if (c.kind === "target") outs.push({ id: "out:" + e.item, rate: c.rate, target: true });
      else outs.push({ id: add({ id: "extra:" + e.item, kind: "extra", item: e.item, rate: c.rate, last: true }), rate: c.rate, surplus: true });
    }
    if (!ins.length || !outs.length) continue;
    if (ins.length === 1 && outs.length === 1) { edges.push({ from: ins[0].id, to: outs[0].id, item: e.item, rate: outs[0].rate }); continue; }
    const id = add({ id: "bal:" + e.item, kind: "bal", item: e.item, ins, outs, total: outs.reduce((t, o) => t + o.rate, 0), liquid: isLiquid(e.item) });
    for (const p of ins) edges.push({ from: p.id, to: id, item: e.item, rate: p.rate });
    for (const c of outs) edges.push({ from: id, to: c.id, item: e.item, rate: c.rate });
  }
  return { nodes, edges };
}

// Planner rates are floats from the solver; a ratio exact to 1 part in 10^7 of each
// rate is exact for every figure the planner shows.
export const PLAN_TOL = 1e-7;

/**
 * The exact splitter/merger build for a splitter node: every machine feeding it in,
 * every consumer out, each getting exactly its rate (see balance in belts.js).
 */
export function balancerPlan(bal) {
  return balance(bal.ins.map((i) => i.rate), bal.outs.map((o) => o.rate), { rel: PLAN_TOL, capacity: 1200 });
}

/** "6×64 : 16×31": a splitter's weights, grouped by runs of equal outputs. */
export function ratioLabel(weights) {
  const runs = [];
  for (const w of weights) {
    const last = runs[runs.length - 1];
    if (last && last[0] === w) last[1]++;
    else runs.push([w, 1]);
  }
  if (runs.length === 1) return runs[0][1] > 1 ? `equal ×${runs[0][1]}` : "1";
  return runs.map(([w, n]) => (n > 1 ? `${n}×${w}` : String(w))).join(" : ");
}

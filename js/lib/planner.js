// The production planner. Several final products share one factory: every
// intermediate is made on one line sized for all of its consumers, and each line's
// output is then rationed between them. That's a linear programme:
//
//   variables   x_r  machines (at 100%) running recipe r
//               s_i  items/min of i drawn from outside (ore, water, your own inputs)
//   each item   Σ_r rate_r(i)·x_r + s_i ≥ target_i      (surplus is allowed: byproducts)
//   objective   fewest raw resources, fewest machines or least power
import { D, items, recipes as ALL, recipeById, perMinute, basePower, machinePower, itemName } from "./game.js";
import { minimize } from "./lp.js";

const TINY = 1e-6;
// Raw resources count 1 per item/min. Water is nearly free (extractors go anywhere), and
// hand-gathered things (slugs, remains, wood, waste) are a last resort.
const WEIGHT = { Water: 0.05 };
const GATHERED = 1000;

export const OBJECTIVES = {
  resources: "Fewest raw resources",
  machines: "Fewest machines",
  power: "Least power",
};

/**
 * @param {object} o
 * @param {{item: string, rate: number}[]} o.targets  final products, items/min
 * @param {{item: string, rate?: number|null}[]} [o.inputs]  things you already have
 *   coming in (rate empty = as much as needed); used before anything is made
 * @param {Set<string>} o.recipes  enabled recipe ids
 * @param {keyof OBJECTIVES} [o.objective]
 * @param {number} [o.maxClock]  machines are rounded up to run at or below this (1 = 100%)
 */
export function plan({ targets, inputs = [], recipes, objective = "resources", maxClock = 1 }) {
  targets = targets.filter((t) => items[t.item] && t.rate > 0);
  if (!targets.length) return { status: "empty" };

  const supply = new Map(); // item → { cap, weight, kind }
  for (const id of D.resources) supply.set(id, { cap: null, weight: WEIGHT[id] ?? 1, kind: "raw" });
  for (const id of D.gathered) supply.set(id, { cap: null, weight: GATHERED, kind: "raw" });
  for (const inp of inputs) {
    if (!items[inp.item]) continue;
    const cap = inp.rate > 0 ? inp.rate : null;
    supply.set(inp.item, { cap, weight: 0, kind: "input" });
  }

  // Walk back from the targets to every enabled recipe that could be involved.
  const makers = new Map();
  for (const id of recipes) {
    const r = recipeById[id];
    if (r) for (const [o] of r.out) (makers.get(o) ?? makers.set(o, []).get(o)).push(r);
  }
  const used = [], seen = new Set(), queue = targets.map((t) => t.item), missing = [];
  const visited = new Set();
  while (queue.length) {
    const it = queue.pop();
    if (visited.has(it)) continue;
    visited.add(it);
    const ms = makers.get(it) ?? [];
    if (!ms.length && !supply.has(it)) missing.push(it);
    for (const r of ms) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      used.push(r);
      for (const [i] of r.in) queue.push(i);
    }
  }
  // Anything on the way that can't be made from raw materials with these recipes?
  // (Standard recipes alone loop: Turbofuel only comes from alternates.)
  const can = makeable(recipes, supply);
  const stuck = targets.map((t) => t.item).filter((it) => !can.has(it));
  if (missing.length || stuck.length) {
    const what = [...new Set([...stuck, ...missing])];
    const fix = unlocks(stuck, recipes, supply);
    return {
      status: "missing", missing: what, suggest: fix,
      message: `Nothing you've turned on makes ${what.map(itemName).join(", ")} from raw materials.` +
        (fix.length ? ` Turning on ${fix.map((r) => r.name).join(" or ")} would, or add it as an input.` : " Add it as an input."),
    };
  }

  // Columns: recipes, then one supply column per item that can come from outside.
  const rows = new Map(); // item → row coefficients
  const row = (it) => rows.get(it) ?? rows.set(it, {}).get(it);
  const rates = used.map(perMinute);
  used.forEach((r, j) => {
    for (const [it, n] of rates[j].in) row(it)[j] = (row(it)[j] ?? 0) - n;
    for (const [it, n] of rates[j].out) row(it)[j] = (row(it)[j] ?? 0) + n;
  });
  for (const t of targets) row(t.item);
  const sup = [...rows.keys()].filter((it) => supply.has(it));
  const n = used.length + sup.length;
  sup.forEach((it, k) => (row(it)[used.length + k] = 1));

  const want = new Map();
  for (const t of targets) want.set(t.item, (want.get(t.item) ?? 0) + t.rate);
  const lp = [...rows].map(([it, a]) => ({ a, op: ">=", rhs: want.get(it) ?? 0 }));
  sup.forEach((it, k) => {
    const cap = supply.get(it).cap;
    if (cap != null) lp.push({ a: { [used.length + k]: 1 }, op: "<=", rhs: cap });
  });

  const cost = new Float64Array(n);
  used.forEach((r, j) => {
    cost[j] = objective === "machines" ? 1 : objective === "power" ? basePower(r) : 1e-4;
  });
  sup.forEach((it, k) => {
    const w = supply.get(it).weight;
    cost[used.length + k] = objective === "resources" ? w : w * 1e-3;
  });

  const sol = minimize(n, cost, lp);
  if (sol.status !== "optimal") {
    return { status: "infeasible", message: "These targets can't be met with the inputs and recipes you've allowed. Raise an input limit or turn on more recipes." };
  }
  return describe(sol.x, used, rates, sup, supply, want, maxClock);
}

// Turns the LP's answer into lines, item balances and belt-level flows.
function describe(x, used, rates, sup, supply, want, maxClock) {
  const lines = [];
  used.forEach((r, j) => {
    if (x[j] < TINY) return;
    const exact = x[j];
    const built = Math.max(1, Math.ceil(exact / maxClock - TINY));
    const clock = exact / built;
    const base = basePower(r);
    lines.push({
      recipe: r, exact, built, clock,
      power: built * machinePower(base, clock),
      in: rates[j].in.map(([it, k]) => [it, k * exact]),
      out: rates[j].out.map(([it, k]) => [it, k * exact]),
    });
  });

  const bal = new Map();
  const b = (it) => bal.get(it) ?? bal.set(it, { item: it, producers: [], consumers: [], made: 0, used: 0 }).get(it);
  for (const L of lines) {
    for (const [it, k] of L.out) { b(it).producers.push({ kind: "line", line: L, rate: k }); b(it).made += k; }
    for (const [it, k] of L.in) { b(it).consumers.push({ kind: "line", line: L, rate: k }); b(it).used += k; }
  }
  const raw = [];
  sup.forEach((it, k) => {
    const v = x[used.length + k];
    if (v < TINY) return;
    const kind = supply.get(it).kind;
    raw.push({ item: it, rate: v, kind });
    b(it).producers.unshift({ kind, rate: v });
    b(it).made += v;
  });
  for (const [it, rate] of want) { b(it).consumers.push({ kind: "target", rate }); b(it).used += rate; }
  for (const e of bal.values()) {
    const extra = e.made - e.used;
    if (extra > 1e-4) e.consumers.push({ kind: "surplus", rate: extra });
  }

  // Order lines from raw materials towards the products, so the list reads like the
  // factory is built: smelting first, final assembly last.
  const depth = new Map(lines.map((L) => [L, 0]));
  for (let pass = 0; pass < lines.length; pass++) {
    let moved = false;
    for (const L of lines) {
      let d = 0;
      for (const [it] of L.in) for (const p of bal.get(it)?.producers ?? []) if (p.line && p.line !== L) d = Math.max(d, depth.get(p.line) + 1);
      if (d > depth.get(L) && d <= lines.length) { depth.set(L, d); moved = true; }
    }
    if (!moved) break;
  }
  for (const L of lines) L.depth = depth.get(L);
  lines.sort((a, b) => a.depth - b.depth || a.recipe.name.localeCompare(b.recipe.name));

  // Belt-level flows: each producer of an item feeds each consumer in proportion.
  const flows = [];
  for (const e of bal.values()) {
    const total = e.consumers.reduce((s, c) => s + c.rate, 0);
    if (total < TINY) continue;
    for (const p of e.producers) for (const c of e.consumers) {
      const rate = (p.rate * c.rate) / total;
      if (rate > 1e-4) flows.push({ item: e.item, from: p, to: c, rate });
    }
  }

  const machines = {};
  for (const L of lines) machines[L.recipe.b] = (machines[L.recipe.b] ?? 0) + L.built;
  raw.sort((a, b) => (a.kind === b.kind ? b.rate - a.rate : a.kind === "input" ? -1 : 1));
  return {
    status: "ok",
    lines,
    balance: bal,
    raw,
    flows,
    machines,
    power: lines.reduce((s, L) => s + L.power, 0),
    targets: [...want].map(([item, rate]) => ({ item, rate })),
  };
}

// Items reachable from the supply with these recipes (a forward fixed point).
function makeable(enabled, supply) {
  const can = new Set(supply.keys());
  const rs = [...enabled].map((id) => recipeById[id]).filter(Boolean);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rs) {
      if (r.out.every(([o]) => can.has(o)) || !r.in.every(([i]) => can.has(i))) continue;
      for (const [o] of r.out) can.add(o);
      grew = true;
    }
  }
  return can;
}

// Single recipes (usually alternates) that, turned on, would let every stuck item be made.
function unlocks(stuck, enabled, supply) {
  if (!stuck.length) return [];
  const out = [];
  for (const r of ALL) {
    if (enabled.has(r.id)) continue;
    const can = makeable(new Set([...enabled, r.id]), supply);
    if (stuck.every((it) => can.has(it))) out.push(r);
    if (out.length >= 3) break;
  }
  return out;
}

/** One line's (or one input's) output of `item`, shared out between its consumers. */
export function distribution(result, item) {
  const e = result.balance.get(item);
  if (!e) return [];
  const total = e.consumers.reduce((s, c) => s + c.rate, 0);
  return e.consumers.map((c) => ({ ...c, share: c.rate / total }));
}

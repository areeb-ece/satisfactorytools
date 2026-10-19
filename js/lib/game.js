// Lookups over js/data.js and the game's formulas that more than one tool needs.
import D from "../data.js";

export { D };
export const items = D.items;
export const recipes = D.recipes;
export const buildings = D.buildings;
export const recipeById = Object.fromEntries(D.recipes.map((r) => [r.id, r]));

// Clock speed → power. 1.0: doubling a machine's speed costs 2.5× the power, so the
// exponent is log2(2.5). Generators scale linearly instead.
export const POWER_EXP = Math.log2(2.5);
export const MAX_CLOCK = 2.5; // 250% with three Power Shards
export const PURITY = { impure: 0.5, normal: 1, pure: 2 };

// Belts and lifts in items/min, pipes in m³/min (1.0).
export const BELTS = [
  { name: "Belt Mk.1", rate: 60 }, { name: "Belt Mk.2", rate: 120 }, { name: "Belt Mk.3", rate: 270 },
  { name: "Belt Mk.4", rate: 480 }, { name: "Belt Mk.5", rate: 780 }, { name: "Belt Mk.6", rate: 1200 },
];
export const PIPES = [{ name: "Pipe Mk.1", rate: 300 }, { name: "Pipe Mk.2", rate: 600 }];

const TINY = 1e-6;

export const isLiquid = (id) => !!items[id]?.liquid;
export const itemName = (id) => items[id]?.name ?? id;
export const unit = (id) => (isLiquid(id) ? "m³/min" : "/min");

/** Cheapest belt (or pipe, for fluids) that carries `rate`, with how many are needed. */
export function carrier(id, rate) {
  const list = isLiquid(id) ? PIPES : BELTS;
  const one = list.find((b) => b.rate >= rate - TINY);
  if (one) return { ...one, count: 1 };
  const top = list[list.length - 1];
  return { ...top, count: Math.ceil(rate / top.rate - TINY) };
}

/** Items/min of each ingredient (negative) and product (positive) for one machine at 100%. */
export function perMinute(r) {
  const k = 60 / r.time;
  return { in: r.in.map(([id, n]) => [id, n * k]), out: r.out.map(([id, n]) => [id, n * k]) };
}

/** Average draw of one machine at 100% (variable-power recipes average their range). */
export function basePower(r) {
  return r.pw ? (r.pw[0] + r.pw[1]) / 2 : buildings[r.b].power;
}

/** Power of one machine at `clock` (1 = 100%) with `sloops` Somersloops in it. */
export function machinePower(base, clock, sloops = 0, slots = 0) {
  const amp = slots ? 1 + sloops / slots : 1;
  return base * Math.pow(clock, POWER_EXP) * amp * amp;
}

/** Power Shards one machine needs to run at `clock`: one per 50% above 100%. */
export function shardsFor(clock) {
  return clock <= 1 + TINY ? 0 : Math.ceil((clock - 1) / 0.5 - TINY);
}

export const recipesMaking = (id) => recipes.filter((r) => r.out.some(([o]) => o === id));
export const recipesUsing = (id) => recipes.filter((r) => r.in.some(([i]) => i === id));

// Converter recipes that turn one raw resource into another. Off by default in the
// planner: otherwise "fewest resources" would happily turn bauxite into nitrogen.
export const isConversion = (r) => r.b === "Converter" && r.out.some(([o]) => D.resources.includes(o));

/** Recipes on in a fresh plan: every standard recipe except resource conversion. */
export function defaultRecipes() {
  return new Set(recipes.filter((r) => !r.alt && !isConversion(r)).map((r) => r.id));
}

/** A tidy number: whole numbers stay whole, others get up to `dp` decimals. */
export function fmt(n, dp = 2) {
  if (!isFinite(n)) return "∞";
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return (Object.is(r, -0) ? 0 : r).toLocaleString("en-US", { maximumFractionDigits: dp });
}
export const pct = (clock, dp = 2) => fmt(clock * 100, dp) + "%";
export function mw(n) {
  return Math.abs(n) >= 1000 ? fmt(n / 1000, 2) + " GW" : fmt(n, 1) + " MW";
}

// Miners, extractors and resource wells.
import { D, PURITY, POWER_EXP, MAX_CLOCK, carrier, shardsFor } from "./game.js";

export const EXTRACTORS = D.extractors;

/** One extractor: rate per minute and power at `clock`. */
export function extractor(kind, purity = "normal", clock = 1) {
  const e = EXTRACTORS[kind];
  const mult = e.purity ? PURITY[purity] : 1;
  return { rate: e.rate * mult * clock, power: e.power * Math.pow(clock, POWER_EXP), shards: shardsFor(clock) };
}

/** `count` extractors of a kind on one resource: totals and what carries the output. */
export function extraction(kind, resource, purity, clock, count = 1) {
  const one = extractor(kind, purity, clock);
  const rate = one.rate * count;
  return { ...one, count, total: rate, totalPower: one.power * count, carrier: carrier(resource, one.rate) };
}

/** The highest clock that still fits on `capacity`/min (a belt or pipe), up to 250%. */
export function clockForCap(kind, purity, capacity) {
  const e = EXTRACTORS[kind];
  const at100 = e.rate * (e.purity ? PURITY[purity] : 1);
  return Math.min(MAX_CLOCK, capacity / at100);
}

/** How many extractors (all at one clock) make `target`/min, and at what clock. */
export function forTarget(kind, purity, target, maxClock = 1) {
  const at100 = EXTRACTORS[kind].rate * (EXTRACTORS[kind].purity ? PURITY[purity] : 1);
  const n = Math.max(1, Math.ceil(target / (at100 * maxClock) - 1e-9));
  return { n, clock: target / (at100 * n) };
}

/**
 * A resource well: one Pressurizer and its satellite nodes. The Pressurizer's clock
 * sets every extractor's speed, and only the Pressurizer draws power.
 */
export function well(nodes, clock = 1) {
  const base = EXTRACTORS.FrackingExtractor.rate;
  let rate = 0, count = 0;
  for (const p of ["impure", "normal", "pure"]) {
    rate += (nodes[p] || 0) * base * PURITY[p] * clock;
    count += nodes[p] || 0;
  }
  return { rate, count, power: D.pressurizer.power * Math.pow(clock, POWER_EXP), shards: shardsFor(clock) };
}

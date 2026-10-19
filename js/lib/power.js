// Power plants. Generators scale linearly with clock: 250% makes 2.5× the power and
// burns 2.5× the fuel (and water).
import { D, items, shardsFor } from "./game.js";

export const GENERATORS = D.generators;
const EXTRACTOR = D.extractors.WaterPump.rate;

/** One generator burning `fuel` at `clock`: MW, fuel and water per minute, waste. */
export function burn(gen, fuel, clock = 1) {
  const g = GENERATORS[gen];
  const mw = g.power * clock;
  const fuelRate = (mw / items[fuel].energy) * 60;
  const waste = D.waste[fuel];
  return {
    mw, fuel: fuelRate, water: g.water * clock,
    waste: waste ? { item: waste[0], rate: fuelRate * waste[1] } : null,
    shards: shardsFor(clock),
  };
}

/** Generators of each kind and fuel needed for `target` MW, all at one clock. */
export function forTarget(target, clock = 1) {
  const out = [];
  for (const [gen, g] of Object.entries(GENERATORS)) {
    for (const fuel of g.fuel) {
      if (!items[fuel]?.energy) continue;
      const exact = target / (g.power * clock);
      const n = Math.max(1, Math.ceil(exact - 1e-9));
      const each = burn(gen, fuel, target / (g.power * n)); // spread the load evenly
      out.push({
        gen, fuel, n, exact, clock: each.mw / g.power,
        fuelRate: each.fuel * n,
        water: each.water * n,
        extractors: Math.ceil((each.water * n) / EXTRACTOR - 1e-9),
        waste: each.waste ? { item: each.waste.item, rate: each.waste.rate * n } : null,
      });
    }
  }
  return out;
}

/** Power from a fuel supply: how many generators it keeps running at `clock`. */
export function fromSupply(gen, fuel, supply, clock = 1) {
  const one = burn(gen, fuel, clock);
  const n = supply / one.fuel;
  return { n, whole: Math.floor(n + 1e-9), mw: n * one.mw, water: n * one.water, waste: one.waste ? { item: one.waste.item, rate: one.waste.rate * n } : null, extractors: Math.ceil((n * one.water) / EXTRACTOR - 1e-9) };
}

/** Geothermal: average MW for a set of geysers (output swings 0.5×–1.5× over a minute). */
export function geothermal(geysers) {
  let mw = 0;
  for (const p of ["impure", "normal", "pure"]) mw += (geysers[p] || 0) * D.geothermal[p];
  return { mw, low: mw * 0.5, high: mw * 1.5 };
}

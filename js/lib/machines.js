// Overclocking and Somersloops for one recipe.
import { buildings, perMinute, basePower, machinePower, shardsFor, MAX_CLOCK } from "./game.js";

/** Items/min of `item` from one machine at 100% with `sloops` Somersloops. */
export function baseRate(recipe, item, sloops = 0) {
  const slots = buildings[recipe.b].sloops;
  const out = perMinute(recipe).out.find(([o]) => o === item);
  return out ? out[1] * (slots ? 1 + sloops / slots : 1) : 0;
}

/** One machine at `clock`: what it makes, eats and draws. */
export function machineAt(recipe, clock, sloops = 0) {
  const b = buildings[recipe.b];
  const amp = b.sloops ? 1 + sloops / b.sloops : 1;
  const pm = perMinute(recipe);
  return {
    clock, sloops, amp,
    shards: shardsFor(clock),
    power: machinePower(basePower(recipe), clock, sloops, b.sloops),
    in: pm.in.map(([id, n]) => [id, n * clock]), // Somersloops don't add to the inputs
    out: pm.out.map(([id, n]) => [id, n * clock * amp]),
  };
}

/**
 * Ways to make `target` items/min of `item`: n identical machines at whatever clock
 * gets there, from the fewest (overclocked) up to a couple past the fewest that need no
 * Power Shards. More machines at lower clocks always draw less power in total.
 */
export function layouts(recipe, item, target, { sloops = 0, maxClock = MAX_CLOCK } = {}) {
  const per = baseRate(recipe, item, sloops);
  if (!(per > 0) || !(target > 0)) return [];
  const fewest = Math.max(1, Math.ceil(target / (per * maxClock) - 1e-9));
  const stock = Math.max(fewest, Math.ceil(target / per - 1e-9));
  const counts = new Set();
  for (let n = fewest; n < fewest + 6 && n <= stock + 2; n++) counts.add(n);
  for (let n = stock; n <= stock + 2; n++) counts.add(n);
  const out = [];
  for (const n of [...counts].sort((a, b) => a - b)) {
    const clock = target / (per * n);
    if (clock < 0.01) break; // machines can't go below 1%
    const m = machineAt(recipe, clock, sloops);
    out.push({ n, clock, shards: m.shards * n, sloops: sloops * n, power: m.power * n, perMachine: m });
  }
  return out;
}

/**
 * The other common layout: as many machines at 100% as fit, plus one underclocked.
 * Power grows faster than speed, so this draws a little more than spreading the load
 * evenly, but only one machine needs its clock set.
 */
export function fillLast(recipe, item, target, sloops = 0) {
  const per = baseRate(recipe, item, sloops);
  if (!(per > 0) || !(target > 0)) return null;
  const full = Math.floor(target / per + 1e-9);
  const rest = target - full * per;
  const lastClock = rest / per;
  const b = buildings[recipe.b];
  const one = (c) => machinePower(basePower(recipe), c, sloops, b.sloops);
  return { full, lastClock: lastClock > 1e-9 ? lastClock : 0, power: full * one(1) + (lastClock > 1e-9 ? one(lastClock) : 0) };
}

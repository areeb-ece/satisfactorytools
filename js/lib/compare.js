// Alternate recipe comparer: plan the same output once per recipe that makes an item,
// with that recipe as the only one allowed for it, and compare what each costs.
import { recipesMaking } from "./game.js";
import { plan } from "./planner.js";

/**
 * @param {string} item
 * @param {Set<string>} base  recipes allowed for everything else in the chain
 * @param {number} rate  items/min to plan for (per-unit figures divide by this)
 */
export function compare(item, base, rate = 60) {
  const rows = [];
  for (const r of recipesMaking(item)) {
    if (r.name.startsWith("Unpackage")) continue; // packaging loops aren't a way to make it
    const set = new Set(base);
    for (const other of recipesMaking(item)) set.delete(other.id);
    set.add(r.id);
    const res = plan({ targets: [{ item, rate }], recipes: set });
    if (res.status !== "ok") { rows.push({ recipe: r, ok: false, message: res.message }); continue; }
    const raw = res.raw.filter((x) => x.kind === "raw");
    rows.push({
      recipe: r, ok: true,
      raw: Object.fromEntries(raw.map((x) => [x.item, x.rate / rate])),
      rawTotal: raw.filter((x) => x.item !== "Water").reduce((s, x) => s + x.rate, 0) / rate,
      water: (raw.find((x) => x.item === "Water")?.rate ?? 0) / rate,
      machines: res.lines.reduce((s, L) => s + L.exact, 0),
      power: res.power,
      byproducts: [...res.balance.values()].flatMap((e) => e.consumers.filter((c) => c.kind === "surplus").map((c) => ({ item: e.item, rate: c.rate }))),
      result: res,
    });
  }
  return rows;
}

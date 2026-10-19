// The AWESOME Sink's coupon curve (1.0): the first three coupons cost 500 points each,
// then the n-th costs 250·(⌈n/3⌉ − 1)² + 1000, rising every three coupons. The curve
// stops growing at coupon 3,000 (249,501,250 points each from then on).
import { items } from "./game.js";

export function couponCost(n) {
  if (n <= 3) return 500;
  const g = Math.min(Math.ceil(n / 3), 1000) - 1;
  return 250 * g * g + 1000;
}

/** Points/min for a list of { item, rate }. Fluids can't be sunk (package them first). */
export function pointsPerMinute(list) {
  let total = 0;
  const rows = list.map(({ item, rate }) => {
    const pts = items[item]?.liquid ? 0 : (items[item]?.sink ?? 0) * rate;
    total += pts;
    return { item, rate, points: pts };
  });
  return { rows, total };
}

/**
 * Coupons earned over time. `printed` coupons already printed (or earned), `progress`
 * points towards the next one. Returns the next few coupons with their minutes from now.
 */
export function schedule(perMinute, printed = 0, progress = 0, count = 6) {
  const out = [];
  let t = 0, have = progress;
  for (let k = 1; k <= count; k++) {
    const cost = couponCost(printed + k);
    const need = Math.max(0, cost - have);
    t += perMinute > 0 ? need / perMinute : Infinity;
    have = Math.max(0, have - cost);
    out.push({ n: printed + k, cost, minutes: t });
  }
  return out;
}

/** Coupons per hour at a steady rate, starting from `printed` coupons. */
export function couponsPerHour(perMinute, printed = 0) {
  let pts = perMinute * 60, n = printed, c = 0;
  while (c < 100000 && pts >= couponCost(n + 1)) { pts -= couponCost(++n); c++; }
  return c + pts / couponCost(n + 1);
}

/** Sinkable items, best points first. */
export function ranking() {
  return Object.entries(items)
    .filter(([, it]) => it.sink && !it.liquid)
    .map(([id, it]) => ({ item: id, points: it.sink }))
    .sort((a, b) => b.points - a.points);
}

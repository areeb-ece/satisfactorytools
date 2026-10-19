// Splitting one belt into exact ratios with splitters (1 → 2 or 3) and mergers (3 → 1).
//
// A tree of splitters divides a belt into N equal parts when N = 2^a · 3^b. For a
// ratio whose parts add up to D, pick such an N ≥ D, give each output its share of the
// N parts, and loop the N − D spare parts back into a merger at the input. Whole
// subtrees go to one output wherever they fit, which keeps the build small.

/** Rates → small whole-number weights in the same ratio, e.g. 180, 120, 75 → 12, 8, 5. */
export function toWeights(rates, maxSum = 120) {
  const total = rates.reduce((s, r) => s + r, 0);
  if (!(total > 0)) return { weights: rates.map(() => 0), exact: true, error: 0 };
  const live = rates.filter((r) => r > 0).length;
  for (let D = live; D <= maxSum; D++) {
    const w = rates.map((r) => (r / total) * D);
    if (w.every((x, i) => Math.abs(x - Math.round(x)) < 1e-6 && (rates[i] <= 0 || Math.round(x) >= 1))) {
      return { weights: w.map(Math.round), exact: true, error: 0 };
    }
  }
  // No small exact ratio: the closest one with parts adding up to at most 36.
  let best = null;
  for (let D = live; D <= 36; D++) {
    const raw = rates.map((r) => (r / total) * D);
    const w = raw.map((x, i) => (rates[i] > 0 ? Math.max(1, Math.floor(x)) : 0));
    let left = D - w.reduce((s, x) => s + x, 0);
    const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) if (left > 0 && rates[i] > 0) { w[i]++; left--; }
    if (left < 0) continue;
    const error = Math.max(...rates.map((r, i) => (r > 0 ? Math.abs(w[i] / D - r / total) / (r / total) : 0)));
    if (!best || error < best.error - 1e-9) best = { weights: w, exact: false, error };
  }
  return best;
}

const SMOOTH = [];
for (let a = 1; a <= 2048; a *= 2) for (let b = a; b <= 2048; b *= 3) SMOOTH.push(b);
SMOOTH.sort((x, y) => x - y);

// Distinct orderings of the splitter levels (e.g. 3·2·2, 2·3·2, 2·2·3).
function orders(twos, threes) {
  const out = [];
  (function go(t, h, acc) {
    if (!t && !h) return void out.push(acc);
    if (t) go(t - 1, h, [...acc, 2]);
    if (h) go(t, h - 1, [...acc, 3]);
  })(twos, threes, []);
  return out.slice(0, 400);
}

function assign(radices, weights, loop) {
  const rem = [...weights, loop];
  let splitters = 0;
  const pieces = rem.map(() => 0);
  function build(level, cap) {
    let o = -1;
    for (let i = 0; i < rem.length; i++) if (rem[i] >= cap && (o < 0 || rem[i] > rem[o])) o = i;
    if (o >= 0) {
      rem[o] -= cap;
      pieces[o]++;
      return { out: o, parts: cap };
    }
    splitters++;
    const k = radices[level], sub = cap / k;
    return { ways: k, children: Array.from({ length: k }, () => build(level + 1, sub)) };
  }
  const N = radices.reduce((p, k) => p * k, 1);
  const tree = build(0, N);
  // Merging k belts into one takes ⌈(k − 1)/2⌉ mergers; the loop also merges into the input.
  let mergers = 0;
  pieces.forEach((k, i) => {
    if (i === weights.length) mergers += k ? Math.ceil(k / 2) : 0;
    else mergers += Math.ceil(Math.max(0, k - 1) / 2);
  });
  return { tree, splitters, mergers, pieces };
}

/**
 * The cheapest splitter tree found for whole-number weights.
 * Returns { N, D, radices, tree, splitters, mergers, loop } where tree nodes are
 * { ways, children } (a splitter) or { out, parts } (to output `out`; out === weights.length
 * is the loop back to the input).
 */
export function splitPlan(weights) {
  const D = weights.reduce((s, w) => s + w, 0);
  if (D <= 0) return null;
  if (weights.filter((w) => w > 0).length === 1) return { N: D, D, radices: [], tree: { out: weights.findIndex((w) => w > 0), parts: D }, splitters: 0, mergers: 0, loop: 0 };
  let best = null;
  for (const N of SMOOTH) {
    if (N < D) continue;
    if (N > Math.max(3 * D, 9)) break;
    let twos = 0, threes = 0;
    for (let x = N; x % 2 === 0; x /= 2) twos++;
    for (let x = N / 2 ** twos; x % 3 === 0; x /= 3) threes++;
    for (const radices of orders(twos, threes)) {
      const a = assign(radices, weights, N - D);
      // Looped-back parts load the input belt (it carries N/D of the flow), so they count too.
      const cost = a.splitters + a.mergers + (4 * (N - D)) / D;
      if (!best || cost < best.cost || (cost === best.cost && N < best.N)) best = { ...a, cost, N, D, radices, loop: N - D };
    }
  }
  return best;
}

/** How a belt feeding `machines` identical machines is usually built. */
export function manifoldNote(machines) {
  return machines <= 1 ? "" : `A manifold (one belt with a splitter at each of the ${machines} machines) fills up and then gives each its share; it just takes a while to saturate.`;
}

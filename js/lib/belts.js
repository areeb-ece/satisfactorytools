// Splitting one belt into exact ratios with splitters (1 → 2 or 3) and mergers (3 → 1).
//
// A tree of splitters divides a belt into N equal parts when N = 2^a · 3^b. For a
// ratio whose parts add up to D, pick such an N ≥ D, give each output its share of the
// N parts, and loop the N − D spare parts back into a merger at the input. The input
// belt then carries N/D of the flow, every part is exactly 1/D of what comes in, and
// each output gets exactly its weight in parts: no rounding, whatever the ratio.
// Whole subtrees go to one output wherever they fit, which keeps the build small.

// ── exact ratios ──────────────────────────────────────────────────────────────
const big = (n) => BigInt(n);
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };

/** A number as an exact fraction [p, q] (BigInt), e.g. 14.53125 → [465n, 32n], 0.1 → [1n, 10n]. */
export function rational(x, rel = 1e-9) {
  if (typeof x === "string") return decimal(x);
  if (!isFinite(x) || x < 0) throw new Error("not a non-negative number: " + x);
  if (Number.isInteger(x)) return [big(x), 1n];
  // Continued fractions: the simplest fraction within `rel` (float noise by default) of x.
  const tol = rel * Math.max(1, x), maxDen = 1e12;
  let [p0, q0, p1, q1] = [0, 1, 1, 0], v = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(v);
    [p0, q0, p1, q1] = [p1, q1, a * p1 + p0, a * q1 + q0];
    if (q1 > maxDen || Math.abs(p1 / q1 - x) <= tol) break;
    v = 1 / (v - a);
    if (!isFinite(v)) break;
  }
  return [big(p1), big(q1)];
}
// "12.75" → [1275n, 100n], exactly as typed.
function decimal(s) {
  const m = /^\s*(\d*)(?:\.(\d*))?\s*$/.exec(s);
  if (!m || (!m[1] && !m[2])) throw new Error("not a number: " + s);
  const frac = m[2] || "";
  return [big((m[1] || "0") + frac), 10n ** big(frac.length)];
}

/**
 * Rates or ratio parts → the smallest whole-number weights in exactly the same ratio,
 * e.g. 180, 120, 75 → 12, 8, 5 and 1234, 63, 17 → 1234, 63, 17. Typed numbers are
 * taken exactly. `rel` is for rates that came out of a calculation (the planner's):
 * how close to the float each fraction must be, which keeps float noise from turning
 * 14.53125 into a fraction with a twelve-digit denominator.
 */
export function toWeights(values, rel = 1e-9) {
  const fr = values.map((v) => (v ? rational(v, rel) : [0n, 1n]));
  let L = 1n;
  for (const [, q] of fr) L = (L / gcd(L, q)) * q;
  let w = fr.map(([p, q]) => (p * L) / q);
  const g = w.reduce((a, b) => gcd(a, b), 0n) || 1n;
  w = w.map((x) => x / g);
  const D = w.reduce((a, b) => a + b, 0n);
  if (D > 2n ** 50n) throw new Error("the parts add up to more than 2^50");
  return { weights: w.map(Number), D: Number(D), exact: true, error: 0 };
}

// ── the splitter tree ─────────────────────────────────────────────────────────
// 3-smooth numbers (2^a · 3^b) from D up to 3D: every one is a tree of 2- and 3-way splits.
function smooth(D) {
  const out = [];
  for (let a = 1; a <= 3 * D; a *= 2) for (let b = a; b <= 3 * D; b *= 3) if (b >= D) out.push(b);
  return out.sort((x, y) => x - y).slice(0, 8);
}

// Orderings of the splitter levels to try (3·2·2, 2·3·2, …): all of them when there
// are few, otherwise the two extremes plus a fixed spread of interleavings.
function orders(twos, threes, outputs) {
  const total = twos + threes;
  let count = 1;
  for (let i = 0; i < threes; i++) count = (count * (total - i)) / (i + 1);
  const tries = outputs > 40 || total > 16 ? 16 : 120; // big builds: fewer, still varied
  if (count <= Math.min(160, tries)) {
    const out = [];
    (function go(t, h, acc) {
      if (!t && !h) return void out.push(acc);
      if (t) go(t - 1, h, [...acc, 2]);
      if (h) go(t, h - 1, [...acc, 3]);
    })(twos, threes, []);
    return out;
  }
  const out = [[...Array(threes).fill(3), ...Array(twos).fill(2)], [...Array(twos).fill(2), ...Array(threes).fill(3)]];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < tries; k++) {
    const r = [...Array(twos).fill(2), ...Array(threes).fill(3)];
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    out.push(r);
  }
  return out;
}

function assign(radices, weights, loop) {
  const rem = [...weights, loop];
  let splitters = 0;
  const pieces = rem.map(() => 0);
  // A whole subtree of `cap` parts goes to the output with the most parts still to
  // place, if that's at least `cap`; a max-heap finds it quickly for hundreds of outputs.
  const heap = rem.map((_, i) => i).filter((i) => rem[i] > 0);
  const above = (a, b) => rem[heap[a]] > rem[heap[b]] || (rem[heap[a]] === rem[heap[b]] && heap[a] < heap[b]);
  const swap = (a, b) => { [heap[a], heap[b]] = [heap[b], heap[a]]; };
  const down = (i) => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && above(l, m)) m = l;
      if (r < heap.length && above(r, m)) m = r;
      if (m === i) return;
      swap(i, m); i = m;
    }
  };
  for (let i = (heap.length >> 1) - 1; i >= 0; i--) down(i);
  function build(level, cap) {
    if (heap.length && rem[heap[0]] >= cap) {
      const o = heap[0];
      rem[o] -= cap;
      pieces[o]++;
      if (rem[o] === 0) { heap[0] = heap[heap.length - 1]; heap.pop(); }
      down(0);
      return { out: o, parts: cap };
    }
    splitters++;
    const k = radices[level], sub = cap / k;
    return { ways: k, parts: cap, children: Array.from({ length: k }, () => build(level + 1, sub)) };
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
 * { ways, parts, children } (a splitter) or { out, parts } (to output `out`;
 * out === weights.length is the loop back to the input). `parts` counts 1/N shares
 * of the belt after the input merger, i.e. 1/D shares of what comes in.
 */
export function splitPlan(weights) {
  const D = weights.reduce((s, w) => s + w, 0);
  if (D <= 0) return null;
  if (weights.filter((w) => w > 0).length === 1) return { N: D, D, radices: [], tree: { out: weights.findIndex((w) => w > 0), parts: D }, splitters: 0, mergers: 0, loop: 0 };
  let best = null;
  for (const N of smooth(D).slice(0, weights.length > 40 || D > 1e6 ? 4 : 8)) {
    let twos = 0, threes = 0;
    for (let x = N; x % 2 === 0; x /= 2) twos++;
    for (let x = N / 2 ** twos; x % 3 === 0; x /= 3) threes++;
    for (const radices of orders(twos, threes, weights.length)) {
      const a = assign(radices, weights, N - D);
      // Looped-back parts load the input belt (it carries N/D of the flow), so they count too.
      const cost = a.splitters + a.mergers + (4 * (N - D)) / D;
      if (!best || cost < best.cost || (cost === best.cost && N < best.N)) best = { ...a, cost, N, D, radices, loop: N - D };
    }
  }
  return best;
}

/**
 * The plan as an explicit network of belts: every splitter, every merger and which
 * belt goes where. Belt amounts are exact: `parts` of 1/D of the input.
 * @param {number[]} weights
 * @param {object} plan  from splitPlan(weights)
 * @param {number[]} [inputs]  what each incoming belt carries (any units); they're merged first
 * @returns {{ nodes: {id, kind, ways?, out?}[], edges: {from, to, parts, loop?}[] }}
 */
export function network(weights, plan, inputs = [1]) {
  const nodes = [], edges = [];
  let n = 0;
  const add = (kind, extra = {}) => { const id = kind + n++; nodes.push({ id, kind, ...extra }); return id; };
  const link = (from, to, parts, extra = {}) => edges.push({ from, to, parts, ...extra });
  // Merge a list of [node, parts] belts into one, three at a time (or down to `keep`).
  const mergeAll = (list, keep = 1) => {
    const belts = list.slice();
    while (belts.length > keep) {
      const take = belts.splice(0, 3);
      const m = add("merge");
      for (const [id, p, ex] of take) link(id, m, p, ex);
      belts.push([m, take.reduce((t, b) => t + b[1], 0)]);
    }
    return belts;
  };

  const sum = inputs.reduce((t, x) => t + x, 0) || 1;
  const ins = inputs.map((x, i) => [add("in", { index: i }), (plan.D * x) / sum]);
  const outs = weights.map((w, i) => (w > 0 ? add("out", { out: i, parts: w }) : null));
  // Several inputs merge into one belt before the splitters.
  const [[head]] = mergeAll(ins);
  const headParts = plan.D;

  const leaves = new Map(); // output index → [node, parts] belts that end there
  let root = null;
  (function walk(t, parent) {
    if (!t.children) { (leaves.get(t.out) ?? leaves.set(t.out, []).get(t.out)).push([parent, t.parts]); return; }
    const id = add("split", { ways: t.ways });
    if (parent) link(parent, id, t.parts); else root = id;
    for (const c of t.children) walk(c, id);
  })(plan.tree, null);

  const loopBelts = leaves.get(weights.length) ?? [];
  if (!root) { // a single output: the input goes straight there
    link(head, outs[plan.tree.out], headParts);
    return { nodes, edges };
  }
  if (loopBelts.length) {
    // The loop joins the input belt: merge the loop belts (two per merger, the input
    // takes the third slot of the last one).
    const loops = mergeAll(loopBelts.map(([id, p]) => [id, p, { loop: true }]), 2);
    const m = add("merge", { loop: true });
    link(head, m, headParts);
    for (const [id, p, ex] of loops) link(id, m, p, ex ?? { loop: true });
    link(m, root, plan.N);
  } else link(head, root, plan.N);
  for (const [o, belts] of leaves) {
    if (o === weights.length) continue;
    const [[id, p]] = belts.length > 1 ? mergeAll(belts) : [belts[0]];
    link(id, outs[o], p);
  }
  return { nodes, edges };
}

/** How a belt feeding `machines` identical machines is usually built. */
export function manifoldNote(machines) {
  return machines <= 1 ? "" : `A manifold (one belt with a splitter at each of the ${machines} machines) fills up and then gives each its share; it just takes a while to saturate.`;
}

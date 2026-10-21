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
 * The splitter tree with the fewest splitters and mergers found for whole-number weights
 * (on a tie, the smaller loop). `maxN` caps N, which caps how much the loop adds to the
 * input belt (it carries N/D of the flow); with no N that small, it returns null.
 * `quick` tries a few trees instead of many, to compare builds while searching.
 * Returns { N, D, radices, tree, splitters, mergers, pieces, loop } where tree nodes are
 * { ways, parts, children } (a splitter) or { out, parts } (to output `out`;
 * out === weights.length is the loop back to the input). `parts` counts 1/N shares
 * of the belt after the input merger, i.e. 1/D shares of what comes in.
 */
export function splitPlan(weights, maxN = Infinity, quick = false) {
  const D = weights.reduce((s, w) => s + w, 0);
  if (D <= 0) return null;
  if (weights.filter((w) => w > 0).length === 1) return { N: D, D, radices: [], tree: { out: weights.findIndex((w) => w > 0), parts: D }, splitters: 0, mergers: 0, loop: 0 };
  let best = null;
  for (const N of smooth(D).filter((n) => n <= maxN).slice(0, quick ? 3 : weights.length > 40 || D > 1e6 ? 4 : 8)) {
    let twos = 0, threes = 0;
    for (let x = N; x % 2 === 0; x /= 2) twos++;
    for (let x = N / 2 ** twos; x % 3 === 0; x /= 3) threes++;
    for (const radices of orders(twos, threes, weights.length).slice(0, quick ? 6 : Infinity)) {
      const a = assign(radices, weights, N - D);
      const cost = a.splitters + a.mergers;
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

// ── several inputs ────────────────────────────────────────────────────────────
// A balancer: belts of any rates in, outputs in any ratio out, every output exact, and
// no belt carrying more than the fastest belt there is to build with.
//
// Every build has the same shape. The inputs are put into groups; each group's belts
// merge into one, which is split exactly (as above) into what the group sends to each
// output; and each output merges whatever reaches it. One group of every input is
// "merge everything, then split"; each input in a group of its own is "split each input
// on its own"; in between, some inputs merge and others don't. Which inputs group
// together, and which group feeds which output, is searched: every way of grouping up
// to six inputs (rules of thumb for more), each shared out several ways (inputs and
// outputs that match exactly, or add up exactly, first). The build with the fewest
// splitters and mergers wins; on a tie, fewer loops, then the lighter busiest belt.
//
// The belt limit: an input over it is taken as several equal belts; an output over it
// gets as few belts as will carry it, packed from the pieces that reach it; a group
// only merges belts that fit on one; and a loop may only add what its belt has room
// for. When a split needs a loop that won't fit, its belt is halved (or thirded) first.
//
// Amounts are exact: whole "units", chosen so every input belt and output is a whole
// number of them; each belt is num/den units.

const gcdN = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const lcmN = (a, b) => (a / gcdN(a, b)) * b;
const mergersFor = (k) => Math.ceil(Math.max(0, k - 1) / 2);
const sumOf = (list) => list.reduce((t, x) => t + x, 0);
// Weights with their common factor taken out (a split only cares about the ratio).
const reduce = (w) => { const g = w.reduce((a, b) => gcdN(a, b), 0) || 1; return w.map((x) => x / g); };
const FIT = 1 + 1e-12; // float slack when comparing with the belt limit

// Inputs (rates) and output shares (scaled to the input total) → whole units.
function units(inputs, outputs, rel) {
  const fin = inputs.map((v) => rational(v, rel));
  const w = toWeights(outputs, rel).weights.map(big);
  const W = w.reduce((a, b) => a + b, 0n);
  let L = 1n;
  for (const [, q] of fin) L = (L / gcd(L, q)) * q;
  let A = fin.map(([p, q]) => (p * L) / q);
  const T = A.reduce((a, b) => a + b, 0n);
  const g = gcd(T, W);
  A = A.map((a) => a * (W / g));
  let B = w.map((x) => (T / g) * x);
  const all = [...A, ...B].reduce((a, b) => gcd(a, b), 0n) || 1n;
  A = A.map((a) => a / all);
  B = B.map((b) => b / all);
  const U = A.reduce((a, b) => a + b, 0n);
  if (U > 2n ** 50n) throw new Error("the amounts need more than 2^50 parts");
  return { A: A.map(Number), B: B.map(Number), U: Number(U) };
}

// Splitting a belt into k equal belts (k = 2^a·3^b), halves first: the radices.
function evenRadices(k) {
  const r = [];
  while (k % 2 === 0) { r.push(2); k /= 2; }
  while (k % 3 === 0) { r.push(3); k /= 3; }
  return k === 1 ? r : null;
}
const evenSplitters = (r) => { let n = 0, p = 1; for (const x of r) { n += p; p *= x; } return n; };
const PRESPLIT = [1, 2, 3, 4, 6, 8, 9];

// How one group's belt is split into its flows: the first way that fits (whole, or
// pre-split into k equal belts), with its plan cached by ratio and room.
function groupPlan(amounts, supply, ctx) {
  const order = amounts.map((_, i) => i).sort((p, q) => amounts[q] - amounts[p] || p - q);
  const w = reduce(order.map((i) => amounts[i]));
  const D = sumOf(w), per = supply / D; // per: units in one of the D parts (whole)
  for (const k of PRESPLIT) {
    // The belt into each tree carries (supply/k)·N/D, which has to fit.
    const maxN = Math.min(3 * D, Math.floor(((D * ctx.cap * k) / supply) * FIT));
    if (maxN < D) continue;
    const key = w.join(",") + "|" + maxN + (ctx.quick ? "q" : "");
    let plan = ctx.plans.get(key);
    if (plan === undefined) {
      if (ctx.work <= 0 && !ctx.force) return null; // out of search budget: skip this build
      ctx.work--;
      plan = splitPlan(w, maxN, ctx.quick);
      ctx.plans.set(key, plan);
    }
    if (plan) return { k, plan, order, per, radices: evenRadices(k) };
  }
  return null;
}

// The parts of each of a plan's outputs (the last is the loop), from its tree.
function leafParts(plan) {
  if (plan.leaves) return plan.leaves;
  const out = Array.from({ length: plan.pieces.length }, () => []);
  (function walk(t) { if (t.children) t.children.forEach(walk); else out[t.out].push(t.parts); })(plan.tree);
  return (plan.leaves = out);
}

// The belts reaching an output, packed onto as few output belts as carry `total`
// (first fit, biggest first; one more belt whenever a piece fits on none). Returns the
// belts as lists of indices into `amounts`.
function pack(amounts, total, cap) {
  const bins = Array.from({ length: Math.max(1, Math.ceil(total / cap - 1e-9)) }, () => ({ sum: 0, items: [] }));
  const order = amounts.map((_, i) => i).sort((p, q) => amounts[q] - amounts[p] || p - q);
  for (const i of order) {
    let b = bins.find((x) => x.sum + amounts[i] <= cap * FIT);
    if (!b) bins.push((b = { sum: 0, items: [] }));
    b.sum += amounts[i];
    b.items.push(i);
  }
  return bins.filter((b) => b.items.length);
}

// What a build costs, from its groups and flows ([group, output, units]), without
// building it. build() makes exactly this many splitters and mergers.
function evaluate(groups, flows, S, T, ctx) {
  const leaves = T.map(() => []); // the belts arriving at each output, in units
  let splitters = 0, mergers = 0, loops = 0, busiest = Math.max(...S);
  const parts = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi], mine = flows.filter((f) => f[0] === gi);
    if (mine.length === 1) { for (const i of g) leaves[mine[0][1]].push(S[i]); parts.push({ g, mine }); continue; } // straight there
    const supply = sumOf(g.map((i) => S[i]));
    const gp = groupPlan(mine.map((f) => f[2]), supply, ctx);
    if (!gp) return null;
    const { k, plan } = gp, loopLeaves = plan.pieces[plan.pieces.length - 1];
    splitters += k * plan.splitters + (k > 1 ? evenSplitters(gp.radices) : 0);
    // Whole: the inputs and the loop all merge into the belt before the splitters.
    // Pre-split: the inputs merge, and each piece takes its own loop.
    mergers += k === 1 ? mergersFor(g.length + loopLeaves) : mergersFor(g.length) + k * Math.ceil(loopLeaves / 2);
    if (loopLeaves) loops += k;
    const lp = leafParts(plan);
    gp.order.forEach((fi, c) => { for (let r = 0; r < k; r++) for (const p of lp[c]) leaves[mine[fi][1]].push((p * gp.per) / k); });
    busiest = Math.max(busiest, supply, ((supply / k) * plan.N) / plan.D);
    parts.push({ g, mine, ...gp });
  }
  leaves.forEach((list, j) => {
    for (const b of pack(list, T[j], ctx.cap)) { mergers += mergersFor(b.items.length); busiest = Math.max(busiest, b.sum); }
  });
  return { count: splitters + mergers, loops, busiest, groups: parts };
}

// 2–4 of `pool` (indices into val, with something left) adding up to target exactly.
function subsetSum(target, pool, val, budget = 800) {
  const list = pool.filter((i) => val[i] > 0 && val[i] < target).sort((p, q) => val[q] - val[p] || p - q);
  if (list.length > 40) return null;
  let steps = 0;
  for (let size = 2; size <= 4 && size <= list.length; size++) {
    const pick = [];
    const go = (start, left) => {
      if (++steps > budget) return false;
      if (pick.length === size) return left === 0;
      for (let x = start; x < list.length; x++) {
        const v = val[list[x]];
        if (v > left) continue;
        if (v * (size - pick.length) < left) break; // the rest are no bigger
        pick.push(list[x]);
        if (go(x + 1, left - v)) return true;
        pick.pop();
      }
      return false;
    };
    if (go(0, target)) return pick;
  }
  return null;
}

// Who feeds whom: exact matches, then (if `sums`) a group that adds up to several
// outputs or an output several groups add up to, then the north-west corner rule.
function allocate(G, T, oa, ob, sums) {
  const a = [...G], b = [...T], flows = [];
  const send = (i, j, f) => { flows.push([i, j, f]); a[i] -= f; b[j] -= f; };
  for (const i of oa) for (const j of ob) if (a[i] && a[i] === b[j]) send(i, j, a[i]);
  if (sums) {
    for (const i of oa) if (a[i]) { const js = subsetSum(a[i], ob, b); if (js) for (const j of js) send(i, j, b[j]); }
    for (const j of ob) if (b[j]) { const is = subsetSum(b[j], oa, a); if (is) for (const i of is) send(i, j, a[i]); }
  }
  const ia = oa.filter((i) => a[i]), jb = ob.filter((j) => b[j]);
  let x = 0, y = 0;
  while (x < ia.length && y < jb.length) {
    const i = ia[x], j = jb[y], f = Math.min(a[i], b[j]);
    send(i, j, f);
    if (!a[i]) x++;
    if (!b[j]) y++;
  }
  return flows;
}

function* transports(G, T) {
  const n = G.length, m = T.length;
  if (n === 1) { yield T.map((t, j) => [0, j, t]); return; }
  const id = (k) => Array.from({ length: k }, (_, i) => i);
  const desc = (v) => id(v.length).sort((p, q) => v[q] - v[p] || p - q);
  const asc = (v) => desc(v).reverse();
  const orders = [[id(n), id(m)], [desc(G), desc(T)], [asc(G), asc(T)], [desc(G), asc(T)], [asc(G), desc(T)], [desc(G), id(m)], [id(n), desc(T)]];
  let seed = 7 + 31 * n + m;
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) { seed = (seed * 48271) % 2147483647; const j = seed % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  };
  for (let k = 0; k < 4; k++) orders.push([shuffle(id(n)), shuffle(id(m))]);
  for (const [oa, ob] of orders) { yield allocate(G, T, oa, ob, true); yield allocate(G, T, oa, ob, false); }
}

function* setPartitions(list) {
  if (!list.length) { yield []; return; }
  const [first, ...rest] = list;
  for (const p of setPartitions(rest)) {
    yield [[first], ...p];
    for (let k = 0; k < p.length; k++) yield [...p.slice(0, k), [first, ...p[k]], ...p.slice(k + 1)];
  }
}

// Ways to group the input belts, likeliest first. Groups that wouldn't fit on one
// belt are left out, and so are groupings that only swap equal inputs around.
function groupings(S, T, cap) {
  const n = S.length, idx = Array.from({ length: n }, (_, i) => i);
  const out = [], seen = new Set();
  const add = (gs) => {
    const norm = gs.filter((g) => g.length).map((g) => [...g].sort((p, q) => p - q)).sort((x, y) => x[0] - y[0]);
    if (norm.some((g) => g.length > 1 && sumOf(g.map((i) => S[i])) > cap * FIT)) return;
    const key = norm.map((g) => g.map((i) => S[i]).sort((p, q) => p - q).join(".")).sort().join("|");
    if (!seen.has(key)) { seen.add(key); out.push(norm); }
  };
  const pack = (list) => { // first fit, biggest first, into belts that fit
    const bins = [];
    for (const i of [...list].sort((p, q) => S[q] - S[p] || p - q)) {
      const b = bins.find((x) => x.sum + S[i] <= cap * FIT);
      if (b) { b.g.push(i); b.sum += S[i]; } else bins.push({ g: [i], sum: S[i] });
    }
    return bins.map((b) => b.g);
  };
  const usedT = new Set(), matched = [];
  for (const i of idx) {
    const j = T.findIndex((t, jj) => !usedT.has(jj) && t === S[i]);
    if (j >= 0) { usedT.add(j); matched.push(i); }
  }
  const rest = idx.filter((i) => !matched.includes(i));
  add(idx.map((i) => [i]));
  add([idx]);
  add(pack(idx));
  if (matched.length && rest.length) {
    add([...matched.map((i) => [i]), rest]);
    add([...matched.map((i) => [i]), ...pack(rest)]);
  }
  if (n <= 6) for (const p of setPartitions(idx)) add(p);
  else {
    const sorted = [...idx].sort((p, q) => S[q] - S[p] || p - q);
    for (const size of [2, 3, 4]) {
      const gs = [];
      for (let x = 0; x < n; x += size) gs.push(sorted.slice(x, x + size));
      add(gs);
    }
  }
  return out;
}

/**
 * @param {number[]} inputs   rates of the belts coming in
 * @param {number[]} outputs  shares: rates, or any ratio (scaled to the input total)
 * @param {{rel?: number, capacity?: number}} [o]  rel: tolerance for calculated rates (see
 *   toWeights); capacity: the most one belt may carry, in the inputs' units
 * @returns {{ strategy, A, B, U, cap, inBelts, outBelts, groups, splitters, mergers, loops,
 *   cost, tried, nodes, edges }}
 *   A, B: each input and output in whole units (U units = everything coming in);
 *   inBelts: { index, part, of, amount } and outBelts: { index, part, of, num, den }, one
 *   per belt (more than one where an input or output is over the belt limit);
 *   nodes: { id, kind: in | split | merge | out, index?, part?, of?, ways?, loop? };
 *   edges: { from, to, num, den, loop }  carrying num/den units
 */
export function balance(inputs, outputs, o = {}) {
  const u = units(inputs, outputs, o.rel);
  const total = sumOf(inputs.map(Number));
  const capIn = o.capacity && total > 0 ? (o.capacity * u.U) / total : Infinity; // the limit in units
  // An input over the limit: several equal belts, with units rescaled so each is whole.
  const ka = u.A.map((a) => Math.max(1, Math.ceil(a / capIn - 1e-9)));
  const L = ka.reduce(lcmN, 1);
  const inBelts = u.A.flatMap((x, i) => Array.from({ length: ka[i] }, (_, p) => ({ index: i, part: p, of: ka[i], amount: x * (L / ka[i]) })));
  const g = [...inBelts.map((b) => b.amount), ...u.B.map((b) => b * L)].reduce(gcdN, 0);
  for (const b of inBelts) b.amount /= g;
  const A = u.A.map((a) => (a * L) / g), B = u.B.map((b) => (b * L) / g), U = sumOf(A);
  if (U > 2 ** 50) throw new Error("the amounts need more than 2^50 parts");
  const cap = (capIn * L) / g;

  const S = inBelts.map((b) => b.amount), T = B;
  // Builds are compared with quick plans; the few best are then planned in full.
  const ctx = { cap, plans: new Map(), work: 300, force: true, quick: true };
  const before = (c, d) => c.count < d.count || (c.count === d.count && (c.loops < d.loops || (c.loops === d.loops && c.busiest < d.busiest * (1 - 1e-12))));
  let top = [], tried = 0;
  search: for (const gs of groupings(S, T, cap)) {
    const G = gs.map((grp) => sumOf(grp.map((i) => S[i])));
    const seen = new Set();
    for (const flows of transports(G, T)) {
      const key = flows.map((f) => f.join(",")).sort().join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      if (++tried > 4000) break search;
      ctx.force = !top.length;
      const c = evaluate(gs, flows, S, T, ctx);
      if (!c || (top.length === 5 && !before(c, top[4]))) continue;
      top.push({ ...c, gs, flows });
      top = top.sort((x, y) => (before(x, y) ? -1 : before(y, x) ? 1 : 0)).slice(0, 5);
    }
  }
  Object.assign(ctx, { quick: false, force: true });
  let best = null;
  for (const t of top) {
    const c = evaluate(t.gs, t.flows, S, T, ctx);
    if (c && (!best || before(c, best))) best = c;
  }
  if (!best) throw new Error("no build fits on those belts");
  const net = build(best, inBelts, S, T, cap);
  const merged = best.groups.filter((x) => x.plan && x.g.length > 1);
  const strategy = inBelts.length === 1 ? "split"
    : best.groups.length === 1 && best.groups[0].plan ? "merge"
    : merged.length ? "mixed" : "route";
  const groups = best.groups.map((x) => ({ inputs: x.g, outputs: [...new Set(x.mine.map((f) => f[1]))], split: !!x.plan, pre: x.k || 1 }));
  return { ...net, strategy, A, B, U, cap, inBelts, groups, loops: best.loops, cost: best.count, tried };
}

// The chosen build as one network of nodes and belts.
function build(best, inBelts, S, T, cap) {
  const nodes = [], edges = [];
  let k = 0;
  const node = (kind, extra = {}) => { const id = kind + "_" + k++; nodes.push({ id, kind, ...extra }); return id; };
  const ins = inBelts.map((b, x) => { const id = "in" + x; nodes.push({ id, kind: "in", index: b.index, part: b.part, of: b.of, amount: b.amount }); return id; });
  const pending = T.map(() => []); // belts arriving at each output: [node, num, den, loop]
  // Merge belts into one, three at a time; returns the belt that comes out.
  const mergeAll = (list) => {
    list = list.slice();
    while (list.length > 1) {
      const take = list.splice(0, 3);
      const id = node("merge", take.some((t) => t[3]) ? { loop: true } : {});
      let num = 0, den = 1;
      for (const [from, a, b, lp] of take) {
        edges.push({ from, to: id, num: a, den: b, loop: !!lp });
        num = num * b + a * den; den *= b;
        const q = gcdN(num, den); num /= q; den /= q;
      }
      list.push([id, num, den, take.every((t) => t[3])]);
    }
    return list[0];
  };
  for (const grp of best.groups) {
    const { g, mine } = grp;
    if (!grp.plan) { for (const i of g) pending[mine[0][1]].push([ins[i], S[i], 1, false]); continue; }
    const { k: pre, plan, order, per, radices } = grp;
    // One splitter tree; `head` are the belts that merge (with its loop) to feed it.
    // Its parts are 1/N of that belt, per/pre units each.
    const tree = (head) => {
      const loops = [];
      let root = null;
      (function walk(t, parent) {
        if (!t.children) {
          const belt = [parent, t.parts * per, pre, t.out === order.length];
          if (belt[3]) loops.push(belt); else pending[mine[order[t.out]][1]].push(belt);
          return;
        }
        const id = node("split", { ways: t.ways });
        if (parent) edges.push({ from: parent, to: id, num: t.parts * per, den: pre, loop: false }); else root = id;
        for (const c of t.children) walk(c, id);
      })(plan.tree, null);
      const [from, num, den] = mergeAll([...head, ...loops]);
      edges.push({ from, to: root, num, den, loop: false });
    };
    const inputs = g.map((i) => [ins[i], S[i], 1, false]);
    if (pre === 1) { tree(inputs); continue; }
    const subs = [];
    (function even(from, num, den, level) {
      if (level === radices.length) { subs.push([from, num, den, false]); return; }
      const id = node("split", { ways: radices[level] });
      edges.push({ from, to: id, num, den, loop: false });
      for (let c = 0; c < radices[level]; c++) even(id, num, den * radices[level], level + 1);
    })(...mergeAll(inputs).slice(0, 3), 0);
    for (const s of subs) tree([s]);
  }
  // Each output merges what reaches it onto as few belts as carry it (one, under the limit).
  const outBelts = [];
  pending.forEach((list, j) => {
    if (!list.length) return; // a share of 0
    const bins = pack(list.map((b) => b[1] / b[2]), T[j], cap);
    bins.forEach((bin, p) => {
      const [from, num, den] = mergeAll(bin.items.map((i) => list[i]));
      const id = "out" + outBelts.length;
      nodes.push({ id, kind: "out", index: j, part: p, of: bins.length });
      outBelts.push({ index: j, part: p, of: bins.length, num, den });
      edges.push({ from, to: id, num, den, loop: false });
    });
  });
  const count = (kind) => nodes.filter((n) => n.kind === kind).length;
  return { nodes, edges, outBelts, splitters: count("split"), mergers: count("merge") };
}

/** How a belt feeding `machines` identical machines is usually built. */
export function manifoldNote(machines) {
  return machines <= 1 ? "" : `A manifold (one belt with a splitter at each of the ${machines} machines) fills up and then gives each its share; it just takes a while to saturate.`;
}

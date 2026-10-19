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

// ── several inputs ────────────────────────────────────────────────────────────
// A balancer: belts of any rates in, outputs in any ratio out, every output exact.
// Two ways to build it, and the cheaper wins:
//   merge   join every input into one belt, then split that belt exactly
//   route   decide which input feeds which output (a small transport problem), split
//           each input exactly into its own pieces, and merge the pieces at each output.
//           No belt then carries the whole total, and an input that matches an output
//           goes straight there.
// Amounts are exact: whole "units", chosen so every input and every output is a whole
// number of them; each belt is num/den units.

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

// Who feeds whom: the north-west corner rule over one ordering of inputs and outputs,
// after first pairing any input and output that match exactly.
function allocate(A, B, orderA, orderB) {
  const a = [...A], b = [...B], flows = [];
  for (const i of orderA) for (const j of orderB) {
    if (a[i] && a[i] === b[j]) { flows.push([i, j, a[i]]); a[i] = 0; b[j] = 0; }
  }
  let x = 0, y = 0;
  const ia = orderA.filter((i) => a[i]), jb = orderB.filter((j) => b[j]);
  while (x < ia.length && y < jb.length) {
    const i = ia[x], j = jb[y], f = Math.min(a[i], b[j]);
    flows.push([i, j, f]);
    a[i] -= f; b[j] -= f;
    if (!a[i]) x++;
    if (!b[j]) y++;
  }
  return flows;
}

const mergersFor = (k) => Math.ceil(Math.max(0, k - 1) / 2);
const planCost = (p) => p.splitters + p.mergers + (p.loop ? (4 * p.loop) / p.D : 0);
// Weights with their common factor taken out (the plan only cares about the ratio).
const reduce = (w) => { const g = w.reduce((a, b) => gcdN(a, b), 0) || 1; return w.map((x) => x / g); };

/**
 * @param {number[]} inputs   rates of the belts coming in
 * @param {number[]} outputs  shares: rates, or any ratio (scaled to the input total)
 * @param {{rel?: number, capacity?: number}} [o]  rel: tolerance for calculated rates (see
 *   toWeights); capacity: the most one belt can carry, in the inputs' units, so a build
 *   whose busiest belt wouldn't fit loses to one that does
 * @returns {{ strategy, A, B, U, splitters, mergers, loops, nodes, edges }}
 *   nodes: { id, kind: in | split | merge | out, index?, ways? }
 *   edges: { from, to, num, den, loop? }  carrying num/den units (U units = all the input)
 */
export function balance(inputs, outputs, o = {}) {
  const { A, B, U } = units(inputs, outputs, o.rel);
  const n = A.length, m = B.length;
  const options = [];
  const rate = inputs.reduce((t, x) => t + Number(x), 0) / U; // input units → per minute
  const tooBig = (units) => (o.capacity && units * rate > o.capacity + 1e-9 ? 1000 : 0);

  // merge everything, then one split
  const whole = splitPlan(reduce(B));
  options.push({ strategy: "merge", cost: planCost(whole) + mergersFor(n) + tooBig((U * whole.N) / whole.D), plan: whole });
  // route each input to its own outputs (tried over a few orderings)
  if (n > 1) {
    const idx = (len) => Array.from({ length: len }, (_, i) => i);
    const desc = (arr) => idx(arr.length).sort((p, q) => arr[q] - arr[p] || p - q);
    const tried = new Set();
    for (const [oa, ob] of [[idx(n), idx(m)], [desc(A), desc(B)], [desc(A), idx(m)], [idx(n), desc(B)]]) {
      const flows = allocate(A, B, oa, ob);
      const key = flows.map((f) => f.join(",")).sort().join(";");
      if (tried.has(key)) continue;
      tried.add(key);
      let cost = 0;
      const per = [];
      for (let i = 0; i < n; i++) {
        const mine = flows.filter((f) => f[0] === i);
        const w = reduce(mine.map((f) => f[2]));
        const plan = splitPlan(w);
        per.push({ i, flows: mine, w, plan });
        cost += planCost(plan) + tooBig((A[i] * plan.N) / plan.D);
      }
      for (let j = 0; j < m; j++) cost += mergersFor(flows.filter((f) => f[1] === j).length);
      options.push({ strategy: "route", cost, per, flows });
    }
  }
  const best = options.reduce((x, y) => (y.cost < x.cost - 1e-9 ? y : x));
  return { ...build(best, A, B, U), strategy: best.strategy, A, B, U };
}

// The chosen build as one network of nodes and belts.
function build(best, A, B, U) {
  const nodes = [], edges = [];
  const ins = A.map((_, i) => { const id = "in" + i; nodes.push({ id, kind: "in", index: i }); return id; });
  const outs = B.map((_, j) => { const id = "out" + j; nodes.push({ id, kind: "out", index: j }); return id; });
  let k = 0;
  const pending = B.map(() => []); // belts arriving at each output: [node, num, den]
  // Copy one sub-network (from network()) in, its input wired to `from`, its outputs collected.
  const graft = (sub, from, scale, outIndex) => {
    const rename = new Map();
    for (const nd of sub.nodes) {
      if (nd.kind === "in") rename.set(nd.id, from);
      else if (nd.kind === "out") rename.set(nd.id, { out: outIndex(nd.out) });
      else { const id = nd.kind + "_" + k++; rename.set(nd.id, id); nodes.push({ id, kind: nd.kind, ways: nd.ways, loop: nd.loop }); }
    }
    for (const e of sub.edges) {
      const to = rename.get(e.to), num = e.parts * scale[0], den = scale[1];
      if (typeof to === "object") pending[to.out].push([rename.get(e.from), num, den, e.loop]);
      else edges.push({ from: rename.get(e.from), to, num, den, loop: e.loop });
    }
  };
  let splitters = 0, mergers = 0, loops = 0;
  if (best.strategy === "merge") {
    const sub = network(reduce(B), best.plan, A);
    // network() counts parts of 1/D of the input, and the input is all U units.
    const inIds = sub.nodes.filter((nd) => nd.kind === "in").map((nd) => nd.id);
    const rename = new Map(inIds.map((id, i) => [id, ins[i]]));
    for (const nd of sub.nodes) {
      if (nd.kind === "in") continue;
      if (nd.kind === "out") { rename.set(nd.id, outs[nd.out]); continue; }
      const id = nd.kind + "_" + k++;
      rename.set(nd.id, id);
      nodes.push({ id, kind: nd.kind, ways: nd.ways, loop: nd.loop });
    }
    // Parts are 1/D of the input; the input is U units, so a part is U/D = gB units. Every
    // belt is a whole number of units (inputs and their merges are sums of whole inputs,
    // splitter belts whole parts); rounding only clears the float noise network() leaves
    // on the input side.
    const gB = U / best.plan.D;
    for (const e of sub.edges) {
      const units = e.parts * gB, num = Math.round(units);
      if (Math.abs(units - num) > 1e-6 * Math.max(1, num)) throw new Error("a belt that isn't whole units: " + units);
      edges.push({ from: rename.get(e.from), to: rename.get(e.to), num, den: 1, loop: e.loop });
    }
    splitters = best.plan.splitters;
    loops = best.plan.loop ? 1 : 0;
  } else {
    for (const p of best.per) {
      if (p.flows.length === 1) { pending[p.flows[0][1]].push([ins[p.i], p.flows[0][2], 1]); continue; }
      const sub = network(p.w, p.plan, [1]);
      // parts are 1/D of this input, which carries A_i units
      graft(sub, ins[p.i], [A[p.i], p.plan.D], (o) => p.flows[o][1]);
      splitters += p.plan.splitters;
      if (p.plan.loop) loops++;
    }
  }
  // Each output joins the belts that reach it, three at a time.
  pending.forEach((belts, j) => {
    let list = belts.slice();
    while (list.length > 1) {
      const take = list.splice(0, 3), id = "merge_" + k++;
      nodes.push({ id, kind: "merge" });
      for (const [from, num, den, loop] of take) edges.push({ from, to: id, num, den, loop });
      // sum of fractions, kept exact
      let num = 0, den = 1;
      for (const [, a, b] of take) { num = num * b + a * den; den *= b; const g2 = gcdN(num, den); num /= g2; den /= g2; }
      list.push([id, num, den]);
    }
    if (list.length) edges.push({ from: list[0][0], to: outs[j], num: list[0][1], den: list[0][2], loop: list[0][3] });
  });
  mergers = nodes.filter((nd) => nd.kind === "merge").length;
  return { nodes, edges, splitters, mergers, loops };
}
const gcdN = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };

/** How a belt feeding `machines` identical machines is usually built. */
export function manifoldNote(machines) {
  return machines <= 1 ? "" : `A manifold (one belt with a splitter at each of the ${machines} machines) fills up and then gives each its share; it just takes a while to saturate.`;
}

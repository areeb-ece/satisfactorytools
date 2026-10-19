// A small two-phase simplex solver, enough for factory planning (a few hundred
// variables at most). Minimises c·x subject to rows of a·x (<=, >= or =) rhs, x ≥ 0.
// Rows are sparse: { a: { [column]: coefficient }, op, rhs }.
const EPS = 1e-9;
const PIV = 1e-7; // smallest pivot element trusted; tinier ones are round-off

export function minimize(n, cost, rows) {
  const m = rows.length;
  const norm = rows.map((r) => {
    // Scale each row so its largest coefficient is 1: rates run from 0.1 to 1000s/min.
    let big = 0;
    for (const j in r.a) big = Math.max(big, Math.abs(r.a[j]));
    const flip = (r.rhs < 0 ? -1 : 1) / (big || 1);
    const op = r.rhs >= 0 ? r.op : r.op === "<=" ? ">=" : r.op === ">=" ? "<=" : "=";
    return { a: r.a, flip, op, rhs: r.rhs * flip };
  });
  // Recipe graphs are badly degenerate (most items balance at exactly zero), which makes
  // the simplex wander. Pivots are chosen against right-hand sides nudged by a different
  // tiny amount each, which breaks the ties; the true right-hand sides ride along in the
  // last column and the answer is read from those.
  const slacks = norm.filter((r) => r.op !== "=").length;
  const arts = norm.filter((r) => r.op !== "<=").length;
  const N = n + slacks + arts; // columns; T[i][N] is the nudged right-hand side, T[i][N + 1] the true one
  const W = N + 2;
  const T = norm.map(() => new Float64Array(W));
  const basis = new Int32Array(m);
  let s = n, a = n + slacks;
  norm.forEach((r, i) => {
    for (const j in r.a) T[i][j] = r.a[j] * r.flip;
    T[i][N] = r.rhs + (r.op === "=" ? 0 : 1e-7 * (0.5 + ((i * 0.6180339887) % 1)));
    T[i][N + 1] = r.rhs;
    if (r.op === "<=") { T[i][s] = 1; basis[i] = s++; return; }
    if (r.op === ">=") T[i][s++] = -1;
    T[i][a] = 1;
    basis[i] = a++;
  });
  const firstArt = n + slacks;
  let nonneg = true;
  for (let j = 0; j < n; j++) if ((cost[j] || 0) < 0) nonneg = false;

  // Reduced costs for a cost vector over the current basis.
  function reduced(c) {
    const z = new Float64Array(W);
    for (let j = 0; j < N; j++) z[j] = c[j] || 0;
    for (let i = 0; i < m; i++) {
      const cb = c[basis[i]] || 0;
      if (!cb) continue;
      const row = T[i];
      for (let j = 0; j < W; j++) z[j] -= cb * row[j];
    }
    return z;
  }
  function pivot(z, r, k) {
    const pr = T[r], pv = pr[k];
    for (let j = 0; j < W; j++) pr[j] /= pv;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = T[i][k];
      if (!f) continue;
      const row = T[i];
      for (let j = 0; j < W; j++) { row[j] -= f * pr[j]; if (Math.abs(row[j]) < 1e-12) row[j] = 0; }
    }
    for (let i = 0; i < m; i++) if (T[i][N] < 0 && T[i][N] > -1e-9) T[i][N] = 0;
    const f = z[k];
    if (f) for (let j = 0; j < W; j++) z[j] -= f * pr[j];
    basis[r] = k;
  }
  // Dantzig pricing (most negative reduced cost) moves fast; after a run of degenerate
  // pivots it switches to Bland's rule, which can't cycle, until the objective moves.
  // A column whose only pivots are round-off is set aside rather than read as
  // "unbounded": with non-negative costs the objective can't fall below zero.
  function run(z, limit, floor) {
    let stuck = 0;
    const blocked = new Uint8Array(limit);
    for (let iter = 0; iter < 20000; iter++) {
      if (floor && -z[N] <= 1e-10) return "optimal";
      const bland = stuck > 30;
      let k = -1, most = -EPS;
      for (let j = 0; j < limit; j++) {
        if (!blocked[j] && z[j] < most) { k = j; most = z[j]; if (bland) break; }
      }
      if (k < 0) return "optimal";
      let r = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        const v = T[i][k];
        if (v <= PIV) continue;
        const ratio = Math.max(T[i][N], 0) / v;
        if (ratio < best - EPS) { best = ratio; r = i; }
        else if (ratio <= best + EPS && (bland ? basis[i] < basis[r] : v > T[r][k])) { best = Math.min(best, ratio); r = i; }
      }
      if (r < 0) {
        if (!nonneg) return "unbounded";
        blocked[k] = 1;
        continue;
      }
      stuck = best < EPS ? stuck + 1 : 0;
      if (stuck === 0) blocked.fill(0);
      pivot(z, r, k);
    }
    return "stalled";
  }

  if (arts) {
    const c1 = new Float64Array(N);
    for (let j = firstArt; j < N; j++) c1[j] = 1;
    const z1 = reduced(c1);
    if (run(z1, N, true) !== "optimal" || -z1[N] > 1e-6) return { status: "infeasible" };
    // Pivot leftover (zero-valued) artificials out of the basis where possible.
    for (let i = 0; i < m; i++) {
      if (basis[i] < firstArt) continue;
      for (let j = 0; j < firstArt; j++) if (Math.abs(T[i][j]) > PIV) { pivot(z1, i, j); break; }
    }
  }
  const z = reduced(cost);
  const status = run(z, firstArt);
  if (status !== "optimal") return { status };
  const x = new Float64Array(n);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][N + 1] < EPS ? 0 : T[i][N + 1];
  let value = 0;
  for (let j = 0; j < n; j++) value += (cost[j] || 0) * x[j];
  return { status, x, value };
}

// Layered flowchart layout: nodes → positioned cards and routed links. Pure, no DOM.
// Adapted from PrereqFlow's js/layout.js (same author, same look), generalised to
// cards of any size and to cycles (a factory's loops, a splitter's loop-back belt).
//
// Pipeline (a Sugiyama-style layered drawing):
//   1. columns   longest-path layering, then sources pulled right next to what they
//                feed; nodes marked `last` (products, surplus) share the final column
//   2. lanes     links spanning several columns pass through lane slots, bundled per
//                source, so they run in the gaps between cards
//   3. order     barycentre sweeps + adjacent swaps, keeping the fewest crossings
//   4. place     vertical positions by isotonic regression towards neighbours, so
//                links run as straight as the stacking allows
//   5. route     ports spread along card edges; cubic links through the lanes; links
//                that run backwards (loops) go down a riser, along a bus under the
//                sheet and up into their target, so they never cross the forward flow

export const DIMS = { gutter: 84, laneH: 4, gapY: 14, gapLane: 5, padL: 24, padR: 40, padT: 24, padB: 36, busGap: 26, portGap: 9 };
const COMPACT = 0.6; // pull towards the tight stack, relative to one linked neighbour

// Edges that close a cycle, found by DFS in node order.
function backEdges(ids, succs) {
  const state = new Map(), back = new Set();
  for (const root of ids) {
    if (state.has(root)) continue;
    const stack = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const out = succs.get(top[0]);
      if (top[1] < out.length) {
        const [v, i] = out[top[1]++];
        const s = state.get(v);
        if (s === 1) back.add(i);
        else if (!s) { state.set(v, 1); stack.push([v, 0]); }
      } else { state.set(top[0], 2); stack.pop(); }
    }
  }
  return back;
}

// Isotonic regression (pool adjacent violators): centres y_i as close as possible
// to desired d_i (weighted), keeping order and the minimum separation sep_i.
export function placeColumn(desired, weights, seps) {
  const n = desired.length;
  const off = new Array(n).fill(0);
  for (let i = 1; i < n; i++) off[i] = off[i - 1] + seps[i - 1];
  const blocks = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ sw: weights[i], swz: weights[i] * (desired[i] - off[i]), n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (a.swz / a.sw <= b.swz / b.sw) break;
      a.sw += b.sw; a.swz += b.swz; a.n += b.n;
      blocks.pop();
    }
  }
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.swz / b.sw + off[out.length]);
  return out;
}

/**
 * @param {{id: string, w: number, h: number, first?: boolean, last?: boolean}[]} nodes  in a sensible
 *   initial order (it breaks ties, so cards of one production line stay together)
 * @param {{from: string, to: string}[]} edges
 */
export function layout(nodes, edges, opts = {}) {
  const D = { ...DIMS, ...(opts.dims || {}) };
  const ids = nodes.map((n) => n.id);
  const node = new Map(nodes.map((n) => [n.id, n]));
  const succs = new Map(ids.map((i) => [i, []])), preds = new Map(ids.map((i) => [i, []]));
  edges.forEach((e, i) => { succs.get(e.from).push([e.to, i]); preds.get(e.to).push([e.from, i]); });
  const back = backEdges(ids, succs);

  // ── 1. columns
  const P = new Map(ids.map((i) => [i, []])), S = new Map(ids.map((i) => [i, []]));
  edges.forEach((e, i) => { if (!back.has(i) && e.from !== e.to) { S.get(e.from).push(e.to); P.get(e.to).push(e.from); } });
  const indeg = new Map(ids.map((i) => [i, P.get(i).length]));
  const queue = ids.filter((i) => !indeg.get(i)), topo = [];
  while (queue.length) {
    const c = queue.shift();
    topo.push(c);
    for (const s of S.get(c)) { indeg.set(s, indeg.get(s) - 1); if (!indeg.get(s)) queue.push(s); }
  }
  const col = new Map();
  for (const c of topo) col.set(c, P.get(c).reduce((m, p) => Math.max(m, col.get(p) + 1), 0));
  // Pull nodes that feed more than they take (raw sources, splitters) right, next to
  // their earliest consumer, never level with or left of something that feeds them.
  // Nodes marked `first` (a balancer's inputs) stay in the first column.
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = topo.length - 1; i >= 0; i--) {
      const c = topo[i], out = S.get(c).filter((s) => !node.get(s).last);
      if (node.get(c).first || !out.length || out.length < P.get(c).length) continue;
      const lim = Math.min(...out.map((s) => col.get(s))) - 1;
      if (lim > col.get(c)) { col.set(c, lim); moved = true; }
    }
    if (!moved) break;
  }
  const lastCol = Math.max(0, ...ids.filter((i) => !node.get(i).last).map((i) => col.get(i) + 1));
  for (const i of ids) if (node.get(i).last) col.set(i, Math.max(lastCol, ...P.get(i).map((p) => col.get(p) + 1)));
  const nCols = Math.max(1, ...[...col.values()].map((c) => c + 1));

  // ── 2. items: cards and lane slots
  const items = new Map();
  for (const i of ids) items.set(i, { id: i, col: col.get(i), h: node.get(i).h, card: true });
  const segs = new Map();
  const addSeg = (a, b) => { const k = a + "|" + b; if (!segs.has(k)) segs.set(k, [a, b]); };
  const routes = edges.map((e, i) => {
    const ca = col.get(e.from), cb = col.get(e.to);
    const r = { i, from: e.from, to: e.to, kind: back.has(i) || cb <= ca ? "back" : "fwd", hops: [] };
    if (r.kind === "fwd") {
      let prev = e.from;
      for (let k = ca + 1; k < cb; k++) {
        const id = `~${e.from}@${k}`;
        if (!items.has(id)) items.set(id, { id, col: k, h: D.laneH, card: false, owner: e.from });
        addSeg(prev, id);
        r.hops.push(id);
        prev = id;
      }
      addSeg(prev, e.to);
    }
    return r;
  });
  const segList = [...segs.values()];
  const up = new Map(), down = new Map();
  for (const id of items.keys()) { up.set(id, []); down.set(id, []); }
  for (const [a, b] of segList) { down.get(a).push(b); up.get(b).push(a); }
  const segsBetween = Array.from({ length: Math.max(0, nCols - 1) }, () => []);
  for (const s of segList) segsBetween[items.get(s[0]).col].push(s);

  // ── 3. order within columns
  const cols = Array.from({ length: nCols }, () => []);
  for (const it of items.values()) cols[it.col].push(it.id);
  const seq = new Map(ids.map((id, k) => [id, k]));
  const idx = new Map();
  const reindex = (c) => cols[c].forEach((id, i) => idx.set(id, i));
  reindex(0);
  for (let k = 1; k < nCols; k++) {
    const bc = (id) => { const u = up.get(id); return u.length ? u.reduce((s, x) => s + idx.get(x), 0) / u.length : Infinity; };
    cols[k].sort((a, b) => bc(a) - bc(b) || (seq.get(a) ?? 0) - (seq.get(b) ?? 0));
    reindex(k);
  }
  const crossingsAt = (k) => {
    const s = segsBetween[k];
    let n = 0;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      if ((idx.get(s[i][0]) - idx.get(s[j][0])) * (idx.get(s[i][1]) - idx.get(s[j][1])) < 0) n++;
    }
    return n;
  };
  const totalCrossings = () => { let n = 0; for (let k = 0; k < nCols - 1; k++) n += crossingsAt(k); return n; };
  const sweep = (k, nbrs) => {
    const bc = new Map();
    cols[k].forEach((id, i) => {
      const ns = nbrs.get(id);
      bc.set(id, ns.length ? ns.reduce((s, x) => s + idx.get(x), 0) / ns.length : i);
    });
    cols[k].sort((a, b) => bc.get(a) - bc.get(b) || idx.get(a) - idx.get(b));
    reindex(k);
  };
  const localCross = (a, b) => {
    let n = 0;
    for (const nb of [up, down]) for (const x of nb.get(a)) for (const y of nb.get(b)) if (idx.get(x) > idx.get(y)) n++;
    return n;
  };
  const transpose = () => {
    let improved = true, rounds = 0;
    while (improved && rounds++ < 6) {
      improved = false;
      for (let k = 0; k < nCols; k++) {
        const c = cols[k];
        for (let i = 0; i + 1 < c.length; i++) {
          const a = c[i], b = c[i + 1];
          if (localCross(b, a) < localCross(a, b)) { c[i] = b; c[i + 1] = a; idx.set(b, i); idx.set(a, i + 1); improved = true; }
        }
      }
    }
  };
  let best = totalCrossings(), bestCols = cols.map((c) => c.slice());
  const big = segList.length > 1500; // keep huge factories quick
  for (let it = 0; it < (big ? 4 : 10) && best > 0; it++) {
    if (it % 2 === 0) for (let k = 1; k < nCols; k++) sweep(k, up);
    else for (let k = nCols - 2; k >= 0; k--) sweep(k, down);
    if (!big) transpose();
    const n = totalCrossings();
    if (n < best) { best = n; bestCols = cols.map((c) => c.slice()); }
  }
  bestCols.forEach((c, k) => { cols[k] = c; reindex(k); });

  // ── 4. vertical placement (centres around y = 0, anchored to the tight stack)
  const cy = new Map(), anchor = new Map();
  const sepOf = (a, b) => (a.h + b.h) / 2 + (a.card && b.card ? D.gapY : D.gapLane);
  for (const c of cols) {
    let y = 0;
    c.forEach((id, i) => { if (i) y += sepOf(items.get(c[i - 1]), items.get(id)); anchor.set(id, y); });
    for (const id of c) { anchor.set(id, anchor.get(id) - y / 2); cy.set(id, anchor.get(id)); }
  }
  const relax = (k, dirs) => {
    const c = cols[k];
    if (!c.length) return;
    const desired = [], weights = [], seps = [];
    c.forEach((id, i) => {
      const ns = dirs.flatMap((m) => m.get(id));
      desired.push((ns.reduce((s, x) => s + cy.get(x), 0) + COMPACT * anchor.get(id)) / (ns.length + COMPACT));
      weights.push(ns.length ? (items.get(id).card ? 1 : 2.5) : 0.25);
      if (i) seps.push(sepOf(items.get(c[i - 1]), items.get(id)));
    });
    placeColumn(desired, weights, seps).forEach((y, i) => cy.set(c[i], y));
  };
  for (let it = 0; it < 6; it++) {
    for (let k = 1; k < nCols; k++) relax(k, [up]);
    for (let k = nCols - 2; k >= 0; k--) relax(k, [down]);
  }
  for (let k = 0; k < nCols; k++) relax(k, [up, down]);
  let top = Infinity, bottom = -Infinity;
  for (const [id, y] of cy) { const h = items.get(id).h; top = Math.min(top, y - h / 2); bottom = Math.max(bottom, y + h / 2); }
  if (!isFinite(top)) { top = 0; bottom = 0; }
  const shift = D.padT - top;

  // Columns are as wide as their widest card.
  const colW = cols.map((c) => Math.max(40, ...c.filter((id) => node.has(id)).map((id) => node.get(id).w)));
  const colX = [];
  colW.forEach((w, k) => colX.push(k ? colX[k - 1] + colW[k - 1] + D.gutter : D.padL));
  const pos = new Map();
  for (const id of ids) {
    const n = node.get(id), k = col.get(id);
    pos.set(id, { id, col: k, x: colX[k] + (colW[k] - n.w) / 2, y: Math.round(cy.get(id) + shift - n.h / 2), w: n.w, h: n.h });
  }

  // ── 5. ports + routes
  const yOf = (id) => cy.get(id) + shift;
  const portIn = new Map(), portOut = new Map(); // edge index → y on the card's edge
  const spread = (id, list, map) => {
    if (!list.length) return;
    const h = node.get(id).h;
    list.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const span = Math.min(h - 14, (list.length - 1) * D.portGap);
    list.forEach(([i], k) => map.set(i, yOf(id) + (list.length > 1 ? -span / 2 + (span * k) / (list.length - 1) : 0)));
  };
  const backs = routes.filter((r) => r.kind === "back");
  for (const id of ids) {
    // incoming: sorted by where each link comes from; back links (from below) last
    spread(id, routes.filter((r) => r.to === id).map((r) => [r.i, r.kind === "back" ? Infinity : yOf(r.hops.length ? r.hops[r.hops.length - 1] : r.from)]), portIn);
    spread(id, routes.filter((r) => r.from === id).map((r) => [r.i, r.kind === "back" ? Infinity : yOf(r.hops.length ? r.hops[0] : r.to)]), portOut);
  }
  const f = (v) => Math.round(v * 10) / 10;
  const curve = (x1, y1, x2, y2) => {
    const dx = Math.max(24, (x2 - x1) * 0.5);
    return `C${f(x1 + dx)},${f(y1)} ${f(x2 - dx)},${f(y2)} ${f(x2)},${f(y2)}`;
  };
  const busY = new Map(backs.map((r, i) => [r.i, Math.round(bottom + shift + D.busGap + i * 10)]));
  const R = 6;
  const out = routes.map((r) => {
    const a = pos.get(r.from), b = pos.get(r.to);
    let d, label;
    if (r.kind === "fwd") {
      let x = a.x + a.w, y = portOut.get(r.i);
      d = `M${f(x)},${f(y)}`;
      for (const h of r.hops) {
        const k = items.get(h).col, hy = yOf(h);
        d += ` ${curve(x, y, colX[k], hy)} L${f(colX[k] + colW[k])},${f(hy)}`;
        x = colX[k] + colW[k]; y = hy;
      }
      const ey = portIn.get(r.i), ex = b.x - 1;
      d += ` ${curve(x, y, ex, ey)}`;
      // label sits on the last stretch, nearer the card it feeds
      const dx = Math.max(24, (ex - x) * 0.5), t = 0.62, u = 1 - t;
      label = { x: u * u * u * x + 3 * u * u * t * (x + dx) + 3 * u * t * t * (ex - dx) + t * t * t * ex, y: u * u * u * y + 3 * u * u * t * y + 3 * u * t * t * ey + t * t * t * ey };
    } else {
      // backwards: right edge → riser → bus under the sheet → riser → into the left edge
      const y0 = portOut.get(r.i), x0 = a.x + a.w, rx = x0 + Math.round(D.gutter * 0.35);
      const tx = b.x - 1, ux = b.x - Math.round(D.gutter * 0.35), ty = portIn.get(r.i), by = busY.get(r.i);
      const sg = ux >= rx ? 1 : -1;
      d = `M${f(x0)},${f(y0)} L${f(rx - R)},${f(y0)} Q${f(rx)},${f(y0)} ${f(rx)},${f(y0 + R)}`
        + ` L${f(rx)},${f(by - R)} Q${f(rx)},${f(by)} ${f(rx + sg * R)},${f(by)} L${f(ux - sg * R)},${f(by)} Q${f(ux)},${f(by)} ${f(ux)},${f(by - R)}`
        + ` L${f(ux)},${f(ty + R)} Q${f(ux)},${f(ty)} ${f(ux + R)},${f(ty)} L${f(tx)},${f(ty)}`;
      label = { x: (rx + ux) / 2, y: by - 4 };
    }
    return { i: r.i, from: r.from, to: r.to, kind: r.kind, d, label };
  });

  const width = colX[nCols - 1] + colW[nCols - 1] + D.padR;
  const lastBus = backs.length ? Math.max(...busY.values()) : -Infinity;
  const height = Math.max(Math.round(bottom + shift + D.padB), lastBus + D.padB);
  const predIds = new Map(ids.map((i) => [i, preds.get(i).map(([p]) => p)]));
  const succIds = new Map(ids.map((i) => [i, succs.get(i).map(([s]) => s)]));
  return { nodes: pos, edges: out, width, height, nCols, colX, colW, crossings: best, preds: predIds, succs: succIds, dims: D };
}

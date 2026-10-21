// An interactive flowchart in the PrereqFlow style: cards over SVG links with
// arrowheads. Hover a card to trace what feeds it (blue) and what it feeds (amber),
// with particles running along the lit belts; click to pin it and open its details;
// shift+click to keep a coloured tree highlighted. Drag to pan, ctrl+scroll or the
// buttons to zoom. Used by the planner's factory diagram and the splitter plans.
//
// The page's security policy forbids style attributes, so every position and colour
// is set through el.style.setProperty (CSSOM), never written into markup.
import { h, s, clear, btn, closeBtn, icon } from "./ui.js";
import { layout } from "./lib/flowlayout.js";

let uid = 0;
// Reduced motion, or the shared settings panel's Animations switch, means no smooth scrolling either.
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off";
const N_HL = 6;
const DIRS = { up: "what feeds it", down: "what it feeds", both: "both ways" };

function closure(start, nbrs) {
  const seen = new Set([start]), stack = [start];
  while (stack.length) for (const y of nbrs.get(stack.pop()) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
  return seen;
}

/**
 * @param {{nodes: object[], edges: object[]}} graph
 *   nodes: { id, w, h, last?, kind, title, sub?, note?, tag?, cc?, aria? }
 *   edges: { from, to, label?, title?, loop? }
 * @param {object} [opts]
 *   details(node) → Element   what a pinned card shows
 *   wide(node) → boolean      pin it in the wide drawer (e.g. a splitter's own build)
 *   labels                    rate labels on the links
 *   stage                     fill the container, PrereqFlow style: a legend strip on top,
 *                             zoom controls floating bottom right, a drawer on the right
 *   toolbar                   extra controls for the strip (stage only)
 *   legend                    extra legend entries for the strip (stage only)
 */
export function flowchart(graph, opts = {}) {
  const id = "fc" + uid++;
  const lay = layout(graph.nodes, graph.edges);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const st = { zoom: 1, hovered: null, pinned: null, trees: [], dim: true };

  // ── markup
  const mk = (name) => s("marker", { id: `${id}-${name}`, class: "fc-mk " + name, viewBox: "0 0 10 10", refX: 8.5, refY: 5, markerWidth: 6.5, markerHeight: 6.5, orient: "auto-start-reverse" }, s("path", { d: "M0,0.8 L10,5 L0,9.2 z" }));
  const defs = s("defs", null, ["ah", "ah-n", "ah-u", "ah-d", ...Array.from({ length: N_HL }, (_, i) => "ah-h" + i)].map(mk));
  const gBase = s("g"), gHi = s("g"), gFlow = s("g", { class: "fc-flows" }), gLbl = s("g", { class: "fc-lbls" });
  const svg = s("svg", { class: "fc-edges", width: lay.width, height: lay.height, viewBox: `0 0 ${lay.width} ${lay.height}`, "aria-hidden": "true" }, defs, gBase, gHi, gFlow, gLbl);
  const edgeEls = lay.edges.map((e) => {
    const g = graph.edges[e.i];
    const p = s("path", { class: "e" + (e.kind === "back" ? " back" : "") + (g.cls ? " " + g.cls : ""), d: e.d, "marker-end": `url(#${id}-ah)` }, g.title ? s("title", null, g.title) : null);
    p.dataset.base = p.getAttribute("class");
    gBase.append(p);
    let t = null;
    if (opts.labels && g.label) {
      t = s("text", { class: "fc-lbl", x: e.label.x.toFixed(1), y: (e.label.y - 4).toFixed(1), "text-anchor": "middle" }, g.label);
      gLbl.append(t);
    }
    return { p, t, e };
  });
  const cards = h("div", { class: "fc-cards" });
  const cardEls = new Map();
  const sheen = graph.nodes.length <= 160;
  for (const n of graph.nodes) {
    const p = lay.nodes.get(n.id);
    const el = h("button", { type: "button", class: `fc-card k-${n.kind}${n.cls ? " " + n.cls : ""}${sheen ? " fc-sheen" : ""}`, "aria-label": n.aria || [n.title, n.sub, n.note].filter(Boolean).join(", ") },
      h("span", { class: "t" }, h("b", { text: n.title }), n.tag ? h("i", { text: n.tag }) : null),
      n.sub ? h("span", { class: "s", text: n.sub }) : null,
      n.note ? h("span", { class: "n", text: n.note }) : null,
      h("span", { class: "marks" }));
    for (const [k, v] of [["left", p.x], ["top", p.y], ["width", p.w], ["height", p.h]]) el.style.setProperty(k, v + "px");
    if (n.cc != null) el.style.setProperty("--cc", `var(--c${n.cc % 8})`);
    el.style.setProperty("--sd", (9 + ((p.x * 7 + p.y * 13) % 70) / 10).toFixed(1) + "s");
    el.style.setProperty("--sdl", "-" + (((p.x * 3 + p.y) % 160) / 10).toFixed(1) + "s");
    el.dataset.id = n.id;
    cards.append(el);
    cardEls.set(n.id, el);
  }
  const world = h("div", { class: "fc-world" }, svg, cards);
  world.style.setProperty("width", lay.width + "px");
  world.style.setProperty("height", lay.height + "px");
  const sizer = h("div", { class: "fc-sizer" }, world);
  const view = h("div", { class: "fc-view" + (opts.tall ? " tall" : "") }, sizer);
  const readout = h("div", { class: "fc-readout", hidden: true });
  const pct = h("button", { type: "button", class: "sd-btn sd-small sd-ghost pct", title: "Actual size", "aria-label": "Zoom: 100%, show at actual size", text: "100%", on: { click: () => setZoom(1) } });
  const chips = h("div", { class: "fc-chips" });
  const dimBtn = h("button", { type: "button", class: "sd-btn sd-small sd-ghost", "aria-pressed": "true", text: "Dim others: on", on: { click: () => { st.dim = !st.dim; dimBtn.textContent = "Dim others: " + (st.dim ? "on" : "off"); dimBtn.setAttribute("aria-pressed", String(st.dim)); apply(); } } });
  const zoom = h("div", { class: "fc-zoom", role: "group", "aria-label": "Zoom" },
    btn("", () => setZoom(st.zoom / 1.25), { small: true, kind: "ghost", ico: "minus", label: "Zoom out", title: "Zoom out" }),
    pct,
    btn("", () => setZoom(st.zoom * 1.25), { small: true, kind: "ghost", ico: "plus", label: "Zoom in", title: "Zoom in" }),
    btn("Fit", () => fit(), { small: true, kind: "ghost", ico: "fit", title: "Fit to the window" }));
  const kbd = (t) => h("kbd", { class: "sd-kbd", text: t });
  const hint = h("span", { class: "fc-hint" }, "Hover to trace · click to pin · ", kbd("Shift"), "+click to highlight a tree · drag to pan · ", kbd("Ctrl"), "+scroll to zoom · arrow keys move between cards");
  const swatch = (cls, label) => h("span", { class: "k" }, h("span", { class: "sw " + cls }), label);
  const legend = h("div", { class: "fc-legend", "aria-label": "Legend" },
    swatch("f", "hovered / pinned"), swatch("n", "feeds it"), swatch("u", "it feeds"), ...(opts.legend || []));
  const details = h(opts.stage ? "aside" : "div", { class: opts.stage ? "fc-drawer" : "fc-details", hidden: true, "aria-label": "Details" });
  const frame = h("div", { class: "fc-frame" }, view, readout, opts.stage ? zoom : null, opts.stage ? details : null);
  const root = opts.stage
    ? h("div", { class: "fc stage" }, h("div", { class: "fc-strip" }, legend, chips, opts.toolbar || null, hint), frame)
    : h("div", { class: "fc" }, h("div", { class: "fc-bar" }, zoom, chips, hint), frame, details);

  // ── zoom and pan
  function setZoom(z, ax, ay) {
    z = Math.min(2, Math.max(0.15, z));
    const vx = ax ?? view.clientWidth / 2, vy = ay ?? view.clientHeight / 2;
    const wx = (view.scrollLeft + vx) / st.zoom, wy = (view.scrollTop + vy) / st.zoom;
    st.zoom = z;
    world.style.setProperty("transform", `scale(${z})`);
    sizer.style.setProperty("width", Math.ceil(lay.width * z) + "px");
    sizer.style.setProperty("height", Math.ceil(lay.height * z) + "px");
    pct.textContent = Math.round(z * 100) + "%";
    pct.setAttribute("aria-label", `Zoom: ${Math.round(z * 100)}%, show at actual size`);
    center();
    view.scrollLeft = wx * z - vx;
    view.scrollTop = wy * z - vy;
    root.classList.toggle("far", z < 0.55); // labels and particles only when readable
  }
  // A chart smaller than its view sits in the middle of it rather than the top corner.
  function center() {
    sizer.style.setProperty("margin-left", Math.max(0, (view.clientWidth - lay.width * st.zoom) / 2) + "px");
    sizer.style.setProperty("margin-top", Math.max(0, (view.clientHeight - lay.height * st.zoom) / 2) + "px");
  }
  function fit(min = 0.15) {
    const w = view.clientWidth || 900, hh = view.clientHeight || 600;
    setZoom(Math.max(min, Math.min(1, (w - 8) / lay.width, Math.max((hh - 8) / lay.height, 0.45 * (w - 8) / lay.width))));
    view.scrollLeft = 0;
    view.scrollTop = 0;
  }
  view.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = view.getBoundingClientRect();
    setZoom(st.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let drag = null;
  view.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".fc-card")) return;
    drag = { x: e.clientX, y: e.clientY, l: view.scrollLeft, t: view.scrollTop, moved: false };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; view.classList.add("panning"); }
    view.scrollLeft = drag.l - dx;
    view.scrollTop = drag.t - dy;
  });
  const endDrag = () => {
    if (drag && !drag.moved && st.pinned) pin(null); // a click on the empty sheet unpins
    drag = null;
    view.classList.remove("panning");
  };
  view.addEventListener("pointerup", endDrag);
  view.addEventListener("pointercancel", () => { drag = null; view.classList.remove("panning"); });

  // ── highlighting
  function treeSets() {
    const cardsHl = new Map(), edgesHl = new Map();
    for (const t of st.trees) {
      const anc = t.dir !== "down" ? closure(t.id, lay.preds) : new Set([t.id]);
      const desc = t.dir !== "up" ? closure(t.id, lay.succs) : new Set([t.id]);
      for (const c of new Set([...anc, ...desc])) (cardsHl.get(c) ?? cardsHl.set(c, []).get(c)).push(t.color);
      lay.edges.forEach((e, i) => {
        if (!edgesHl.has(i) && ((anc.has(e.from) && anc.has(e.to)) || (desc.has(e.from) && desc.has(e.to)))) edgesHl.set(i, t.color);
      });
    }
    return { cards: cardsHl, edges: edgesHl, any: cardsHl.size > 0 };
  }
  let flowKey = "";
  function apply() {
    const focus = st.hovered || st.pinned;
    const anc = focus ? closure(focus, lay.preds) : null, desc = focus ? closure(focus, lay.succs) : null;
    const trees = treeSets();
    for (const [cid, el] of cardEls) {
      el.classList.remove("is-focus", "is-needs", "is-unlocks", "is-dim", "is-hl", "is-root", "is-pinned");
      const tc = trees.cards.get(cid);
      if (anc) el.classList.add(cid === focus ? "is-focus" : anc.has(cid) ? "is-needs" : desc.has(cid) ? "is-unlocks" : "is-dim");
      else if (trees.any) {
        if (tc) el.classList.add("is-hl", ...(st.trees.some((t) => t.id === cid) ? ["is-root"] : []));
        else if (st.dim) el.classList.add("is-dim");
      }
      if (cid === st.pinned) el.classList.add("is-pinned");
      if (tc) el.style.setProperty("--hc", `var(--h${tc[0]})`); else el.style.removeProperty("--hc");
      const marks = el.querySelector(".marks");
      const want = tc ? tc.join(",") : "";
      if (marks.dataset.m !== want) {
        clear(marks);
        for (const c of tc || []) { const i = h("i"); i.style.setProperty("--hc", `var(--h${c})`); marks.append(i); }
        marks.dataset.m = want;
      }
    }
    const flows = [];
    edgeEls.forEach(({ p, t, e }, i) => {
      let cls = "", marker = "ah", color = "";
      if (anc) cls = anc.has(e.from) && anc.has(e.to) ? "n" : desc.has(e.from) && desc.has(e.to) ? "u" : "d";
      else if (trees.any) {
        if (trees.edges.has(i)) { cls = "h"; color = `var(--h${trees.edges.get(i)})`; marker = "ah-h" + trees.edges.get(i); }
        else if (st.dim) cls = "d";
      }
      if (cls === "n" || cls === "u" || cls === "d") marker = "ah-" + cls;
      p.setAttribute("class", (p.dataset.base + " " + cls).trim());
      p.setAttribute("marker-end", `url(#${id}-${marker})`);
      if (color) p.style.setProperty("stroke", color); else p.style.removeProperty("stroke");
      if (t) t.setAttribute("class", "fc-lbl" + (cls === "d" ? " d" : cls ? " lit" : ""));
      const lit = cls === "n" || cls === "u" || cls === "h";
      if (lit && p.parentNode !== gHi) gHi.append(p);
      else if (!lit && p.parentNode !== gBase) gBase.append(p);
      if (lit) flows.push([i, cls === "n" ? "var(--needs)" : cls === "u" ? "var(--unlocks)" : color]);
    });
    const key = flows.map((x) => x.join(":")).join("|");
    if (key !== flowKey) {
      flowKey = key;
      clear(gFlow);
      for (const [i, color] of flows.slice(0, 200)) {
        const fl = s("path", { class: "fc-flow", d: lay.edges[i].d });
        fl.style.setProperty("stroke", color);
        fl.style.setProperty("animation-delay", "-" + ((i * 7) % 16) / 10 + "s");
        gFlow.append(fl);
      }
    }
    // (the drawer already shows the pinned card, as in PrereqFlow)
    if (focus && !(opts.stage && focus === st.pinned)) {
      const n = byId.get(focus);
      readout.replaceChildren(h("b", { text: n.title }), n.sub ? h("span", { text: n.sub }) : null,
        h("span", { class: "st" }, h("i", { class: "nd", text: String(anc.size - 1) }), " upstream · ", h("i", { class: "un", text: String(desc.size - 1) }), " downstream"));
      readout.hidden = false;
    } else readout.hidden = true;
    drawChips();
  }
  function drawChips() {
    clear(chips);
    if (!st.trees.length) return;
    for (const t of st.trees) {
      const chip = h("span", { class: "fc-chip" }, h("i"), byId.get(t.id).title + " · " + DIRS[t.dir],
        h("button", { type: "button", class: "x", "aria-label": "Remove highlight of " + byId.get(t.id).title, on: { click: () => { toggleTree(t.id); } } }, icon("x")));
      chip.style.setProperty("--hc", `var(--h${t.color})`);
      chips.append(chip);
    }
    chips.append(dimBtn, btn("Clear", () => { st.trees = []; apply(); }, { small: true, kind: "ghost" }));
  }
  function toggleTree(nid, dir = "both") {
    const i = st.trees.findIndex((t) => t.id === nid);
    if (i >= 0 && st.trees[i].dir === dir) st.trees.splice(i, 1);
    else if (i >= 0) st.trees[i].dir = dir;
    else {
      const used = new Set(st.trees.map((t) => t.color));
      let color = 0;
      while (used.has(color) && color < N_HL - 1) color++;
      st.trees.push({ id: nid, dir, color });
    }
    apply();
  }
  function pin(nid) {
    st.pinned = st.pinned === nid ? null : nid;
    clear(details);
    details.hidden = !st.pinned;
    frame.classList.toggle("drawer-open", !!st.pinned && !!opts.stage);
    if (st.pinned) {
      const n = byId.get(st.pinned);
      details.classList.toggle("wide", !!opts.wide?.(n));
      const close = closeBtn("Close details", () => { const back = cardEls.get(st.pinned); pin(st.pinned); back?.focus({ preventScroll: true }); });
      const trees = h("div", { class: "row", role: "group", "aria-label": "Highlight a tree" }, Object.entries(DIRS).map(([d, label]) => btn("Highlight " + label, () => toggleTree(n.id, d), { small: true })));
      if (opts.stage) {
        details.append(h("header", null, h("div", null, h("b", { text: n.title }), n.tag ? h("i", { text: n.tag }) : null, n.sub ? h("span", { text: n.sub }) : null), close),
          h("div", { class: "dbody" }, opts.details?.(n) ?? null, trees));
      } else {
        details.append(h("header", null, h("b", { text: n.title }), n.sub ? h("span", { text: n.sub }) : null, h("span", { class: "spacer" }), trees, close), opts.details?.(n) ?? null);
      }
    }
    apply();
  }
  // Pin a card and bring it to the middle of the view (from a list outside the chart).
  function focus(nid) {
    const p = lay.nodes.get(nid);
    if (!p) return;
    if (st.pinned !== nid) pin(nid);
    if (st.zoom < 0.7) setZoom(0.8);
    view.scrollTo({ left: (p.x + p.w / 2) * st.zoom - view.clientWidth / 2, top: (p.y + p.h / 2) * st.zoom - view.clientHeight / 2, behavior: still() ? "auto" : "smooth" });
  }
  // Keyboard: the chart is one tab stop; the arrow keys move to the nearest card in that
  // direction, Enter pins it, Escape unpins.
  let cur = graph.nodes[0]?.id;
  const rove = (nid) => { for (const [k, el] of cardEls) el.tabIndex = k === nid ? 0 : -1; cur = nid; };
  cards.addEventListener("keydown", (e) => {
    const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (e.key === "Escape" && st.pinned) { e.stopPropagation(); pin(st.pinned); return; }
    if (!d || !cur) return;
    e.preventDefault();
    const a = lay.nodes.get(cur), ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    let best = null, bestScore = Infinity;
    for (const [k, p] of lay.nodes) {
      if (k === cur) continue;
      const dx = p.x + p.w / 2 - ax, dy = p.y + p.h / 2 - ay;
      const along = dx * d[0] + dy * d[1];
      if (along <= 1) continue;
      const score = along + 3 * Math.abs(dx * d[1] + dy * d[0]);
      if (score < bestScore) { bestScore = score; best = k; }
    }
    if (!best) return;
    rove(best);
    const el = cardEls.get(best);
    el.focus({ preventScroll: true });
    const p = lay.nodes.get(best);
    const L = p.x * st.zoom, T = p.y * st.zoom, R = (p.x + p.w) * st.zoom, B = (p.y + p.h) * st.zoom;
    if (L < view.scrollLeft || R > view.scrollLeft + view.clientWidth || T < view.scrollTop || B > view.scrollTop + view.clientHeight)
      view.scrollTo({ left: (L + R) / 2 - view.clientWidth / 2, top: (T + B) / 2 - view.clientHeight / 2 });
  });
  for (const [nid, el] of cardEls) {
    el.addEventListener("focus", () => { if (cur !== nid) rove(nid); });
    el.addEventListener("pointerenter", () => { st.hovered = nid; apply(); });
    el.addEventListener("pointerleave", () => { if (st.hovered === nid) { st.hovered = null; apply(); } });
    el.addEventListener("focus", () => { st.hovered = nid; apply(); });
    el.addEventListener("blur", () => { if (st.hovered === nid) { st.hovered = null; apply(); } });
    el.addEventListener("click", (e) => { if (e.shiftKey) toggleTree(nid); else pin(nid); });
  }

  // Fit once the chart is in the page and has a size.
  // (first view: no smaller than 55%, so the cards stay readable; "fit" shows everything)
  let fitted = false;
  const ro = new ResizeObserver(() => {
    if (!view.clientWidth) return;
    if (!fitted) { fitted = true; fit(0.55); } else center();
  });
  ro.observe(view);
  rove(cur);
  setZoom(1);
  apply();
  root.chart = { layout: lay, fit, pin, focus, toggleTree, setZoom, state: st };
  return root;
}

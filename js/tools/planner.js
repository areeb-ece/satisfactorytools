// Production planner: several products in one factory. Shared intermediates are made
// on one line each, and every line's output is rationed between the lines (and
// products) that need it, with a splitter plan for each split.
import { h, clear, load, save, seg, select, itemRows, itemLink, rate, stat, table, card, toolHead, toast } from "../ui.js";
import { recipes, recipeById, buildings, items, itemName, fmt, pct, mw, carrier, defaultRecipes, isConversion, D } from "../lib/game.js";
import { plan, distribution, OBJECTIVES } from "../lib/planner.js";
import { factoryDiagram } from "../graph.js";

const KEY = "planner";
export const DEFAULTS = {
  targets: [{ item: "ModularFrame", rate: 10 }, { item: "Rotor", rate: 10 }, { item: "IronPlateReinforced", rate: 5 }],
  inputs: [],
  alts: [], // recipes turned on beyond the defaults
  off: [], // default recipes turned off
  objective: "resources",
  maxClock: 1,
  tab: "factory",
  view: "machines", // the diagram: one card per machine, or per line
};

/** The recipe set a saved plan uses. */
export function recipeSet(st) {
  const set = defaultRecipes();
  for (const id of st.off) set.delete(id);
  for (const id of st.alts) if (recipeById[id]) set.add(id);
  return set;
}
/** Turn one recipe on for the planner (used by other tools). */
export function enableRecipe(id) {
  const st = load(KEY, DEFAULTS);
  if (defaultRecipes().has(id)) st.off = st.off.filter((x) => x !== id);
  else if (!st.alts.includes(id)) st.alts.push(id);
  save(KEY, st);
}
/** Replace the planner's products (used by the milestone list). */
export function setTargets(targets) {
  const st = load(KEY, DEFAULTS);
  st.targets = targets;
  save(KEY, st);
}

const encode = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (t) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));

export default {
  id: "planner",
  title: "Production planner",
  short: "Production planner",
  tagline: "whole factories",
  group: "Planning",
  color: 0,
  blurb: "Plan one factory for several products. Shared parts are made on one line each, raw materials are tallied, and every line's output is rationed between its consumers with a splitter plan.",
  workspace: true,
  mount(view, args, params) {
    let st = load(KEY, DEFAULTS);
    if (params.get("p")) {
      try {
        const p = decode(params.get("p"));
        st = { ...DEFAULTS, ...p, tab: st.tab };
        save(KEY, st);
        toast("Loaded the shared plan.");
      } catch (e) { toast("That plan link is damaged."); }
      history.replaceState(null, "", "#/planner");
    }
    const persist = () => save(KEY, st);
    const out = h("div", { class: "ws-results" });
    const stage = h("div", { class: "ws-stage" });
    let chart = null; // the diagram's API, for "show in diagram" from the side panel
    let timer;
    const update = () => { persist(); clearTimeout(timer); timer = setTimeout(run, 120); };

    const recCount = h("span", { class: "tiny" });
    const dialog = recipeDialog(st, () => { recCount.textContent = summary(); update(); });
    const summary = () => {
      const alts = st.alts.filter((id) => recipeById[id]?.alt).length;
      return `${alts} alternate${alts === 1 ? "" : "s"} on` + (st.off.length ? `, ${st.off.length} standard off` : "") + (st.alts.some((id) => isConversion(recipeById[id] ?? {})) ? ", converter recipes on" : "");
    };
    recCount.textContent = summary();

    const panel = (title, ...kids) => h("section", { class: "panel" }, h("h2", { text: title }), kids);
    view.append(h("div", { class: "ws-side" },
        toolHead(this),
        panel("Products", h("p", { class: "tiny", text: "What leaves the factory, per minute." }),
          itemRows(st.targets, update, { placeholder: "Add product", emptyText: "Add at least one product." })),
        panel("Inputs you already have",
          h("p", { class: "tiny", text: "Parts or ores arriving from elsewhere. They're used before anything is made; leave the rate empty for as much as needed. An input of an ore also caps how much of it the plan may use." }),
          itemRows(st.inputs, update, { kind: "all", placeholder: "Add input", allowEmptyRate: true })),
        panel("Options",
          h("label", { class: "fl" }, "Optimise for", seg(Object.entries(OBJECTIVES).map(([value, label]) => ({ value, label: label.replace(/^(Fewest|Least) /, "") })), st.objective, (v) => { st.objective = v; update(); }, { wide: true, label: "Optimise for" })),
          select("Highest clock speed", [1, 1.5, 2, 2.5].map((c) => ({ value: c, label: pct(c, 0) + (c > 1 ? ` (${(c - 1) / 0.5} shard${c > 1.5 ? "s" : ""} each)` : " (no Power Shards)") })), st.maxClock, (v) => { st.maxClock = Number(v); update(); }),
          h("div", { class: "row" }, h("button", { class: "btn", type: "button", text: "Recipes…", on: { click: () => dialog.showModal() } }), recCount),
          h("div", { class: "row" },
            h("button", { class: "btn ghost small", type: "button", text: "Copy link to this plan", on: { click: copyLink } }),
            h("button", { class: "btn ghost small", type: "button", text: "Start over", on: { click: reset } }))),
        out),
      stage, dialog);

    function copyLink() {
      const { tab, ...p } = st;
      const url = location.href.split("#")[0] + "#/planner?p=" + encode(p);
      navigator.clipboard?.writeText(url).then(() => toast("Link copied."), () => prompt("Copy this link:", url));
    }
    const self = this;
    function reset() {
      st = structuredClone(DEFAULTS);
      persist();
      clear(view);
      self.mount(view, [], new URLSearchParams());
    }

    function run() {
      clear(out);
      clear(stage);
      chart = null;
      const res = plan({ targets: st.targets.filter((t) => t.item && t.rate > 0), inputs: st.inputs.filter((t) => t.item), recipes: recipeSet(st), objective: st.objective, maxClock: st.maxClock });
      if (res.status === "empty") {
        stage.append(h("div", { class: "ws-empty", text: "Add a product and a rate to see the factory." }));
        return;
      }
      if (res.status !== "ok") {
        const fix = res.suggest?.length ? h("div", { class: "row" }, res.suggest.map((r) => h("button", { class: "btn small", type: "button", text: "Turn on " + r.name, on: { click: () => { st.alts.push(r.id); recCount.textContent = summary(); update(); } } }))) : null;
        out.append(panel("No plan", h("p", { class: "note bad", text: res.message }), fix));
        stage.append(h("div", { class: "ws-empty" }, h("p", { class: "note bad", text: res.message })));
        return;
      }
      const show = (id) => chart?.focus(id);
      out.append(results(res, st, (tab) => { st.tab = tab; persist(); }, show));
      stage.append(diagram(res, st, persist, (c) => (chart = c)));
    }
    run();
  },
};

function summaryStats(res) {
  const built = res.lines.reduce((t, L) => t + L.built, 0);
  const raw = res.raw.filter((r) => r.kind === "raw" && !items[r.item].liquid).reduce((t, r) => t + r.rate, 0);
  const fluids = res.raw.filter((r) => r.kind === "raw" && items[r.item].liquid).reduce((t, r) => t + r.rate, 0);
  return h("div", { class: "stats" },
    stat(mw(res.power), "power, as built", true),
    stat(fmt(built, 0), `machines on ${res.lines.length} line${res.lines.length === 1 ? "" : "s"}`),
    stat(fmt(raw, 1) + "/min", "solid resources"),
    fluids ? stat(fmt(fluids, 1) + " m³/min", "fluids (incl. water)") : null);
}

function results(res, st, setTab, find) {
  const panes = {
    factory: () => factory(res, find),
    sources: () => sources(res, find),
    totals: () => totals(res),
  };
  const body = h("div", { class: "stack" });
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const show = (k) => {
    if (!panes[k]) k = "factory";
    setTab(k);
    tabs.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.k === k)));
    clear(body).append(panes[k]());
  };
  for (const [k, label] of [["factory", "Lines"], ["sources", "Sources"], ["totals", "Totals"]]) {
    tabs.append(h("button", { class: "tab", type: "button", role: "tab", "data-k": k, text: label, on: { click: () => show(k) } }));
  }
  const c = h("section", { class: "panel" }, h("h2", { text: "Factory" }), summaryStats(res), tabs, body);
  show(st.tab);
  return c;
}

// The factory as a flowchart filling the stage, PrereqFlow style.
const MAX_MACHINE_CARDS = 600;
function diagram(res, st, persist, setChart) {
  const machines = res.lines.reduce((t, L) => t + L.built, 0);
  const tooMany = machines > MAX_MACHINE_CARDS;
  const holder = h("div", { class: "ws-holder" });
  const draw = () => {
    const toolbar = h("div", { class: "ws-tool" },
      seg([{ value: "machines", label: `Each machine (${fmt(machines, 0)})` }, { value: "lines", label: `Lines (${res.lines.length})` }], st.view, (v) => { st.view = v; persist(); draw(); }, { label: "Show" }));
    const fc = factoryDiagram(res, { perMachine: st.view !== "lines" && !tooMany, stage: true, toolbar });
    setChart(fc.chart);
    holder.replaceChildren(
      tooMany && st.view !== "lines" ? h("p", { class: "note warn ws-banner", text: `${fmt(machines, 0)} machines are too many to draw one by one, so each line is one card.` }) : "",
      fc);
  };
  draw();
  return holder;
}

const consumerName = (c) => (c.kind === "line" ? c.line.recipe.name + " line" : c.kind === "target" ? "Product (leaves the factory)" : "Surplus (sink or store it)");
const producerName = (p, item) => (p.kind === "line" ? p.line.recipe.name + " line" : p.kind === "input" ? "your input" : itemName(item) + " (extracted)");

function factory(res, show) {
  return h("div", { class: "stack" },
    h("p", { class: "tiny", text: "Production lines, from raw materials to products. \"Show\" finds a line's machines in the diagram; a split's \"build\" opens its exact splitters and mergers." }),
    h("div", { class: "lines" }, res.lines.map((L, i) => line(L, res, i % 8, show))));
}

function sources(res, show) {
  const ext = (r) => {
    if (r.kind !== "raw") return "your input";
    if (r.item === "Water") return `${Math.ceil(r.rate / 120 - 1e-9)} Water Extractors`;
    if (r.item === "LiquidOil") return `${Math.ceil(r.rate / 120 - 1e-9)} Oil Extractors (normal)`;
    if (r.item === "NitrogenGas") return `${Math.ceil(r.rate / 60 - 1e-9)} well extractors (normal)`;
    if (D.extractors.MinerMk3.res.includes(r.item)) return `${Math.ceil(r.rate / 240 - 1e-9)} Miner Mk.3 at 100% (normal)`;
    return "gathered by hand or from power plants";
  };
  return h("div", { class: "lines" }, res.raw.map((r) => {
    const c = carrier(r.item, r.rate);
    return h("article", { class: "line cc2" },
      h("header", null, h("b", null, itemLink(r.item)), h("span", { text: rate(r.item, r.rate) }), h("span", { class: "spacer" }),
        h("button", { class: "linkish", type: "button", text: "show", on: { click: () => show("src:" + r.item) } })),
      h("p", { class: "tiny", text: `${c.count > 1 ? c.count + " × " : ""}${c.name} · ${ext(r)}` }),
      h("ul", { class: "feeds" }, distribution(res, r.item).map((x) => h("li", null, `→ ${consumerName(x)}: ${fmt(x.rate)} (${fmt(x.share * 100, 1)}%)`))));
  }));
}

function line(L, res, ci, show) {
  const b = buildings[L.recipe.b];
  const ins = L.in.map(([it, n]) => {
    const from = res.balance.get(it).producers;
    const total = from.reduce((t, p) => t + p.rate, 0);
    return h("li", null, h("span", { class: "r", text: rate(it, n) }), itemLink(it),
      h("span", { class: "s", text: "from " + from.map((p) => producerName(p, it) + (from.length > 1 ? ` ${fmt((p.rate / total) * 100, 0)}%` : "")).join(", ") }));
  });
  const outs = L.out.map(([it, n]) => {
    const cons = distribution(res, it);
    const mine = n / res.balance.get(it).made;
    const c = carrier(it, n);
    return h("li", { class: "stack" },
      h("div", null, h("span", { class: "r", text: rate(it, n) }), " ", itemLink(it), h("span", { class: "s", text: ` · ${c.count > 1 ? c.count + " × " : ""}${c.name}` })),
      cons.length > 1 ? h("div", { class: "share", role: "img", "aria-label": cons.map((x) => `${consumerName(x)} ${fmt(x.share * 100, 1)}%`).join(", ") },
        cons.map((x, i) => h("i", { vars: { width: (x.share * 100).toFixed(3) + "%", "--c": `var(--c${(ci + i + 1) % 8})` } }))) : null,
      h("ul", null, cons.map((x) => h("li", null, h("span", { class: "s", text: "→" }), consumerName(x), h("span", { class: "r", text: fmt(x.rate * mine) }), h("span", { class: "s", text: fmt(x.share * 100, 1) + "%" })))),
      cons.length > 1 || res.balance.get(it).producers.length > 1 ? h("button", { class: "linkish", type: "button", text: "build this split ›", on: { click: () => show("bal:" + it) } }) : null);
  });
  return h("article", { class: "line cc" + ci },
    h("header", null, h("b", { text: L.recipe.name }), L.recipe.alt ? h("span", { class: "tag alt", text: "alternate" }) : null,
      h("span", { text: `${L.built} × ${b.name} at ${pct(L.clock)}` }),
      Math.abs(L.exact - L.built) > 1e-6 ? h("span", { class: "dim", text: `(${fmt(L.exact, 3)} at 100%)` }) : null,
      h("span", { class: "spacer" }), h("span", { text: mw(L.power) }),
      h("button", { class: "linkish", type: "button", text: "show", on: { click: () => show(`m:${L.recipe.id}:0`) } })),
    h("div", { class: "flowgrid" },
      h("div", null, h("h4", { text: "In" }), h("ul", null, ins)),
      h("div", null, h("h4", { text: "Out" }), h("ul", null, outs))));
}

function totals(res) {
  const by = Object.entries(res.machines).map(([b, n]) => ({ b, n, power: res.lines.filter((L) => L.recipe.b === b).reduce((t, L) => t + L.power, 0) }));
  const surplus = [...res.balance.values()].flatMap((e) => e.consumers.filter((c) => c.kind === "surplus").map((c) => ({ item: e.item, rate: c.rate })));
  return h("div", { class: "stack" },
    table([
      { head: "Building", cell: (r) => buildings[r.b].name },
      { head: "Count", n: true, cell: (r) => String(r.n) },
      { head: "Power", n: true, cell: (r) => mw(r.power) },
    ], by.sort((a, b) => b.power - a.power)),
    surplus.length ? h("div", { class: "note warn" }, h("b", { text: "Surplus: " }), surplus.map((x, i) => [i ? ", " : "", itemLink(x.item), " " + rate(x.item, x.rate)]),
      ". Sink it, store it, or add a product that uses it.") : h("p", { class: "tiny", text: "No surplus: every byproduct is used." }),
    h("p", { class: "tiny", text: "Power counts the production machines as built (rounded up and underclocked), not the miners and extractors." }));
}

function recipeDialog(st, onChange) {
  const multi = new Map();
  for (const r of recipes) for (const [o] of r.out.slice(0, 1)) (multi.get(o) ?? multi.set(o, []).get(o)).push(r);
  const groups = [...multi].filter(([, rs]) => rs.length > 1 || rs.some((r) => r.alt)).sort((a, b) => itemName(a[0]).localeCompare(itemName(b[0])));
  const body = h("div", { class: "dbody" });
  const filter = h("input", { class: "ctl", type: "search", placeholder: "Filter by item or recipe…", "aria-label": "Filter recipes" });
  const isOn = (r) => (defaultRecipes().has(r.id) ? !st.off.includes(r.id) : st.alts.includes(r.id));
  const set = (r, on) => {
    if (defaultRecipes().has(r.id)) st.off = on ? st.off.filter((x) => x !== r.id) : [...new Set([...st.off, r.id])];
    else st.alts = on ? [...new Set([...st.alts, r.id])] : st.alts.filter((x) => x !== r.id);
    onChange();
  };
  function draw() {
    const q = filter.value.trim().toLowerCase();
    clear(body).append(filter);
    for (const [it, rs] of groups) {
      if (q && !itemName(it).toLowerCase().includes(q) && !rs.some((r) => r.name.toLowerCase().includes(q))) continue;
      body.append(h("div", { class: "recgroup" }, h("h4", { text: itemName(it) }), rs.map((r) =>
        h("label", null, h("input", { type: "checkbox", checked: isOn(r), on: { change: (e) => set(r, e.target.checked) } }),
          r.name, r.alt ? h("span", { class: "tag alt", text: "alt" }) : isConversion(r) ? h("span", { class: "tag", text: "converter" }) : null,
          h("i", { text: `${buildings[r.b].name}: ${r.in.map(([i, n]) => fmt(n * 60 / r.time, 1) + " " + itemName(i)).join(" + ") || "nothing"}` })))));
    }
  }
  filter.addEventListener("input", draw);
  const all = (on) => {
    st.alts = on ? recipes.filter((r) => r.alt).map((r) => r.id) : [];
    if (!on) st.off = [];
    onChange();
    draw();
  };
  const dlg = h("dialog", { class: "dialog", "aria-label": "Recipes" },
    h("header", null, h("h2", { text: "Recipes the planner may use" }), h("button", { class: "xbtn", type: "button", "aria-label": "Close", text: "×", on: { click: () => dlg.close() } })),
    body,
    h("footer", null, h("button", { class: "btn small", type: "button", text: "All alternates on", on: { click: () => all(true) } }),
      h("button", { class: "btn small", type: "button", text: "Standard recipes only", on: { click: () => all(false) } }),
      h("span", { class: "spacer" }), h("span", { class: "tiny", text: "Per-minute amounts are for one machine at 100%." }),
      h("button", { class: "btn primary", type: "button", text: "Done", on: { click: () => dlg.close() } })));
  draw();
  return dlg;
}

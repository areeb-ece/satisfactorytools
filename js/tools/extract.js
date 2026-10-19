// Miner & node calculator: miners, oil and water extractors, resource wells.
import { h, clear, load, save, num, seg, select, stat, table, card, toolHead } from "../ui.js";
import { itemName, isLiquid, fmt, pct, mw, BELTS, PIPES, PURITY } from "../lib/game.js";
import { EXTRACTORS, extractor, extraction, clockForCap, forTarget, well } from "../lib/extract.js";

const KEY = "extract";
const PUR = Object.keys(PURITY).map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }));

export default {
  id: "extract",
  title: "Miner & node calculator",
  short: "Miners & nodes",
  tagline: "nodes, wells, belts",
  group: "Machines",
  color: 5,
  blurb: "What a miner or extractor gives on each node purity and clock, which belt or pipe it needs, how fast it can run before the belt is full, and what a resource well makes.",
  mount(view) {
    const st = load(KEY, { kind: "MinerMk2", resource: "OreIron", purity: "normal", clock: 100, count: 1, target: 480, well: { impure: 2, normal: 2, pure: 1 }, wellClock: 100, wellRes: "NitrogenGas" });
    const persist = () => save(KEY, st);
    const out = h("div", { class: "stack" });
    const resBox = h("div");
    const wellOut = h("div", { class: "stack" });

    function drawRes() {
      const e = EXTRACTORS[st.kind];
      if (!e.res.includes(st.resource)) st.resource = e.res[0];
      resBox.replaceChildren(e.res.length > 1 ? select("Resource", e.res.map((r) => ({ value: r, label: itemName(r) })), st.resource, (v) => { st.resource = v; persist(); run(); }) : h("p", { class: "tiny", text: itemName(e.res[0]) }));
    }
    function run() {
      persist();
      clear(out);
      const e = EXTRACTORS[st.kind];
      const liquid = isLiquid(st.resource);
      const caps = liquid ? PIPES : BELTS;
      const x = extraction(st.kind, st.resource, st.purity, st.clock / 100, st.count);
      const u = liquid ? "m³/min" : "/min";
      out.append(card(`${st.count} × ${e.name} on ${e.purity ? st.purity + " " : ""}${itemName(st.resource)} at ${pct(st.clock / 100)}`,
        h("div", { class: "stats" },
          stat(fmt(x.total) + " " + u, "total", true),
          stat(fmt(x.rate) + " " + u, "each"),
          stat(mw(x.totalPower), "power"),
          stat(String(x.shards * st.count), "Power Shards"),
          stat((x.carrier.count > 1 ? x.carrier.count + " × " : "") + x.carrier.name, "per extractor's output")),
        table([
          { head: "Clock", n: true, cell: (c) => pct(c, 0) },
          ...Object.keys(PURITY).filter((p) => e.purity || p === "normal").map((p) => ({ head: e.purity ? p : "rate", n: true, cell: (c) => fmt(extractor(st.kind, p, c).rate) })),
          { head: "Power", n: true, cell: (c) => mw(extractor(st.kind, "normal", c).power) },
        ], [0.5, 1, 1.5, 2, 2.5]),
        h("p", { class: "tiny", text: "Fastest clock that still fits on each " + (liquid ? "pipe" : "belt") + ": " + caps.map((b) => `${b.name} ${pct(clockForCap(st.kind, st.purity, b.rate), 0)}`).join(" · ") }),
        (() => { const t = forTarget(st.kind, st.purity, st.target, st.clock / 100); return h("div", { class: "row" }, num(null, st.target, (v) => { st.target = v || 0; run(); }, { unit: u }), h("span", { text: `needs ${t.n} at ${pct(t.clock)} (clock capped at ${pct(st.clock / 100)})` })); })()));
    }
    function runWell() {
      persist();
      clear(wellOut);
      const w = well(st.well, st.wellClock / 100);
      wellOut.append(h("div", { class: "stats" },
        stat(fmt(w.rate) + " m³/min", itemName(st.wellRes), true),
        stat(mw(w.power), "Pressurizer power"),
        stat(String(w.count), "extractors"),
        stat(String(w.shards), "Power Shards")),
        h("p", { class: "tiny", text: `Each satellite node makes ${EXTRACTORS.FrackingExtractor.rate * 0.5} / ${EXTRACTORS.FrackingExtractor.rate} / ${EXTRACTORS.FrackingExtractor.rate * 2} m³/min (impure / normal / pure) at 100%. The Pressurizer's clock sets them all and is the only part that draws power.` }));
    }

    view.append(toolHead(this), h("div", { class: "tgrid" },
      h("div", { class: "stack" },
        card("Extractor",
          select("Building", Object.entries(EXTRACTORS).filter(([k]) => k !== "FrackingExtractor").map(([value, e]) => ({ value, label: e.name })), st.kind, (v) => { st.kind = v; drawRes(); run(); }),
          resBox,
          h("label", { class: "fl" }, "Node purity", seg(PUR, st.purity, (v) => { st.purity = v; run(); }, { wide: true })),
          h("div", { class: "two" },
            num("Clock", st.clock, (v) => { st.clock = Math.min(250, Math.max(1, v ?? 100)); run(); }, { unit: "%", min: 1, max: 250 }),
            num("How many", st.count, (v) => { st.count = Math.max(1, Math.round(v || 1)); run(); }, { min: 1, step: 1 }))),
        card("Resource well",
          select("Resource", EXTRACTORS.FrackingExtractor.res.map((r) => ({ value: r, label: itemName(r) })), st.wellRes, (v) => { st.wellRes = v; runWell(); }),
          h("div", { class: "three" }, ["impure", "normal", "pure"].map((p) => num(p[0].toUpperCase() + p.slice(1), st.well[p], (v) => { st.well[p] = Math.max(0, Math.round(v || 0)); runWell(); }, { min: 0, step: 1 }))),
          num("Pressurizer clock", st.wellClock, (v) => { st.wellClock = Math.min(250, Math.max(1, v ?? 100)); runWell(); }, { unit: "%", min: 1, max: 250 }),
          wellOut)),
      out));
    drawRes();
    run();
    runWell();
  },
};

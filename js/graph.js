// The planner's factory diagram: every machine as its own card, raw materials on the
// left, products and surplus on the right, and a splitter/merger card wherever an
// item's belts split or join. Pin a splitter card to see its exact build.
import { h, itemLink, table } from "./ui.js";
import { buildings, itemName, unit, fmt, pct, mw, carrier, isLiquid, perMinute, basePower, machinePower } from "./lib/game.js";
import { factoryGraph, ratioLabel, PLAN_TOL } from "./lib/factory.js";
import { toWeights } from "./lib/belts.js";
import { flowchart } from "./flowchart.js";
import { splitView } from "./splitview.js";

const belt = (item, rate) => { const c = carrier(item, rate); return (c.count > 1 ? c.count + " × " : "") + c.name; };

export function factoryDiagram(res, { perMachine = true, stage = false, toolbar = null } = {}) {
  const g = factoryGraph(res, { perMachine });
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const name = (n) => {
    if (n.kind === "machine") return n.line.recipe.name + (n.of > 1 ? ` #${n.index + 1}` : "");
    if (n.kind === "bal") return "splitter";
    return itemName(n.item);
  };
  const nodes = g.nodes.map((n) => {
    if (n.kind === "machine") {
      const L = n.line, b = buildings[L.recipe.b];
      const [it, r] = L.out[0];
      return { ...n, w: 196, h: 62, cc: n.li, title: L.recipe.name + (L.recipe.alt ? " ◆" : ""), tag: perMachine ? (n.of > 1 ? `${n.index + 1}/${n.of}` : "") : `×${n.count}`,
        sub: `${b.name} @ ${pct(L.clock)}`, note: `${fmt(r / n.of * (perMachine ? 1 : n.of), 2)} ${itemName(it)}/min` };
    }
    if (n.kind === "bal") {
      let ratio = "";
      try { if (!n.liquid) ratio = ratioLabel(toWeights(n.outs.map((o) => o.rate), PLAN_TOL).weights); } catch (e) { ratio = "too fine to build"; }
      const kind = n.liquid ? "Pipe junction" : n.ins.length > 1 && n.outs.length > 1 ? "Merge + split" : n.ins.length > 1 ? "Merger" : "Splitter";
      return { ...n, w: 200, h: Math.max(62, 16 + 9 * Math.max(n.ins.length, n.outs.length)), title: kind, tag: itemName(n.item),
        sub: `${n.ins.length} in → ${n.outs.length} out · ${fmt(n.total)}${isLiquid(n.item) ? " m³" : ""}/min`, note: n.liquid ? "fluids share by demand" : n.outs.length > 1 ? "ratio " + ratio : belt(n.item, n.total) };
    }
    const tag = n.kind === "src" ? (n.input ? "input" : "raw") : n.kind === "out" ? "product" : "surplus";
    return { ...n, w: 176, h: 52, title: itemName(n.item), tag, sub: `${fmt(n.rate)} ${unit(n.item)}`, note: n.kind === "extra" ? "sink or store" : belt(n.item, n.rate) };
  });
  const edges = g.edges.map((e) => ({ ...e, label: fmt(e.rate, 2), cls: isLiquid(e.item) ? "fluid" : "", title: `${itemName(e.item)}: ${fmt(e.rate, 3)} ${unit(e.item)}  (${name(byId.get(e.from))} → ${name(byId.get(e.to))})` }));

  const details = (n) => {
    if (n.kind === "machine") {
      const L = n.line, k = perMachine ? 1 : L.built, b = buildings[L.recipe.b];
      const pm = perMachine ? 1 / L.built : 1;
      return h("div", { class: "stack" },
        h("p", { class: "tiny", text: `${perMachine ? "One" : L.built} ${b.name}${perMachine ? "" : "s"} at ${pct(L.clock)} · ${mw(machinePower(basePower(L.recipe), L.clock) * k)}${L.recipe.alt ? " · alternate recipe" : ""}` }),
        table([
          { head: "", cell: (r) => r[0] },
          { head: "Item", cell: (r) => itemLink(r[1]) },
          { head: "Per minute", n: true, cell: (r) => fmt(r[2] * pm, 3) + " " + unit(r[1]) },
          { head: "Belt", cell: (r) => belt(r[1], r[2] * pm) },
        ], [...L.in.map(([i, r]) => ["in", i, r]), ...L.out.map(([i, r]) => ["out", i, r])]),
        h("p", { class: "tiny", text: `Recipe at 100%: ${perMinute(L.recipe).in.map(([i, r]) => fmt(r, 2) + " " + itemName(i)).join(" + ")} → ${perMinute(L.recipe).out.map(([i, r]) => fmt(r, 2) + " " + itemName(i)).join(" + ")} per minute.` }));
    }
    if (n.kind === "bal") {
      if (n.liquid) return h("p", { class: "note", text: "Fluids don't need a ratio: a pipe junction or manifold shares by demand, as long as the pipe carries the total." });
      const outs = n.outs.map((o) => ({ label: name(byId.get(o.id)), rate: o.rate }));
      const ins = n.ins.map((i) => ({ label: name(byId.get(i.id)), rate: i.rate }));
      return splitView(outs, n.item, { inputs: ins, tol: PLAN_TOL });
    }
    return h("p", { class: "tiny", text: `${fmt(n.rate, 3)} ${unit(n.item)} on ${belt(n.item, n.rate)}.` });
  };
  const swatch = (cls, label) => h("span", { class: "k" }, h("span", { class: cls }), label);
  return flowchart({ nodes, edges }, {
    details, labels: true, tall: true, stage, toolbar,
    wide: (n) => n.kind === "bal" && !n.liquid,
    legend: [swatch("sw bal", "splitter / merger"), swatch("ln dot", "fluid"), swatch("ln", "belt")],
  });
}

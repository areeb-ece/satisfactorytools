// Power plant planner.
import { h, clear, load, save, num, seg, select, stat, table, card, toolHead } from "../ui.js";
import { items, itemName, fmt, pct, mw, unit } from "../lib/game.js";
import { GENERATORS, forTarget, fromSupply, geothermal } from "../lib/power.js";

const KEY = "power";
const short = (name) => name.replace(/-Powered Generator$| Power Plant$/, "");
const FUELS = Object.entries(GENERATORS).flatMap(([gen, g]) => g.fuel.filter((f) => items[f]?.energy).map((fuel) => ({ value: gen + "|" + fuel, label: `${itemName(fuel)} → ${g.name}` })));

export default {
  id: "power",
  title: "Power plant planner",
  short: "Power plants",
  tagline: "generators and fuel",
  group: "Machines",
  color: 6,
  blurb: "How many generators of each kind a target needs, the fuel and water they burn, the Water Extractors to feed them and the nuclear waste they leave; or what a fuel supply will power.",
  mount(view) {
    const st = load(KEY, { mode: "target", target: 1500, clock: 100, use: "GeneratorFuel|LiquidFuel", supply: 120, geo: { impure: 0, normal: 0, pure: 0 } });
    const persist = () => save(KEY, st);
    const out = h("div", { class: "stack" });
    const inputs = h("div", { class: "stack" });
    const geoOut = h("div");

    function drawInputs() {
      clear(inputs);
      if (st.mode === "target") inputs.append(num("Power needed", st.target, (v) => { st.target = v || 0; run(); }, { unit: "MW" }));
      else {
        const [, fuel] = st.use.split("|");
        inputs.append(select("Fuel and generator", FUELS, st.use, (v) => { st.use = v; drawInputs(); run(); }),
          num("Fuel supply", st.supply, (v) => { st.supply = v || 0; run(); }, { unit: unit(fuel) }));
      }
      inputs.append(num("Generator clock", st.clock, (v) => { st.clock = Math.min(250, Math.max(1, v ?? 100)); run(); }, { unit: "%", min: 1, max: 250, hint: "Generators scale linearly: 250% makes 2.5× the power and burns 2.5× the fuel." }));
    }
    function run() {
      persist();
      clear(out);
      const c = st.clock / 100;
      if (st.mode === "target") {
        const rows = forTarget(st.target, c).sort((a, b) => a.n - b.n);
        out.append(card(`${mw(st.target)} from one kind of generator`, table([
          { head: "Generator", cell: (o) => short(GENERATORS[o.gen].name) },
          { head: "Fuel", cell: (o) => itemName(o.fuel) },
          { head: "Count", n: true, cell: (o) => String(o.n) },
          { head: "Clock", n: true, cell: (o) => pct(o.clock, 2) },
          { head: "Fuel", n: true, cell: (o) => fmt(o.fuelRate, 2) + " " + unit(o.fuel) },
          { head: "Water", n: true, cell: (o) => (o.water ? fmt(o.water) + " m³/min" : "") },
          { head: "Extractors", n: true, title: "Water Extractors at 100%", cell: (o) => (o.water ? String(o.extractors) : "") },
          { head: "Waste", n: true, cell: (o) => (o.waste ? fmt(o.waste.rate, 2) + " " + itemName(o.waste.item) + "/min" : "") },
        ], rows),
        h("p", { class: "tiny", text: "Counts are rounded up and the load spread evenly, so the clock shown is what each generator runs at to make exactly the target." })));
      } else {
        const [gen, fuel] = st.use.split("|");
        const r = fromSupply(gen, fuel, st.supply, c);
        out.append(card(`${fmt(st.supply)} ${unit(fuel)} of ${itemName(fuel)}`, h("div", { class: "stats" },
          stat(mw(r.mw), "power", true),
          stat(fmt(r.n, 2), `${GENERATORS[gen].name}s at ${pct(c, 0)}`),
          r.water ? stat(fmt(r.water) + " m³/min", `water (${r.extractors} extractors)`) : null,
          r.waste ? stat(fmt(r.waste.rate, 2) + "/min", itemName(r.waste.item)) : null)));
      }
    }
    function runGeo() {
      persist();
      const g = geothermal(st.geo);
      geoOut.replaceChildren(h("div", { class: "stats" }, stat(mw(g.mw), "average", true), stat(`${mw(g.low)}–${mw(g.high)}`, "swing over each minute")));
    }
    view.append(toolHead(this), h("div", { class: "tgrid" },
      h("div", { class: "stack" },
        card("Plan",
          seg([{ value: "target", label: "I need power" }, { value: "supply", label: "I have fuel" }], st.mode, (v) => { st.mode = v; drawInputs(); run(); }, { wide: true }),
          inputs),
        card("Geothermal",
          h("p", { class: "tiny", text: "No fuel: output depends on the geyser (impure 100, normal 200, pure 400 MW on average)." }),
          h("div", { class: "three" }, ["impure", "normal", "pure"].map((p) => num(p[0].toUpperCase() + p.slice(1), st.geo[p], (v) => { st.geo[p] = Math.max(0, Math.round(v || 0)); runGeo(); }, { min: 0, step: 1 }))),
          geoOut)),
      out));
    drawInputs();
    run();
    runGeo();
  },
};

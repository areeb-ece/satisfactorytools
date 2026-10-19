// Alternate recipe comparer.
import { h, clear, load, save, num, seg, itemPicker, itemLink, table, card, toolHead, toast } from "../ui.js";
import { itemName, buildings, fmt, mw, unit, defaultRecipes, recipesMaking } from "../lib/game.js";
import { compare } from "../lib/compare.js";
import { recipeSet, enableRecipe, DEFAULTS as PLANNER } from "./planner.js";

const KEY = "compare";

export default {
  id: "compare",
  title: "Alternate recipe comparer",
  short: "Alternate recipes",
  tagline: "is it worth it?",
  group: "Planning",
  color: 3,
  blurb: "Pick an item and see every recipe that makes it, each planned all the way back to raw resources: what it costs per unit, the power and machines it takes, and what's left over.",
  mount(view, args) {
    const st = load(KEY, { item: "Computer", rate: 10, base: "standard" });
    if (args[0]) st.item = args[0];
    const out = h("div", { class: "stack" });
    const run = () => {
      save(KEY, st);
      clear(out);
      if (!st.item || !recipesMaking(st.item).length) return out.append(card(null, h("p", { class: "empty-note", text: "Pick an item that a machine makes." })));
      const base = st.base === "planner" ? recipeSet(load("planner", PLANNER)) : defaultRecipes();
      const rows = compare(st.item, base, st.rate || 1).sort((a, b) => (a.ok === b.ok ? (a.rawTotal ?? 0) - (b.rawTotal ?? 0) : a.ok ? -1 : 1));
      const ok = rows.filter((r) => r.ok);
      const best = (k) => Math.min(...ok.map((r) => r[k]));
      const resKeys = [...new Set(ok.flatMap((r) => Object.keys(r.raw)))].filter((k) => k !== "Water");
      const per = st.rate || 1;
      out.append(card(`${itemName(st.item)} · ${rows.length} recipe${rows.length === 1 ? "" : "s"}`,
        h("p", { class: "tiny", text: `Each recipe is planned for ${fmt(per)} ${unit(st.item)}, using ${st.base === "planner" ? "the planner's recipes" : "standard recipes"} for every other part. Raw figures are per unit made; power, machines and leftovers are for the whole plan. The best value in each column is marked.` }),
        table([
          { head: "Recipe", cell: (r) => [r.recipe.name, " ", r.recipe.alt ? h("span", { class: "tag alt", text: "alt" }) : "", h("div", { class: "tiny", text: buildings[r.recipe.b].name })] },
          { head: "Raw / unit", n: true, title: "Solid and fluid resources per unit, water left out", cell: (r) => (r.ok ? h("span", { class: r.rawTotal === best("rawTotal") ? "good" : null, text: fmt(r.rawTotal, 3) }) : "—") },
          ...resKeys.map((k) => ({ head: itemName(k), n: true, cell: (r) => (r.ok && r.raw[k] ? fmt(r.raw[k], 3) : "") })),
          { head: "Water / unit", n: true, cell: (r) => (r.ok && r.water ? fmt(r.water, 2) : "") },
          { head: "Power", n: true, cell: (r) => (r.ok ? h("span", { class: r.power === best("power") ? "good" : null, text: mw(r.power) }) : "") },
          { head: "Machines", n: true, title: "At 100%, whole chain", cell: (r) => (r.ok ? h("span", { class: r.machines === best("machines") ? "good" : null, text: fmt(r.machines, 1) }) : "") },
          { head: `Left over at ${fmt(st.rate || 1)}/min`, cell: (r) => (r.ok ? h("ul", null, r.byproducts.map((b) => h("li", null, fmt(b.rate, 1) + " ", itemLink(b.item)))) : h("span", { class: "bad", text: r.message })) },
          { head: "", cell: (r) => h("button", { class: "btn small ghost", type: "button", text: "Use in planner", on: { click: () => { enableRecipe(r.recipe.id); toast(r.recipe.name + " is on in the planner."); } } }) },
        ], rows)));
    };
    view.append(toolHead(this), card("Compare",
      h("div", { class: "two" },
        h("label", { class: "fl" }, "Item", itemPicker(st.item, (id) => { st.item = id; run(); })),
        num("Rate", st.rate, (v) => { st.rate = v || 1; run(); }, { unit: "/min", min: 0.01 })),
      h("label", { class: "fl" }, "Everything else uses", seg([{ value: "standard", label: "Standard recipes" }, { value: "planner", label: "Planner's recipes" }], st.base, (v) => { st.base = v; run(); }, { wide: true }))), out);
    run();
  },
};

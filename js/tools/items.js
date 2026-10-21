// Recipe and item browser: every item, what makes it and what it goes into.
import { h, clear, itemLink, table, card, toolHead, btn } from "../ui.js";
import { items, buildings, itemName, fmt, unit, perMinute, basePower, recipesMaking, recipesUsing, mw, D } from "../lib/game.js";
import { enableRecipe } from "./planner.js";
import { toast } from "../ui.js";

const ids = Object.keys(items).sort((a, b) => itemName(a).localeCompare(itemName(b)));

export default {
  id: "items",
  title: "Recipes & items",
  tagline: "look anything up",
  group: "Planning",
  color: 1,
  blurb: "Every item in the game: what makes it, what it goes into, standard and alternate recipes side by side with per-minute rates, plus stack size, sink points and fuel value.",
  mount(view, args) {
    let sel = items[args[0]] ? args[0] : "IronPlate";
    const list = h("div", { class: "ilist", role: "list", "aria-label": "Items" });
    const q = h("input", { class: "sd-input ctl", type: "search", placeholder: "Search items…", "aria-label": "Search items", autocomplete: "off" });
    const count = h("p", { class: "sd-hint tiny count", "aria-live": "polite" });
    const detail = h("div", { class: "stack" });
    function drawList() {
      const t = q.value.trim().toLowerCase();
      clear(list);
      let n = 0;
      for (const id of ids) {
        if (t && !itemName(id).toLowerCase().includes(t)) continue;
        n++;
        const k = recipesMaking(id).length;
        list.append(h("button", { type: "button", role: "listitem", "aria-current": String(id === sel), on: { click: () => (location.hash = "#/items/" + id) } },
          h("span", { text: itemName(id) }), h("i", { text: k ? k + " recipe" + (k > 1 ? "s" : "") : D.resources.includes(id) ? "resource" : "gathered" })));
      }
      count.textContent = t ? (n ? "Enter opens the first." : `No item matches “${q.value.trim()}”.`) : "";
    }
    q.addEventListener("input", drawList);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") list.querySelector("button")?.click(); });
    drawList();
    view.append(toolHead(this), h("div", { class: "tgrid browse" }, card("Items", q, count, list), detail));
    detail.append(...itemDetail(sel));
    list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  },
};

function recipeRows(rs, item) {
  return table([
    { head: "Recipe", cell: (r) => h("div", { class: "rname" }, h("span", null, r.name, " ", r.alt ? h("span", { class: "sd-tag tag alt", text: "alternate" }) : ""),
      btn("Use in planner", () => { enableRecipe(r.id); toast(r.name + " is on in the planner."); }, { small: true, kind: "ghost", ico: "plus", title: "Turn this recipe on in the production planner", label: "Use " + r.name + " in the planner" })) },
    { head: "Building", cell: (r) => buildings[r.b].name },
    { head: "In, per minute", cell: (r) => h("ul", null, perMinute(r).in.map(([i, n]) => h("li", null, fmt(n) + " ", itemLink(i)))) },
    { head: "Out, per minute", cell: (r) => h("ul", null, perMinute(r).out.map(([i, n]) => h("li", { class: i === item ? "good" : null }, fmt(n) + " ", itemLink(i)))) },
    { head: "Cycle", n: true, cell: (r) => fmt(r.time) + " s" },
    { head: "Power", n: true, cell: (r) => (r.pw ? `${r.pw[0]}–${r.pw[1]} MW` : mw(basePower(r))) },
  ], rs.sort((a, b) => a.alt - b.alt || a.name.localeCompare(b.name)));
}

function itemDetail(id) {
  const it = items[id];
  const make = recipesMaking(id), use = recipesUsing(id);
  const facts = [
    ["Stack size", it.liquid ? "fluid (pipes and tanks)" : String(it.stack)],
    ["Sink points", it.sink && !it.liquid ? fmt(it.sink) : it.liquid ? "can't be sunk as a fluid" : "can't be sunk"],
    it.energy ? ["Energy", fmt(it.energy) + (it.liquid ? " MJ per m³" : " MJ")] : null,
    D.resources.includes(id) ? ["Source", "extracted from resource nodes"] : D.gathered.includes(id) ? ["Source", "gathered or left over by power plants"] : null,
  ].filter(Boolean);
  return [
    card(null, h("h2", { class: "item-name", text: itemName(id) }), h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })]))),
    card("Made by", make.length ? recipeRows(make, id) : h("p", { class: "sd-hint tiny", text: "Nothing makes this; it comes from the world." })),
    card("Used in", use.length ? recipeRows(use, null) : h("p", { class: "sd-hint tiny", text: "No machine recipe uses this " + (it.energy ? "(it's a fuel)." : ".") })),
    h("p", { class: "sd-hint tiny", text: "Rates are for one machine at 100% clock. " + (it.liquid ? "Fluids are in " + unit(id) + "." : "") }),
  ];
}

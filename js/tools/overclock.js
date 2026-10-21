// Overclock & Somersloop calculator for one recipe.
import { h, clear, load, save, num, select, itemPicker, recipePicker, rate, stat, table, card, toolHead, field, fold } from "../ui.js";
import { recipeById, buildings, itemName, fmt, pct, mw, unit, MAX_CLOCK, shardsFor } from "../lib/game.js";
import { baseRate, machineAt, layouts, fillLast } from "../lib/machines.js";

const KEY = "overclock";

export default {
  id: "overclock",
  title: "Overclock & Somersloop calculator",
  short: "Overclocking",
  tagline: "clocks, shards, sloops",
  group: "Machines",
  color: 2,
  blurb: "For one recipe: how many machines at what clock reach a target rate, how many Power Shards and Somersloops that takes, and the power each layout draws.",
  mount(view) {
    const st = load(KEY, { item: "Motor", recipe: "Motor", target: 30, sloops: 0, clock: 100 });
    const out = h("div", { class: "stack" });
    const one = h("div", { class: "stack" });
    const pickBox = h("div", { class: "pick" });
    const sloopBox = h("div");
    const persist = () => save(KEY, st);

    function drawPick() {
      pickBox.replaceChildren(field("Recipe", recipePicker(st.item, st.recipe, (id) => { st.recipe = id; persist(); drawSloops(); run(); })));
      drawSloops();
    }
    function drawSloops() {
      const r = recipeById[st.recipe];
      const slots = r ? buildings[r.b].sloops : 0;
      if (st.sloops > slots) st.sloops = slots;
      sloopBox.replaceChildren(slots
        ? select("Somersloops per machine", Array.from({ length: slots + 1 }, (_, i) => ({ value: i, label: i + " of " + slots + (i ? ` (×${fmt(1 + i / slots, 2)} output)` : "") })), st.sloops, (v) => { st.sloops = Number(v); persist(); run(); })
        : h("p", { class: "sd-hint tiny", text: r ? buildings[r.b].name + "s can't be amplified." : "" }));
    }

    function run() {
      const wasOpen = one.querySelector("details")?.open;
      clear(out); clear(one);
      const r = recipeById[st.recipe];
      if (!r || !r.out.some(([o]) => o === st.item)) return;
      const b = buildings[r.b];
      const per = baseRate(r, st.item, st.sloops);
      const rows = layouts(r, st.item, st.target, { sloops: st.sloops });
      const fl = fillLast(r, st.item, st.target, st.sloops);
      if (!rows.length) return out.append(card(`${fmt(st.target)} ${unit(st.item)} of ${itemName(st.item)}`, h("div", { class: "empty" }, h("b", { text: "No layouts to show" }), h("p", { text: "Give a target above 0 per minute." }))));
      out.append(card(`${fmt(st.target)} ${unit(st.item)} of ${itemName(st.item)}`,
        h("p", { class: "sd-hint tiny", text: `One ${b.name} makes ${rate(st.item, per)} at 100%${st.sloops ? ` with ${st.sloops} Somersloop${st.sloops > 1 ? "s" : ""}` : ""}. Fewer machines need shards; more machines at lower clocks draw less power in total.` }),
        table([
          { head: "Machines", n: true, cell: (o) => String(o.n) },
          { head: "Clock each", n: true, cell: (o) => pct(o.clock, 4) },
          { head: "Shards", n: true, cell: (o) => (o.shards ? `${o.shards} (${o.perMachine.shards} each)` : "none") },
          { head: "Somersloops", n: true, cell: (o) => (o.sloops ? String(o.sloops) : "") },
          { head: "Power", n: true, cell: (o) => mw(o.power) },
          { head: "Inputs", cell: (o) => o.perMachine.in.map(([i, n]) => fmt(n * o.n) + " " + itemName(i)).join(", ") },
        ], rows, { rowClass: (o) => (Math.abs(o.clock - 1) < 1e-9 ? "sel" : null) }),
        rows.some((o) => Math.abs(o.clock - 1) < 1e-9) ? h("p", { class: "sd-hint tiny", text: "The highlighted row runs every machine at 100%: no Power Shards." }) : null,
        fl && fl.lastClock ? h("p", { class: "sd-hint tiny", text: `Or ${fl.full} at 100% and one at ${pct(fl.lastClock, 4)}: ${mw(fl.power)}.` }) : null));

      // A single machine at a chosen clock.
      const m = machineAt(r, st.clock / 100, st.sloops);
      one.append(fold("One machine at a set clock", wasOpen ?? st.clock !== 100, "clock " + fmt(st.clock) + "%",
        num("Clock speed", st.clock, (v) => { st.clock = Math.min(250, Math.max(1, v ?? 100)); persist(); run(); }, { unit: "%", min: 1, max: 250, step: "any" }),
        h("div", { class: "stats" },
          stat(mw(m.power), "power", true),
          stat(String(shardsFor(m.clock)), "Power Shards"),
          ...m.out.map(([i, n]) => stat(fmt(n, 3), itemName(i) + " " + unit(i)))),
        h("p", { class: "sd-hint tiny", text: "Uses " + m.in.map(([i, n]) => fmt(n, 3) + " " + itemName(i) + " " + unit(i)).join(", ") + ". Somersloops multiply the output, not the inputs, and square the power multiplier." })));
    }

    view.append(toolHead(this), h("div", { class: "tgrid" },
      h("div", { class: "stack" },
        card("Recipe",
          field("Product", itemPicker(st.item, (id) => { st.item = id; persist(); drawPick(); run(); })),
          pickBox,
          num("Target", st.target, (v) => { st.target = v || 0; persist(); run(); }, { unit: "/min" }),
          sloopBox,
          h("p", { class: "sd-hint tiny", text: `Clock range 1–${pct(MAX_CLOCK, 0)}. Each Power Shard adds 50% above 100%. Power grows with clock^1.32: double speed costs 2.5× the power.` })),
        h("section", { class: "card tune" }, one)),
      out));
    drawPick();
    run();
  },
};

// Milestone shopping list: tick off what's done, see the parts still to deliver.
import { h, clear, load, save, num, select, itemLink, table, card, toolHead, toast } from "../ui.js";
import { itemName, fmt, recipesMaking } from "../lib/game.js";
import { MILESTONES, ELEVATOR, ELEVATOR_COST, totals } from "../lib/milestones.js";
import { setTargets } from "./planner.js";

const KEY = "milestones";

export default {
  id: "milestones",
  title: "Milestone shopping list",
  short: "Milestones",
  tagline: "HUB and Space Elevator",
  group: "Planning",
  color: 4,
  blurb: "Tick off HUB milestones and Space Elevator phases as you finish them and get the total parts still to deliver. Send the list to the planner to build it in a set time.",
  mount(view) {
    const st = load(KEY, { done: [], skip: [], cost: 1, minutes: 60 });
    const done = new Set(st.done), skip = new Set(st.skip);
    const out = h("div", { class: "stack" });
    const persist = () => { st.done = [...done]; st.skip = [...skip]; save(KEY, st); };
    const all = [...MILESTONES.map((m) => m.id), ...ELEVATOR.map((p) => "phase:" + p.phase)];
    const todo = () => new Set(all.filter((id) => !done.has(id) && !skip.has(id)));

    function entry(id, name, cost, mult = 1) {
      const row = h("div", { class: "ms" + (done.has(id) ? " done" : "") });
      const box = h("input", { type: "checkbox", id: "ms-" + id, checked: done.has(id), on: { change: () => { box.checked ? done.add(id) : done.delete(id); row.classList.toggle("done", box.checked); persist(); draw(); } } });
      row.append(box, h("label", { for: "ms-" + id, text: name }),
        h("span", { text: cost.map(([i, n]) => fmt(Math.ceil(n * mult), 0) + " " + itemName(i)).join(" · ") }));
      return row;
    }
    const tiers = h("div", { class: "tiers" });
    function drawTiers() {
      clear(tiers);
      const byTier = new Map();
      for (const m of MILESTONES) (byTier.get(m.tier) ?? byTier.set(m.tier, []).get(m.tier)).push(m);
      for (const [t, ms] of byTier) {
        const allDone = ms.every((m) => done.has(m.id));
        tiers.append(h("section", { class: "tier" },
          h("h3", null, t === 0 ? "Onboarding (HUB upgrades)" : "Tier " + t,
            h("button", { class: "linkish", type: "button", text: allDone ? "untick all" : "tick all", on: { click: () => { ms.forEach((m) => (allDone ? done.delete(m.id) : done.add(m.id))); persist(); drawTiers(); draw(); } } })),
          ms.map((m) => entry(m.id, m.name, m.cost))));
      }
      tiers.append(h("section", { class: "tier" }, h("h3", { text: "Space Elevator" }),
        ELEVATOR.map((p) => entry("phase:" + p.phase, `Phase ${p.phase}: ${p.name} (unlocks ${p.unlocks})`, p.cost, st.cost))));
    }

    function draw() {
      clear(out);
      const list = totals(todo(), st.cost);
      const left = todo().size;
      if (!list.length) return out.append(card("Still to deliver", h("p", { class: "empty-note", text: "Nothing left: every milestone and phase is ticked." })));
      out.append(card(`Still to deliver · ${left} left`,
        table([
          { head: "Part", cell: (r) => itemLink(r.item) },
          { head: "Amount", n: true, cell: (r) => fmt(r.amount, 0) },
          { head: `Per minute over ${fmt(st.minutes, 0)} min`, n: true, cell: (r) => fmt(r.amount / st.minutes, 2) },
        ], list),
        h("div", { class: "row" },
          num(null, st.minutes, (v) => { st.minutes = v || 60; persist(); draw(); }, { unit: "minutes", min: 1 }),
          h("button", { class: "btn primary", type: "button", text: "Plan this in the planner", on: { click: () => {
            setTargets(list.filter((r) => recipesMaking(r.item).length).map((r) => ({ item: r.item, rate: Math.round((r.amount / st.minutes) * 1000) / 1000 })));
            toast("Sent to the planner.");
            location.hash = "#/planner";
          } } }))));
    }
    view.append(toolHead(this), h("div", { class: "tgrid" },
      h("div", { class: "stack" },
        card("Settings",
          select("Space Elevator cost (Game Mode)", ELEVATOR_COST.map((c) => ({ value: c, label: c + "×" + (c === 1 ? " (default)" : "") })), st.cost, (v) => { st.cost = Number(v); persist(); drawTiers(); draw(); }),
          h("p", { class: "tiny", text: "Game Modes (1.2) can scale the Space Elevator deliveries. HUB milestones use the amounts shown." }),
          h("button", { class: "btn small ghost", type: "button", text: "Untick everything", on: { click: () => { done.clear(); persist(); drawTiers(); draw(); } } })),
        out),
      card("Milestones", tiers)));
    drawTiers();
    draw();
  },
};

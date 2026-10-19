// AWESOME Sink calculator.
import { h, clear, load, save, num, itemRows, itemLink, stat, table, card, toolHead } from "../ui.js";
import { itemName, fmt } from "../lib/game.js";
import { couponCost, pointsPerMinute, schedule, couponsPerHour, ranking } from "../lib/sink.js";

const KEY = "sink";
const time = (m) => (!isFinite(m) ? "never" : m < 1 ? fmt(m * 60, 0) + " s" : m < 120 ? fmt(m, 1) + " min" : fmt(m / 60, 1) + " h");

export default {
  id: "sink",
  title: "AWESOME Sink calculator",
  short: "AWESOME Sink",
  tagline: "points and coupons",
  group: "Logistics",
  color: 1,
  blurb: "What you're sinking in points per minute, when the next coupons print along the rising coupon cost, and which items are worth the most points.",
  mount(view) {
    const st = load(KEY, { list: [{ item: "ModularFrameHeavy", rate: 2 }, { item: "Computer", rate: 2.5 }], printed: 0, progress: 0 });
    const persist = () => save(KEY, st);
    const out = h("div", { class: "stack" });
    const q = h("input", { class: "ctl", type: "search", placeholder: "Filter…", "aria-label": "Filter items" });
    const rank = h("div");
    function run() {
      persist();
      clear(out);
      const p = pointsPerMinute(st.list.filter((x) => x.item && x.rate > 0));
      const next = schedule(p.total, st.printed, st.progress, 6);
      out.append(card("Your sink",
        h("div", { class: "stats" },
          stat(fmt(p.total, 0), "points per minute", true),
          stat(fmt(couponsPerHour(p.total, st.printed), 2), "coupons per hour now"),
          stat(fmt(couponCost(st.printed + 1), 0), `points for coupon ${st.printed + 1}`)),
        table([
          { head: "Coupon", n: true, cell: (r) => "#" + r.n },
          { head: "Costs", n: true, cell: (r) => fmt(r.cost, 0) },
          { head: "Prints in", n: true, cell: (r) => time(r.minutes) },
        ], next),
        p.rows.some((r) => !r.points) ? h("p", { class: "note warn", text: "Fluids score nothing: package them first. Items with no points can't go in the sink." }) : null,
        h("p", { class: "tiny", text: "The first three coupons cost 500 points each; after that the cost rises every three coupons (250·(⌈n/3⌉ − 1)² + 1000). Printing a coupon spends its points." })));
    }
    function drawRank() {
      const t = q.value.trim().toLowerCase();
      const rows = ranking().filter((r) => !t || itemName(r.item).toLowerCase().includes(t)).slice(0, t ? 200 : 25);
      rank.replaceChildren(table([
        { head: "Item", cell: (r) => itemLink(r.item) },
        { head: "Points each", n: true, cell: (r) => fmt(r.points, 0) },
      ], rows));
    }
    q.addEventListener("input", drawRank);
    view.append(toolHead(this), h("div", { class: "tgrid" },
      h("div", { class: "stack" },
        card("Items going in", itemRows(st.list, run, { kind: "sink", placeholder: "Add item" })),
        card("Coupons so far",
          h("div", { class: "two" },
            num("Coupons printed", st.printed, (v) => { st.printed = Math.max(0, Math.round(v || 0)); run(); }, { min: 0, step: 1, hint: "All time, not just in hand." }),
            num("Points towards next", st.progress, (v) => { st.progress = Math.max(0, v || 0); run(); }, { min: 0 })))),
      h("div", { class: "stack" }, out, card("Most points per item", q, rank))));
    run();
    drawRank();
  },
};

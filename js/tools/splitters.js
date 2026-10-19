// Belt splitter ratio helper.
import { h, clear, load, save, num, itemPicker, stat, table, card, toolHead } from "../ui.js";
import { fmt, carrier, BELTS, PIPES, isLiquid } from "../lib/game.js";
import { splitView } from "../splitview.js";

const KEY = "splitters";

export default {
  id: "splitters",
  title: "Belt splitter ratio helper",
  short: "Belt splitting",
  tagline: "exact ratios",
  group: "Machines",
  color: 7,
  blurb: "Split one belt into any ratio (1/3, 2/5, 12:8:5…) with splitters and mergers, drawn as a tree with the loop-back parts marked. Plus every belt and pipe tier's throughput.",
  mount(view) {
    const st = load(KEY, { item: "IronIngot", total: 375, outs: [{ label: "Plates", rate: 180 }, { label: "Rods", rate: 120 }, { label: "Out", rate: 75 }] });
    const persist = () => save(KEY, st);
    const rows = h("div", { class: "rows" });
    const out = h("div", { class: "stack" });

    function drawRows() {
      clear(rows);
      st.outs.forEach((o, i) => rows.append(h("div", { class: "irow" },
        h("input", { class: "ctl", type: "text", value: o.label, "aria-label": "Output name", on: { input: (e) => { o.label = e.target.value; run(); } } }),
        num(null, o.rate, (v) => { o.rate = v || 0; run(); }, { unit: "share" }),
        h("button", { class: "xbtn sm", type: "button", text: "×", "aria-label": "Remove output", on: { click: () => { st.outs.splice(i, 1); drawRows(); run(); } } }))));
      rows.append(h("div", { class: "row" },
        h("button", { class: "btn small", type: "button", text: "+ Add output", on: { click: () => { st.outs.push({ label: String.fromCharCode(65 + st.outs.length), rate: 1 }); drawRows(); run(); } } }),
        h("button", { class: "btn small ghost", type: "button", text: "Equal split", on: { click: () => { st.outs.forEach((o) => (o.rate = 1)); drawRows(); run(); } } })));
    }
    function run() {
      persist();
      clear(out);
      const live = st.outs.filter((o) => o.rate > 0);
      if (live.length < 2) return out.append(card(null, h("p", { class: "empty-note", text: "Give at least two outputs a share." })));
      const sum = live.reduce((t, o) => t + o.rate, 0);
      const k = st.total > 0 ? st.total / sum : 0;
      out.append(card("Splitter plan", splitView(live.map((o) => ({ label: o.label || "?", rate: o.rate })), st.item)),
        st.total > 0 ? card("Each output", table([
          { head: "Output", cell: (o) => o.label },
          { head: "Share", n: true, cell: (o) => fmt((o.rate / sum) * 100, 2) + "%" },
          { head: "Rate", n: true, cell: (o) => fmt(o.rate * k, 2) + (isLiquid(st.item) ? " m³/min" : "/min") },
          { head: "Needs", cell: (o) => { const c = carrier(st.item, o.rate * k); return (c.count > 1 ? c.count + " × " : "") + c.name; } },
        ], live)) : null);
    }
    view.append(toolHead(this), h("div", { class: "tgrid" },
      h("div", { class: "stack" },
        card("Belt",
          h("label", { class: "fl" }, "Item (for belt sizes, optional)", itemPicker(st.item, (id) => { st.item = id; run(); }, { kind: "all" })),
          num("Total on the belt", st.total, (v) => { st.total = v || 0; run(); }, { unit: "/min" })),
        card("Outputs", h("p", { class: "tiny", text: "Shares can be rates or parts of a ratio: 180, 120, 75 and 12, 8, 5 give the same plan." }), rows),
        card("Throughput",
          h("div", { class: "stats" }, [...BELTS, ...PIPES].map((b) => stat(fmt(b.rate) + (b.name.startsWith("Pipe") ? " m³" : ""), b.name))),
          h("p", { class: "tiny", text: "Per minute. Conveyor lifts match the belt of the same mark." }))),
      out));
    drawRows();
    run();
  },
};

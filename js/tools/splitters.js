// Belt splitter ratio helper: the plan as a flowchart filling the window, the belt,
// its outputs and the exact shares in the side panel.
import { h, clear, load, save, num, itemPicker, stat, toolHead } from "../ui.js";
import { fmt, BELTS, PIPES } from "../lib/game.js";
import { splitParts } from "../splitview.js";
import { flowchart } from "../flowchart.js";

const KEY = "splitters";

export default {
  id: "splitters",
  title: "Belt splitter ratio helper",
  short: "Belt splitting",
  tagline: "exact ratios",
  group: "Machines",
  color: 7,
  blurb: "Split one belt into any ratio (3:2, 2:7, 1234:63:17…) exactly, with splitters and mergers drawn as a flowchart: every belt, where it goes and what it carries, and the parts that loop back. Plus every belt and pipe tier's throughput.",
  workspace: true,
  mount(view) {
    const st = load(KEY, { item: "IronIngot", total: 375, outs: [{ label: "Plates", rate: 180 }, { label: "Rods", rate: 120 }, { label: "Out", rate: 75 }] });
    const persist = () => save(KEY, st);
    const rows = h("div", { class: "rows" });
    const summary = h("section", { class: "panel" });
    const stage = h("div", { class: "ws-stage" });

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
    let timer;
    const run = () => { persist(); clearTimeout(timer); timer = setTimeout(draw, 120); };
    function draw() {
      clear(summary);
      clear(stage);
      const live = st.outs.filter((o) => o.rate > 0);
      if (live.length < 2) {
        summary.append(h("h2", { text: "Plan" }), h("p", { class: "empty-note", text: "Give at least two outputs a share." }));
        stage.append(h("div", { class: "ws-empty", text: "Give at least two outputs a share to see the splitters." }));
        return;
      }
      const p = splitParts(live.map((o) => ({ label: o.label || "?", rate: o.rate })), st.item, st.total > 0 ? { total: st.total } : {});
      if (p.error) { summary.append(h("h2", { text: "Plan" }), p.error); stage.append(h("div", { class: "ws-empty" }, p.error.cloneNode(true))); return; }
      summary.append(h("h2", { text: "Plan" }), ...p.summary, p.table);
      stage.append(p.tooBig ? h("div", { class: "ws-empty" }, p.tooBig) : flowchart(p.graph, {
        labels: true, stage: true,
        legend: [
          h("span", { class: "k" }, h("span", { class: "sw bal" }), "splitter"),
          h("span", { class: "k" }, h("span", { class: "sw mrg" }), "merger"),
          h("span", { class: "k" }, h("span", { class: "ln dash" }), "loops back to the input"),
        ],
        details: (n) => h("p", { class: "tiny", text: n.kind === "split" ? "Every output of this splitter carries the same amount; the labels on its belts say how much." : n.kind === "merge" ? "Joins its belts into one; nothing is lost." : n.kind === "out" ? `Gets exactly ${n.tag} of what comes in.` : "The belt being split." }),
      }));
    }
    view.append(
      h("div", { class: "ws-side" },
        toolHead(this),
        h("section", { class: "panel" }, h("h2", { text: "Belt" }),
          h("label", { class: "fl" }, "Item (for belt sizes, optional)", itemPicker(st.item, (id) => { st.item = id; run(); }, { kind: "all" })),
          num("Total on the belt", st.total, (v) => { st.total = v || 0; run(); }, { unit: "/min" })),
        h("section", { class: "panel" }, h("h2", { text: "Outputs" }), h("p", { class: "tiny", text: "Shares can be rates or parts of a ratio: 180, 120, 75 and 12, 8, 5 give the same plan. Any ratio is split exactly." }), rows),
        summary,
        h("section", { class: "panel" }, h("h2", { text: "Throughput" }),
          h("div", { class: "stats" }, [...BELTS, ...PIPES].map((b) => stat(fmt(b.rate) + (b.name.startsWith("Pipe") ? " m³" : ""), b.name))),
          h("p", { class: "tiny", text: "Per minute. Conveyor lifts match the belt of the same mark." }))),
      stage);
    drawRows();
    draw();
  },
};

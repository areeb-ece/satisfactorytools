// Belt splitter and merger helper: any number of input belts, any rates, shared out
// over the outputs in any ratio, exactly. The build fills the window as a flowchart;
// the inputs, outputs and exact shares are in the side panel.
import { h, clear, load, save, num, itemPicker, stat, toolHead } from "../ui.js";
import { fmt, BELTS, PIPES } from "../lib/game.js";
import { splitParts } from "../splitview.js";
import { flowchart } from "../flowchart.js";

const KEY = "splitters";

export default {
  id: "splitters",
  title: "Belt splitter & merger helper",
  short: "Belt splitting",
  tagline: "exact ratios",
  group: "Machines",
  color: 7,
  blurb: "Any number of belts in, at any rates, shared out over the outputs in any ratio (3:2, 2:7, 1234:63:17…), exactly. Every splitter, merger and belt is drawn as a flowchart, with what each belt carries and the parts that loop back.",
  workspace: true,
  mount(view) {
    const st = load(KEY, { item: "IronIngot", ins: [{ label: "Smelters A", rate: 240 }, { label: "Smelters B", rate: 135 }], outs: [{ label: "Plates", rate: 180 }, { label: "Rods", rate: 120 }, { label: "Out", rate: 75 }] });
    if (!Array.isArray(st.ins)) st.ins = [{ label: "In", rate: st.total > 0 ? st.total : st.outs.reduce((t, o) => t + (o.rate || 0), 0) }]; // saved before inputs existed
    delete st.total;
    const persist = () => save(KEY, st);
    const inRows = h("div", { class: "rows" }), outRows = h("div", { class: "rows" });
    const summary = h("section", { class: "panel" });
    const stage = h("div", { class: "ws-stage" });

    // One editable list of { label, rate } rows.
    function rowsOf(box, list, { unit, add, next, min }) {
      const draw = () => {
        clear(box);
        list.forEach((o, i) => box.append(h("div", { class: "irow" },
          h("input", { class: "ctl", type: "text", value: o.label, "aria-label": "Name", on: { input: (e) => { o.label = e.target.value; run(); } } }),
          num(null, o.rate, (v) => { o.rate = v || 0; run(); }, { unit }),
          h("button", { class: "xbtn sm", type: "button", text: "×", "aria-label": "Remove", disabled: list.length <= min, on: { click: () => { list.splice(i, 1); draw(); run(); } } }))));
        box.append(h("div", { class: "row" },
          h("button", { class: "btn small", type: "button", text: add, on: { click: () => { list.push(next(list)); draw(); run(); } } }),
          box === outRows ? h("button", { class: "btn small ghost", type: "button", text: "Equal split", on: { click: () => { list.forEach((o) => (o.rate = 1)); draw(); run(); } } }) : null));
      };
      draw();
    }
    let timer;
    const run = () => { persist(); clearTimeout(timer); timer = setTimeout(draw, 120); };
    function draw() {
      clear(summary);
      clear(stage);
      const ins = st.ins.filter((o) => o.rate > 0), outs = st.outs.filter((o) => o.rate > 0);
      const total = ins.reduce((t, o) => t + o.rate, 0);
      summary.append(h("h2", { text: "Build" }));
      if (!ins.length || !outs.length || (ins.length === 1 && outs.length === 1)) {
        summary.append(h("p", { class: "empty-note", text: "Give at least one input a rate and two outputs a share (or two inputs and one output, to merge)." }));
        stage.append(h("div", { class: "ws-empty", text: "Nothing to split or merge yet." }));
        return;
      }
      const p = splitParts(outs.map((o) => ({ label: o.label || "?", rate: o.rate })), st.item, { inputs: ins.map((o) => ({ label: o.label || "?", rate: o.rate })) });
      if (p.error) { summary.append(p.error); stage.append(h("div", { class: "ws-empty" }, p.error.cloneNode(true))); return; }
      summary.append(h("p", { class: "tiny", text: `${fmt(total, 3)}/min coming in on ${ins.length} belt${ins.length === 1 ? "" : "s"}.` }), ...p.summary, p.table);
      stage.append(p.tooBig ? h("div", { class: "ws-empty" }, p.tooBig) : flowchart(p.graph, {
        labels: true, stage: true,
        legend: [
          h("span", { class: "k" }, h("span", { class: "sw bal" }), "splitter"),
          h("span", { class: "k" }, h("span", { class: "sw mrg" }), "merger"),
          h("span", { class: "k" }, h("span", { class: "ln dash" }), "loops back"),
        ],
        details: (n) => h("p", { class: "tiny", text: n.kind === "split" ? "Every output of this splitter carries the same amount; the labels on its belts say how much." : n.kind === "merge" ? "Joins its belts into one; nothing is lost." : n.kind === "out" ? `Gets exactly ${n.tag} of everything coming in.` : `An input belt: ${n.sub}.` }),
      }));
    }
    view.append(
      h("div", { class: "ws-side" },
        toolHead(this),
        h("section", { class: "panel" }, h("h2", { text: "Item" }),
          h("label", { class: "fl" }, "For belt sizes (optional)", itemPicker(st.item, (id) => { st.item = id; run(); }, { kind: "all" }))),
        h("section", { class: "panel" }, h("h2", { text: "Inputs" }), h("p", { class: "tiny", text: "The belts coming in, at any rates." }), inRows),
        h("section", { class: "panel" }, h("h2", { text: "Outputs" }), h("p", { class: "tiny", text: "Rates, or parts of a ratio of everything coming in: 180, 120, 75 and 12, 8, 5 give the same build. Always exact." }), outRows),
        summary,
        h("section", { class: "panel" }, h("h2", { text: "Throughput" }),
          h("div", { class: "stats" }, [...BELTS, ...PIPES].map((b) => stat(fmt(b.rate) + (b.name.startsWith("Pipe") ? " m³" : ""), b.name))),
          h("p", { class: "tiny", text: "Per minute. Conveyor lifts match the belt of the same mark." }))),
      stage);
    rowsOf(inRows, st.ins, { unit: "/min", add: "+ Add input", next: (l) => ({ label: "In " + (l.length + 1), rate: 60 }), min: 1 });
    rowsOf(outRows, st.outs, { unit: "share", add: "+ Add output", next: (l) => ({ label: String.fromCharCode(65 + l.length), rate: 1 }), min: 1 });
    draw();
  },
};

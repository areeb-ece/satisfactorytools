// Belt splitter and merger helper: any number of input belts, any rates, shared out
// over the outputs in any ratio, exactly. The build fills the window as a flowchart;
// the inputs, outputs and exact shares are in the side panel.
import { h, clear, load, save, num, itemPicker, stat, toolHead, field, segField, btn, closeBtn, fold, markStale } from "../ui.js";
import { fmt, BELTS, PIPES, isLiquid } from "../lib/game.js";
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
  blurb: "Any number of belts in, at any rates, shared out over the outputs in any ratio (3:2, 2:7, 1234:63:17…), exactly, with no belt faster than the ones you can build. The build with the fewest splitters and mergers is drawn as a flowchart, with what each belt carries and the parts that loop back.",
  workspace: true,
  mount(view) {
    const st = load(KEY, { item: "IronIngot", ins: [{ label: "Smelters A", rate: 240 }, { label: "Smelters B", rate: 135 }], outs: [{ label: "Plates", rate: 180 }, { label: "Rods", rate: 120 }, { label: "Out", rate: 75 }] });
    // Saved before inputs existed: one input, of the old total. (load() fills `ins` in from
    // the defaults, so the old `total` is what tells.)
    if ("total" in st || !Array.isArray(st.ins)) st.ins = [{ label: "In", rate: st.total > 0 ? st.total : st.outs.reduce((t, o) => t + (o.rate || 0), 0) }];
    delete st.total;
    if (!(st.belt >= 0 && st.belt < BELTS.length)) st.belt = BELTS.length - 1; // the fastest belt you can build
    const persist = () => save(KEY, st);
    const inRows = h("div", { class: "rows" }), outRows = h("div", { class: "rows" });
    const summary = h("section", { class: "panel results" });
    const stage = h("div", { class: "ws-stage" });

    // One editable list of { label, rate } rows.
    function rowsOf(box, list, { unit, add, next, min, kind }) {
      const draw = () => {
        clear(box);
        list.forEach((o, i) => {
          const x = closeBtn("Remove " + (o.label || "row " + (i + 1)), () => { list.splice(i, 1); draw(); markStale(); run(); });
          x.disabled = list.length <= min;
          if (x.disabled) x.title = "Keep at least one";
          box.append(h("div", { class: "irow" },
            h("div", { class: "cell" }, h("input", { class: "sd-input sd-small ctl", type: "text", value: o.label, "aria-label": "Name of " + kind + " " + (i + 1), on: { input: (e) => { o.label = e.target.value; run(); } } })),
            h("div", { class: "cell" }, num(null, o.rate, (v) => { o.rate = v || 0; run(); }, { unit, aria: (unit === "share" ? "Share for " : "Rate for ") + (o.label || kind + " " + (i + 1)) })),
            x));
        });
        box.append(h("div", { class: "row" },
          btn(add, () => { list.push(next(list)); draw(); run(); }, { small: true, ico: "plus", cls: "add" }),
          box === outRows ? btn("Equal split", () => { list.forEach((o) => (o.rate = 1)); draw(); run(); }, { small: true, kind: "ghost" }) : null));
      };
      draw();
    }
    let timer;
    const run = () => { persist(); clearTimeout(timer); timer = setTimeout(draw, 120); };
    function draw() {
      clear(summary);
      clear(stage);
      view.imageInfo = null;
      const ins = st.ins.filter((o) => o.rate > 0), outs = st.outs.filter((o) => o.rate > 0);
      const total = ins.reduce((t, o) => t + o.rate, 0);
      summary.append(h("h2", { text: "Build" }));
      if (!ins.length || !outs.length || (ins.length === 1 && outs.length === 1)) {
        summary.append(h("p", { class: "empty-note sd-hint", text: "Give at least one input a rate and two outputs a share (or two inputs and one output, to merge)." }));
        stage.append(h("div", { class: "ws-empty" }, h("div", { class: "empty" }, h("b", { text: "Nothing to split or merge yet." }), h("p", { text: "Give at least one input a rate and two outputs a share (or two inputs and one output, to merge)." }))));
        return;
      }
      const capacity = isLiquid(st.item) ? PIPES.at(-1).rate : BELTS[st.belt].rate;
      const p = splitParts(outs.map((o) => ({ label: o.label || "?", rate: o.rate })), st.item, { inputs: ins.map((o) => ({ label: o.label || "?", rate: o.rate })), capacity });
      if (p.error) { summary.append(p.error); stage.append(h("div", { class: "ws-empty" }, p.error.cloneNode(true))); return; }
      const b = p.build, belt = isLiquid(st.item) ? PIPES.at(-1) : BELTS[st.belt];
      view.imageInfo = () => ({
        what: `${fmt(total, 3)}/min on ${ins.length} belt${ins.length === 1 ? "" : "s"} → ${outs.map((o) => o.label || "?").join(", ")}`,
        facts: `${b.splitters} splitter${b.splitters === 1 ? "" : "s"}, ${b.mergers} merger${b.mergers === 1 ? "" : "s"} · no belt over ${belt.name} (${fmt(belt.rate)}/min) · exact`,
        defaults: ["Build"],
        kinds: { src: "input belt", out: "output" },
      });
      summary.append(h("p", { class: "sd-hint tiny", text: `${fmt(total, 3)}/min coming in on ${ins.length} belt${ins.length === 1 ? "" : "s"}.` }), ...p.summary, p.table);
      stage.append(p.tooBig ? h("div", { class: "ws-empty" }, p.tooBig) : flowchart(p.graph, {
        labels: true, stage: true,
        legend: [
          h("span", { class: "k" }, h("span", { class: "sw bal" }), "splitter"),
          h("span", { class: "k" }, h("span", { class: "sw mrg" }), "merger"),
          h("span", { class: "k" }, h("span", { class: "ln dash" }), "loops back"),
        ],
        details: (n) => h("p", { class: "sd-hint tiny", text: n.kind === "split" ? "Every output of this splitter carries the same amount; the labels on its belts say how much." : n.kind === "merge" ? "Joins its belts into one; nothing is lost." : n.kind === "out" ? `Gets exactly ${n.tag} of everything coming in.` : `An input belt: ${n.sub}.` }),
      }));
    }
    view.append(
      h("div", { class: "ws-side" },
        toolHead(this),
        h("section", { class: "panel" }, h("h2", { text: "Inputs" }), h("p", { class: "sd-hint tiny", text: "The belts coming in, at any rates." }), inRows),
        h("section", { class: "panel" }, h("h2", { text: "Outputs" }), h("p", { class: "sd-hint tiny", text: "Rates, or parts of a ratio of everything coming in: 180, 120, 75 and 12, 8, 5 give the same build. Always exact." }), outRows),
        h("section", { class: "panel" },
          segField("Fastest belt you can build", BELTS.map((b, i) => ({ value: String(i), label: b.name.replace("Belt ", ""), title: `${b.name}: ${fmt(b.rate)}/min` })), String(st.belt), (v) => { st.belt = +v; run(); }, { wide: true }),
          h("p", { class: "sd-hint tiny", text: "No belt in the build carries more than this. An input or output that's more than one belt carries is spread over several." }),
          field("Item, for belt sizes (optional)", itemPicker(st.item, (id) => { st.item = id; run(); }, { kind: "all" }))),
        summary,
        h("section", { class: "panel tune ref" }, fold("Belt and pipe throughput", false, "per minute",
          h("div", { class: "stats" }, [...BELTS, ...PIPES].map((b) => stat(fmt(b.rate) + (b.name.startsWith("Pipe") ? " m³" : ""), b.name))),
          h("p", { class: "sd-hint tiny", text: "Per minute. Conveyor lifts match the belt of the same mark." })))),
      stage);
    rowsOf(inRows, st.ins, { unit: "/min", kind: "input", add: "Add input", next: (l) => ({ label: "In " + (l.length + 1), rate: 60 }), min: 1 });
    rowsOf(outRows, st.outs, { unit: "share", kind: "output", add: "Add output", next: (l) => ({ label: String.fromCharCode(65 + l.length), rate: 1 }), min: 1 });
    draw();
  },
};

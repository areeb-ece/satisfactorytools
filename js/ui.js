// Small DOM helpers shared by the tools. The page's security policy forbids style
// attributes, so nothing here writes one: colours and sizes go through classes or
// el.style.setProperty (CSSOM), which the policy allows.
import { items, recipes, itemName, fmt, unit, recipesMaking } from "./lib/game.js";

const SVGNS = "http://www.w3.org/2000/svg";

function put(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "text") el.textContent = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "vars") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k in el && !k.includes("-") && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
}
function kids(el, list) {
  for (const c of list.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
/** h("div", { class: "x", on: { click } }, child, "text", [more]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  put(el, props);
  return kids(el, children);
}
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props || {})) if (v != null) el.setAttribute(k, v);
  return kids(el, children);
}
export const clear = (el) => { el.replaceChildren(); return el; };

// ── saved state (per tool, in this browser only) ─────────────────────────────
const PREFIX = "satisfactorytools.";
export function load(key, defaults) {
  try {
    const v = JSON.parse(localStorage.getItem(PREFIX + key));
    if (v && typeof v === "object") return { ...defaults, ...v };
  } catch (e) { /* storage blocked or corrupt: start fresh */ }
  return structuredClone(defaults);
}
export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* this visit only */ }
}

// ── fields ───────────────────────────────────────────────────────────────────
/** A labelled number box. `get`/`set` read and write the value; empty → null. */
export function num(label, value, onChange, { min = 0, max, step = "any", unit: u, hint, placeholder } = {}) {
  const input = h("input", { class: label == null ? "ctl" : null, type: "number", inputmode: "decimal", min, max, step, placeholder, value: value ?? "" });
  input.addEventListener("input", () => {
    const v = input.value === "" ? null : Number(input.value);
    const bad = v != null && (!isFinite(v) || v < min || (max != null && v > max));
    input.classList.toggle("bad", bad);
    if (!bad) onChange(v);
  });
  const box = u ? h("span", { class: "unit" }, input, h("i", { text: u })) : input;
  return label == null ? box : h("label", { class: "fl" }, label, box, hint && h("span", { class: "hint", text: hint }));
}

export function select(label, options, value, onChange) {
  const sel = h("select", { class: label == null ? "ctl" : null, on: { change: () => onChange(sel.value) } },
    options.map((o) => (o.group ? h("optgroup", { label: o.group }, o.options.map(opt)) : opt(o))));
  sel.value = value;
  function opt(o) { return h("option", { value: o.value, text: o.label }); }
  return label == null ? sel : h("label", { class: "fl" }, label, sel);
}

/** A segmented control (radio group), as in OTU Calendar. */
export function seg(options, value, onChange, { wide = false, label } = {}) {
  const box = h("div", { class: "seg" + (wide ? " wide" : ""), role: "radiogroup", "aria-label": label });
  const set = (v) => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === String(v))));
  for (const o of options) {
    box.append(h("button", { type: "button", role: "radio", "data-v": o.value, text: o.label, title: o.title, on: { click: () => { set(o.value); onChange(o.value); } } }));
  }
  set(value);
  return box;
}

// Item search: a text box with the game's item names as suggestions.
const lists = new Map();
function datalist(kind) {
  if (lists.has(kind)) return lists.get(kind);
  const made = new Set(recipes.flatMap((r) => r.out.map(([o]) => o)));
  const ids = Object.keys(items).filter((id) => kind === "all" || (kind === "made" ? made.has(id) : kind === "sink" ? items[id].sink && !items[id].liquid : kind === "fuel" ? items[id].energy : true));
  const id = "items-" + kind;
  const dl = h("datalist", { id }, ids.map((i) => itemName(i)).sort().map((n) => h("option", { value: n })));
  document.body.append(dl);
  lists.set(kind, id);
  return id;
}
const byName = new Map(Object.entries(items).map(([id, it]) => [it.name.toLowerCase(), id]));
export const findItem = (name) => byName.get(String(name).trim().toLowerCase()) ?? null;

export function itemPicker(value, onChange, { kind = "made", placeholder = "Search items…", label } = {}) {
  const input = h("input", { class: "ctl", type: "text", list: datalist(kind), placeholder, autocomplete: "off", spellcheck: "false", value: value ? itemName(value) : "", "aria-label": label || "Item" });
  const commit = () => {
    const id = findItem(input.value);
    input.classList.toggle("bad", !!input.value.trim() && !id);
    if (id || !input.value.trim()) onChange(id);
  };
  input.addEventListener("change", commit);
  input.addEventListener("input", () => { if (findItem(input.value)) commit(); });
  return input;
}

/** Recipe choice for an item (standard first, then alternates). */
export function recipePicker(item, value, onChange) {
  const rs = item ? recipesMaking(item).sort((a, b) => a.alt - b.alt || a.name.localeCompare(b.name)) : [];
  if (!rs.length) return h("select", { class: "ctl", disabled: true }, h("option", { text: "Pick an item first" }));
  const v = rs.some((r) => r.id === value) ? value : rs[0].id;
  if (v !== value) queueMicrotask(() => onChange(v));
  return select(null, rs.map((r) => ({ value: r.id, label: r.name + (r.alt ? " (alternate)" : "") })), v, onChange);
}

// ── output bits ──────────────────────────────────────────────────────────────
export const itemLink = (id) => h("a", { href: "#/items/" + id, text: itemName(id) });
export const rate = (id, n, dp = 2) => fmt(n, dp) + " " + unit(id);
export function stat(value, label, hi) { return h("div", { class: "stat" + (hi ? " hi" : "") }, h("b", { text: value }), h("span", { text: label })); }

/** A table from column specs: { head, cell(row) → node|string, n (numeric) }. */
export function table(cols, rows, { rowClass } = {}) {
  return h("div", { class: "tw" }, h("table", { class: "t" },
    h("thead", null, h("tr", null, cols.map((c) => h("th", { class: c.n ? "n" : null, text: c.head, title: c.title })))),
    h("tbody", null, rows.map((r, i) => h("tr", { class: rowClass?.(r, i) }, cols.map((c) => h("td", { class: c.n ? "n" : c.cls }, c.cell(r, i))))))));
}

export function card(title, ...children) {
  return h("section", { class: "card" }, title && h("h2", null, title), children);
}
export function toolHead(t) {
  return h("header", { class: "thead" }, h("h1", { text: t.title }), h("p", { text: t.blurb }));
}

let toastTimer;
export function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast", role: "status", text: msg });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/** A list of { item, rate } rows that can be added to and removed from. */
export function itemRows(list, onChange, { kind = "made", rateLabel = "Rate", placeholder, allowEmptyRate = false, emptyText } = {}) {
  const box = h("div", { class: "rows" });
  function draw() {
    clear(box);
    if (!list.length && emptyText) box.append(h("p", { class: "empty-note", text: emptyText }));
    list.forEach((row, i) => {
      box.append(h("div", { class: "irow" },
        itemPicker(row.item, (id) => { row.item = id; onChange(); }, { kind }),
        num(null, row.rate, (v) => { row.rate = v; onChange(); }, { unit: row.item && items[row.item]?.liquid ? "m³/min" : "/min", placeholder: allowEmptyRate ? "any" : "0" }),
        h("button", { class: "xbtn sm", type: "button", title: "Remove", "aria-label": "Remove " + (row.item ? itemName(row.item) : "row"), text: "×", on: { click: () => { list.splice(i, 1); draw(); onChange(); } } })));
    });
    box.append(h("div", { class: "row" }, h("button", { class: "btn small", type: "button", text: "+ " + (placeholder || "Add"), on: { click: () => { list.push({ item: null, rate: allowEmptyRate ? null : 60 }); draw(); box.querySelector(".irow:last-of-type input")?.focus(); } } })));
  }
  draw();
  box.redraw = draw;
  return box;
}

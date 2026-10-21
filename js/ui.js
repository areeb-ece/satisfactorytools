// Small DOM helpers shared by the tools. The page's security policy forbids style
// attributes, so nothing here writes one: colours and sizes go through classes or
// el.style.setProperty (CSSOM), which the policy allows. Controls use the shared
// components from /design/ui.css (sd-*); the old class names stay on as hooks.
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

// ── icons: one stroked set, drawn here rather than borrowed from text glyphs ──
const ICONS = {
  x: "M6 6l12 12M18 6 6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  chevron: "m9 6 6 6-6 6",
  fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  reset: "M4 5v5h5M4.6 15a8 8 0 1 0 1.8-8.2L4 10",
  locate: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
};
export const icon = (name) => s("svg", { class: "ico", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" }, s("path", { d: ICONS[name] }));

/** A button from the shared set: kind is "", "primary", "ghost" or "danger"; small for dense rows. */
export function btn(text, onClick, { kind = "", small = false, ico, cls = "", title, label, after } = {}) {
  const c = ["sd-btn", kind && "sd-" + kind, small && "sd-small", !text && "sd-icon", cls].filter(Boolean).join(" ");
  return h("button", { class: c, type: "button", title, "aria-label": label, on: { click: onClick } }, ico && !after ? icon(ico) : null, text || null, ico && after ? icon(ico) : null);
}
/** The × that removes a row or closes a panel. */
export const closeBtn = (label, onClick, { small = false } = {}) => btn("", onClick, { kind: "ghost", small, ico: "x", label, title: label, cls: "xbtn" });

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
let uid = 0;
const nextId = (p) => p + "-" + ++uid;

/** Mark a control as wrong, with a sentence under it saying why (or clear it with null). */
export function flag(input, msg) {
  const box = input.closest(".unit") ?? input;
  let err = box.nextElementSibling?.classList.contains("sd-error") ? box.nextElementSibling : null;
  input.classList.toggle("bad", !!msg);
  if (msg) {
    if (!err) { err = h("p", { class: "sd-error", id: nextId("err"), role: "alert" }); box.after(err); }
    err.textContent = msg;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", err.id);
  } else {
    err?.remove();
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
  markStale();
}
/** While any field is wrong, the results still show the last valid input: dim them so they don't read as current. */
export function markStale() {
  const view = document.getElementById("view");
  if (view) view.classList.toggle("is-stale", !!view.querySelector('[aria-invalid="true"]'));
}

/** A label above its control, with an optional hint under it. */
export function field(label, control, hint) {
  const target = control.matches?.("input, select, textarea") ? control : control.querySelector?.("input, select, textarea");
  if (target && !target.id) target.id = nextId("f");
  target?.removeAttribute("aria-label"); // the visible label names it
  return h("div", { class: "sd-field fl" },
    h("label", { class: "sd-label", for: target?.id, text: label }),
    control,
    hint && h("p", { class: "sd-hint hint", text: hint }));
}

const range = (min, max) => (max != null ? `Enter a number from ${min} to ${max}.` : min > 0 ? `Enter a number of at least ${min}.` : "Enter a number of 0 or more.") + " The results show the last valid value until then.";

/** A labelled number box. `get`/`set` read and write the value; empty → null. */
export function num(label, value, onChange, { min = 0, max, step = "any", unit: u, hint, placeholder, aria } = {}) {
  const input = h("input", { class: "sd-input sd-mono" + (label == null ? " sd-small ctl" : ""), type: "number", inputmode: "decimal", min, max, step, placeholder, value: value ?? "", "aria-label": label == null ? aria : null });
  input.addEventListener("input", () => {
    const v = input.value === "" ? null : Number(input.value);
    const bad = v != null && (!isFinite(v) || v < min || (max != null && v > max));
    flag(input, bad ? range(min, max) : null);
    if (!bad) onChange(v);
  });
  if (u) input.style.setProperty("--ulen", String(u.length));
  const box = u ? h("span", { class: "unit" }, input, h("i", { text: u, "aria-hidden": "true" })) : input;
  return label == null ? box : field(label, box, hint);
}

export function select(label, options, value, onChange, { small = label == null } = {}) {
  const sel = h("select", { class: label == null ? "ctl" : null, on: { change: () => onChange(sel.value) } },
    options.map((o) => (o.group ? h("optgroup", { label: o.group }, o.options.map(opt)) : opt(o))));
  sel.value = value;
  function opt(o) { return h("option", { value: o.value, text: o.label }); }
  const box = h("span", { class: "sd-select" + (small ? " sd-small" : "") }, sel);
  return label == null ? box : field(label, box);
}

/** A segmented control (radio group), from the shared set. */
export function seg(options, value, onChange, { wide = false, label } = {}) {
  const box = h("div", { class: "sd-seg seg" + (wide ? " wide" : ""), role: "radiogroup", "aria-label": label });
  // One tab stop for the group; the arrow keys move the choice, as radio buttons do.
  const set = (v) => box.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === String(v); b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
  for (const o of options) {
    box.append(h("button", { type: "button", role: "radio", "data-v": o.value, text: o.label, title: o.title, on: { click: () => { set(o.value); onChange(o.value); } } }));
  }
  box.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const bs = [...box.querySelectorAll("button")];
    const next = bs[(bs.indexOf(document.activeElement) + step + bs.length) % bs.length];
    next.focus();
    next.click();
  });
  set(value);
  return box;
}
/** A segmented control under its own label. */
export function segField(label, options, value, onChange, opts = {}) {
  return h("div", { class: "sd-field fl" }, h("span", { class: "sd-label", text: label }), seg(options, value, onChange, { label, ...opts }));
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

export function itemPicker(value, onChange, { kind = "made", placeholder = "Search items…", label, small = false } = {}) {
  const input = h("input", { class: "sd-input ctl" + (small ? " sd-small" : ""), type: "text", list: datalist(kind), placeholder, autocomplete: "off", spellcheck: "false", value: value ? itemName(value) : "", "aria-label": label || "Item", title: value ? itemName(value) : null });
  const commit = () => {
    const id = findItem(input.value);
    input.title = id ? itemName(id) : "";
    const typed = input.value.trim();
    flag(input, typed && !id ? `No item is called “${typed}”. Pick one from the list.` : null);
    if (id || !typed) onChange(id);
  };
  input.addEventListener("change", commit);
  input.addEventListener("input", () => { if (findItem(input.value)) commit(); });
  return input;
}

/** Recipe choice for an item (standard first, then alternates). */
export function recipePicker(item, value, onChange) {
  const rs = item ? recipesMaking(item).sort((a, b) => a.alt - b.alt || a.name.localeCompare(b.name)) : [];
  if (!rs.length) return h("span", { class: "sd-select" }, h("select", { class: "ctl", disabled: true }, h("option", { text: "Pick an item first" })));
  const v = rs.some((r) => r.id === value) ? value : rs[0].id;
  if (v !== value) queueMicrotask(() => onChange(v));
  return select(null, rs.map((r) => ({ value: r.id, label: r.name + (r.alt ? " (alternate)" : "") })), v, onChange, { small: false });
}

// ── output bits ──────────────────────────────────────────────────────────────
export const itemLink = (id) => h("a", { href: "#/items/" + id, text: itemName(id) });
export const rate = (id, n, dp = 2) => fmt(n, dp) + " " + unit(id);
export function stat(value, label, hi) { return h("div", { class: "stat" + (hi ? " hi" : "") }, h("b", { text: value }), h("span", { text: label })); }

/** A table from column specs: { head, cell(row) → node|string, n (numeric) }. */
export function table(cols, rows, { rowClass } = {}) {
  return h("div", { class: "tw" }, h("table", { class: "sd-table t" },
    h("thead", null, h("tr", null, cols.map((c) => h("th", { class: c.n ? "sd-num n" : null, text: c.head, title: c.title, scope: "col" })))),
    h("tbody", null, rows.map((r, i) => h("tr", { class: rowClass?.(r, i) }, cols.map((c) => h("td", { class: c.n ? "sd-num n" : c.cls, "data-h": c.head || null }, c.cell(r, i))))))));
}

export function card(title, ...children) {
  return h("section", { class: "card" }, title && h("h2", null, title), children);
}
/** A section that folds away: open when it holds something other than its defaults. */
export function fold(title, open, summary, ...children) {
  const d = h("details", { class: "fold", open },
    h("summary", null, h("span", { class: "fold-t", text: title }), summary ? h("span", { class: "fold-s", text: summary }) : null, icon("chevron")),
    h("div", { class: "fold-b" }, children));
  return d;
}
export function toolHead(t) {
  return h("header", { class: "thead" }, h("h1", { text: t.title, tabindex: "-1" }), h("p", { text: t.blurb }));
}

let toastTimer, toastEl;
export function toast(msg) {
  toastEl?.remove();
  const t = (toastEl = h("div", { class: "sd-toast toast", role: "status", text: msg }));
  document.body.append(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.setAttribute("data-open", "")));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.removeAttribute("data-open"); setTimeout(() => t.remove(), 300); }, 2600);
}

/** A list of { item, rate } rows that can be added to and removed from. */
export function itemRows(list, onChange, { kind = "made", rateLabel = "Rate", placeholder, allowEmptyRate = false, emptyText, noun = "Item" } = {}) {
  const box = h("div", { class: "rows" });
  function draw() {
    clear(box);
    if (!list.length && emptyText) box.append(h("p", { class: "empty-note sd-hint", text: emptyText }));
    list.forEach((row, i) => {
      const name = row.item ? itemName(row.item) : "row " + (i + 1);
      box.append(h("div", { class: "irow" },
        h("div", { class: "cell" }, itemPicker(row.item, (id) => { row.item = id; onChange(); }, { kind, small: true, label: `${noun} ${i + 1}` })),
        h("div", { class: "cell" }, num(null, row.rate, (v) => { row.rate = v; onChange(); }, { unit: row.item && items[row.item]?.liquid ? "m³/min" : "/min", placeholder: allowEmptyRate ? "any" : "0", aria: rateLabel + " for " + name })),
        closeBtn("Remove " + (row.item ? itemName(row.item) : "row"), () => { list.splice(i, 1); draw(); markStale(); onChange(); })));
    });
    box.append(h("div", { class: "row" }, btn(placeholder || "Add", () => { list.push({ item: null, rate: allowEmptyRate ? null : 60 }); draw(); [...box.querySelectorAll(".irow")].at(-1)?.querySelector("input")?.focus(); }, { small: true, ico: "plus", cls: "add" })));
  }
  draw();
  box.redraw = draw;
  return box;
}

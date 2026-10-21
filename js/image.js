// Image export's drawing engine (after PrereqFlow's js/image.js): a flat list of drawing
// operations, drawn to a high-resolution canvas (PNG) or written out as an SVG document.
//
// spec = { width, height, bg, fonts: { mono, text }, ops: [...] } in CSS pixels; each op is
//   { t: "rect",  x, y, w, h, r?, fill?, stroke?, sw?, dash? }        r = corner radius
//   { t: "path",  d, stroke?, sw?, dash?, fill? }                     d is SVG path data
//   { t: "arrow", x, y, color, size? }                                tip at (x, y), pointing right
//   { t: "text",  x, y, text, size, weight?, color, anchor?, ls?, font?, halo? }
//                                                     y = baseline; font "mono" (default) or "text"
// and may carry `a` (opacity, 0–1).
//
// The page can't fetch its own font files (connect-src 'none'), so an SVG names the fonts
// and falls back to similar ones where they aren't installed.

// Browsers refuse canvases past ~16k px a side; Safari also caps the total area.
const MAX_SIDE = 16000, MAX_AREA = 120e6;
let fonts = { mono: 'mononoki, ui-monospace, Menlo, Consolas, monospace', text: 'system-ui, sans-serif' };

/** The font stacks to draw with (CSS font-family lists). */
export function useFonts(f) { fonts = { ...fonts, ...f }; }
const fontStr = (size, weight = 400, font = "mono") => `${weight} ${size}px ${fonts[font] || fonts.mono}`;

let measureCtx = null;
export function measure(text, size, weight = 400, font = "mono") {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx.font = fontStr(size, weight, font);
  return measureCtx.measureText(String(text)).width;
}

/** Cut text to fit maxW, with an ellipsis. */
export function fit(text, maxW, size, weight = 400, font = "mono") {
  let s = String(text);
  if (measure(s, size, weight, font) <= maxW) return s;
  while (s.length > 1 && measure(s + "…", size, weight, font) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

/** Word-wrap to at most maxLines lines of maxW px; the last line gets an ellipsis. */
export function wrap(text, maxW, size, weight = 400, maxLines = 2, font = "mono") {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (!cur || measure(next, size, weight, font) <= maxW) { cur = next; continue; }
    lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    keep[maxLines - 1] = fit(lines.slice(maxLines - 1).join(" "), maxW, size, weight, font);
    return keep;
  }
  return lines.map((l) => fit(l, maxW, size, weight, font));
}

/** The largest scale up to `wanted` that keeps the canvas inside browser limits. */
export function fitScale(w, h, wanted) {
  const s = Math.min(wanted, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
  return Math.max(0.25, Math.floor(s * 100) / 100);
}

const arrowPts = (op) => { const s = op.size || 8; return [[op.x, op.y], [op.x - s, op.y - s * 0.42], [op.x - s, op.y + s * 0.42]]; };
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (r && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

async function loadFonts() {
  if (!document.fonts?.load) return;
  const want = [fontStr(12, 400), fontStr(12, 700), fontStr(12, 400, "text"), fontStr(12, 700, "text")];
  try { await Promise.all(want.map((f) => document.fonts.load(f))); } catch { /* system fonts, then */ }
}

export async function toCanvas(spec, scale) {
  await loadFonts();
  const cv = document.createElement("canvas");
  cv.width = Math.round(spec.width * scale);
  cv.height = Math.round(spec.height * scale);
  const ctx = cv.getContext("2d");
  if (!ctx) throw new Error("This browser couldn't make a canvas that large.");
  ctx.scale(scale, scale);
  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, spec.width, spec.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const op of spec.ops) {
    ctx.setLineDash(op.dash || []);
    ctx.globalAlpha = op.a ?? 1;
    if (op.t === "rect") {
      if (op.fill) { ctx.fillStyle = op.fill; rrect(ctx, op.x, op.y, op.w, op.h, op.r); ctx.fill(); }
      if (op.stroke) {
        const o = (op.sw || 1) / 2;
        ctx.strokeStyle = op.stroke; ctx.lineWidth = op.sw || 1;
        rrect(ctx, op.x + o, op.y + o, op.w - 2 * o, op.h - 2 * o, op.r ? Math.max(0, op.r - o) : 0); ctx.stroke();
      }
    } else if (op.t === "path") {
      const p = new Path2D(op.d);
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(p); }
      if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.sw || 1; ctx.stroke(p); }
    } else if (op.t === "arrow") {
      const pts = arrowPts(op);
      ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.lineTo(...pts[1]); ctx.lineTo(...pts[2]); ctx.closePath();
      ctx.fillStyle = op.color; ctx.fill();
    } else if (op.t === "text") {
      ctx.font = fontStr(op.size, op.weight || 400, op.font);
      ctx.textAlign = op.anchor === "end" ? "right" : op.anchor === "middle" ? "center" : "left";
      ctx.textBaseline = "alphabetic";
      if ("letterSpacing" in ctx) ctx.letterSpacing = (op.ls || 0) + "px";
      if (op.halo) { ctx.strokeStyle = op.halo; ctx.lineWidth = 3; ctx.strokeText(op.text, op.x, op.y); }
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
  }
  return cv;
}

/** A PNG, stepping the scale down if the browser refuses the canvas. */
export async function toPNG(spec, wanted) {
  let scale = fitScale(spec.width, spec.height, wanted);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const cv = await toCanvas(spec, scale);
      const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
      cv.width = cv.height = 0;
      if (blob && blob.size > 1000) return { blob, scale, w: Math.round(spec.width * scale), h: Math.round(spec.height * scale) };
    } catch { /* try smaller */ }
    scale = Math.max(0.5, Math.floor(scale * 0.7 * 100) / 100);
  }
  throw new Error("The image is too large for this browser. Try a lower resolution, or less in it.");
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const n2 = (v) => Math.round(v * 100) / 100;

/** A standalone SVG document. */
export function toSVG(spec) {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${n2(spec.width)}" height="${n2(spec.height)}" viewBox="0 0 ${n2(spec.width)} ${n2(spec.height)}">`);
  out.push(`<style>text{font-family:${esc(fonts.mono)};white-space:pre}.tx{font-family:${esc(fonts.text)}}</style>`);
  out.push(`<rect width="100%" height="100%" fill="${spec.bg}"/>`);
  for (const op of spec.ops) {
    const alpha = op.a != null && op.a < 1 ? ` opacity="${n2(op.a)}"` : "";
    const dash = op.dash?.length ? ` stroke-dasharray="${op.dash.join(" ")}"` : "";
    if (op.t === "rect") {
      const o = op.stroke ? (op.sw || 1) / 2 : 0;
      if (op.fill) out.push(`<rect x="${n2(op.x)}" y="${n2(op.y)}" width="${n2(op.w)}" height="${n2(op.h)}"${op.r ? ` rx="${op.r}"` : ""} fill="${op.fill}"${alpha}/>`);
      if (op.stroke) out.push(`<rect x="${n2(op.x + o)}" y="${n2(op.y + o)}" width="${n2(op.w - 2 * o)}" height="${n2(op.h - 2 * o)}"${op.r ? ` rx="${n2(Math.max(0, op.r - o))}"` : ""} fill="none" stroke="${op.stroke}" stroke-width="${op.sw || 1}"${dash}${alpha}/>`);
    } else if (op.t === "path") {
      out.push(`<path d="${op.d}" fill="${op.fill || "none"}"${op.stroke ? ` stroke="${op.stroke}" stroke-width="${op.sw || 1}" stroke-linecap="round" stroke-linejoin="round"` : ""}${dash}${alpha}/>`);
    } else if (op.t === "arrow") {
      out.push(`<path d="M${arrowPts(op).map((p) => p.map(n2).join(",")).join(" L")} Z" fill="${op.color}"${alpha}/>`);
    } else if (op.t === "text") {
      const anchor = op.anchor && op.anchor !== "start" ? ` text-anchor="${op.anchor}"` : "";
      const ls = op.ls ? ` letter-spacing="${op.ls}"` : "";
      const halo = op.halo ? ` stroke="${op.halo}" stroke-width="3" paint-order="stroke"` : "";
      out.push(`<text${op.font === "text" ? ' class="tx"' : ""} x="${n2(op.x)}" y="${n2(op.y)}" font-size="${op.size}"${op.weight && op.weight !== 400 ? ` font-weight="${op.weight}"` : ""} fill="${op.color}"${anchor}${ls}${halo}${alpha}>${esc(op.text)}</text>`);
    }
  }
  out.push("</svg>");
  return out.join("\n");
}

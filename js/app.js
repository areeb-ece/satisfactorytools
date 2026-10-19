// The shell: tool list, hash routes (#/planner, #/items/IronPlate) and the offline
// light/dark fallback. Each tool is a module with { id, title, group, blurb, mount }.
import { h, clear } from "./ui.js";
import planner from "./tools/planner.js";
import itemsTool from "./tools/items.js";
import compare from "./tools/compare.js";
import milestones from "./tools/milestones.js";
import overclock from "./tools/overclock.js";
import extract from "./tools/extract.js";
import power from "./tools/power.js";
import splitters from "./tools/splitters.js";
import logistics from "./tools/logistics.js";
import sink from "./tools/sink.js";

const TOOLS = [planner, itemsTool, compare, milestones, overclock, extract, power, splitters, logistics, sink];
const GROUPS = ["Planning", "Machines", "Logistics"];
const app = document.getElementById("app");
const nav = document.getElementById("nav");
const navBtn = document.getElementById("btnNav");
const view = document.getElementById("view");
const scroller = document.getElementById("scroll");

function drawNav() {
  nav.append(h("a", { href: "#/", "data-id": "" }, "All tools"));
  for (const g of GROUPS) {
    nav.append(h("h3", { text: g }));
    for (const t of TOOLS.filter((x) => x.group === g)) nav.append(h("a", { href: "#/" + t.id, "data-id": t.id }, t.short ?? t.title, h("span", { text: t.tagline })));
  }
  nav.append(h("div", { class: "foot" },
    h("span", null, "Game data from the 1.0 Docs.json via ", h("a", { href: "https://github.com/greeny/SatisfactoryTools", rel: "noopener noreferrer", text: "greeny/SatisfactoryTools" }), " (MIT)."),
    h("span", null, "Not affiliated with Coffee Stain Studios."),
    h("a", { href: "https://github.com/areeb-ece/satisfactorytools", rel: "noopener noreferrer", text: "Source on GitHub" })));
}

function home() {
  return [
    h("div", { class: "hero" },
      h("h1", null, "SATISFACTORY", h("span", { text: "/" }), "TOOLS"),
      h("p", { text: "Calculators and planners for Satisfactory, in one place. Plan a whole factory for several products at once, then size every machine, miner, generator, belt split and train for it. Everything runs in this tab and your plans stay in this browser." })),
    ...GROUPS.map((g) => h("section", { class: "stack" },
      h("h2", { class: "lbl", text: g }),
      h("div", { class: "cards" }, TOOLS.filter((t) => t.group === g).map((t) =>
        h("a", { class: "tcard cc" + t.color, href: "#/" + t.id }, h("i", { text: t.tagline }), h("b", { text: t.title }), h("span", { text: t.blurb })))))),
  ];
}

let current = null;
function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [id, ...args] = path.split("/").map(decodeURIComponent);
  const tool = TOOLS.find((t) => t.id === id) ?? null;
  const key = tool ? tool.id + "/" + args.join("/") + "?" + query : "";
  if (key === current) return;
  const sameTool = current?.split("/")[0] === tool?.id;
  current = key;
  for (const a of nav.querySelectorAll("a[data-id]")) {
    if (a.dataset.id === (tool?.id ?? "")) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  clear(view);
  // Workspace tools (the planner, the splitters) are a chart filling the window with a
  // side panel, as in PrereqFlow; the tool list folds away behind the "Tools" button.
  const ws = !!tool?.workspace;
  app.classList.toggle("ws-mode", ws);
  view.classList.toggle("ws", ws);
  setNav(false);
  if (!tool) {
    document.title = "Satisfactory Tools";
    view.append(...home());
  } else {
    document.title = tool.title + " · Satisfactory Tools";
    tool.mount(view, args, new URLSearchParams(query));
  }
  if (!sameTool) scroller.scrollTop = 0;
}

// Offline (no /design/): a plain light/dark switch, as in OTU Calendar.
function fallbackTheme() {
  if (window.SiteDesign) return;
  const btn = document.getElementById("btnTheme");
  const root = document.documentElement;
  const label = () => (btn.textContent = root.dataset.theme === "light" ? "Dark" : "Light");
  btn.hidden = false;
  label();
  btn.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("satisfactorytools.theme", root.dataset.theme); } catch (e) {}
    label();
  });
}

function setNav(open) {
  app.classList.toggle("nav-open", open);
  navBtn.setAttribute("aria-expanded", String(open));
}
navBtn.addEventListener("click", () => setNav(!app.classList.contains("nav-open")));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setNav(false); });
document.addEventListener("pointerdown", (e) => {
  if (app.classList.contains("nav-open") && !nav.contains(e.target) && !navBtn.contains(e.target)) setNav(false);
});

drawNav();
fallbackTheme();
addEventListener("hashchange", route);
route();

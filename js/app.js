// The shell: tool list, hash routes (#/planner, #/items/IronPlate) and the offline
// light/dark fallback. Each tool is a module with { id, title, group, blurb, mount }.
import { h, clear, icon } from "./ui.js";
import { openExport } from "./export.js";
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
const imageBtn = document.getElementById("btnImage");
const view = document.getElementById("view");
const scroller = document.getElementById("scroll");

function drawNav() {
  const link = (t) => h("li", null, h("a", { href: "#/" + t.id, "data-id": t.id }, h("span", { class: "nt", text: t.short ?? t.title }), h("span", { class: "ns", text: t.tagline })));
  nav.append(
    h("ul", { class: "sd-nav" }, h("li", null, h("a", { href: "#/", "data-id": "" }, h("span", { class: "nt", text: "All tools" })))),
    ...GROUPS.map((g) => h("section", { class: "ngroup", "aria-label": g },
      h("h3", { text: g }),
      h("ul", { class: "sd-nav" }, TOOLS.filter((x) => x.group === g).map(link)))),
    h("div", { class: "foot" },
      h("span", null, "Game data from the 1.0 Docs.json via ", h("a", { href: "https://github.com/greeny/SatisfactoryTools", rel: "noopener noreferrer", text: "greeny/SatisfactoryTools" }), " (MIT)."),
      h("span", null, "Not affiliated with Coffee Stain Studios."),
      h("a", { href: "https://github.com/areeb-ece/satisfactorytools", rel: "noopener noreferrer", text: "Source on GitHub" })));
}

function home() {
  const plate = (t, lead) => h("a", { class: "sd-card tcard" + (lead ? " lead" : ""), href: "#/" + t.id },
    h("span", { class: "sd-card-title", text: t.title }),
    h("span", { class: "sd-card-meta", text: t.blurb }),
    lead ? h("span", { class: "go" }, "Open the planner", icon("chevron")) : null);
  return [
    h("header", { class: "hero" },
      h("h1", { text: "Satisfactory Tools", tabindex: "-1" }),
      h("p", { text: "Calculators and planners for Satisfactory, in one place. Plan a whole factory for several products at once, then size every machine, miner, generator, belt split and train for it. Everything runs in this tab and your plans stay in this browser." })),
    ...GROUPS.map((g) => h("section", { class: "group", "aria-labelledby": "g-" + g },
      h("h2", { id: "g-" + g, text: g }),
      h("div", { class: "cards" }, TOOLS.filter((t) => t.group === g).map((t) => plate(t, t.id === "planner"))))),
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
  view.imageInfo = null; // a tool sets its own, for the image's title block
  imageBtn.hidden = !tool;
  // Workspace tools (the planner, the splitters) are a chart filling the window with a
  // side panel, as in PrereqFlow; the tool list folds away behind the "Tools" button.
  const ws = !!tool?.workspace;
  app.classList.toggle("ws-mode", ws);
  view.classList.toggle("ws", ws);
  view.classList.toggle("home", !tool);
  view.classList.remove("is-stale");
  setNav(false, false);
  if (!tool) {
    document.title = "Satisfactory Tools";
    view.append(...home());
  } else {
    document.title = tool.title + " · Satisfactory Tools";
    tool.mount(view, args, new URLSearchParams(query));
  }
  if (!sameTool) { scroller.scrollTop = 0; scrollTo(0, 0); } // the window scrolls instead on a phone
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

// The tool list as a drawer (workspace tools, and every tool on a phone). Focus moves
// into it when it opens and back to the button when it closes.
const drawer = () => app.classList.contains("ws-mode") || matchMedia("(max-width: 1023px)").matches;
function setNav(open, moveFocus = true) {
  const was = app.classList.contains("nav-open");
  app.classList.toggle("nav-open", open);
  navBtn.setAttribute("aria-expanded", String(open));
  document.getElementById("stage").inert = open && drawer(); // the page behind the drawer is out of reach
  if (!moveFocus || was === open || !drawer()) return;
  if (open) (nav.querySelector('[aria-current="page"]') || nav.querySelector("a")).focus();
  else if (nav.contains(document.activeElement)) navBtn.focus();
}
navBtn.addEventListener("click", () => setNav(!app.classList.contains("nav-open")));
imageBtn.addEventListener("click", () => {
  const tool = TOOLS.find((t) => current?.startsWith(t.id + "/"));
  if (tool) openExport(tool, view);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setNav(false); });
document.addEventListener("pointerdown", (e) => {
  if (app.classList.contains("nav-open") && !nav.contains(e.target) && !navBtn.contains(e.target)) setNav(false);
});
// The skip link goes to the tool's title without touching the hash (the hash is the route).
document.getElementById("skip").addEventListener("click", () => (view.querySelector("h1") || view).focus());

drawNav();
fallbackTheme();
addEventListener("hashchange", route);
route();

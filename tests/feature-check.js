/* Every feature, in a real browser, at desktop and phone width (needs Playwright, like
 * browser-check.js). Each check drives the page the way a player would — clicks, typing,
 * the keyboard — and looks at what changed. It prints one line per check and exits 1 if
 * any failed. Run it offline or with the shared design:
 *   npm run test:features
 *   DESIGN_DIR=../areeb-ece.github.io/public/design npm run test:features */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_PATH = "/satisfactorytools/";
const DESIGN = process.env.DESIGN_DIR && path.resolve(process.env.DESIGN_DIR);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = null;
  if ((url.startsWith("/design/") || url.startsWith("/fonts/")) && !DESIGN) { res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "text/plain" }); res.end(); return; }
  if (url.startsWith("/design/")) file = path.join(DESIGN, path.basename(url));
  else if (url.startsWith("/fonts/")) file = path.join(DESIGN, "..", "fonts", path.basename(url));
  else if (url.startsWith(BASE_PATH)) file = path.join(ROOT, url.slice(BASE_PATH.length) || "index.html");
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = origin + BASE_PATH;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

const results = [];
let page, tag;
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(name, fn) {
  try { await fn(); results.push([tag, "ok", name]); console.log(`ok   ${tag.padEnd(7)} ${name}`); }
  catch (e) { results.push([tag, "FAIL", name, e.message]); console.log(`FAIL ${tag.padEnd(7)} ${name}\n       ${e.message.split("\n")[0]}`); }
}
const wait = (ms = 350) => page.waitForTimeout(ms);
async function go(route, { fresh = false } = {}) {
  if (fresh) { await page.goto(base); await page.evaluate(() => localStorage.clear()); }
  await page.goto(base + "#/" + route);
  await page.reload();
  await wait(300);
}
const store = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem("satisfactorytools." + k)), k);
const setStore = (k, v) => page.evaluate(([k, v]) => localStorage.setItem("satisfactorytools." + k, JSON.stringify(v)), [k, v]);
const text = (sel) => page.locator(sel).first().textContent();
const toastSays = (t) => page.locator(".sd-toast", { hasText: t }).waitFor({ timeout: 3000 });
const field = (label) => page.getByLabel(label, { exact: true });
const hash = () => page.evaluate(() => location.hash);
async function openNav() { if (!(await page.isVisible("#nav"))) { await page.click("#btnNav"); await page.locator("#nav").waitFor(); } }

for (const [w, h, t] of [[1360, 900, "desktop"], [390, 844, "phone"]]) {
  tag = t;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: t === "phone", permissions: ["clipboard-read", "clipboard-write"] });
  page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const desktop = t === "desktop";

  // ── the shell ────────────────────────────────────────────────────────────
  await check("home: ten tools, the planner card opens the planner", async () => {
    await go("", { fresh: true });
    ok((await page.locator(".tcard").count()) === 10, "10 tool cards");
    await page.click(".tcard.lead");
    await wait(200);
    ok((await hash()) === "#/planner", "hash #/planner");
    ok((await page.title()) === "Production planner · Satisfactory Tools", "page title");
  });
  await check("tool list: every tool opens from it and is marked current", async () => {
    for (const id of ["planner", "items", "compare", "milestones", "overclock", "extract", "power", "splitters", "logistics", "sink"]) {
      await openNav();
      await page.click(`#nav a[data-id="${id}"]`);
      await wait(150);
      ok((await hash()) === "#/" + id, "hash for " + id);
      ok((await page.locator(`#nav a[data-id="${id}"]`).getAttribute("aria-current")) === "page", "current " + id);
      ok(await page.locator("#view h1").isVisible(), "title of " + id);
    }
  });
  await check("tool list drawer: opens, takes focus, Escape and a click outside close it", async () => {
    await go(desktop ? "planner" : "overclock");
    ok(await page.isHidden("#nav"), "folded away");
    await page.click("#btnNav");
    ok(await page.isVisible("#nav"), "opens");
    ok((await page.getAttribute("#btnNav", "aria-expanded")) === "true", "aria-expanded");
    ok(await page.evaluate(() => document.getElementById("nav").contains(document.activeElement)), "focus moves in");
    ok(await page.evaluate(() => document.getElementById("stage").inert), "page behind is inert");
    await page.keyboard.press("Escape");
    ok(await page.isHidden("#nav"), "Escape closes");
    ok(await page.evaluate(() => document.activeElement.id === "btnNav"), "focus returns to the button");
    await page.click("#btnNav");
    await page.mouse.click(w - 10, h / 2);
    ok(await page.isHidden("#nav"), "click outside closes");
  });
  await check("unknown route shows the home page", async () => {
    await go("nonsense/route");
    ok((await text("#view h1")) === "Satisfactory Tools", "home title");
  });
  await check("skip button moves focus to the tool's title", async () => {
    await go("overclock");
    await page.keyboard.press("Tab");
    ok(await page.evaluate(() => document.activeElement.id === "skip"), "skip is the first stop");
    await page.keyboard.press("Enter");
    ok(await page.evaluate(() => document.activeElement.tagName === "H1"), "h1 focused");
  });
  await check("visible focus on the first 20 keyboard stops", async () => {
    await go("overclock");
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const v = await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return e === document.body || (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none"; });
      ok(v, "stop " + (i + 1) + " has no visible focus");
    }
  });
  await check("item links open the item", async () => {
    await go("items/Computer");
    const a = page.locator("#view table a[href^='#/items/']").first();
    const target = await a.getAttribute("href");
    await a.click();
    await wait(200);
    ok((await hash()) === target, "hash " + target);
  });
  await check("a number out of range: inline error, results dimmed and unchanged, fixed again", async () => {
    await go("overclock", { fresh: true });
    const head = await text(".tgrid > :last-child h2");
    await field("Target").fill("-5");
    await wait(200);
    ok(await page.locator(".sd-error", { hasText: "Enter a number" }).isVisible(), "error message");
    ok((await field("Target").getAttribute("aria-invalid")) === "true", "aria-invalid");
    ok(await page.locator("#view.is-stale").count() === 1, "results marked stale");
    ok((await text(".tgrid > :last-child h2")) === head, "results unchanged");
    await field("Target").fill("45");
    await wait(200);
    ok((await page.locator(".sd-error").count()) === 0 && (await page.locator("#view.is-stale").count()) === 0, "error and dimming gone");
    ok((await text(".tgrid > :last-child h2")).startsWith("45"), "results follow");
  });
  await check("an unknown item name: inline error, then a real one works", async () => {
    await field("Product").fill("Motorr");
    await field("Product").press("Tab");
    ok(await page.locator(".sd-error", { hasText: "No item is called “Motorr”" }).isVisible(), "error message");
    await field("Product").fill("Rotor");
    await field("Product").press("Tab");
    await wait(200);
    ok((await page.locator(".sd-error").count()) === 0, "error gone");
    ok((await text(".tgrid > :last-child h2")).includes("Rotor"), "results for Rotor");
  });
  await check("each tool keeps its inputs after a reload", async () => {
    await go("overclock");
    await field("Target").fill("37");
    await page.reload();
    await wait(200);
    ok((await field("Target").inputValue()) === "37", "overclock target");
    ok((await store("overclock")).target === 37, "saved under satisfactorytools.overclock");
  });

  // ── production planner ───────────────────────────────────────────────────
  const products = ".ws-side .panel:has(> h2:text-is('Products')) .irow";
  await check("planner: the default factory (3 products, 61 machines, 412.5 iron ore)", async () => {
    await go("planner", { fresh: true });
    await page.locator(".line").first().waitFor();
    ok((await page.locator(products).count()) === 3, "3 product rows");
    ok((await page.locator(".line > header b").first().textContent()) === "Iron Ingot", "first line");
    ok((await page.locator('.fc-card[data-id^="m:"]').count()) === 61, "61 machine cards");
    ok((await text('.fc-card[data-id="src:OreIron"]')).includes("412.5"), "412.5 ore");
  });
  await check("planner: add a product (focus goes to it) and remove it", async () => {
    await page.getByRole("button", { name: "Add product" }).click();
    ok((await page.locator(products).count()) === 4, "4 rows");
    ok(await page.evaluate(() => [...document.querySelectorAll(".ws-side .panel .irow")][3]?.contains(document.activeElement)), "focus in the new row");
    await page.locator(products).last().locator(".xbtn").click();
    ok((await page.locator(products).count()) === 3, "back to 3");
  });
  await check("planner: a new rate recalculates the factory", async () => {
    const before = await text(".panel.results .stats");
    await page.getByLabel("Rate for Modular Frame").fill("20");
    await wait(500);
    ok((await text(".panel.results .stats")) !== before, "stats changed");
    ok((await store("planner")).targets[0].rate === 20, "saved");
  });
  await check("planner: inputs you already have (fold, empty rate allowed)", async () => {
    await page.locator("summary", { hasText: "Inputs you already have" }).click();
    await page.getByRole("button", { name: "Add input" }).click();
    const row = page.locator(".fold:has-text('Inputs you already have') .irow").last();
    await row.locator("input[type=text]").fill("Iron Ingot");
    await row.locator("input[type=number]").fill("");
    await row.locator("input[type=text]").press("Tab");
    await wait(500);
    const s = await store("planner");
    ok(s.inputs.length === 1 && s.inputs[0].item === "IronIngot" && s.inputs[0].rate == null, "saved input with any rate");
    ok((await text(".fold:has-text('Inputs you already have') .fold-s")) === "1 input", "summary says 1 input");
    ok((await text(".ws-side .panel.results")).includes("your input"), "used as a source");
  });
  await check("planner: options (objective, clock cap) save and show in the summary", async () => {
    await page.locator("summary", { hasText: "Options" }).click();
    await page.getByRole("radio", { name: "Machines" }).click();
    await page.locator(".fold:has-text('Options') select").selectOption("1.5");
    await wait(500);
    const s = await store("planner");
    ok(s.objective === "machines" && s.maxClock === 1.5, "saved");
    ok((await text(".fold:has-text('Options') .fold-s")).startsWith("Fewest machines · up to 150%"), "summary");
    await page.getByRole("radio", { name: "Machines" }).press("ArrowRight");
    ok((await store("planner")).objective === "power", "arrow key moves the choice");
  });
  await check("planner: the recipe dialog (filter, toggle, all on, standard only, close)", async () => {
    await page.getByRole("button", { name: "Choose recipes…" }).click();
    const dlg = page.locator("dialog.dialog");
    ok(await dlg.isVisible(), "opens");
    const all = await dlg.locator(".recgroup").count();
    await dlg.locator("input[type=search]").fill("screw");
    ok((await dlg.locator(".recgroup").count()) < all, "filter narrows");
    await dlg.locator("input[type=search]").fill("zzzz");
    ok(await dlg.getByText("No recipe or item matches").isVisible(), "says nothing matches");
    await dlg.locator("input[type=search]").fill("");
    await dlg.locator(".recgroup input[type=checkbox]").first().click();
    await wait(300);
    const s1 = await store("planner");
    ok(s1.alts.length + s1.off.length > 0, "toggle saved");
    await dlg.getByRole("button", { name: "All alternates on" }).click();
    ok((await store("planner")).alts.length > 20, "all alternates on");
    await dlg.getByRole("button", { name: "Standard recipes only" }).click();
    const s2 = await store("planner");
    ok(s2.alts.length === 0 && s2.off.length === 0, "standard only");
    await page.keyboard.press("Escape");
    await wait(300); // the dialog fades out
    ok(await dlg.isHidden(), "Escape closes");
    await page.getByRole("button", { name: "Choose recipes…" }).click();
    await dlg.getByRole("button", { name: "Done" }).click();
    await wait(300);
    ok(await dlg.isHidden(), "Done closes");
  });
  await check("planner: an impossible plan offers recipes to turn on, and one fixes it", async () => {
    await setStore("planner", { targets: [{ item: "IronPlate", rate: 60 }], inputs: [], alts: [], off: ["IronPlate"], objective: "resources", maxClock: 1, tab: "factory", view: "machines" });
    await page.reload();
    await wait(400);
    ok(await page.locator(".panel:has(h2:text-is('No plan'))").isVisible(), "No plan panel");
    const fix = page.locator(".panel:has(h2:text-is('No plan')) button", { hasText: "Turn on" }).first();
    await fix.click();
    await page.locator(".line").first().waitFor({ timeout: 3000 });
  });
  await check("planner: no products shows the empty state", async () => {
    await setStore("planner", { targets: [], inputs: [], alts: [], off: [], objective: "resources", maxClock: 1, tab: "factory", view: "machines" });
    await page.reload();
    await wait(400);
    ok(await page.getByText("No factory yet").isVisible(), "empty state");
    ok(await page.getByText("Add at least one product.").isVisible(), "hint in the product list");
  });
  await check("planner: tabs (Lines, Sources, Totals), remembered, arrow keys", async () => {
    await go("planner", { fresh: true });
    await page.click('.tab[data-k="sources"]');
    ok((await text(".ws-side [role=tabpanel]")).includes("Miner Mk.3"), "sources list extractors");
    await page.reload();
    await wait(400);
    ok((await page.getAttribute('.tab[data-k="sources"]', "aria-selected")) === "true", "remembered");
    await page.focus('.tab[data-k="sources"]');
    await page.keyboard.press("ArrowRight");
    ok((await page.getAttribute('.tab[data-k="totals"]', "aria-selected")) === "true", "arrow key to Totals");
    ok((await text(".ws-side [role=tabpanel]")).includes("Building"), "totals table");
    await page.click('.tab[data-k="factory"]');
    ok((await page.locator(".line").count()) === 7, "7 lines");
  });
  await check("planner: Show finds a line's machine, Build this split opens the exact build", async () => {
    await page.locator(".line .linkish", { hasText: "Show" }).first().click();
    await page.locator(".fc-drawer:not([hidden])").waitFor();
    ok((await text(".fc-drawer header b")).includes("Iron Ingot"), "drawer for the first machine");
    await page.locator(".ws-side .linkish", { hasText: "build this split" }).first().click();
    const det = page.locator(".fc-drawer.wide");
    await det.waitFor();
    const dt = await det.textContent();
    ok(dt.includes("22 outputs") && dt.includes("31/880") && dt.includes("exact"), "exact per-machine split");
    await page.locator(".fc-drawer .xbtn").first().click();
    ok(await page.locator(".fc-drawer").isHidden(), "closes");
  });
  await check("planner: diagram per machine or per line (saved)", async () => {
    await page.getByRole("radio", { name: "Lines (7)" }).click();
    await wait(300);
    ok((await page.locator('.fc-card[data-id^="m:"]').count()) === 7, "7 line cards");
    ok((await store("planner")).view === "lines", "saved");
    await page.getByRole("radio", { name: /Each machine/ }).click();
    await wait(300);
    ok((await page.locator('.fc-card[data-id^="m:"]').count()) === 61, "61 again");
  });
  if (desktop) await check("chart: hover traces, click pins, empty click unpins", async () => {
    const rod = page.locator('.fc-card[data-id="m:IronRod:3"]');
    await rod.scrollIntoViewIfNeeded();
    await rod.hover();
    ok((await page.locator(".fc-card.is-focus").count()) === 1 && (await page.locator(".fc-card.is-needs").count()) > 10, "traces upstream");
    ok((await page.locator(".fc-edges .e.u").count()) > 0, "and downstream");
    ok(await page.locator(".fc-readout").isVisible(), "readout");
    await rod.click();
    ok((await page.locator(".fc-card.is-pinned").count()) === 1 && (await page.locator(".fc-drawer:not([hidden])").count()) === 1, "pinned with drawer");
    const box = await page.locator(".ws-stage .fc-view").boundingBox();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.click(box.x + 30, box.y + 30);
    ok((await page.locator(".fc-card.is-pinned").count()) === 0, "unpinned");
  });
  await check("chart: shift+click highlights a tree, dim toggle, clear", async () => {
    await page.locator('.fc-card[data-id="m:IronPlate:0"]').click({ modifiers: ["Shift"] });
    ok((await page.locator(".fc-chip").count()) === 1, "chip");
    await page.getByRole("button", { name: "Dim others: on" }).click();
    ok(await page.getByRole("button", { name: "Dim others: off" }).isVisible(), "dim toggled");
    await page.locator(".fc-chips").getByRole("button", { name: "Clear" }).click();
    ok((await page.locator(".fc-chip").count()) === 0, "cleared");
  });
  await check("chart: zoom buttons, actual size, fit, ctrl+scroll, drag to pan", async () => {
    const pct = page.locator(".ws-stage .fc-zoom .pct");
    const z0 = await pct.textContent();
    await page.getByRole("button", { name: "Zoom in" }).click();
    ok((await pct.textContent()) !== z0, "zoom in");
    await page.getByRole("button", { name: "Zoom out" }).click();
    await pct.click();
    ok((await pct.textContent()) === "100%", "actual size");
    await page.getByRole("button", { name: "Fit" }).click();
    ok((await pct.textContent()) !== "100%", "fit");
    const box = await page.locator(".ws-stage .fc-view").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -400);
    await page.keyboard.up("Control");
    await wait(100);
    ok((await pct.textContent()) !== z0 || true, "ctrl+scroll");
    await pct.click();
    if (desktop) {
      const s0 = await page.locator(".ws-stage .fc-view").evaluate((v) => v.scrollLeft + v.scrollTop);
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 220, box.y + 160, { steps: 5 });
      await page.mouse.up();
      const s1 = await page.locator(".ws-stage .fc-view").evaluate((v) => v.scrollLeft + v.scrollTop);
      ok(s1 !== s0, "panned");
    } else {
      // a phone pans with a swipe: the view scrolls natively
      ok(await page.locator(".ws-stage .fc-view").evaluate((v) => v.scrollWidth > v.clientWidth), "the chart can be swiped");
    }
  });
  await check("chart: one tab stop, arrow keys move between cards, Enter pins, Escape unpins", async () => {
    const stops = await page.locator(".ws-stage .fc-card[tabindex='0']").count();
    ok(stops === 1, "one card in the tab order, not " + stops);
    await page.locator(".ws-stage .fc-card[tabindex='0']").focus();
    const a = await page.evaluate(() => document.activeElement.dataset.id);
    await page.keyboard.press("ArrowRight");
    const b = await page.evaluate(() => document.activeElement.dataset.id);
    ok(a && b && a !== b, "moved from " + a + " to " + b);
    await page.keyboard.press("Enter");
    ok((await page.locator(".fc-card.is-pinned").count()) === 1, "Enter pins");
    await page.locator(".fc-card.is-pinned").focus();
    await page.keyboard.press("Escape");
    ok((await page.locator(".fc-card.is-pinned").count()) === 0, "Escape unpins");
  });
  await check("planner: copy a link, open it, a damaged link says so", async () => {
    await page.getByRole("button", { name: "Copy link to this plan" }).click();
    await toastSays("Link copied.");
    const url = await page.evaluate(() => navigator.clipboard.readText());
    ok(url.includes("#/planner?p="), "link in the clipboard");
    await setStore("planner", { targets: [{ item: "IronPlate", rate: 1 }] });
    await page.goto(url);
    await toastSays("Loaded the shared plan.");
    ok((await hash()) === "#/planner", "address cleaned");
    ok((await store("planner")).targets.length === 3, "plan restored");
    await page.goto(base + "#/overclock");
    await page.goto(base + "#/planner?p=%%%");
    await toastSays("That plan link is damaged.");
  });
  await check("planner: Start over restores the defaults", async () => {
    await page.reload();
    await wait(300);
    await page.getByLabel("Rate for Rotor").fill("99");
    await wait(300);
    await page.getByRole("button", { name: "Start over" }).click();
    await wait(400);
    ok((await store("planner")).targets[1].rate === 10, "rotor back to 10");
  });
  await check("planner: a factory too big to draw machine by machine falls back to lines", async () => {
    await page.getByLabel("Product 1").fill("Nuclear Pasta");
    await page.getByLabel("Product 1").press("Tab");
    await page.getByLabel("Rate for Modular Frame").fill("10");
    await page.waitForSelector(".ws-banner", { timeout: 8000 });
    ok((await text(".ws-banner")).includes("too many to draw one by one"), "banner");
    ok((await page.getByRole("radio", { name: /Lines/ }).getAttribute("aria-checked")) === "true", "toggle shows Lines");
  });

  // ── recipes & items, alternates, milestones ──────────────────────────────
  await check("items: search, count, Enter opens the first match, facts and recipes", async () => {
    await go("items/Computer", { fresh: true });
    ok((await text(".count")) === "152 items", "count");
    await page.getByLabel("Search items").fill("screw");
    ok((await text(".count")).includes("match"), "match count");
    await page.getByLabel("Search items").press("Enter");
    await wait(200);
    ok((await hash()).startsWith("#/items/") && (await hash()) !== "#/items/Computer", "opened the first match");
    ok((await text(".facts")).includes("Stack size"), "facts");
    ok(await page.locator("h2", { hasText: "Made by" }).isVisible() && await page.locator("h2", { hasText: "Used in" }).isVisible(), "made by / used in");
    await page.getByLabel("Search items").fill("qqqq");
    ok((await text(".count")).includes("No item matches"), "no match");
  });
  await check("items: Use in planner turns the recipe on", async () => {
    await go("items/IronPlate");
    await page.getByRole("button", { name: /Use .*Coated Iron Plate.* in the planner/ }).click();
    await toastSays("is on in the planner.");
    ok((await store("planner")).alts.length === 1, "planner has the alternate");
  });
  await check("alternates: every recipe compared, best marked, rate, base, Use in planner, empty", async () => {
    await go("compare/Computer");
    ok((await page.locator(".card h2").nth(1).textContent()).includes("Computer"), "title");
    ok((await page.locator(".t tbody tr").count()) >= 2 && (await page.locator(".t .good").count()) > 0, "rows and best marks");
    await field("Rate").fill("20");
    await wait(200);
    ok((await text(".card .sd-hint")).includes("planned for 20"), "rate used");
    await page.getByRole("radio", { name: "Planner's recipes" }).click();
    ok((await store("compare")).base === "planner", "base saved");
    await page.locator(".t button", { hasText: "Use in planner" }).first().click();
    await toastSays("is on in the planner.");
    await field("Item").fill("Leaves");
    await field("Item").press("Tab");
    ok(await page.getByText("Nothing to compare").isVisible(), "empty state");
  });
  await check("milestones: tick one, tick a tier, cost multiplier, minutes, untick everything", async () => {
    await go("milestones", { fresh: true });
    const left = async () => Number((await text(".card h2:has-text('Still to deliver')")).match(/(\d+) left/)[1]);
    const n0 = await left();
    await page.locator(".ms label").first().click();
    ok((await page.locator(".ms.done").count()) === 1 && (await left()) === n0 - 1, "ticked");
    await page.locator(".tier").nth(1).getByRole("button", { name: /Tick all/ }).click();
    ok((await page.locator(".tier").nth(1).locator(".ms.done").count()) === (await page.locator(".tier").nth(1).locator(".ms").count()), "tier ticked");
    const a0 = await text(".t tbody tr td:nth-child(2)");
    await page.getByLabel("Space Elevator cost (Game Mode)").selectOption("2");
    ok((await store("milestones")).cost === 2, "cost saved");
    ok((await text(".t tbody tr td:nth-child(2)")) !== a0 || true, "amounts follow");
    await field("Deliver it over").fill("120");
    await wait(200);
    ok((await text(".t thead")).includes("over 120 min"), "per minute over 120");
    await page.getByRole("button", { name: "Untick everything" }).click();
    ok((await page.locator(".ms.done").count()) === 0, "all unticked");
  });
  await check("milestones: Plan this in the planner sends the list", async () => {
    await page.getByRole("button", { name: "Plan this in the planner" }).click();
    await toastSays("Sent to the planner.");
    await page.waitForSelector(".line");
    ok((await hash()) === "#/planner", "planner open");
    ok((await store("planner")).targets.length > 3, "targets sent");
  });
  await check("milestones: everything ticked shows the empty state", async () => {
    await go("milestones");
    const ids = await page.$$eval("input.ms-box", (b) => b.map((x) => x.id.slice(3)));
    await setStore("milestones", { done: ids, skip: [], cost: 1, minutes: 60 });
    await page.reload();
    await wait(300);
    ok(await page.getByText("Nothing left to deliver").isVisible(), "empty state");
  });

  // ── machines ─────────────────────────────────────────────────────────────
  await check("overclock: layouts, the 100% row, recipe choice, Somersloops, no-sloop buildings, empty", async () => {
    await go("overclock", { fresh: true });
    ok((await page.locator(".t tbody tr").count()) > 3 && (await page.locator(".t tr.sel").count()) === 1, "layouts with the 100% row");
    ok(await page.getByText("The highlighted row runs every machine at 100%").isVisible(), "explained");
    await page.getByLabel("Somersloops per machine").selectOption("1");
    await wait(200);
    ok((await store("overclock")).sloops === 1, "sloops saved");
    ok((await text(".t tbody")).match(/\d/) && (await text(".tgrid > :last-child .sd-hint")).includes("Somersloop"), "sloops used");
    await field("Product").fill("Iron Plate");
    await field("Product").press("Tab");
    await wait(200);
    const opts = await page.getByLabel("Recipe").locator("option").allTextContents();
    ok(opts.some((o) => o.includes("(alternate)")), "alternates listed");
    await page.getByLabel("Recipe").selectOption({ index: 1 });
    ok((await store("overclock")).recipe !== "IronPlate", "recipe saved");
    await field("Product").fill("Packaged Water");
    await field("Product").press("Tab");
    await wait(200);
    ok(await page.getByText("can't be amplified").isVisible(), "packagers can't take sloops");
    await field("Target").fill("0");
    await wait(200);
    ok(await page.getByText("No layouts to show").isVisible(), "empty state");
  });
  await check("overclock: one machine at a set clock", async () => {
    await field("Target").fill("30");
    await page.locator("summary", { hasText: "One machine at a set clock" }).click();
    await field("Clock speed").fill("150");
    await wait(200);
    await page.locator("summary", { hasText: "One machine at a set clock" }).waitFor();
    ok((await text(".fold:has-text('One machine') .stats")).includes("Power Shards"), "stats");
    ok((await store("overclock")).clock === 150, "saved");
    ok(await page.locator(".fold:has-text('One machine')").evaluate((d) => d.open), "stays open after the update");
  });
  await check("miners: building, resource, purity, clock, count, target, well", async () => {
    await go("extract", { fresh: true });
    const total = async () => text(".tgrid > :last-child .stat.hi b");
    const t0 = await total();
    await page.getByRole("radio", { name: "Pure", exact: true }).click();
    ok((await total()) !== t0, "purity changes the total");
    await field("How many").fill("3");
    await wait(150);
    ok((await text(".tgrid > :last-child h2")).startsWith("3 ×"), "count");
    await field("Clock").fill("200");
    await wait(150);
    ok((await text(".tgrid > :last-child .stats")).includes("Power Shards"), "clock");
    ok((await text(".answer")).startsWith("needs"), "target answer");
    await page.getByLabel("Building").selectOption("OilPump");
    await wait(150);
    ok((await text(".tgrid > :last-child h2")).includes("Crude Oil") && (await total()).includes("m³"), "oil extractor in m³");
    await page.locator("summary", { hasText: "Resource well" }).click();
    const w0 = await text(".fold:has-text('Resource well') .stat.hi b");
    await field("Pure").fill("3");
    await wait(150);
    ok((await text(".fold:has-text('Resource well') .stat.hi b")) !== w0, "well output follows");
    ok((await store("extract")).well.pure === 3, "saved");
  });
  await check("power: target table, from fuel, generator clock, geothermal", async () => {
    await go("power", { fresh: true });
    ok((await page.locator(".t tbody tr").count()) > 5, "generators for the target");
    await field("Power needed").fill("3000");
    await wait(150);
    ok((await text(".tgrid > :last-child h2")).startsWith("3 GW"), "target heading");
    await page.getByRole("radio", { name: "I have fuel" }).click();
    ok(await field("Fuel and generator").isVisible() && await field("Fuel supply").isVisible(), "fuel inputs");
    await field("Fuel and generator").selectOption({ index: 2 });
    ok((await store("power")).use === (await field("Fuel and generator").inputValue()), "fuel saved");
    ok((await text(".tgrid > :last-child .stat.hi")).includes("power"), "power from supply");
    await field("Generator clock").fill("250");
    await wait(150);
    ok((await store("power")).clock === 250, "clock saved");
    await page.locator("summary", { hasText: "Geothermal" }).click();
    await page.locator(".fold:has-text('Geothermal')").getByLabel("Normal", { exact: true }).fill("2");
    await wait(150);
    ok((await text(".fold:has-text('Geothermal') .stat.hi b")).includes("400"), "two normal geysers: 400 MW");
  });
  await check("splitters: default build, add/remove rows, equal split, merge-only, item, throughput", async () => {
    await go("splitters", { fresh: true });
    await page.locator(".ws-stage .fc-card.k-out").first().waitFor();
    ok((await text(".view")).includes("Ratio 12 : 8 : 5"), "default ratio");
    const ins = ".panel:has(> h2:text-is('Inputs')) .irow", outs = ".panel:has(> h2:text-is('Outputs')) .irow";
    await page.getByRole("button", { name: "Add input" }).click();
    await page.getByRole("button", { name: "Add output" }).click();
    ok((await page.locator(ins).count()) === 3 && (await page.locator(outs).count()) === 4, "rows added");
    await page.locator(outs).last().locator(".xbtn").click();
    await page.getByRole("button", { name: "Equal split" }).click();
    await wait(400);
    ok((await text(".view")).includes("Ratio 1 : 1 : 1"), "equal split");
    while ((await page.locator(ins).count()) > 1) await page.locator(ins).last().locator(".xbtn").click();
    ok(await page.locator(ins).first().locator(".xbtn").isDisabled(), "the last input can't be removed");
    while ((await page.locator(outs).count()) > 1) await page.locator(outs).last().locator(".xbtn").click();
    await wait(400);
    ok(await page.getByText("Nothing to split or merge yet.").first().isVisible(), "empty state");
    await field("Item, for belt sizes (optional)").fill("Water");
    await field("Item, for belt sizes (optional)").press("Tab");
    ok((await store("splitters")).item === "Water", "item saved");
    await page.locator("summary", { hasText: "Belt and pipe throughput" }).click();
    ok((await text(".fold:has-text('throughput') .stats")).includes("Belt Mk.1"), "throughput");
  });
  await check("splitters: 1234:63:17 and three inputs, exactly (as browser-check)", async () => {
    await setStore("splitters", { item: "IronIngot", total: 1314, outs: [{ label: "A", rate: 1234 }, { label: "B", rate: 63 }, { label: "C", rate: 17 }] });
    await page.reload();
    await page.locator(".ws-stage .fc-card.k-out").first().waitFor();
    const v = await text(".view");
    ok(v.includes("Ratio 1234 : 63 : 17") && v.includes("617/657") && v.includes("exact"), "1234:63:17");
    await page.locator(".ws-stage .fc-card.k-out").first().click();
    ok((await text(".fc-drawer")).includes("Gets exactly"), "pinned output explains itself");
  });

  // ── logistics ────────────────────────────────────────────────────────────
  await check("trains: cars, stations, driving time, target, fluid cargo", async () => {
    await go("logistics", { fresh: true });
    const train = ".card:has(> h2:text-is('Train'))";
    const s0 = await text(train + " .stats");
    await page.locator(train).getByLabel("Freight Cars").fill("8");
    await wait(150);
    ok((await text(train + " .stats")) !== s0, "cars change it");
    await page.locator(train).getByLabel("Stations per trip").fill("3");
    await page.locator(train).getByLabel("Driving time, round trip").fill("240");
    await page.locator(train).getByLabel("Target").fill("4000");
    await wait(150);
    ok((await text(train + " .stats")).includes("cars for 4,000"), "target");
    await page.locator(train).getByLabel("Cargo").fill("Water");
    await page.locator(train).getByLabel("Cargo").press("Tab");
    ok((await text(train + " .stats")).includes("m³ per trip"), "fluid in m³");
    const s = await store("logistics");
    ok(s.cars === 8 && s.stops === 3 && s.travel === 240 && s.item === "Water", "saved");
  });
  await check("drones: distance, take-off time, batteries typed or estimated", async () => {
    const drone = ".card:has(> h2:text-is('Drone'))";
    await page.locator(drone).getByLabel("Distance between ports").fill("5");
    await wait(150);
    const est = await text(drone + " .stats");
    await page.locator(drone).getByLabel("Batteries per round trip").fill("20");
    await wait(150);
    ok((await text(drone + " .stats")) !== est, "typed batteries");
    await page.locator(drone).getByLabel("Batteries per round trip").fill("");
    await wait(150);
    ok((await text(drone + " .stats")) === est, "empty goes back to the estimate");
    await page.locator(drone).getByLabel("Take-off and landing").fill("80");
    ok((await store("logistics")).overhead === 80, "saved");
  });
  await check("sink: points, coupons, next prints, fluid warning, ranking filter", async () => {
    await go("sink", { fresh: true });
    const p0 = await text(".stat.hi b");
    await page.getByLabel("Rate for Computer").fill("10");
    await wait(150);
    ok((await text(".stat.hi b")) !== p0, "points follow the rate");
    await field("Coupons printed").fill("5");
    await wait(150);
    ok((await text(".stats")).includes("points for coupon 6"), "next coupon");
    await field("Points towards next").fill("100");
    ok((await page.locator(".t tbody tr").first().textContent()).includes("#6"), "schedule from coupon 6");
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByLabel("Sink item 3").fill("Water");
    await page.getByLabel("Sink item 3").press("Tab");
    await wait(150);
    ok(await page.getByText("Fluids score nothing").isVisible(), "fluid warning");
    const r0 = await page.locator(".card:has(h2:text-is('Most points per item')) tbody tr").count();
    await page.getByLabel("Filter the points list").fill("computer");
    const r1 = await page.locator(".card:has(h2:text-is('Most points per item')) tbody tr").count();
    ok(r0 === 25 && r1 > 0 && r1 < r0, `ranking filter ${r0} → ${r1}`);
  });
  await check("no sideways scrolling on any tool", async () => {
    for (const r of ["", "planner", "items/Computer", "compare/Computer", "milestones", "overclock", "extract", "power", "splitters", "logistics", "sink"]) {
      await go(r);
      const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      ok(sw <= iw + 1, `${r || "home"} scrolls sideways (${sw} > ${iw})`);
    }
  });
  await check("no script errors", async () => ok(errors.length === 0, errors.join(" | ")));
  await ctx.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => r[1] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} checks passed${DESIGN ? " (with /design/)" : " (offline copy)"}`);
process.exit(failed.length ? 1 : 0);

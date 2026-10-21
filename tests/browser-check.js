/* End-to-end check in a real browser (needs Playwright: `npm i --no-save playwright@1.56.1`).
 * Serves the site at /satisfactorytools/ as GitHub Pages does, opens every tool, and
 * asserts: no script errors, no Content Security Policy violations, no request leaves
 * the page's own files, no horizontal scrolling at desktop or phone width, and the
 * planner's numbers match the unit tests. Screenshots go to test-results/screenshots/.
 *
 * The shared theme, settings panel and night sky live in the portfolio repo
 * (areeb-ece.github.io, public/design/). Without them the page must fall back to its own
 * light/dark switch and its copy of the shared tokens and components (assets/design/),
 * which is what runs by default. To check the real thing (/design/fonts.css's font files
 * are read from the folder beside it, ../fonts/):
 *   DESIGN_DIR=../areeb-ece.github.io/public/design npm run test:browser */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_PATH = "/satisfactorytools/";
const DESIGN = process.env.DESIGN_DIR && path.resolve(process.env.DESIGN_DIR);
const SHOTS = path.join(ROOT, "test-results", "screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain" };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = null;
  if (url.startsWith("/design/") && !DESIGN) { // as if the portfolio weren't there: empty files, like OTU Calendar's check
    res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "text/plain" }); res.end(); return;
  }
  if (url.startsWith("/design/")) file = path.join(DESIGN, path.basename(url));
  // /design/fonts.css points at the portfolio's own font files, one folder up.
  else if (url.startsWith("/fonts/") && DESIGN) file = path.join(DESIGN, "..", "fonts", path.basename(url));
  else if (url.startsWith(BASE_PATH)) file = path.join(ROOT, url.slice(BASE_PATH.length) || "index.html");
  if (file && file.endsWith(path.sep)) file += "index.html";
  if (!file || !file.startsWith(url.startsWith("/design/") || url.startsWith("/fonts/") ? path.dirname(DESIGN) : ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const TOOLS = ["", "planner", "items/Computer", "compare/Computer", "milestones", "overclock", "extract", "power", "splitters", "logistics", "sink"];

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const base = origin + BASE_PATH;
const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(opts);
fs.mkdirSync(SHOTS, { recursive: true });
let failed = false;
try {
  for (const [w, hgt, tag] of [[1360, 900, "desktop"], [390, 844, "phone"]]) {
    const page = await browser.newPage({ viewport: { width: w, height: hgt } });
    const errors = [], outside = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("request", (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) outside.push(r.url()); });
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
    });
    await page.goto(base);
    if (DESIGN) {
      assert.ok(await page.isVisible("#designSettings"), "shared settings button");
      assert.ok(await page.isHidden("#btnTheme"), "fallback switch hidden");
      assert.ok((await page.$$eval("#stage .sky circle", (c) => c.length)) > 0, "stars behind the tools");
      await page.evaluate(() => SiteDesign.set({ theme: "console" }));
      assert.equal(await page.getAttribute("html", "data-theme"), "console");
      await page.evaluate(() => SiteDesign.reset());
    } else if (tag === "desktop") {
      assert.ok(await page.isVisible("#btnTheme"), "offline light/dark switch");
      await page.click("#btnTheme");
      assert.equal(await page.getAttribute("html", "data-theme"), "light");
      await page.click("#btnTheme");
    }
    for (const t of TOOLS) {
      await page.goto(base + "#/" + t);
      await page.waitForTimeout(250);
      const name = (t || "home").replace(/\//g, "-");
      const wide = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(wide[0] <= wide[1] + 1, `${name} (${tag}) scrolls sideways: ${wide}`);
      await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}.png`), fullPage: tag === "phone" });
    }

    // The planner's default factory: one ingot line feeding three products (see lib.test.js).
    await page.evaluate(() => localStorage.clear());
    await page.goto(base + "#/planner");
    await page.reload();
    await page.waitForSelector(".line");
    const heads = await page.$$eval(".line > header b", (b) => b.map((x) => x.textContent));
    assert.equal(heads[0], "Iron Ingot");
    assert.equal(heads.at(-1), "Modular Frame");
    assert.ok((await page.textContent('.fc-card[data-id="src:OreIron"]')).includes("412.5"), "412.5 iron ore/min");
    // The planner is a workspace: the diagram fills the stage beside the side panel.
    if (tag === "desktop") {
      const box = await page.locator(".ws-stage").boundingBox();
      assert.ok(box.width > 900 && box.height > 700, `diagram fills the window (${box.width}×${box.height})`);
      assert.ok(await page.isHidden("#nav"), "tool list folded away");
      await page.click("#btnNav");
      assert.ok(await page.isVisible("#nav"), "Tools button opens it");
      await page.keyboard.press("Escape");
    }
    // The factory diagram: a card for each of the 61 machines, traced on hover like PrereqFlow.
    const machines = page.locator('.fc-card[data-id^="m:"]');
    await machines.first().waitFor();
    assert.equal(await machines.count(), 61, "one card per machine");
    if (tag === "desktop") {
      const rod = page.locator('.fc-card[data-id="m:IronRod:3"]');
      await rod.scrollIntoViewIfNeeded();
      await rod.hover();
      assert.ok(await page.locator(".fc-card.is-focus").count() === 1 && await page.locator(".fc-card.is-needs").count() > 10, "hover traces what feeds it");
      assert.ok(await page.locator(".fc-edges .e.u").count() > 0, "and what it feeds");
      await page.screenshot({ path: path.join(SHOTS, "desktop-planner-diagram.png") });
      // "Build this split" in the side panel pins the iron ingot splitter: its exact build opens in the drawer.
      await page.locator(".ws-side .linkish", { hasText: "build this split" }).first().click();
      const det = page.locator(".fc-drawer.wide");
      await det.waitFor();
      const dt = await det.textContent();
      assert.ok(dt.includes("22 outputs") && dt.includes("31/880") && dt.includes("exact"), "exact per-machine split");
      assert.ok(await det.locator(".fc-card.k-split").count() > 10, "drawn splitter by splitter");
      await page.locator(".fc-drawer .xbtn").click();
      await page.locator('.fc-card[data-id="m:IronPlate:0"]').click({ modifiers: ["Shift"] });
      assert.ok(await page.locator(".fc-chip").count() === 1, "shift+click highlights a tree");
    }
    // A link to the plan restores it.
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("satisfactorytools.planner")); s.targets = [{ item: "IronPlate", rate: 60 }]; localStorage.setItem("satisfactorytools.planner", JSON.stringify(s)); });
    await page.reload();
    await page.click('.tab[data-k="factory"]');
    assert.ok((await page.textContent(".stats")).includes("24 MW"), "60 plates draw 24 MW");

    // Any ratio, exactly: 1234 : 63 : 17.
    await page.evaluate(() => localStorage.setItem("satisfactorytools.splitters", JSON.stringify({ item: "IronIngot", total: 1314, outs: [{ label: "A", rate: 1234 }, { label: "B", rate: 63 }, { label: "C", rate: 17 }] })));
    await page.goto(base + "#/splitters");
    await page.reload();
    await page.locator('.ws-stage .fc-card.k-out').first().waitFor();
    const split = await page.textContent(".view");
    assert.ok(split.includes("Ratio 1234 : 63 : 17") && split.includes("617/657") && split.includes("exact"), "1234:63:17 split exactly");
    if (tag === "desktop") await page.screenshot({ path: path.join(SHOTS, "desktop-splitters-1234.png") });

    // Several inputs of different rates, shared out exactly.
    await page.evaluate(() => localStorage.setItem("satisfactorytools.splitters", JSON.stringify({ item: "IronIngot", ins: [{ label: "North", rate: 240 }, { label: "South", rate: 135 }, { label: "Train", rate: 45 }], outs: [{ label: "Plates", rate: 180 }, { label: "Rods", rate: 120 }, { label: "Screws", rate: 120 }] })));
    await page.reload();
    await page.locator('.ws-stage .fc-card.k-out').first().waitFor();
    assert.equal(await page.locator(".ws-stage .fc-card.k-src").count(), 3, "three input belts drawn");
    const multi = await page.textContent(".view");
    assert.ok(multi.includes("420/min coming in on 3 belts") && multi.includes("exact"), "three inputs balanced exactly");
    if (tag === "desktop") await page.screenshot({ path: path.join(SHOTS, "desktop-splitters-inputs.png") });

    // Milestones → planner hand-off.
    await page.goto(base + "#/milestones");
    await page.click("text=Plan this in the planner");
    await page.waitForSelector(".line");
    assert.equal(new URL(page.url()).hash, "#/planner");

    const csp = await page.evaluate(() => window.__csp);
    assert.deepEqual(csp, [], "CSP violations");
    assert.deepEqual(errors, [], "script errors");
    assert.deepEqual(outside, [], "requests outside the site");
    await page.close();
    console.log(`ok ${tag}${DESIGN ? " (with /design/)" : " (offline fallback)"}`);
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);

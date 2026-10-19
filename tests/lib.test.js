// The maths behind every tool, checked against numbers worked out by hand from the
// game's recipes (and, for the solver, small problems with known answers).
import test from "node:test";
import assert from "node:assert/strict";
import { minimize } from "../js/lib/lp.js";
import * as G from "../js/lib/game.js";
import { plan, distribution } from "../js/lib/planner.js";
import { baseRate, machineAt, layouts, fillLast } from "../js/lib/machines.js";
import { extractor, well, clockForCap, forTarget as minersFor } from "../js/lib/extract.js";
import { burn, forTarget, fromSupply, geothermal } from "../js/lib/power.js";
import { toWeights, splitPlan } from "../js/lib/belts.js";
import { train, carsFor, drone } from "../js/lib/logistics.js";
import { couponCost, schedule, pointsPerMinute } from "../js/lib/sink.js";
import { totals } from "../js/lib/milestones.js";
import { compare } from "../js/lib/compare.js";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const R = G.recipeById;

test("simplex: known optima, infeasible problems", () => {
  // min x + y  s.t. x + 2y ≥ 4, 3x + y ≥ 6  →  (1.6, 1.2)
  let s = minimize(2, [1, 1], [{ a: { 0: 1, 1: 2 }, op: ">=", rhs: 4 }, { a: { 0: 3, 1: 1 }, op: ">=", rhs: 6 }]);
  assert.equal(s.status, "optimal");
  near(s.x[0], 1.6); near(s.x[1], 1.2); near(s.value, 2.8);
  // min 2x + y  s.t. x + y = 3, x ≥ 1  →  (1, 2)
  s = minimize(2, [2, 1], [{ a: { 0: 1, 1: 1 }, op: "=", rhs: 3 }, { a: { 0: 1 }, op: ">=", rhs: 1 }]);
  near(s.x[0], 1); near(s.x[1], 2);
  // a ≤ cap that binds
  s = minimize(2, [0, 1], [{ a: { 0: 1, 1: 1 }, op: ">=", rhs: 10 }, { a: { 0: 1 }, op: "<=", rhs: 4 }]);
  near(s.x[0], 4); near(s.x[1], 6);
  assert.equal(minimize(1, [1], [{ a: { 0: 1 }, op: "<=", rhs: 1 }, { a: { 0: 1 }, op: ">=", rhs: 2 }]).status, "infeasible");
});

test("planner: 60 Iron Plate/min", () => {
  const r = plan({ targets: [{ item: "IronPlate", rate: 60 }], recipes: G.defaultRecipes() });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.raw.map((x) => [x.item, x.rate]).map(([i, n]) => [i, Math.round(n * 1e6) / 1e6]), [["OreIron", 90]]);
  assert.deepEqual(r.lines.map((L) => [L.recipe.id, L.built, Math.round(L.clock * 1e6) / 1e6]), [["IngotIron", 3, 1], ["IronPlate", 3, 1]]);
  near(r.power, 24);
  assert.deepEqual(r.machines, { SmelterMk1: 3, ConstructorMk1: 3 });
});

test("planner: several products share one ingot line, rationed by need", () => {
  const targets = [{ item: "ModularFrame", rate: 10 }, { item: "Rotor", rate: 10 }, { item: "IronPlateReinforced", rate: 5 }];
  const r = plan({ targets, recipes: G.defaultRecipes() });
  // By hand: 20 RIP, 10 rotors and 10 frames need 120 plates, 232.5 rods (122.5 of them for 490 screws).
  near(r.raw[0].rate, 412.5);
  assert.equal(r.lines.filter((L) => L.recipe.id === "IngotIron").length, 1);
  const ingots = distribution(r, "IronIngot");
  near(ingots.reduce((s, c) => s + c.share, 0), 1);
  near(ingots.find((c) => c.line?.recipe.id === "IronPlate").rate, 180);
  near(ingots.find((c) => c.line?.recipe.id === "IronRod").rate, 232.5);
  // Reinforced plates: 15/min go into frames, 5/min leave as a product.
  const rip = distribution(r, "IronPlateReinforced");
  near(rip.find((c) => c.kind === "target").rate, 5);
  near(rip.find((c) => c.kind === "line").rate, 15);
  // Every flow out of a line adds up to what that line makes.
  for (const L of r.lines) for (const [it, made] of L.out) {
    near(r.flows.filter((f) => f.from.line === L && f.item === it).reduce((s, f) => s + f.rate, 0), made, 1e-5);
  }
  // Lines are listed from raw materials towards the products.
  assert.equal(r.lines[0].recipe.id, "IngotIron");
  assert.equal(r.lines.at(-1).recipe.id, "ModularFrame");
});

test("planner: inputs, caps, byproducts, objectives", () => {
  const targets = [{ item: "ModularFrame", rate: 10 }, { item: "Rotor", rate: 10 }, { item: "IronPlateReinforced", rate: 5 }];
  let r = plan({ targets, inputs: [{ item: "IronIngot", rate: 100 }], recipes: G.defaultRecipes() });
  near(r.raw.find((x) => x.item === "IronIngot").rate, 100);
  near(r.raw.find((x) => x.item === "OreIron").rate, 312.5);
  // Ore capped below what 60 plates need.
  r = plan({ targets: [{ item: "IronPlate", rate: 60 }], inputs: [{ item: "OreIron", rate: 50 }], recipes: G.defaultRecipes() });
  assert.equal(r.status, "infeasible");
  // Plastic leaves heavy oil residue over.
  r = plan({ targets: [{ item: "Plastic", rate: 60 }], recipes: G.defaultRecipes() });
  near(r.raw[0].rate, 90);
  near(distribution(r, "HeavyOilResidue").find((c) => c.kind === "surplus").rate, 30);
  // Machines rounded up and underclocked; with a 250% cap fewer machines are built.
  r = plan({ targets: [{ item: "IronPlate", rate: 50 }], recipes: G.defaultRecipes(), maxClock: 2.5 });
  assert.equal(r.lines.find((L) => L.recipe.id === "IronPlate").built, 1);
  // Every objective solves with everything turned on.
  const all = new Set(G.recipes.map((x) => x.id));
  for (const objective of Object.keys({ resources: 1, machines: 1, power: 1 })) {
    assert.equal(plan({ targets: [{ item: "Computer", rate: 5 }, { item: "SpaceElevatorPart_9", rate: 1 }], recipes: all, objective }).status, "ok");
  }
});

test("planner: says which recipe unlocks an item nothing can make", () => {
  const r = plan({ targets: [{ item: "LiquidTurboFuel", rate: 10 }], recipes: G.defaultRecipes() });
  assert.equal(r.status, "missing");
  assert.ok(r.suggest.some((x) => x.id === "Alternate_TurboBlendFuel"), r.message);
  assert.equal(plan({ targets: [], recipes: G.defaultRecipes() }).status, "empty");
});

test("machines: overclock power, shards, Somersloops", () => {
  near(G.machinePower(4, 2), 10); // double speed, 2.5× power
  assert.deepEqual([1, 1.01, 1.5, 1.51, 2.5].map(G.shardsFor), [0, 1, 1, 2, 3]);
  const plate = R.IronPlate;
  near(baseRate(plate, "IronPlate"), 20);
  near(baseRate(plate, "IronPlate", 1), 40); // a Constructor's one slot doubles it
  const m = machineAt(plate, 1, 1);
  near(m.power, 16); // and quadruples the power
  near(m.in[0][1], 30); // without eating more
  const opts = layouts(plate, "IronPlate", 100);
  assert.equal(opts[0].n, 2); near(opts[0].clock, 2.5); assert.equal(opts[0].shards, 6);
  const stock = opts.find((o) => o.n === 5);
  near(stock.clock, 1); assert.equal(stock.shards, 0);
  assert.ok(opts.every((o, i) => i === 0 || o.power < opts[i - 1].power));
  const f = fillLast(plate, "IronPlate", 50);
  assert.equal(f.full, 2); near(f.lastClock, 0.5);
});

test("extraction: miners, oil, wells, belt caps", () => {
  near(extractor("MinerMk3", "pure", 2.5).rate, 1200);
  near(extractor("MinerMk1", "impure").rate, 30);
  near(extractor("OilPump", "normal").rate, 120);
  near(extractor("WaterPump", "pure").rate, 120); // no purity on water
  near(extractor("MinerMk2", "normal", 2).power, 15 * 2.5);
  const w = well({ impure: 2, normal: 1, pure: 1 });
  near(w.rate, 240); assert.equal(w.count, 4); near(w.power, 150);
  near(clockForCap("MinerMk3", "pure", 780), 780 / 480);
  assert.deepEqual(minersFor("MinerMk2", "normal", 300), { n: 3, clock: 300 / 360 });
  assert.equal(G.carrier("OreIron", 1200).name, "Belt Mk.6");
  assert.equal(G.carrier("OreIron", 1500).count, 2);
  assert.equal(G.carrier("LiquidOil", 450).name, "Pipe Mk.2");
});

test("power: fuel, water and waste per generator", () => {
  let b = burn("GeneratorCoal", "Coal");
  near(b.fuel, 15); near(b.water, 45); near(b.mw, 75);
  b = burn("GeneratorNuclear", "NuclearFuelRod");
  near(b.fuel, 0.2); near(b.water, 240); near(b.waste.rate, 10);
  near(burn("GeneratorNuclear", "PlutoniumFuelRod").waste.rate, 1);
  near(burn("GeneratorFuel", "LiquidFuel").fuel, 20);
  near(burn("GeneratorCoal", "Coal", 2.5).mw, 187.5); // linear, unlike machines
  const coal = forTarget(1000).find((o) => o.gen === "GeneratorCoal" && o.fuel === "Coal");
  assert.equal(coal.n, 14); near(coal.fuelRate, 200); near(coal.water, 600); assert.equal(coal.extractors, 5);
  near(fromSupply("GeneratorFuel", "LiquidFuel", 100).mw, 1250);
  near(geothermal({ normal: 1, pure: 1 }).mw, 600);
});

test("belts: ratios and splitter trees", () => {
  assert.deepEqual(toWeights([180, 120, 75]).weights, [12, 8, 5]);
  assert.deepEqual(toWeights([22.5, 22.5, 45]).weights, [1, 1, 2]);
  const approx = toWeights([1, Math.PI]);
  assert.equal(approx.exact, false);
  // Each output's subtrees add up to its weight; the loop takes the rest.
  const parts = (t, acc = {}) => (t.children ? t.children.forEach((c) => parts(c, acc)) : (acc[t.out] = (acc[t.out] ?? 0) + t.parts), acc);
  for (const w of [[1, 1], [1, 1, 1], [2, 1], [1, 1, 1, 1, 1], [12, 8, 5], [3, 4], [7]]) {
    const p = splitPlan(w);
    const got = parts(p.tree);
    w.forEach((x, i) => assert.equal(got[i] ?? 0, x, `weights ${w}`));
    assert.equal(got[w.length] ?? 0, p.loop);
    assert.equal(p.N, p.D + p.loop);
  }
  assert.equal(splitPlan([1, 1]).splitters, 1);
  assert.equal(splitPlan([1, 1, 1]).loop, 0);
  assert.equal(splitPlan([1, 1, 1, 1, 1]).loop, 1); // 5 → split 6, loop one back
  assert.equal(splitPlan([2, 1]).mergers, 1);
});

test("logistics: trains and drones", () => {
  const t = train({ item: "IronPlate", cars: 1, travel: 120 });
  near(t.load, 6400); near(t.round, 174.16); near(t.rate, (6400 / 174.16) * 60);
  assert.equal(train({ item: "LiquidOil", cars: 2, travel: 60 }).load, 4800);
  assert.equal(carsFor({ item: "IronPlate", target: 5000, travel: 120 }).cars, 3);
  const d = drone({ item: "IronPlate", km: 3, overhead: 50, batteries: 7 });
  near(d.round, 130); near(d.rate, 1800 * 60 / 130); near(d.batteries, 7 * 60 / 130);
});

test("sink: coupon curve", () => {
  assert.deepEqual([1, 2, 3, 4, 6, 7, 9, 10].map(couponCost), [500, 500, 500, 1250, 1250, 2000, 2000, 3250]);
  assert.equal(couponCost(3000), 249501250);
  assert.equal(couponCost(5000), 249501250);
  near(pointsPerMinute([{ item: "IronPlate", rate: 100 }, { item: "Water", rate: 100 }]).total, 600);
  const s = schedule(500, 0, 0, 4);
  assert.deepEqual(s.map((x) => x.minutes), [1, 2, 3, 5.5]);
});

test("milestones: totals with the Space Elevator multiplier", () => {
  const t = totals(new Set(["Tutorial1", "phase:1"]), 2);
  assert.deepEqual(t, [{ item: "SpaceElevatorPart_1", amount: 100 }, { item: "IronRod", amount: 10 }]);
});

test("compare: every iron ingot recipe, per ingot", () => {
  const rows = compare("IronIngot", G.defaultRecipes());
  const std = rows.find((r) => r.recipe.id === "IngotIron");
  near(std.raw.OreIron, 1);
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.ok));
});

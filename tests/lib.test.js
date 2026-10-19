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
import { toWeights, splitPlan, network, rational } from "../js/lib/belts.js";
import { factoryGraph, balancerPlan, ratioLabel } from "../js/lib/factory.js";
import { layout } from "../js/lib/flowlayout.js";
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

// Follows every belt of a splitter network and checks it does exactly what it claims:
// splitters divide evenly into 2 or 3, mergers take at most 3 and lose nothing, and
// each output receives exactly its weight in 1/D shares of the input.
function verifyNetwork(weights, plan, net, inputs = 1) {
  const into = new Map(), from = new Map();
  for (const e of net.edges) {
    (into.get(e.to) ?? into.set(e.to, []).get(e.to)).push(e);
    (from.get(e.from) ?? from.set(e.from, []).get(e.from)).push(e);
  }
  const sum = (l) => (l ?? []).reduce((t, e) => t + e.parts, 0);
  let splitters = 0, mergers = 0;
  for (const n of net.nodes) {
    const i = into.get(n.id) ?? [], o = from.get(n.id) ?? [];
    if (n.kind === "split") {
      splitters++;
      assert.equal(i.length, 1);
      assert.ok(n.ways === 2 || n.ways === 3);
      assert.equal(o.length, n.ways);
      for (const e of o) assert.equal(e.parts * n.ways, i[0].parts, "splitter divides evenly");
    } else if (n.kind === "merge") {
      mergers++;
      assert.ok(i.length >= 2 && i.length <= 3, "merger takes 2–3 belts");
      assert.equal(o.length, 1);
      near(o[0].parts, sum(i), 1e-12);
    } else if (n.kind === "out") {
      assert.equal(sum(i), weights[n.out], `output ${n.out} gets exactly its weight`);
    } else if (n.kind === "in") assert.equal(i.length, 0);
  }
  assert.equal(splitters, plan.splitters);
  assert.equal(mergers, plan.mergers + Math.ceil((inputs - 1) / 2), "mergers: the plan's, plus any to join several inputs");
  const ins = net.nodes.filter((n) => n.kind === "in").map((n) => sum(from.get(n.id)));
  near(ins.reduce((t, x) => t + x, 0), plan.D, 1e-12);
}

test("belts: exact weights for any ratio", () => {
  assert.deepEqual(toWeights([180, 120, 75]).weights, [12, 8, 5]);
  assert.deepEqual(toWeights([22.5, 22.5, 45]).weights, [1, 1, 2]);
  assert.deepEqual(toWeights([1234, 63, 17]).weights, [1234, 63, 17]);
  assert.deepEqual(toWeights([0.1, 0.2, 0.7]).weights, [1, 2, 7]);
  assert.deepEqual(toWeights(["12.75", "0.25"]).weights, [51, 1]);
  assert.deepEqual(toWeights([30, 14.53125]).weights, [64, 31]);
  assert.deepEqual(rational(825 / 28), [825n, 28n]);
});

test("belts: every splitter network is exact, 1234:63:17 included", () => {
  const parts = (t, acc = {}) => (t.children ? t.children.forEach((c) => parts(c, acc)) : (acc[t.out] = (acc[t.out] ?? 0) + t.parts), acc);
  const cases = [[1, 1], [1, 1, 1], [2, 1], [3, 2], [5, 4], [2, 7], [1, 1, 1, 1, 1], [12, 8, 5], [3, 4], [7], [1234, 63, 17],
    [999983, 1], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], [...Array(6).fill(64), ...Array(16).fill(31)]];
  let seed = 3;
  const rnd = (n) => 1 + ((seed = (seed * 48271) % 2147483647) % n);
  for (let k = 0; k < 40; k++) cases.push(Array.from({ length: 2 + (k % 6) }, () => rnd(k < 20 ? 20 : 5000)));
  for (const w of cases) {
    const p = splitPlan(w);
    const got = parts(p.tree);
    w.forEach((x, i) => assert.equal(got[i] ?? 0, x, `weights ${w}`));
    assert.equal(got[w.length] ?? 0, p.loop);
    assert.equal(p.N, p.D + p.loop);
    let n = p.N;
    while (n % 2 === 0) n /= 2;
    while (n % 3 === 0) n /= 3;
    assert.ok(n === 1 || w.length === 1, "N = 2^a·3^b (one output needs no splitter at all)");
    verifyNetwork(w, p, network(w, p));
    verifyNetwork(w, p, network(w, p, [3, 1, 2]), 3); // three uneven input belts merged first
  }
  assert.equal(splitPlan([1, 1]).splitters, 1);
  assert.equal(splitPlan([1, 1, 1]).loop, 0);
  assert.equal(splitPlan([1, 1, 1, 1, 1]).loop, 1); // 5 → split 6, loop one back
  const big = splitPlan([1234, 63, 17]);
  assert.equal(big.D, 1314);
  assert.ok(big.splitters + big.mergers < 40, "and it stays a reasonable build");
});

test("factory graph: a card per machine, exact splitters between them", () => {
  const r = plan({ targets: [{ item: "ModularFrame", rate: 10 }, { item: "Rotor", rate: 10 }, { item: "IronPlateReinforced", rate: 5 }], recipes: G.defaultRecipes() });
  const g = factoryGraph(r);
  const machines = g.nodes.filter((n) => n.kind === "machine");
  assert.equal(machines.length, r.lines.reduce((t, L) => t + L.built, 0));
  // Iron ingots: 14 smelters merge, then split between 6 plate and 16 rod constructors.
  const ing = g.nodes.find((n) => n.id === "bal:IronIngot");
  assert.equal(ing.ins.length, 14);
  assert.equal(ing.outs.length, 22);
  near(ing.ins.reduce((t, x) => t + x.rate, 0), ing.total, 1e-9);
  const bp = balancerPlan(ing);
  assert.deepEqual([...new Set(bp.weights)].sort((a, b) => b - a), [64, 31]);
  verifyNetwork(bp.weights, bp.plan, bp.net, 14);
  assert.match(ratioLabel(bp.weights), /^(6×64 : 16×31|16×31 : 6×64)$/);
  // Every edge's rate is conserved through every splitter card.
  for (const b of g.nodes.filter((n) => n.kind === "bal")) {
    near(g.edges.filter((e) => e.to === b.id).reduce((t, e) => t + e.rate, 0), g.edges.filter((e) => e.from === b.id).reduce((t, e) => t + e.rate, 0), 1e-9);
  }
  // One machine to one machine needs no splitter: a direct belt.
  const lines = factoryGraph(r, { perMachine: false });
  assert.equal(lines.nodes.filter((n) => n.kind === "machine").length, r.lines.length);
});

test("flow layout: columns left to right, no overlapping cards, loops routed underneath", () => {
  const r = plan({ targets: [{ item: "ModularFrame", rate: 10 }, { item: "Rotor", rate: 10 }], recipes: G.defaultRecipes() });
  const g = factoryGraph(r);
  const L = layout(g.nodes.map((n) => ({ ...n, w: 180, h: n.kind === "bal" ? 120 : 60 })), g.edges);
  for (const e of L.edges) {
    const a = L.nodes.get(e.from), b = L.nodes.get(e.to);
    if (e.kind === "fwd") assert.ok(a.x + a.w < b.x, `${e.from} → ${e.to} runs left to right`);
  }
  const all = [...L.nodes.values()];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
  }
  assert.ok(g.nodes.filter((n) => n.last).every((n) => L.nodes.get(n.id).col === L.nCols - 1), "products in the last column");
  // A loop (a splitter's loop-back belt) is drawn as a bus below everything else.
  const w = [1, 1, 1, 1, 1], p = splitPlan(w), net = network(w, p);
  const SL = layout(net.nodes.map((n) => ({ id: n.id, w: 100, h: 40, last: n.kind === "out" })), net.edges);
  const back = SL.edges.filter((e) => e.kind === "back");
  assert.equal(back.length, 1);
  const lowest = Math.max(...[...SL.nodes.values()].map((n) => n.y + n.h));
  assert.ok(back[0].d.split(/[ ,LMQC]/).filter(Boolean).map(Number).some((v) => v > lowest), "bus runs under the cards");
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

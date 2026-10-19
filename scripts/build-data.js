// Builds js/data.js, the game data every tool reads, from the community dataset
// greeny/SatisfactoryTools data/data1.0.json (MIT), which is extracted from the game's
// own Docs.json. Recipes haven't changed since 1.0 (1.1 and 1.2 added features, not
// recipe changes), so the 1.0 file is current.
//
//   node scripts/build-data.js              download the file and rebuild
//   node scripts/build-data.js data1.0.json  rebuild from a local copy
//
// The few facts the dataset doesn't carry (Somersloop slots, extractor rates, Space
// Elevator phases, nuclear waste per rod) are written out below, each with its source.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SOURCE = "https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/data/data1.0.json";
const OUT = new URL("../js/data.js", import.meta.url);

const arg = process.argv[2];
const text = arg ? readFileSync(arg, "utf8") : await (await fetch(SOURCE)).text();
const raw = JSON.parse(text);
const sha = createHash("sha256").update(text).digest("hex").slice(0, 16);

// Desc_IronPlate_C → IronPlate, Recipe_Alternate_Screw_C → Alternate_Screw.
const short = (cls) => cls.replace(/^(Desc_|BP_|Recipe_|Schematic_|Build_)/, "").replace(/_C$/, "");
const round = (n) => Math.round(n * 1e6) / 1e6;

// ── machines that run recipes ──────────────────────────────────────────────────
// Somersloop slots (production amplifier, 1.0). Filling every slot doubles output.
// Packagers can't be amplified.
const SLOOPS = {
  Desc_SmelterMk1_C: 1, Desc_ConstructorMk1_C: 1, Desc_AssemblerMk1_C: 2, Desc_FoundryMk1_C: 2,
  Desc_OilRefinery_C: 2, Desc_Converter_C: 2, Desc_ManufacturerMk1_C: 4, Desc_Blender_C: 4,
  Desc_HadronCollider_C: 4, Desc_QuantumEncoder_C: 4, Desc_Packager_C: 0,
};

const recipes = [];
const machineIds = new Set();
for (const r of Object.values(raw.recipes)) {
  if (!r.inMachine || !r.producedIn.length) continue;
  const b = r.producedIn[0];
  machineIds.add(b);
  const rec = {
    id: short(r.className),
    name: r.name.replace(/^Alternate: /, ""),
    alt: r.alternate,
    time: r.time,
    in: r.ingredients.map((x) => [short(x.item), round(x.amount)]),
    out: r.products.map((x) => [short(x.item), round(x.amount)]),
    b: short(b),
  };
  // Particle Accelerator, Converter and Quantum Encoder recipes swing between two values.
  if (r.isVariablePower) rec.pw = [r.minPower, r.maxPower];
  recipes.push(rec);
}
recipes.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

const buildings = {};
for (const id of machineIds) {
  const b = raw.buildings[id];
  buildings[short(id)] = { name: b.name, power: b.metadata.powerConsumption, sloops: SLOOPS[id] ?? 0 };
}

// ── items ──────────────────────────────────────────────────────────────────────
const used = new Set(recipes.flatMap((r) => [...r.in, ...r.out].map((x) => x[0])));
const items = {};
for (const it of Object.values(raw.items)) {
  const id = short(it.className);
  const keep = used.has(id) || raw.resources[it.className] || Object.values(raw.generators).some((g) => g.fuel.includes(it.className));
  if (!keep) continue;
  const o = { name: it.name, stack: it.stackSize };
  if (it.liquid) o.liquid = true;
  if (it.sinkPoints) o.sink = it.sinkPoints;
  if (it.energyValue) o.energy = it.energyValue;
  items[id] = o;
}

// Raw inputs: the map's resources, plus anything used but never made (slugs, remains,
// wood, nuclear waste). The planner draws these from outside the factory.
const made = new Set(recipes.flatMap((r) => r.out.map((x) => x[0])));
const resources = Object.keys(raw.resources).map(short);
const gathered = [...used].filter((id) => !made.has(id) && !resources.includes(id)).sort();

// ── extraction ─────────────────────────────────────────────────────────────────
// Rates at 100% clock on a normal node. Miners: one item per cycle (Mk.1 1 s, Mk.2 0.5 s,
// Mk.3 0.25 s, from the dataset). Impure nodes give half, pure nodes double.
// Oil Extractor 120 m³/min, Water Extractor 120 m³/min (no purity), Resource Well
// Extractor 60 m³/min, all powered by the well's Pressurizer.
const bpow = (cls) => raw.buildings[cls].metadata.powerConsumption;
const minerRate = (cls) => (60 / raw.miners[cls].extractCycleTime) * raw.miners[cls].itemsPerCycle;
const solids = raw.miners.Desc_MinerMk1_C.allowedResources.map(short);
const extractors = {
  MinerMk1: { name: "Miner Mk.1", rate: minerRate("Desc_MinerMk1_C"), power: bpow("Desc_MinerMk1_C"), purity: true, res: solids },
  MinerMk2: { name: "Miner Mk.2", rate: minerRate("Desc_MinerMk2_C"), power: bpow("Desc_MinerMk2_C"), purity: true, res: solids },
  MinerMk3: { name: "Miner Mk.3", rate: minerRate("Desc_MinerMk3_C"), power: bpow("Desc_MinerMk3_C"), purity: true, res: solids },
  OilPump: { name: "Oil Extractor", rate: (60 / raw.miners.Desc_OilPump_C.extractCycleTime) * raw.miners.Desc_OilPump_C.itemsPerCycle / 1000, power: bpow("Desc_OilPump_C"), purity: true, res: ["LiquidOil"] },
  WaterPump: { name: "Water Extractor", rate: 120, power: bpow("Desc_WaterPump_C"), purity: false, res: ["Water"] },
  FrackingExtractor: { name: "Resource Well Extractor", rate: (60 / raw.miners.Desc_FrackingExtractor_C.extractCycleTime) * raw.miners.Desc_FrackingExtractor_C.itemsPerCycle / 1000, power: 0, purity: true, res: raw.miners.Desc_FrackingExtractor_C.allowedResources.map(short) },
};
const pressurizer = { name: "Resource Well Pressurizer", power: bpow("Desc_FrackingSmasher_C") };

// ── power ──────────────────────────────────────────────────────────────────────
// Water per MW is the game's supplemental ratio: m³/s = MW × ratio / 1000.
// Nuclear waste per rod: Uranium 50, Plutonium 10, Ficsonium none.
const WASTE = { NuclearFuelRod: ["NuclearWaste", 50], PlutoniumFuelRod: ["PlutoniumWaste", 10] };
const generators = {};
for (const g of Object.values(raw.generators)) {
  generators[short(g.className)] = {
    name: raw.buildings[g.className].name,
    power: g.powerProduction,
    water: g.waterToPowerRatio ? round((g.powerProduction * g.waterToPowerRatio / 1000) * 60) : 0,
    fuel: g.fuel.map(short).filter((f) => items[f]),
  };
}
// Geothermal output depends on the geyser, not fuel: average MW by purity (it swings
// between 0.5× and 1.5× of that over a minute).
const geothermal = { name: raw.buildings.Desc_GeneratorGeoThermal_C.name, impure: 100, normal: 200, pure: 400 };

// ── milestones ─────────────────────────────────────────────────────────────────
const milestones = Object.values(raw.schematics)
  .filter((s) => s.type === "EST_Milestone" || s.type === "EST_Tutorial")
  .map((s) => ({ id: short(s.className), name: s.name, tier: s.tier, cost: s.cost.map((c) => [short(c.item), c.amount]) }))
  .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "en", { numeric: true }));
for (const m of milestones) for (const [it] of m.cost) if (!items[it]) items[it] = { name: raw.items["Desc_" + it + "_C"].name, stack: raw.items["Desc_" + it + "_C"].stackSize };

// Space Elevator phases at the default Game Mode cost (1.0). Game Modes (1.2) can scale
// these from 0.25× to 100×.
const elevator = [
  { phase: 1, name: "Distribution Platform", unlocks: "Tiers 3 and 4", cost: [["SpaceElevatorPart_1", 50]] },
  { phase: 2, name: "Construction Dock", unlocks: "Tiers 5 and 6", cost: [["SpaceElevatorPart_1", 1000], ["SpaceElevatorPart_2", 1000], ["SpaceElevatorPart_3", 100]] },
  { phase: 3, name: "Main Body", unlocks: "Tiers 7 and 8", cost: [["SpaceElevatorPart_2", 2500], ["SpaceElevatorPart_4", 500], ["SpaceElevatorPart_5", 100]] },
  { phase: 4, name: "Propulsion", unlocks: "Tier 9", cost: [["SpaceElevatorPart_7", 500], ["SpaceElevatorPart_6", 500], ["SpaceElevatorPart_9", 100], ["SpaceElevatorPart_8", 250]] },
  { phase: 5, name: "Assembly", unlocks: "Project Assembly", cost: [["SpaceElevatorPart_9", 1000], ["SpaceElevatorPart_10", 1000], ["SpaceElevatorPart_12", 256], ["SpaceElevatorPart_11", 200]] },
];
for (const p of elevator) for (const [it] of p.cost) if (!items[it]) throw new Error(`Space Elevator part ${it} isn't in the dataset`);

// Every id a recipe, milestone or generator mentions must be a known item.
for (const r of recipes) for (const [it] of [...r.in, ...r.out]) if (!items[it]) throw new Error(`${r.name}: unknown item ${it}`);

const data = { source: SOURCE, sha256: sha, items, recipes, buildings, resources, gathered, extractors, pressurizer, generators, waste: WASTE, geothermal, milestones, elevator };
writeFileSync(OUT, `// Generated by scripts/build-data.js from ${SOURCE}\n// (MIT, sha256 ${sha}…). Don't edit by hand: change the script and run it again.\nexport default ${JSON.stringify(data)};\n`);
console.log(`js/data.js: ${Object.keys(items).length} items, ${recipes.length} recipes, ${milestones.length} milestones`);

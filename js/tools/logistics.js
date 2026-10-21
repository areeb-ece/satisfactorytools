// Train & drone throughput.
import { h, clear, load, save, num, itemPicker, stat, card, toolHead, field } from "../ui.js";
import { itemName, fmt, unit, isLiquid } from "../lib/game.js";
import { train, carsFor, drone, droneBatteries, carLoad, CAR_STACKS, CAR_FLUID, TRANSFER, DRONE_SLOTS, DRONE_SPEED } from "../lib/logistics.js";

const KEY = "logistics";

export default {
  id: "logistics",
  title: "Train & drone throughput",
  short: "Trains & drones",
  tagline: "freight per minute",
  group: "Logistics",
  color: 0,
  blurb: "What a train delivers per minute for its round trip and Freight Cars, how many cars a target needs, and the same for a drone between two ports, with its battery use.",
  mount(view) {
    const st = load(KEY, { item: "IronPlate", cars: 4, travel: 180, stops: 2, target: 2000, dItem: "Computer", km: 2, overhead: 50, batteries: null });
    const persist = () => save(KEY, st);
    const tOut = h("div", { class: "stack" }), dOut = h("div", { class: "stack" });
    const unitBox = h("span");

    function runTrain() {
      persist();
      clear(tOut);
      if (!st.item) return;
      const t = train(st);
      const need = carsFor({ ...st, target: st.target });
      tOut.append(h("div", { class: "stats" },
        stat(fmt(t.rate) + " " + unit(st.item), "delivered", true),
        stat(fmt(t.round, 1) + " s", "round trip with transfers"),
        stat(fmt(t.load), (isLiquid(st.item) ? "m³" : "items") + " per trip"),
        stat(String(need.cars), `cars for ${fmt(st.target)} ${unit(st.item)}`)),
        h("p", { class: "sd-hint tiny", text: `A Freight Car holds ${CAR_STACKS} stacks (${fmt(carLoad(st.item))} ${itemName(st.item)}) or ${fmt(CAR_FLUID)} m³ of fluid. Each stop adds a ${TRANSFER} s platform transfer. Platforms also limit throughput: they load and unload through their belts or pipes.` }));
    }
    function runDrone() {
      persist();
      clear(dOut);
      if (!st.dItem) return;
      const bat = st.batteries ?? droneBatteries(st.km);
      const d = drone({ item: st.dItem, km: st.km, overhead: st.overhead, batteries: bat });
      dOut.append(h("div", { class: "stats" },
        stat(fmt(d.rate) + "/min", itemName(st.dItem) + " delivered", true),
        stat(fmt(d.round, 1) + " s", "round trip"),
        stat(fmt(d.batteries, 2) + "/min", "Batteries")),
        h("p", { class: "sd-hint tiny", text: `${DRONE_SLOTS} stacks per trip (${fmt(d.load)} ${itemName(st.dItem)}), ${DRONE_SPEED} m/s on Batteries. Fuel per trip defaults to 4 + 1 per km, a community figure; the Drone Port shows the real numbers after the first round trip.` }));
    }
    view.append(toolHead(this), h("div", { class: "tgrid two-up" },
      card("Train",
        field("Cargo", itemPicker(st.item, (id) => { st.item = id; runTrain(); }, { kind: "all" })),
        h("div", { class: "two" },
          num("Freight Cars", st.cars, (v) => { st.cars = Math.max(1, Math.round(v || 1)); runTrain(); }, { min: 1, step: 1 }),
          num("Stations per trip", st.stops, (v) => { st.stops = Math.max(1, Math.round(v || 2)); runTrain(); }, { min: 1, step: 1 })),
        num("Driving time, round trip", st.travel, (v) => { st.travel = v || 0; runTrain(); }, { unit: "s", hint: "Time the train spends moving; time it once in-game." }),
        num("Target", st.target, (v) => { st.target = v || 0; runTrain(); }, { unit: "/min" }),
        tOut),
      card("Drone",
        field("Cargo", itemPicker(st.dItem, (id) => { st.dItem = id; runDrone(); }, { kind: "all" })),
        h("div", { class: "two" },
          num("Distance between ports", st.km, (v) => { st.km = v || 0; runDrone(); }, { unit: "km" }),
          num("Take-off and landing", st.overhead, (v) => { st.overhead = v ?? 0; runDrone(); }, { unit: "s/trip" })),
        num("Batteries per round trip", st.batteries, (v) => { st.batteries = v; runDrone(); }, { placeholder: "estimate", hint: "Leave empty to estimate from the distance." }),
        dOut)));
    runTrain();
    runDrone();
  },
};

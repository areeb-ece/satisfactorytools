// Trains and drones.
import { items } from "./game.js";

// Freight Car: 32 stacks of items, or 2,400 m³ of fluid (1.2). Every stop costs a
// 27.08 s transfer at the platforms, which hold the train while they load or unload.
export const CAR_STACKS = 32;
export const CAR_FLUID = 2400;
export const TRANSFER = 27.08;
// Drone: 9 inventory slots, 75 m/s on Batteries. Fuel per trip is shown at the port
// in-game; the default estimate here is 4 Batteries plus 1 per km (community figure).
export const DRONE_SLOTS = 9;
export const DRONE_SPEED = 75;

/** What one Freight Car carries of `item`. */
export const carLoad = (item) => (items[item]?.liquid ? CAR_FLUID : CAR_STACKS * (items[item]?.stack ?? 100));

/**
 * Items/min a train delivers. `travel` is the driving time of one round trip in
 * seconds; each of `stops` stations adds a platform transfer.
 */
export function train({ item, cars, travel, stops = 2 }) {
  const round = travel + stops * TRANSFER;
  const load = carLoad(item) * cars;
  return { round, load, rate: (load / round) * 60 };
}

/** Freight Cars needed for `target`/min on the same route. */
export function carsFor({ item, target, travel, stops = 2 }) {
  const round = travel + stops * TRANSFER;
  const perCar = (carLoad(item) / round) * 60;
  return { cars: Math.ceil(target / perCar - 1e-9), perCar, round };
}

/**
 * One drone between two ports `km` apart. `overhead` is the take-off and landing time
 * per round trip (seconds), `batteries` the fuel per round trip.
 */
export function drone({ item, km, speed = DRONE_SPEED, overhead, batteries }) {
  const load = DRONE_SLOTS * (items[item]?.stack ?? 100);
  const round = (2 * km * 1000) / speed + overhead;
  const trips = 60 / round;
  return { load, round, rate: load * trips, batteries: batteries * trips };
}

/** Default battery estimate per round trip. */
export const droneBatteries = (km) => 4 + km;

// HUB milestones and Space Elevator phases: the parts still to deliver.
import { D } from "./game.js";

export const MILESTONES = D.milestones;
export const ELEVATOR = D.elevator;
// Game Modes (1.2) can scale the Space Elevator's deliveries.
export const ELEVATOR_COST = [0.25, 0.5, 0.75, 1, 2, 5, 10, 25, 50, 100];

/**
 * Totals for the milestones and phases in `todo` (ids like "Tutorial1" or "phase:3").
 * Space Elevator amounts are multiplied by `elevatorCost`.
 */
export function totals(todo, elevatorCost = 1) {
  const sum = new Map();
  const add = (id, n) => sum.set(id, (sum.get(id) ?? 0) + n);
  for (const m of MILESTONES) if (todo.has(m.id)) for (const [id, n] of m.cost) add(id, n);
  for (const p of ELEVATOR) if (todo.has("phase:" + p.phase)) for (const [id, n] of p.cost) add(id, Math.ceil(n * elevatorCost));
  return [...sum].map(([item, amount]) => ({ item, amount })).sort((a, b) => b.amount - a.amount);
}

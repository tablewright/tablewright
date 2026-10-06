/**
 * ─ Routes ─
 *
 * The shortest way through the movement graph priced for the mover: A*
 * over cells, with the diagonal parity as part of the state under the
 * alternating rule. Two hair-thin biases, a turn and straying from the
 * straight line, pick one of the many equal staircases. The safe route
 * never drops; the quick one may. Movement is a budget per turn, and
 * the route offered comes in tiers: within it, with a dash, or refused.
 * Design: docs/design.md §5 "Moving shows movement only".
 */

import type { Cell } from "../../grid/square-grid.js";
import type { Mover, StepKind } from "./cost.js";
import { cellIndex, type Topology } from "../derive.js";
import type { GridRule } from "./distance.js";
import { STRAY, Search } from "./search.js";

export interface RouteStep {
  readonly cell: Cell;
  readonly kind: StepKind | "start";
  readonly rise: number;
  /** Movement spent so far, at this cell. */
  readonly cost: number;
  readonly dice: number;
}

export interface Route {
  readonly steps: readonly RouteStep[];
  readonly cost: number;
  /** Dice of falling damage along the way. */
  readonly dice: number;
  readonly kinds: ReadonlySet<StepKind>;
}

export interface RouteOptions {
  /** Whether a fall may be part of the route. */
  readonly drops?: boolean;
}

/** The two routes a move may take: the safe one never drops; the quick one is offered only when it is cheaper. */
export interface Routes {
  readonly safe?: Route;
  readonly quick?: Route;
}

/** What this turn has left: the speed it started with, what is spent, whether it dashed. */
export interface Budget {
  readonly speed: number;
  readonly spent: number;
  readonly dashed: boolean;
}

/**
 * A mover under no limit: every way is within the movement, so nothing is
 * ever refused and nothing needs a dash. What a token with no sheet moves
 * on, since a placeholder the DM put down has no speed to be held to.
 */
export const NO_LIMIT: Budget = {
  speed: Number.POSITIVE_INFINITY,
  spent: 0,
  dashed: false,
};

export type Phase = "move" | "dash" | "refused";

export interface Choice {
  readonly route: Route | undefined;
  readonly phase: Phase;
  /** Why a move is refused: no route at all, the dash spent, or beyond even a dash. */
  readonly reason?: "none" | "spent" | "beyond";
}

/** The cheapest route from `from` to `to`, or undefined when there is none. */
export function findRoute(
  topology: Topology,
  from: Cell,
  to: Cell,
  mover: Mover,
  rule: GridRule,
  options: RouteOptions = {}
): Route | undefined {
  const goal = cellIndex(topology.bounds, to);
  if (goal === undefined) {
    return undefined;
  }
  const search = new Search(topology, mover, rule, options.drops ?? false);
  const unit = rule.cellSize;
  // Admissible under every rule: no step costs less than a cell.
  const guide = (cell: Cell): number =>
    Math.max(Math.abs(to.col - cell.col), Math.abs(to.row - cell.row)) * unit +
    Math.abs(
      (cell.col - to.col) * (from.row - to.row) - (from.col - to.col) * (cell.row - to.row)
    ) *
      STRAY *
      unit;
  const found = search.run(from, (index) => index === goal, guide, Infinity);
  return found === undefined ? undefined : search.routeTo(found);
}

/** The safe and the quick route, the quick one only when it beats the safe one. */
export function routes(
  topology: Topology,
  from: Cell,
  to: Cell,
  mover: Mover,
  rule: GridRule
): Routes {
  const safe = findRoute(topology, from, to, mover, rule, { drops: false });
  const quick = findRoute(topology, from, to, mover, rule, { drops: true });
  const quicker = quick !== undefined && (safe === undefined || quick.cost < safe.cost);
  return quicker ? { safe, quick } : { safe };
}

/**
 * Movement spent to reach every cell from `from` within `budget`, row-major
 * over the bounds; Infinity where the budget does not reach.
 */
export function reach(
  topology: Topology,
  from: Cell,
  mover: Mover,
  rule: GridRule,
  budget: number,
  options: RouteOptions = {}
): Float32Array {
  const search = new Search(topology, mover, rule, options.drops ?? false);
  search.run(
    from,
    () => false,
    () => 0,
    budget
  );
  return search.costs(budget);
}

/**
 * Which route this turn takes, in tiers: the safe one if the movement
 * left covers it, else the shortest; failing both, either with a dash;
 * failing that, refused. Within a tier, `preference` picks.
 */
export function chooseRoute(
  candidates: Routes,
  budget: Budget,
  preference: "safe" | "quick" = "safe"
): Choice {
  const normal = Math.max(0, budget.speed - budget.spent);
  const withDash = Math.max(0, budget.speed * 2 - budget.spent);
  const tierOf = (route: Route): number => {
    if (route.cost <= normal) {
      return 0;
    }
    return !budget.dashed && route.cost <= withDash ? 1 : 2;
  };
  const offered: { route: Route; way: "safe" | "quick"; tier: number }[] = [];
  if (candidates.safe !== undefined) {
    offered.push({ route: candidates.safe, way: "safe", tier: tierOf(candidates.safe) });
  }
  if (candidates.quick !== undefined) {
    offered.push({ route: candidates.quick, way: "quick", tier: tierOf(candidates.quick) });
  }
  if (offered.length === 0) {
    return { route: undefined, phase: "refused", reason: "none" };
  }
  const best = Math.min(...offered.map((entry) => entry.tier));
  const inTier = offered.filter((entry) => entry.tier === best);
  const chosen = inTier.find((entry) => entry.way === preference) ?? inTier[0];
  if (chosen === undefined) {
    return { route: undefined, phase: "refused", reason: "none" };
  }
  if (best === 2) {
    return { route: chosen.route, phase: "refused", reason: budget.dashed ? "spent" : "beyond" };
  }
  return { route: chosen.route, phase: best === 0 ? "move" : "dash" };
}

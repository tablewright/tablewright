/**
 * ─ Measure ─
 *
 * The answers a ruler gives between two cells, composed from the rules:
 * the straight distance under the campaign's rule with the rise between
 * the two heights; the way on foot, offered as a move is, in tiers, the
 * safe way if the movement covers it, else the shortest, else either
 * with a dash, else beyond reach; and where the line of effect breaks,
 * if it does. Pure, so a story's numbers and a logic test's are the
 * same numbers.
 * Design: docs/design.md §5 "A measurement gives three answers" and
 * "Moving shows movement only".
 */

import type { Point } from "../geometry.js";
import type { SeenBy } from "../seen.js";
import type { Cell } from "../grid/square-grid.js";
import { speedOf, type Mover } from "../topology/cost.js";
import { heightAt, type Topology } from "../topology/derive.js";
import { distance, type GridRule } from "../topology/distance.js";
import { cellCentre, firstBlock } from "../topology/effect.js";
import {
  chooseRoute,
  routes,
  type Budget,
  type Choice,
  type Route,
  type Routes,
} from "../topology/route.js";

export interface Measurement {
  readonly from: Cell;
  readonly to: Cell;
  /** The straight distance under the rule, in its unit. */
  readonly distance: number;
  /** How much higher the far cell stands than the near one, in the unit; negative when lower. */
  readonly rise: number;
  /** The rule's unit, as the numbers are shown. */
  readonly unit: string;
  /** The shortest way on foot at any cost, or nothing when there is none. */
  readonly route: Route | undefined;
  /** Both ways the move may take, for a drag to choose between as it goes. */
  readonly ways: Routes;
  /** The way this turn offers, chosen in tiers: with or without a dash, or refused. */
  readonly choice: Choice;
  /** Movement left this turn before a dash, in the unit: where a way leaves the plain colour. */
  readonly reach: number;
  /** Movement left with a dash taken, in the unit: where a way turns red. */
  readonly dashReach: number;
  /** Where the line of effect breaks, in cell coordinates, or nothing when it holds. */
  readonly blockedAt: Point | undefined;
  /** Who the measure is for: everyone at the table, the DM, or the one who made it. */
  readonly seenBy: SeenBy;
}

/** A turn just begun: the whole speed to spend, and no dash taken. */
export function turnOf(mover: Mover): Budget {
  return { speed: speedOf(mover), spent: 0, dashed: false };
}

/** Measure from `from` to `to` for `mover` under `rule`, with `budget` left this turn. */
export function measure(
  topology: Topology,
  from: Cell,
  to: Cell,
  rule: GridRule,
  mover: Mover,
  seenBy: SeenBy = "party",
  budget: Budget = turnOf(mover)
): Measurement {
  const near = { ...from, height: heightAt(topology, from) };
  const far = { ...to, height: heightAt(topology, to) };
  const found = routes(topology, from, to, mover, rule);
  return {
    from,
    to,
    distance: distance(near, far, rule),
    rise: far.height - near.height,
    unit: rule.unit,
    route: found.quick ?? found.safe,
    ways: found,
    choice: chooseRoute(found, budget),
    reach: Math.max(0, budget.speed - budget.spent),
    dashReach: Math.max(0, (budget.dashed ? budget.speed : budget.speed * 2) - budget.spent),
    blockedAt: firstBlock(topology, cellCentre(from), cellCentre(to), "effect")?.at,
    seenBy,
  };
}

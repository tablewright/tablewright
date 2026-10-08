/**
 * ─ A line between two tokens ─
 *
 * Two tokens picked one after the other draw a line from the first, the
 * attacker, to the second, the target. It says how far apart they are
 * under the rule and how much cover the target has from the attacker,
 * both from what one seat sees. A template among what is picked, or a
 * third thing, draws none. In range or out waits on sheets.
 * Design: docs/templates.md "A spell aimed at one creature".
 */

import type { Cover } from "@tablewright/schema";
import { placeOf, tokenSpot } from "../area/catches.js";
import { spotToCellSpot } from "../area/area.js";
import { tidy } from "../draw/tool.js";
import type { TokenView } from "../tokens/token-layer.js";
import type { Topology } from "../topology/derive.js";
import { coverOf, type CoverAnswer } from "../topology/rules/cover.js";
import { distanceBetween, type GridRule, type Place } from "../topology/rules/distance.js";
import type { Thing } from "./picked.js";

/** The two tokens a line runs between, by their ids: from the attacker to the target. */
export interface Pair {
  readonly from: string;
  readonly to: string;
}

/** What a line between two tokens says: how far, and how much cover. */
export interface Aim {
  readonly from: string;
  readonly to: string;
  /** The rule's distance between the two, in its unit. */
  readonly distance: number;
  readonly cover: CoverAnswer;
}

const COVER_WORDS: Readonly<Record<Cover, string>> = {
  none: "no cover",
  half: "half cover",
  "three-quarters": "three-quarters cover",
  total: "total cover",
};

/** The pair a line runs between: exactly two tokens picked, first to second, or none. */
export function pairOf(picked: readonly Thing[]): Pair | undefined {
  const [first, second, ...rest] = picked;
  if (first?.kind !== "token" || second?.kind !== "token" || rest.length > 0) {
    return undefined;
  }
  return { from: first.id, to: second.id };
}

/**
 * The line from `from` to `to`, judged against `topology` as one seat
 * sees it: each token stands where `placeOf` puts it, and the cover runs
 * from the attacker's spot, the place in its cube the area rule asks about.
 */
export function aimOf(from: TokenView, to: TokenView, topology: Topology, rule: GridRule): Aim {
  return {
    from: from.id,
    to: to.id,
    distance: distanceBetween([placeIn(from)], [placeIn(to)], rule),
    cover: coverOf(
      topology,
      spotToCellSpot(tokenSpot(from, rule), rule),
      { cell: to.cell, foot: placeOf(to) },
      rule
    ),
  };
}

/** What the line's badge says: the distance and the cover, in words. */
export function aimText(aim: Aim, unit: string): string {
  return `${tidy(aim.distance)} ${unit}, ${COVER_WORDS[aim.cover.cover]}`;
}

// Where a token stands in the scene's space, as distance reads it.
function placeIn(token: TokenView): Place {
  return { ...token.cell, height: placeOf(token) };
}

/**
 * ─ Distance ─
 *
 * The straight measure under the campaign's rule: every square the
 * same, every second diagonal double, or the exact length, taken to
 * height the way Fantasy Grounds does, the greatest axis first. Between
 * tokens it is the least between the cells they occupy, so a big
 * creature measures from its nearest edge.
 * Design: docs/design.md §5 "A measurement gives three answers".
 */

import type { DiagonalRule, SystemManifest } from "@tablewright/schema";

/** What a cell measures and how a diagonal counts: the campaign's setting. */
export interface GridRule {
  /** One cell's width in `unit`. */
  readonly cellSize: number;
  /** The unit's short name, as the table shows it. */
  readonly unit: string;
  readonly diagonals: DiagonalRule;
}

/** 5e's default: five feet a square, every square the same. */
export const DEFAULT_RULE: GridRule = { cellSize: 5, unit: "ft", diagonals: "equal" };

/** A place in the scene's space: a cell and the height the field gives it. */
export interface Place {
  readonly col: number;
  readonly row: number;
  readonly height: number;
}

/** The rule a system's manifest declares, or the default when it declares none. */
export function gridRuleOf(system: SystemManifest | null | undefined): GridRule {
  const grid = system?.grid;
  if (grid === undefined || grid === null) {
    return DEFAULT_RULE;
  }
  return {
    cellSize: grid.cellSize ?? DEFAULT_RULE.cellSize,
    unit: grid.unit,
    diagonals: grid.diagonals,
  };
}

/** The distance between two places under `rule`, in the rule's unit. */
export function distance(a: Place, b: Place, rule: GridRule): number {
  const dx = Math.abs(b.col - a.col);
  const dy = Math.abs(b.row - a.row);
  const dz = Math.abs(b.height - a.height) / rule.cellSize;
  return axes(dx, dy, dz, rule) * rule.cellSize;
}

/** The least distance between two sets of places: token to token, whatever their size. */
export function distanceBetween(
  from: readonly Place[],
  to: readonly Place[],
  rule: GridRule
): number {
  let least = Infinity;
  for (const a of from) {
    for (const b of to) {
      least = Math.min(least, distance(a, b, rule));
    }
  }
  return least;
}

/** What one diagonal step costs under the rule, given how many the path has taken. */
export function diagonalCost(rule: GridRule, taken: number): number {
  switch (rule.diagonals) {
    case "exact":
      return Math.SQRT2 * rule.cellSize;
    case "alternate":
      return (taken % 2 === 0 ? 1 : 2) * rule.cellSize;
    default:
      return rule.cellSize;
  }
}

// Three axes in cells folded under the rule: the greatest, plus half the
// other two for the alternating rule, or the true length.
function axes(dx: number, dy: number, dz: number, rule: GridRule): number {
  if (rule.diagonals === "exact") {
    return Math.hypot(dx, dy, dz);
  }
  const [hi = 0, mid = 0, lo = 0] = [dx, dy, dz].sort((p, q) => q - p);
  return rule.diagonals === "alternate" ? hi + Math.floor((mid + lo) / 2) : hi;
}

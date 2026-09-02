/**
 * ─ Facing math ─
 *
 * Facing is degrees clockwise from north, 0 to 360, the way a compass
 * reads and the way a player thinks about a miniature. Pixi draws
 * angles in radians clockwise from east, so the conversions live
 * here and nowhere else.
 */

import type { Point } from "../geometry.js";
import type { Cell } from "../grid/square-grid.js";

const FULL_TURN = 360;

/** Normalise any angle in degrees into [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const wrapped = degrees % FULL_TURN;
  return wrapped < 0 ? wrapped + FULL_TURN : wrapped;
}

/** Facing that points from `from` to `to` in world space, or undefined when they coincide. */
export function facingToward(from: Point, to: Point): number | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return undefined;
  }
  // atan2 of (east, north): screen y grows downward, so north is negative dy.
  return normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Facing that points from `from` to `to`, or undefined when they are the same cell. */
export function facingBetween(from: Cell, to: Cell): number | undefined {
  return facingToward({ x: from.col, y: from.row }, { x: to.col, y: to.row });
}

/** Degrees clockwise from north into Pixi radians clockwise from east. */
export function facingToRadians(degrees: number): number {
  return ((degrees - 90) * Math.PI) / 180;
}

export interface RingArc {
  /** Pixi arc start, radians. */
  readonly start: number;
  /** Pixi arc end, radians; the arc runs clockwise from start through the front. */
  readonly end: number;
}

/** The arc of a ring that is open at the rear by `gapDegrees`, centred behind `facing`. */
export function ringArc(facing: number, gapDegrees: number): RingArc {
  const rear = facingToRadians(facing + 180);
  const halfGap = (gapDegrees * Math.PI) / 360;
  return { start: rear + halfGap, end: rear + 2 * Math.PI - halfGap };
}

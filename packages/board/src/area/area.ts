/**
 * ─ Areas ─
 *
 * What a template is before anything draws it: a line, a cone or a
 * circle, its sizes, and how it stands upward. An area is laid down
 * from an origin, which is a place on the map or the token it hangs
 * on, and every size is in the rule's distance unit so the shape means
 * the same whatever a cell measures.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column".
 */

import type { GridRule } from "../topology/distance.js";
import type { Cell } from "../grid/square-grid.js";

/**
 * A place in the scene, in the rule's distance unit throughout: across
 * the map from the grid's own nought, and up from the scene's.
 */
export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Where an area starts: a place on the map, or the token it hangs on. */
export type Anchor =
  | { readonly kind: "spot"; readonly at: Spot }
  | { readonly kind: "token"; readonly id: string };

/**
 * A straight run with a width and a height. A box has square corners; a
 * beam is round in section about its axis, and reads its width alone.
 * The height rises from the origin, as a wall of fire does.
 */
export interface LineArea {
  readonly kind: "line";
  /** Degrees clockwise from north, as a token's facing is. */
  readonly aim: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly form: "box" | "beam";
}

/**
 * An area opening from a point. The spread is how wide it opens, from
 * nought to ninety degrees; a round edge keeps everything within the
 * length, a flat one is as wide as it is long and reaches further at
 * the corners. Flat is the footprint given a height; 3D spreads upward
 * as it spreads across.
 */
export interface ConeArea {
  readonly kind: "cone";
  readonly aim: number;
  readonly length: number;
  readonly spread: number;
  readonly edge: "round" | "flat";
  readonly form: "flat" | "3d";
  /** How tall it stands when it is flat; a 3D cone takes its own. */
  readonly height: number;
}

/**
 * A radius about a point. A sphere reaches every way, a dome stops at
 * the floor it sits on, a cylinder is a column rising from it. The
 * inner radius makes a ring; nought is a full disc.
 */
export interface CircleArea {
  readonly kind: "circle";
  readonly radius: number;
  readonly inner: number;
  readonly form: "sphere" | "dome" | "cylinder";
  /** How tall a cylinder stands; a sphere and a dome take theirs from the radius. */
  readonly height: number;
}

export type Area = LineArea | ConeArea | CircleArea;

/** The widest an area may open, in degrees. */
export const SPREAD_RANGE = { min: 0, max: 90 } as const;

/** A line with no width is the crow-flies measure it has always been. */
export function isMeasure(area: Area): boolean {
  return area.kind === "line" && area.width <= 0;
}

/**
 * The way an area faces as a unit vector across the map. Degrees run
 * clockwise from north, and north is up the map, so a quarter turn
 * leads east.
 */
export function aimVector(degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
}

/**
 * The centre of a cell's cube: across at the cell's middle, up at half
 * a cell above the ground the field gives it. This is the place the
 * cover rule asks about.
 */
export function cubeCentre(cell: Cell, ground: number, rule: GridRule): Spot {
  return {
    x: (cell.col + 0.5) * rule.cellSize,
    y: (cell.row + 0.5) * rule.cellSize,
    z: ground + rule.cellSize / 2,
  };
}

/** A place on the map's floor, from a cell and the height under it. */
export function floorSpot(cell: Cell, ground: number, rule: GridRule): Spot {
  return { x: (cell.col + 0.5) * rule.cellSize, y: (cell.row + 0.5) * rule.cellSize, z: ground };
}

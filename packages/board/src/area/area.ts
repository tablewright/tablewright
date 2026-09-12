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
 * A straight run in three sizes: as long as it is aimed, as wide across
 * and as tall upward, the height rising from the origin as a wall of
 * fire does. It is a rectangle rather than a line, since Line in the
 * column measures and lays nothing down.
 */
export interface RectArea {
  readonly kind: "rect";
  /** Degrees clockwise from north, as a token's facing is. */
  readonly aim: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
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

export type Area = RectArea | ConeArea | CircleArea;

/** The widest an area may open, in degrees. */
export const SPREAD_RANGE = { min: 0, max: 90 } as const;

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

/**
 * One line for the badge beside an area: what it is and how big, in the
 * DM's words. The form is named only where it changes what is caught,
 * so a plain cone says nothing about standing up.
 */
export function describeArea(area: Area, rule: GridRule): string {
  const unit = rule.unit;
  switch (area.kind) {
    case "rect":
      return `${tidy(area.length)} by ${tidy(area.width)} ${unit} rectangle`;
    case "cone":
      return `${tidy(area.length)} ${unit} cone, ${tidy(area.spread)}°${
        area.form === "flat" ? ", flat" : ""
      }`;
    default: {
      const shape = area.form === "sphere" ? "sphere" : area.form === "dome" ? "dome" : "cylinder";
      const ring = area.inner > 0 ? `, ${tidy(area.inner)} ${unit} inner` : "";
      return `${tidy(area.radius)} ${unit} ${shape}${ring}`;
    }
  }
}

// Whole numbers stay whole; a fractional size keeps two places, as the
// ruler's own badge does.
function tidy(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * What each item in the column starts from, in the rule's own unit: a
 * wall of fire's reach, a breath weapon, a fireball. The DM changes the
 * numbers from there, and a spell will name its own once sheets arrive.
 */
export function defaultArea(kind: Area["kind"], rule: GridRule): Area {
  const cells = (count: number): number => count * rule.cellSize;
  switch (kind) {
    case "rect":
      return { kind: "rect", aim: 0, length: cells(12), width: cells(1), height: cells(4) };
    case "cone":
      return {
        kind: "cone",
        aim: 0,
        length: cells(6),
        spread: 53,
        edge: "round",
        form: "3d",
        height: cells(1),
      };
    default:
      return { kind: "circle", radius: cells(4), inner: 0, form: "sphere", height: cells(4) };
  }
}

/**
 * A size the pointer reached, snapped to whole cells and never shorter
 * than one. Every size a DM types moves by a cell, so one dragged should
 * land on the same numbers rather than between them.
 */
export function snapSize(reach: number, rule: GridRule): number {
  return Math.max(1, Math.round(reach / rule.cellSize)) * rule.cellSize;
}

/**
 * An area the drag reached that far: the length of a rectangle or a
 * cone, the radius of a circle. A circle's hole is pulled in with it, so
 * dragging a ring smaller never swallows the ring.
 */
export function reached(area: Area, reach: number, rule: GridRule): Area {
  if (area.kind === "circle") {
    return clamped({ ...area, radius: reach }, rule);
  }
  return { ...area, length: reach };
}

/** Where an area's origin may sit: a cell's middle, a grid corner, or wherever it was clicked. */
export type OriginSnap = "centre" | "corner" | "free";

export const ORIGIN_SNAPS: readonly OriginSnap[] = ["centre", "corner", "free"];

/**
 * The place an origin takes when it is put down at `at`, in the rule's
 * unit. A cone leaving a cell's middle covers that cell's neighbours
 * evenly; one leaving a corner is what a grid game usually means; free
 * is for a map that is not being played on the squares.
 */
export function snapOrigin(
  at: { x: number; y: number },
  snap: OriginSnap,
  rule: GridRule
): { x: number; y: number } {
  const cell = rule.cellSize;
  switch (snap) {
    case "centre":
      return {
        x: (Math.floor(at.x / cell) + 0.5) * cell,
        y: (Math.floor(at.y / cell) + 0.5) * cell,
      };
    case "corner":
      return { x: Math.round(at.x / cell) * cell, y: Math.round(at.y / cell) * cell };
    default:
      return at;
  }
}

/**
 * An area with its sizes made sensible. A ring's hole must sit inside
 * its radius: an inner radius as wide as the area swallows it, and a
 * ring that catches nothing is not a shape anyone meant to draw. One
 * rule covers both hands, so raising the inner clamps it and lowering
 * the radius pulls it down.
 */
export function clamped(area: Area, rule: GridRule): Area {
  if (area.kind !== "circle") {
    return area;
  }
  const inner = Math.min(area.inner, Math.max(0, area.radius - rule.cellSize));
  return inner === area.inner ? area : { ...area, inner };
}

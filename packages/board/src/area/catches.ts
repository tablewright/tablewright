/**
 * ─ What an area catches ─
 *
 * Which cells an area takes, and which tokens stand in them. A cell is
 * caught when the volume holds the centre of that cell's cube, and then
 * everything standing in the cell is caught: one test in three
 * dimensions rather than a family of grid rules. An area set to line of
 * sight asks one thing more, that a straight line from its origin reach
 * that centre; one that spreads around corners does not. The rule is
 * named so a system that counts differently can bring its own.
 * Design: docs/design.md §5 "A cell is caught when the volume holds the
 * centre of its cube"; docs/templates.md "What stops it".
 */

import { forCellsInExtent, intersectExtents, type CellExtent } from "../grid/grid-lines.js";
import type { Cell } from "../grid/square-grid.js";
import type { TokenView } from "../tokens/token-layer.js";
import { heightAt, type Topology } from "../topology/derive.js";
import type { AreaRule } from "@tablewright/schema";
import type { GridRule } from "../topology/rules/distance.js";
import { firstStop } from "../topology/rules/effect.js";
import { cubeCentre, spotToCellSpot, type Area, type Spot } from "./area.js";
import { beamCorners, holds } from "./volume.js";

// The place in a cell the rule asks about. A second rule joins here
// rather than at every call site.
function testPoint(areaRule: AreaRule, cell: Cell, ground: number, rule: GridRule): Spot {
  switch (areaRule) {
    case "cube-centre":
    default:
      return cubeCentre(cell, ground, rule);
  }
}

/** How high a token stands: the ground under it, and what it holds above that floor. */
export function placeOf(token: TokenView): number {
  return (token.height ?? 0) + (token.elevation ?? 0);
}

/** Whether `area` catches `cell`, by the campaign's area rule. */
export function catchesCell(
  area: Area,
  origin: Spot,
  cell: Cell,
  topology: Topology,
  rule: GridRule
): boolean {
  return catches(
    area,
    origin,
    testPoint(rule.areaRule, cell, heightAt(topology, cell), rule),
    topology,
    rule
  );
}

/**
 * Whether `area` catches `token` where it stands. A token is judged by
 * the cube it occupies, which sits at the ground under it plus whatever
 * it holds above that floor, so a flier is not caught by what washes
 * the ground beneath them. `source` is the token the area was laid
 * from, if it was laid from one, which `isSource` leaves out.
 */
export function catchesToken(
  area: Area,
  origin: Spot,
  token: TokenView,
  topology: Topology,
  rule: GridRule,
  source?: string
): boolean {
  if (isSource(area, token, source)) {
    return false;
  }
  return catches(area, origin, tokenSpot(token, rule), topology, rule);
}

/**
 * Whether `token` is the one `area` was laid from and so stands outside
 * it. A cone, a wall and a beam never catch the token they leave from, as
 * the rules have it for a cone's and a line's point of origin; a circle
 * laid on a token still holds it, a sphere's origin being inside it. The
 * token is known by who it is, not by where its cube lies.
 */
export function isSource(area: Area, token: TokenView, source: string | undefined): boolean {
  return area.kind !== "circle" && source !== undefined && token.id === source;
}

/** The place in a token's cube the area rule asks about, where it stands. */
export function tokenSpot(token: TokenView, rule: GridRule): Spot {
  return testPoint(rule.areaRule, token.cell, placeOf(token), rule);
}

// The volume must hold the spot; set to line of sight, the straight line
// from the origin must reach it too.
function catches(
  area: Area,
  origin: Spot,
  spot: Spot,
  topology: Topology,
  rule: GridRule
): boolean {
  if (!holds(area, origin, spot)) {
    return false;
  }
  return (
    area.reaches === "around-corners" ||
    firstStop(topology, spotToCellSpot(origin, rule), spotToCellSpot(spot, rule)) === undefined
  );
}

/**
 * The cells `area` catches, in row order. Only the cells the area could
 * possibly reach are asked about, so a small template over a large map
 * costs what it covers rather than what the map holds.
 */
export function caughtCells(
  area: Area,
  origin: Spot,
  topology: Topology,
  rule: GridRule,
  extent: CellExtent = topology.bounds
): Cell[] {
  const box = intersectExtents(reachBox(area, origin, rule), extent);
  const cells: Cell[] = [];
  if (box === undefined) {
    return cells;
  }
  forCellsInExtent(box, (col, row) => {
    const cell = { col, row };
    if (catchesCell(area, origin, cell, topology, rule)) {
      cells.push(cell);
    }
  });
  return cells;
}

// The furthest an area reaches across the map, as a box of cells around
// its origin. A flat-edged cone overshoots its length at the corners, and
// a tall beam tilted steeply leans its height out past its length, so each
// is given the room it actually takes.
function reachBox(area: Area, origin: Spot, rule: GridRule): CellExtent {
  const reach = flatReach(area);
  const cells = Math.ceil(reach / rule.cellSize) + 1;
  const colMin = Math.floor(origin.x / rule.cellSize) - cells;
  const rowMin = Math.floor(origin.y / rule.cellSize) - cells;
  return { colMin, rowMin, cols: cells * 2 + 1, rows: cells * 2 + 1 };
}

function flatReach(area: Area): number {
  switch (area.kind) {
    case "rect":
      // A box is convex, so the corner furthest across the map is as far
      // as any of it reaches.
      return area.form === "beam"
        ? Math.max(...beamCorners(area).map((corner) => Math.hypot(corner.x, corner.y)))
        : area.length + area.width;
    case "cone": {
      const half = ((area.spread / 2) * Math.PI) / 180;
      return area.edge === "flat" ? area.length / Math.max(Math.cos(half), 1e-6) : area.length;
    }
    default:
      return area.radius;
  }
}

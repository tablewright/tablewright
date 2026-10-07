/**
 * ─ The slice ─
 *
 * What a side view cuts: the upright plane along an area's yaw through
 * its origin. Along it lie the ground at the field's own samples, the
 * walls and shut doors it crosses standing to their tops, the area's own
 * cut through the plane, and the stretches of ground the area lands on.
 * Every length is in the rule's unit, along the yaw from the origin and
 * up from the scene's nought, so one scale serves both ways.
 * Design: docs/templates.md "The side view".
 */

import type { Cell } from "../../grid/square-grid.js";
import type { Point } from "../../shared/geometry.js";
import { cellIndex, type Topology } from "../../topology/derive.js";
import type { GridRule } from "../../topology/rules/distance.js";
import { crossingOf, passes, topOf } from "../../topology/rules/effect.js";
import { forSamplesAlong } from "../../topology/shapes.js";
import { aimVector, type ConeArea, type RectArea, type Spot } from "../area.js";
import { catchesCell } from "../cover.js";

/** A point in the slice: how far along the yaw from the origin, and how high. */
export interface SidePoint {
  readonly along: number;
  readonly z: number;
}

/** A wall or a shut door the slice crosses, standing from its foot to its top. */
export interface Upright {
  readonly along: number;
  /** The higher of the two cells it stands between. */
  readonly foot: number;
  readonly top: number;
  readonly kind: "wall" | "door";
}

/** The plane a side view cuts, and the stretch of it shown. */
export interface SliceFrame {
  readonly origin: Spot;
  /** The way the yaw leads across the map, as a unit vector. */
  readonly way: Point;
  /** Where the slice starts, along the yaw from the origin; behind it is less than nought. */
  readonly from: number;
  /** Where the slice ends. */
  readonly to: number;
  readonly rule: GridRule;
}

// How finely a cone's round far edge is walked. Two degrees keeps a
// ninety foot arc within a fiftieth of a foot of true.
const ARC_STEP = 2;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** The slice along `yaw` through `origin`, shown from `from` to `to` along it. */
export function sliceFrame(
  origin: Spot,
  yaw: number,
  from: number,
  to: number,
  rule: GridRule
): SliceFrame {
  const way = aimVector(yaw);
  return { origin, way: { x: way.x, y: way.y }, from, to, rule };
}

/** How far along the yaw a point of the plan stands from the origin, both in the rule's unit. */
export function alongOf(frame: SliceFrame, at: Point): number {
  return (at.x - frame.origin.x) * frame.way.x + (at.y - frame.origin.y) * frame.way.y;
}

/** How far across the yaw a point of the plan stands from the origin, to its right. */
export function acrossOf(frame: SliceFrame, at: Point): number {
  return (at.y - frame.origin.y) * frame.way.x - (at.x - frame.origin.x) * frame.way.y;
}

// The point of the plan `along` the slice, in cells, as the field and the
// edges are kept.
function cellsAt(frame: SliceFrame, along: number): Point {
  const { origin, way, rule } = frame;
  return {
    x: (origin.x + way.x * along) / rule.cellSize,
    y: (origin.y + way.y * along) / rule.cellSize,
  };
}

// Each sample the slice crosses, in order: the stretch of the slice inside
// it, the ground there, level at nought off the map, and the cell it lies in.
function forGroundAlong(
  topology: Topology,
  frame: SliceFrame,
  visit: (from: number, to: number, ground: number, cell: Cell) => void
): void {
  const { bounds, per } = topology.samples;
  const length = frame.to - frame.from;
  const start = cellsAt(frame, frame.from);
  const end = cellsAt(frame, frame.to);
  forSamplesAlong(start, end, topology.samples, (span) => {
    const ground = span.index === undefined ? 0 : (topology.field[span.index] ?? 0);
    const cell = {
      col: bounds.colMin + Math.floor(span.i / per),
      row: bounds.rowMin + Math.floor(span.j / per),
    };
    visit(frame.from + length * span.tIn, frame.from + length * span.tOut, ground, cell);
    return false;
  });
}

/**
 * The ground along the slice, as a line that steps where the field does:
 * exact at the field's samples, inventing nothing between them.
 */
export function groundAlong(topology: Topology, frame: SliceFrame): SidePoint[] {
  const points: SidePoint[] = [];
  forGroundAlong(topology, frame, (from, to, ground) => extend(points, from, to, ground));
  return points;
}

// Carry a line of ground on from `from` to `to` at `ground`: a run at the
// same height grows, and a new height steps up or down to it.
function extend(points: SidePoint[], from: number, to: number, ground: number): void {
  const last = points[points.length - 1];
  if (last !== undefined && last.z === ground) {
    points[points.length - 1] = { along: to, z: ground };
  } else {
    points.push({ along: from, z: ground }, { along: to, z: ground });
  }
}

/**
 * The walls and shut doors the slice crosses, nearest the start first:
 * what a straight line from the origin is stopped by below its top. A
 * window and an open door are holes and are not among them.
 */
export function uprightsAlong(topology: Topology, frame: SliceFrame): Upright[] {
  const start = cellsAt(frame, frame.from);
  const end = cellsAt(frame, frame.to);
  const uprights: Upright[] = [];
  for (const data of topology.edges.values()) {
    const t = passes(data, "sight") ? undefined : crossingOf(start, end, data.edge);
    if (t === undefined) {
      continue;
    }
    const top = topOf(topology, data);
    uprights.push({
      along: frame.from + (frame.to - frame.from) * t,
      foot: top - data.tall,
      top,
      kind: data.kind === "wall" ? "wall" : "door",
    });
  }
  return uprights.sort((a, b) => a.along - b.along);
}

/**
 * The area's cut through the slice, as one ring. A 3D cone is the wedge
 * between its two sides at its pitch less and more half its spread,
 * closed by its round or flat far edge; a wall and a flat cone are the
 * band they stand in from the origin up; a beam is the band about its
 * tilted line, where its box and its tube meet the plane alike.
 */
export function areaSlice(area: RectArea | ConeArea, origin: Spot): SidePoint[] {
  const oz = origin.z;
  if (area.kind === "rect" && area.form === "beam") {
    const tilt = radians(area.pitch);
    // Along its line, and up from it, which leans back as the line tilts up.
    const corner = (run: number, rise: number): SidePoint => ({
      along: run * Math.cos(tilt) - rise * Math.sin(tilt),
      z: oz + run * Math.sin(tilt) + rise * Math.cos(tilt),
    });
    const half = area.height / 2;
    return [
      corner(0, -half),
      corner(area.length, -half),
      corner(area.length, half),
      corner(0, half),
    ];
  }
  if (area.kind === "cone" && area.spread <= 0) {
    return [];
  }
  if (area.kind === "rect" || area.form === "flat") {
    const top = oz + area.height;
    return [
      { along: 0, z: oz },
      { along: area.length, z: oz },
      { along: area.length, z: top },
      { along: 0, z: top },
    ];
  }
  const half = area.spread / 2;
  const low = area.pitch - half;
  const high = area.pitch + half;
  const toward = (degrees: number, reach: number): SidePoint => ({
    along: reach * Math.cos(radians(degrees)),
    z: oz + reach * Math.sin(radians(degrees)),
  });
  const apex = { along: 0, z: oz };
  if (area.edge === "flat") {
    // The far disc square to the axis meets each side the length over the
    // cosine of the half spread out.
    const reach = area.length / Math.cos(radians(half));
    return [apex, toward(low, reach), toward(high, reach)];
  }
  const ring = [apex];
  for (let turn = low; turn < high; turn += ARC_STEP) {
    ring.push(toward(turn, area.length));
  }
  ring.push(toward(high, area.length));
  return ring;
}

/**
 * Where along the slice the area lands: the stretches over the cells the
 * board lights, the map's cells caught by the cover rule, line of sight
 * and all, each the ground's line from its start to its end. Each cell
 * is asked once.
 */
export function landsAlong(
  area: RectArea | ConeArea,
  topology: Topology,
  frame: SliceFrame
): SidePoint[][] {
  const stretches: SidePoint[][] = [];
  const asked = new Map<string, boolean>();
  let open: SidePoint[] | undefined;
  forGroundAlong(topology, frame, (from, to, ground, cell) => {
    const key = `${cell.col}:${cell.row}`;
    const isCaught =
      asked.get(key) ??
      (cellIndex(topology.bounds, cell) !== undefined &&
        catchesCell(area, frame.origin, cell, topology, frame.rule));
    asked.set(key, isCaught);
    if (!isCaught) {
      open = undefined;
      return;
    }
    if (open === undefined) {
      open = [];
      stretches.push(open);
    }
    extend(open, from, to, ground);
  });
  return stretches;
}

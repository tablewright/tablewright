/**
 * ─ Gestures ─
 *
 * What a press, a drag and a release mean in Build mode, in cell units:
 * a rect from two cells, a line locked to one axis along grid vertices,
 * the dabs of a brush, the corners of a free shape, the edge nearest a
 * click. Pure, so the layer only feeds it points and takes the stroke.
 * Design: docs/design.md §5 "Six inks, one tool".
 */

import type { CellRect, Edge, Stroke, Visibility } from "@tablewright/schema";
import type { Point } from "../geometry.js";
import type { Cell } from "../grid/square-grid.js";
import type { DrawTool } from "./tool.js";

export type Gesture =
  | { readonly kind: "rect"; readonly a: Cell; b: Cell }
  | { readonly kind: "line"; readonly a: Point; b: Point }
  | { readonly kind: "brush"; readonly points: Point[] }
  | { readonly kind: "free"; readonly points: Point[] }
  | { readonly kind: "click"; readonly edge: Edge };

// Points closer than this to the last one add nothing a brush or a free
// shape can show; the record stays small.
export const POINT_GAP = 0.15;
// How near a click must be to an edge, in cells, to mean it.
export const EDGE_REACH = 0.3;
// A free shape needs three corners to enclose anything.
const FREE_CORNERS = 3;

/** The cell a point falls in. */
export function cellOf(p: Point): Cell {
  return { col: Math.floor(p.x), row: Math.floor(p.y) };
}

/** The grid vertex nearest a point. */
export function vertexOf(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** The block of cells with `a` and `b` at opposite corners, whichever way round. */
export function normRect(a: Cell, b: Cell): CellRect {
  return {
    col0: Math.min(a.col, b.col),
    row0: Math.min(a.row, b.row),
    col1: Math.max(a.col, b.col),
    row1: Math.max(a.row, b.row),
  };
}

/** A line from `a` to `b` snapped to grid vertices and locked to its longer axis. */
export function lockLine(a: Point, b: Point): [Point, Point] {
  const from = vertexOf(a);
  const to = vertexOf(b);
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    ? [from, { x: to.x, y: from.y }]
    : [from, { x: from.x, y: to.y }];
}

/** The edges along a locked line between two vertices. */
export function lineEdges(a: Point, b: Point): Edge[] {
  const edges: Edge[] = [];
  if (a.y === b.y) {
    for (let col = Math.min(a.x, b.x); col < Math.max(a.x, b.x); col += 1) {
      edges.push({ col, row: a.y - 1, side: "south" });
    }
  } else {
    for (let row = Math.min(a.y, b.y); row < Math.max(a.y, b.y); row += 1) {
      edges.push({ col: a.x - 1, row, side: "east" });
    }
  }
  return edges;
}

/** The edge nearest a point, if one is within `reach` cells of it. */
export function edgeNear(p: Point, reach: number = EDGE_REACH): Edge | undefined {
  const vx = Math.round(p.x);
  const vy = Math.round(p.y);
  const dx = Math.abs(p.x - vx);
  const dy = Math.abs(p.y - vy);
  if (dx <= dy) {
    return dx <= reach ? { col: vx - 1, row: Math.floor(p.y), side: "east" } : undefined;
  }
  return dy <= reach ? { col: Math.floor(p.x), row: vy - 1, side: "south" } : undefined;
}

/** Start the gesture a press at `p` begins with `tool`, or nothing for a click ink. */
export function beginGesture(tool: DrawTool, p: Point): Gesture | undefined {
  switch (tool.shape) {
    case "rect":
      return { kind: "rect", a: cellOf(p), b: cellOf(p) };
    case "line":
      return { kind: "line", a: p, b: p };
    case "brush":
      return { kind: "brush", points: [p] };
    case "free":
      return { kind: "free", points: [p] };
    case "click": {
      const edge = edgeNear(p);
      return edge === undefined ? undefined : { kind: "click", edge };
    }
  }
}

/** Carry the gesture to `p`. */
export function moveGesture(gesture: Gesture, p: Point): void {
  switch (gesture.kind) {
    case "rect":
      gesture.b = cellOf(p);
      break;
    case "line":
      gesture.b = p;
      break;
    case "brush":
    case "free": {
      const last = gesture.points[gesture.points.length - 1];
      if (last === undefined || Math.hypot(p.x - last.x, p.y - last.y) >= POINT_GAP) {
        gesture.points.push(p);
      }
      break;
    }
    case "click":
      break;
  }
}

/** The stroke a finished gesture leaves with `tool`, or nothing when it drew nothing. */
export function strokeOf(
  tool: DrawTool,
  gesture: Gesture,
  visibility: Visibility = "party"
): Stroke | undefined {
  switch (gesture.kind) {
    case "rect": {
      const rect = normRect(gesture.a, gesture.b);
      switch (tool.ink) {
        case "ground":
          return { ink: "ground", shape: { kind: "rect", rect }, state: tool.ground, visibility };
        case "wall":
          return { ink: "wall", shape: { kind: "rect", rect }, visibility };
        case "height":
          return { ink: "height", shape: { kind: "rect", rect }, value: tool.height, visibility };
        case "free":
          return { ink: "free", shape: { kind: "rect", rect }, visibility };
        default:
          return undefined;
      }
    }
    case "line": {
      const [a, b] = lockLine(gesture.a, gesture.b);
      const edges = lineEdges(a, b);
      if (tool.ink !== "wall" || edges.length === 0) {
        return undefined;
      }
      return { ink: "wall", shape: { kind: "line", edges }, visibility };
    }
    case "brush": {
      const shape = { kind: "brush" as const, points: gesture.points, radius: tool.radius };
      switch (tool.ink) {
        case "ground":
          return { ink: "ground", shape, state: tool.ground, visibility };
        case "height":
          return { ink: "height", shape, value: tool.height, visibility };
        case "level-change":
          return { ink: "level-change", shape, visibility };
        case "free":
          return { ink: "free", shape, visibility };
        default:
          return undefined;
      }
    }
    case "free": {
      if (gesture.points.length < FREE_CORNERS) {
        return undefined;
      }
      const shape = { kind: "free" as const, points: gesture.points };
      switch (tool.ink) {
        case "ground":
          return { ink: "ground", shape, state: tool.ground, visibility };
        case "height":
          return { ink: "height", shape, value: tool.height, visibility };
        case "free":
          return { ink: "free", shape, visibility };
        default:
          return undefined;
      }
    }
    case "click":
      if (tool.ink !== "threshold") {
        return undefined;
      }
      return {
        ink: "threshold",
        edge: gesture.edge,
        kind: tool.threshold.kind,
        state: tool.threshold.state,
        size: tool.threshold.size,
        visibility,
      };
  }
}

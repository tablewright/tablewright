/**
 * ─ Preview ─
 *
 * What the drawing hand shows before a stroke is recorded: the gesture as
 * it is drawn out, or at rest what a press would take.
 * Design: docs/design.md §5 "Six inks, one tool".
 */

import type { Graphics } from "pixi.js";
import { cellPointToWorld, type SquareGrid } from "../grid/square-grid.js";
import type { Point } from "../shared/geometry.js";
import type { DrawStyle } from "./draw-layer.js";
import { edgeNear, lockLine, normRect, type Gesture } from "./gestures.js";
import type { DrawTool } from "./tool.js";

/** The gesture as it goes: a rect, a line or an outline in the hover colour, a brush's trail in its ink. */
export function gesturePreview(
  g: Graphics,
  grid: SquareGrid,
  style: DrawStyle,
  tool: DrawTool,
  gesture: Gesture
): void {
  const cell = grid.cellSize;
  const { hover, ink } = style;
  if (gesture.kind === "rect") {
    const r = normRect(gesture.a, gesture.b);
    const corner = cellPointToWorld(grid, { x: r.col0, y: r.row0 });
    g.rect(corner.x, corner.y, (r.col1 - r.col0 + 1) * cell, (r.row1 - r.row0 + 1) * cell)
      .fill({ color: hover.rgb, alpha: 0.12 })
      .stroke({ width: 2, color: hover.rgb, alpha: hover.alpha, pixelLine: true });
  } else if (gesture.kind === "line") {
    const [a, b] = lockLine(gesture.a, gesture.b);
    const from = cellPointToWorld(grid, a);
    const to = cellPointToWorld(grid, b);
    g.moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: cell * 0.08, color: hover.rgb, alpha: hover.alpha, cap: "round" });
  } else if (gesture.kind === "free") {
    const points = gesture.points.map((p) => cellPointToWorld(grid, p));
    if (points.length >= 2) {
      g.poly(points, true)
        .fill({ color: hover.rgb, alpha: 0.15 })
        .stroke({ width: 2, color: hover.rgb, alpha: hover.alpha, pixelLine: true });
    }
  } else if (gesture.kind === "brush") {
    const points = gesture.points.map((p) => cellPointToWorld(grid, p));
    const [first, ...rest] = points;
    if (first !== undefined) {
      g.moveTo(first.x, first.y);
      for (const p of rest) {
        g.lineTo(p.x, p.y);
      }
      if (rest.length === 0) {
        g.lineTo(first.x + 0.01, first.y);
      }
      g.stroke({
        width: tool.radius * 2 * cell,
        color: ink.rgb,
        alpha: 0.35,
        cap: "round",
        join: "round",
      });
    }
  }
}

/**
 * At rest, the tool shows what a press would take: the brush's disc, or
 * the edge nearest the pointer.
 */
export function hoverPreview(
  g: Graphics,
  grid: SquareGrid,
  style: DrawStyle,
  tool: DrawTool,
  pointer: Point
): void {
  const cell = grid.cellSize;
  const { hover, ink } = style;
  if (tool.shape === "brush") {
    const at = cellPointToWorld(grid, pointer);
    g.circle(at.x, at.y, tool.radius * cell).stroke({
      width: 1.5,
      color: ink.rgb,
      alpha: ink.alpha,
      pixelLine: true,
    });
  } else if (tool.shape === "click") {
    const edge = edgeNear(pointer);
    if (edge === undefined) {
      return;
    }
    const at = cellPointToWorld(grid, { x: edge.col, y: edge.row });
    const from = edge.side === "east" ? { x: at.x + cell, y: at.y } : { x: at.x, y: at.y + cell };
    const to = { x: at.x + cell, y: at.y + cell };
    g.moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: cell * 0.12, color: hover.rgb, alpha: 0.8, cap: "round" });
  }
}

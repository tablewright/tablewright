/**
 * ─ Threshold glyphs ─
 *
 * How a threshold is drawn on its edge: the vocabulary of posts, bar,
 * lock and line, and the glyph each kind and state is dispatched to.
 * Design: docs/design.md §5 "Topology and measurement".
 */

import type { Graphics } from "pixi.js";
import type { Edge } from "@tablewright/schema";
import { dashedLine } from "../../draw/strokes.js";
import { cellToWorld, type SquareGrid } from "../../grid/square-grid.js";
import type { PackedColor } from "../../theme/css-color.js";
import type { ThresholdEdge } from "../derive.js";
import type { TopologyStyle } from "./topology-layer.js";

/** An edge's line in world pixels, from one end to the other. */
export interface Span {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

// How much heavier a threshold drawn as texture is than the data hint.
const TEXTURE_WEIGHT = 1.6;

// The marks a threshold is drawn with, over the span `s`: its direction
// along the edge, a width scaled up when heavy, the line along it, the
// posts at its ends, the bar across a shut door, and the lock at its middle.
interface Glyphs {
  readonly ux: number;
  readonly uy: number;
  w(fraction: number): number;
  line(width: number, color: PackedColor, alpha?: number): void;
  caps(): void;
  bar(): void;
  lock(): void;
}

function glyphsOf(
  g: Graphics,
  s: Span,
  cell: number,
  style: TopologyStyle,
  heavy: boolean
): Glyphs {
  const ux = (s.x1 - s.x0) / cell;
  const uy = (s.y1 - s.y0) / cell;
  const nx = -uy;
  const ny = ux;
  const { wall, threshold } = style;
  const w = (fraction: number): number => cell * fraction * (heavy ? TEXTURE_WEIGHT : 1);
  const line = (width: number, color: PackedColor, alpha = color.alpha): void => {
    g.moveTo(s.x0, s.y0).lineTo(s.x1, s.y1).stroke({ width, color: color.rgb, alpha });
  };
  // Door posts: the wall's ends, drawn firm where the wall itself is faint.
  const caps = (): void => {
    const half = w(0.12);
    g.moveTo(s.x0 - nx * half, s.y0 - ny * half)
      .lineTo(s.x0 + nx * half, s.y0 + ny * half)
      .moveTo(s.x1 - nx * half, s.y1 - ny * half)
      .lineTo(s.x1 + nx * half, s.y1 + ny * half)
      .stroke({ width: w(0.08), color: wall.rgb, alpha: heavy ? 1 : 0.9 });
  };
  const bar = (): void => {
    const inset = cell * 0.08;
    g.moveTo(s.x0 + ux * inset, s.y0 + uy * inset)
      .lineTo(s.x1 - ux * inset, s.y1 - uy * inset)
      .stroke({ width: w(0.06), color: threshold.rgb, alpha: threshold.alpha });
  };
  const lock = (): void => {
    const mx = (s.x0 + s.x1) / 2;
    const my = (s.y0 + s.y1) / 2;
    g.circle(mx, my, w(0.08)).fill({ color: threshold.rgb, alpha: threshold.alpha });
    g.circle(mx, my, w(0.03)).fill({ color: style.ground });
  };
  return { ux, uy, w, line, caps, bar, lock };
}

/**
 * A threshold as data is a hint in the wall's own faintness; as texture
 * it is heavier and its posts and frame are solid.
 */
export function drawThreshold(
  g: Graphics,
  s: Span,
  data: ThresholdEdge,
  cell: number,
  style: TopologyStyle,
  heavy: boolean
): void {
  const { ux, uy, w, line, caps, bar, lock } = glyphsOf(g, s, cell, style, heavy);
  const { wall, threshold, sight } = style;
  const wallAlpha = heavy ? 1 : wall.alpha;
  if (data.state === "secret") {
    // A wall to everyone who may not see it; to the DM, a wall with a hint.
    line(w(0.06), wall, wallAlpha);
    dashedLine(g, { x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }, cell * 0.12, cell * 0.12);
    g.stroke({ width: w(0.03), color: threshold.rgb, alpha: threshold.alpha });
    return;
  }
  switch (data.threshold) {
    case "arch":
      caps();
      return;
    case "window":
    case "frosted":
      line(w(data.size === "large" ? 0.1 : 0.07), wall, wallAlpha);
      if (data.state === "smashed") {
        // The glass in two pieces at the ends; the way through is clear.
        const shard = cell * 0.3;
        g.moveTo(s.x0, s.y0)
          .lineTo(s.x0 + ux * shard, s.y0 + uy * shard)
          .moveTo(s.x1 - ux * shard, s.y1 - uy * shard)
          .lineTo(s.x1, s.y1)
          .stroke({ width: w(0.04), color: sight.rgb, alpha: sight.alpha });
        return;
      }
      if (data.threshold === "frosted") {
        dashedLine(g, { x: s.x0, y: s.y0 }, { x: s.x1, y: s.y1 }, cell * 0.1, cell * 0.1);
        g.stroke({ width: w(0.04), color: sight.rgb, alpha: sight.alpha });
      } else {
        line(w(0.04), sight);
      }
      if (data.state === "locked") {
        lock();
      }
      return;
    case "door":
      caps();
      if (data.state === "open") {
        // The leaf swung sixty degrees into the room.
        const angle = Math.PI / 3;
        const lx = ux * Math.cos(angle) - uy * Math.sin(angle);
        const ly = ux * Math.sin(angle) + uy * Math.cos(angle);
        const leaf = cell * 0.8;
        g.moveTo(s.x0, s.y0)
          .lineTo(s.x0 + lx * leaf, s.y0 + ly * leaf)
          .stroke({ width: w(0.06), color: threshold.rgb, alpha: threshold.alpha });
      } else {
        bar();
        if (data.state === "locked") {
          lock();
        }
      }
  }
}

/** The edge's line in world pixels: the east or the south side of its cell. */
export function segment(grid: SquareGrid, edge: Edge): Span {
  const cell = grid.cellSize;
  const { x, y } = cellToWorld(grid, edge);
  return edge.side === "east"
    ? { x0: x + cell, y0: y, x1: x + cell, y1: y + cell }
    : { x0: x, y0: y + cell, x1: x + cell, y1: y + cell };
}

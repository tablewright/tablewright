/**
 * ─ Topology layer ─
 *
 * Draws what the DM drew, quietly, over the map picture: difficult and
 * air cells as faint tints, walls as a hint, thresholds by kind and
 * state, level changes as ticks, free ink as it was. Nothing for void
 * or plain ground, so a scene with no strokes looks as it did. One
 * Graphics, rebuilt when the topology or the grid changes; height is
 * the height layer's to show.
 * Design: docs/design.md §5 "Topology and measurement".
 */

import { Graphics, type Container } from "pixi.js";
import type { Edge } from "@tablewright/schema";
import type { Point } from "../geometry.js";
import type { SquareGrid } from "../grid/square-grid.js";
import type { PackedColor } from "../theme/css-color.js";
import { edgeCells } from "./edges.js";
import { groundAt, type EdgeData, type Topology } from "./derive.js";
import { placedPoints, radiusOf, sampleCentre, sampleHeight, sampleWidth } from "./shapes.js";

export interface TopologyStyle {
  /** The board's ground, for the dark centre of a lock mark. */
  readonly ground: number;
  readonly wall: PackedColor;
  readonly threshold: PackedColor;
  /** What sight passes through: windows. */
  readonly sight: PackedColor;
  readonly difficult: PackedColor;
  readonly air: PackedColor;
}

interface Segment {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

type Threshold = Extract<EdgeData, { kind: "threshold" }>;

// The tokens' values, until the theme bridge supplies them.
const DEFAULT_STYLE: TopologyStyle = {
  ground: 0x1b1d24,
  wall: { rgb: 0xf1e6d2, alpha: 0.4 },
  threshold: { rgb: 0xc9a24e, alpha: 1 },
  sight: { rgb: 0x5fa8bd, alpha: 1 },
  difficult: { rgb: 0xf1e6d2, alpha: 0.12 },
  air: { rgb: 0x5fa8bd, alpha: 0.28 },
};

/** The derived topology as one Graphics; call `draw` whenever it or the grid changes. */
export class TopologyLayer {
  private readonly graphics = new Graphics();
  private style: TopologyStyle = DEFAULT_STYLE;
  private last: { topology: Topology; grid: SquareGrid } | undefined;

  constructor(container: Container) {
    container.addChild(this.graphics);
  }

  /** Rebuild the drawing for `topology` on `grid`. */
  draw(topology: Topology, grid: SquareGrid): void {
    this.last = { topology, grid };
    const g = this.graphics;
    g.clear();
    this.drawStates(g, topology, grid);
    this.drawLevelChanges(g, topology, grid);
    this.drawEdges(g, topology, grid);
    this.drawFreeInk(g, topology, grid);
  }

  /** Remove everything drawn. */
  clear(): void {
    this.last = undefined;
    this.graphics.clear();
  }

  /** Change the colours, redrawing if something has been drawn. */
  setStyle(style: TopologyStyle): void {
    this.style = style;
    if (this.last !== undefined) {
      this.draw(this.last.topology, this.last.grid);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private drawStates(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const { bounds } = topology;
    const cell = grid.cellSize;
    const air: Point[] = [];
    let difficult = 0;
    for (let row = bounds.rowMin; row < bounds.rowMin + bounds.rows; row += 1) {
      for (let col = bounds.colMin; col < bounds.colMin + bounds.cols; col += 1) {
        const state = groundAt(topology, { col, row });
        if (state !== "difficult" && state !== "air") {
          continue;
        }
        const x = grid.originX + col * cell;
        const y = grid.originY + row * cell;
        if (state === "difficult") {
          g.rect(x, y, cell, cell);
          difficult += 1;
        } else {
          air.push({ x, y });
        }
      }
    }
    if (difficult > 0) {
      g.fill({ color: this.style.difficult.rgb, alpha: this.style.difficult.alpha });
    }
    if (air.length > 0) {
      for (const p of air) {
        g.rect(p.x, p.y, cell, cell);
      }
      g.fill({ color: this.style.air.rgb, alpha: this.style.air.alpha });
      const inset = cell * 0.06;
      for (const p of air) {
        g.rect(p.x + inset, p.y + inset, cell - inset * 2, cell - inset * 2);
      }
      g.stroke({ width: 1, color: this.style.air.rgb, alpha: 0.8, pixelLine: true });
    }
  }

  // Short ticks over the painted slope, thinned to every fourth row and
  // second column of samples so stairs read without covering the art.
  private drawLevelChanges(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const { samples, levelChange } = topology;
    const width = sampleWidth(samples);
    const height = sampleHeight(samples);
    const half = grid.cellSize * 0.06;
    let ticks = 0;
    for (let j = 1; j < height; j += 4) {
      for (let i = 1; i < width; i += 2) {
        if (levelChange[j * width + i] !== 1) {
          continue;
        }
        const centre = sampleCentre(samples, i, j);
        const x = grid.originX + centre.x * grid.cellSize;
        const y = grid.originY + centre.y * grid.cellSize;
        g.moveTo(x - half, y).lineTo(x + half, y);
        ticks += 1;
      }
    }
    if (ticks > 0) {
      g.stroke({ width: 1, color: this.style.wall.rgb, alpha: 0.5, pixelLine: true });
    }
  }

  private drawEdges(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const cell = grid.cellSize;
    const thresholds: Threshold[] = [];
    let walls = 0;
    for (const data of topology.edges.values()) {
      const [a, b] = edgeCells(data.edge);
      // Between two void cells nothing is crossed, so nothing is drawn.
      if (groundAt(topology, a) === "void" && groundAt(topology, b) === "void") {
        continue;
      }
      if (data.kind === "threshold") {
        thresholds.push(data);
        continue;
      }
      const s = segment(grid, data.edge);
      g.moveTo(s.x0, s.y0).lineTo(s.x1, s.y1);
      walls += 1;
    }
    if (walls > 0) {
      g.stroke({ width: cell * 0.06, color: this.style.wall.rgb, alpha: this.style.wall.alpha });
    }
    for (const data of thresholds) {
      this.drawThreshold(g, segment(grid, data.edge), data, cell);
    }
  }

  private drawThreshold(g: Graphics, s: Segment, data: Threshold, cell: number): void {
    const ux = (s.x1 - s.x0) / cell;
    const uy = (s.y1 - s.y0) / cell;
    const nx = -uy;
    const ny = ux;
    const { wall, threshold, sight } = this.style;
    const line = (width: number, color: PackedColor, alpha = color.alpha): void => {
      g.moveTo(s.x0, s.y0).lineTo(s.x1, s.y1).stroke({ width, color: color.rgb, alpha });
    };
    // Door posts: the wall's ends, drawn firm where the wall itself is faint.
    const caps = (): void => {
      const half = cell * 0.12;
      g.moveTo(s.x0 - nx * half, s.y0 - ny * half)
        .lineTo(s.x0 + nx * half, s.y0 + ny * half)
        .moveTo(s.x1 - nx * half, s.y1 - ny * half)
        .lineTo(s.x1 + nx * half, s.y1 + ny * half)
        .stroke({ width: cell * 0.08, color: wall.rgb, alpha: 0.9 });
    };
    const bar = (): void => {
      const inset = cell * 0.08;
      g.moveTo(s.x0 + ux * inset, s.y0 + uy * inset)
        .lineTo(s.x1 - ux * inset, s.y1 - uy * inset)
        .stroke({ width: cell * 0.06, color: threshold.rgb, alpha: threshold.alpha });
    };
    const lock = (): void => {
      const mx = (s.x0 + s.x1) / 2;
      const my = (s.y0 + s.y1) / 2;
      g.circle(mx, my, cell * 0.08).fill({ color: threshold.rgb, alpha: threshold.alpha });
      g.circle(mx, my, cell * 0.03).fill({ color: this.style.ground });
    };
    if (data.state === "secret") {
      // A wall to everyone who may not see it; to the DM, a wall with a hint.
      line(cell * 0.06, wall);
      dashed(g, s, cell * 0.12, cell * 0.12);
      g.stroke({ width: cell * 0.03, color: threshold.rgb, alpha: threshold.alpha });
      return;
    }
    switch (data.threshold) {
      case "arch":
        caps();
        return;
      case "window":
      case "frosted":
        line(cell * (data.size === "large" ? 0.1 : 0.07), wall);
        if (data.state === "smashed") {
          // The glass in two pieces at the ends; the way through is clear.
          const shard = cell * 0.3;
          g.moveTo(s.x0, s.y0)
            .lineTo(s.x0 + ux * shard, s.y0 + uy * shard)
            .moveTo(s.x1 - ux * shard, s.y1 - uy * shard)
            .lineTo(s.x1, s.y1)
            .stroke({ width: cell * 0.04, color: sight.rgb, alpha: sight.alpha });
          return;
        }
        if (data.threshold === "frosted") {
          dashed(g, s, cell * 0.1, cell * 0.1);
          g.stroke({ width: cell * 0.04, color: sight.rgb, alpha: sight.alpha });
        } else {
          line(cell * 0.04, sight);
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
            .stroke({ width: cell * 0.06, color: threshold.rgb, alpha: threshold.alpha });
        } else {
          bar();
          if (data.state === "locked") {
            lock();
          }
        }
    }
  }

  private drawFreeInk(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const cell = grid.cellSize;
    const toWorld = (p: Point): Point => ({
      x: grid.originX + p.x * cell,
      y: grid.originY + p.y * cell,
    });
    const style = {
      width: cell * 0.04,
      color: this.style.threshold.rgb,
      alpha: this.style.threshold.alpha,
      cap: "round" as const,
      join: "round" as const,
    };
    for (const stroke of topology.free) {
      const { shape } = stroke;
      if (shape.kind === "rect") {
        const { rect } = shape;
        const corner = toWorld({ x: rect.col0, y: rect.row0 });
        g.rect(
          corner.x,
          corner.y,
          (rect.col1 - rect.col0 + 1) * cell,
          (rect.row1 - rect.row0 + 1) * cell
        ).stroke(style);
        continue;
      }
      const points = placedPoints(shape.points).map(toWorld);
      if (points.length === 0) {
        continue;
      }
      if (shape.kind === "free") {
        g.poly(points, true).stroke(style);
        continue;
      }
      // A brush leaves a mark as wide as the disc that painted it; a single
      // dab is a dot of that width.
      const [first, ...rest] = points;
      if (first === undefined) {
        continue;
      }
      g.moveTo(first.x, first.y);
      for (const p of rest) {
        g.lineTo(p.x, p.y);
      }
      if (rest.length === 0) {
        g.lineTo(first.x + 0.01, first.y);
      }
      g.stroke({ ...style, width: radiusOf(shape.radius) * 2 * cell });
    }
  }
}

function segment(grid: SquareGrid, edge: Edge): Segment {
  const cell = grid.cellSize;
  const x = grid.originX + edge.col * cell;
  const y = grid.originY + edge.row * cell;
  return edge.side === "east"
    ? { x0: x + cell, y0: y, x1: x + cell, y1: y + cell }
    : { x0: x, y0: y + cell, x1: x + cell, y1: y + cell };
}

// Pixi strokes have no dash; the path is laid down in pieces instead.
function dashed(g: Graphics, s: Segment, dash: number, gap: number): void {
  const length = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
  const ux = (s.x1 - s.x0) / length;
  const uy = (s.y1 - s.y0) / length;
  for (let at = 0; at < length; at += dash + gap) {
    const end = Math.min(length, at + dash);
    g.moveTo(s.x0 + ux * at, s.y0 + uy * at).lineTo(s.x0 + ux * end, s.y0 + uy * end);
  }
}

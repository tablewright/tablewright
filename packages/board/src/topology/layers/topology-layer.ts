/**
 * ─ Topology layer ─
 *
 * Draws what the DM drew over the map picture. A stroke drawn as data
 * shows quietly, as a tint or a hint; one drawn as texture too shows in
 * full, for a map whose art has none. Free ink shows as it was. Nothing
 * for plain ground or void, so a scene with no strokes looks as it did.
 * One Graphics, rebuilt when the topology or the grid changes; height
 * is the height layer's.
 * Design: docs/design.md §5 "Topology and measurement".
 */

import { Graphics, type Container } from "pixi.js";
import type { Edge } from "@tablewright/schema";
import type { Point } from "../../shared/geometry.js";
import { forCellsInExtent } from "../../grid/grid-lines.js";
import {
  cellPointToWorld,
  cellToWorld,
  insetCell,
  type Cell,
  type SquareGrid,
} from "../../grid/square-grid.js";
import { FALLBACK } from "../../theme/board-theme.js";
import type { PackedColor } from "../../theme/css-color.js";
import { topologyStyle } from "../../theme/styles.js";
import { edgeCells, edgeKey } from "../edges.js";
import {
  LEVEL_CHANGE_TEXTURED,
  groundAt,
  isTexturedAt,
  type ThresholdEdge,
  type Topology,
} from "../derive.js";
import { placedPoints, radiusOf, sampleCentre, sampleHeight, sampleWidth } from "../shapes.js";
import { drawThreshold, segment, type Span } from "./threshold-glyphs.js";

export interface TopologyStyle {
  /** The board's ground, for the dark centre of a lock mark and the floor of a hole. */
  readonly ground: number;
  /** Ground drawn as texture: a painted floor. */
  readonly floor: PackedColor;
  readonly wall: PackedColor;
  readonly threshold: PackedColor;
  /** What sight passes through: windows. */
  readonly sight: PackedColor;
  readonly difficult: PackedColor;
  readonly air: PackedColor;
  /** A threshold under the pointer in Play: brighter, so it reads as workable. */
  readonly hover: PackedColor;
}

// The cells sorted for drawing: the corners to paint or tint, and the air
// cells themselves, whose outlines are drawn in from their edges.
interface Sorted {
  readonly floors: readonly Point[];
  readonly difficult: readonly Point[];
  readonly hatched: readonly Point[];
  readonly air: readonly Cell[];
  readonly holes: readonly Point[];
}

const DEFAULT_STYLE: TopologyStyle = topologyStyle(FALLBACK);

/** The derived topology as one Graphics; call `draw` whenever it or the grid changes. */
export class TopologyLayer {
  private readonly graphics = new Graphics();
  // The threshold under the pointer, drawn again over everything, brighter.
  private readonly glow = new Graphics();
  private style: TopologyStyle = DEFAULT_STYLE;
  // In the DM's Topology view every texture is read as its data hint, so
  // the picture underneath is uncovered and only what the rules read shows.
  private isMuted = false;
  private last: { topology: Topology; grid: SquareGrid } | undefined;
  private highlighted: Edge | undefined;

  constructor(container: Container) {
    container.addChild(this.graphics, this.glow);
  }

  /** Rebuild the drawing for `topology` on `grid`. */
  draw(topology: Topology, grid: SquareGrid): void {
    this.last = { topology, grid };
    const g = this.graphics;
    g.clear();
    this.drawStates(g, topology, grid);
    this.drawLevelChanges(g, topology, grid);
    this.drawEdges(g, topology, grid);
    if (!this.isMuted) {
      this.drawFreeInk(g, topology, grid);
    }
    this.drawHighlight();
  }

  /** Remove everything drawn. */
  clear(): void {
    this.last = undefined;
    this.graphics.clear();
    this.glow.clear();
  }

  /** Change the colours, redrawing if something has been drawn. */
  setStyle(style: TopologyStyle): void {
    this.style = style;
    if (this.last !== undefined) {
      this.draw(this.last.topology, this.last.grid);
    }
  }

  /**
   * Show every stroke as its data hint, whatever it was drawn as: the
   * Topology view uncovers the picture so the numbers over it can be read.
   */
  setMuted(muted: boolean): void {
    if (muted === this.isMuted) {
      return;
    }
    this.isMuted = muted;
    if (this.last !== undefined) {
      this.draw(this.last.topology, this.last.grid);
    }
  }

  /** Brighten the threshold on `edge`, or none. */
  setHighlight(edge: Edge | undefined): void {
    this.highlighted = edge;
    this.drawHighlight();
  }

  destroy(): void {
    this.graphics.destroy();
    this.glow.destroy();
  }

  private drawHighlight(): void {
    const g = this.glow;
    g.clear();
    if (this.last === undefined || this.highlighted === undefined) {
      return;
    }
    const { topology, grid } = this.last;
    const data = topology.edges.get(edgeKey(this.highlighted));
    if (data?.kind !== "threshold") {
      return;
    }
    const cell = grid.cellSize;
    const s = segment(grid, data.edge);
    const { hover } = this.style;
    g.moveTo(s.x0, s.y0)
      .lineTo(s.x1, s.y1)
      .stroke({ width: cell * 0.3, color: hover.rgb, alpha: 0.22, cap: "round" });
    drawThreshold(
      g,
      s,
      data,
      cell,
      {
        ...this.style,
        wall: { rgb: hover.rgb, alpha: 0.9 },
        threshold: hover,
        sight: hover,
      },
      data.look === "both"
    );
  }

  private sortStates(topology: Topology, grid: SquareGrid): Sorted {
    const { bounds } = topology;
    const floors: Point[] = [];
    const difficult: Point[] = [];
    const hatched: Point[] = [];
    const air: Cell[] = [];
    const holes: Point[] = [];
    forCellsInExtent(bounds, (col, row) => {
      const state = groundAt(topology, { col, row });
      if (state === "void") {
        return;
      }
      const textured = !this.isMuted && isTexturedAt(topology, { col, row });
      const p = cellToWorld(grid, { col, row });
      if (state === "ground") {
        if (textured) {
          floors.push(p);
        }
        return;
      }
      if (state === "difficult") {
        difficult.push(p);
        if (textured) {
          hatched.push(p);
        }
        return;
      }
      air.push({ col, row });
      if (textured) {
        holes.push(p);
      }
    });
    return { floors, difficult, hatched, air, holes };
  }

  // Cells by state and look: a textured floor is painted, a textured
  // difficult cell hatched, a textured air cell a hole down to the desk;
  // as data, the tints alone.
  private drawStates(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const cell = grid.cellSize;
    const { floors, difficult, hatched, air, holes } = this.sortStates(topology, grid);
    const fillCells = (cells: readonly Point[], color: number, alpha: number): void => {
      if (cells.length === 0) {
        return;
      }
      for (const p of cells) {
        g.rect(p.x, p.y, cell, cell);
      }
      g.fill({ color, alpha });
    };
    fillCells(floors, this.style.floor.rgb, this.style.floor.alpha);
    fillCells(holes, this.style.ground, 0.85);
    fillCells(difficult, this.style.difficult.rgb, this.style.difficult.alpha);
    if (hatched.length > 0) {
      // Diagonal hatching, four lines to the cell.
      const step = cell / 4;
      for (const p of hatched) {
        for (let k = step; k < cell * 2; k += step) {
          const x0 = p.x + Math.max(0, k - cell);
          const y0 = p.y + Math.min(k, cell);
          const x1 = p.x + Math.min(k, cell);
          const y1 = p.y + Math.max(0, k - cell);
          g.moveTo(x0, y0).lineTo(x1, y1);
        }
      }
      g.stroke({ width: 1, color: this.style.wall.rgb, alpha: 0.6, pixelLine: true });
    }
    if (air.length > 0) {
      fillCells(
        air.map((at) => cellToWorld(grid, at)),
        this.style.air.rgb,
        this.style.air.alpha
      );
      for (const at of air) {
        const { x, y, size } = insetCell(grid, at, 0.06);
        g.rect(x, y, size, size);
      }
      g.stroke({ width: 1, color: this.style.air.rgb, alpha: 0.8, pixelLine: true });
    }
  }

  // Over a painted slope: as data, short ticks thinned to every fourth row
  // and second column of samples, so stairs read without covering the
  // art; as texture, treads, the same ticks long enough to join.
  private drawLevelChanges(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const { samples, levelChange } = topology;
    const width = sampleWidth(samples);
    const height = sampleHeight(samples);
    const cell = grid.cellSize;
    const ticks: Point[] = [];
    const treads: Point[] = [];
    for (let j = 1; j < height; j += 4) {
      for (let i = 1; i < width; i += 2) {
        const mark = levelChange[j * width + i] ?? 0;
        if (mark === 0) {
          continue;
        }
        const p = cellPointToWorld(grid, sampleCentre(samples, i, j));
        if (!this.isMuted && mark === LEVEL_CHANGE_TEXTURED) {
          treads.push(p);
        } else {
          ticks.push(p);
        }
      }
    }
    if (ticks.length > 0) {
      const half = cell * 0.06;
      for (const p of ticks) {
        g.moveTo(p.x - half, p.y).lineTo(p.x + half, p.y);
      }
      g.stroke({ width: 1, color: this.style.wall.rgb, alpha: 0.5, pixelLine: true });
    }
    if (treads.length > 0) {
      const half = cell * 0.14;
      for (const p of treads) {
        g.moveTo(p.x - half, p.y).lineTo(p.x + half, p.y);
      }
      g.stroke({ width: cell * 0.03, color: this.style.wall.rgb, alpha: 0.85 });
    }
  }

  private drawEdges(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const cell = grid.cellSize;
    const thresholds: ThresholdEdge[] = [];
    const hints: Span[] = [];
    const solid: Span[] = [];
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
      (!this.isMuted && data.look === "both" ? solid : hints).push(segment(grid, data.edge));
    }
    if (hints.length > 0) {
      for (const s of hints) {
        g.moveTo(s.x0, s.y0).lineTo(s.x1, s.y1);
      }
      g.stroke({ width: cell * 0.06, color: this.style.wall.rgb, alpha: this.style.wall.alpha });
    }
    if (solid.length > 0) {
      for (const s of solid) {
        g.moveTo(s.x0, s.y0).lineTo(s.x1, s.y1);
      }
      g.stroke({ width: cell * 0.1, color: this.style.wall.rgb, alpha: 1, cap: "square" });
    }
    for (const data of thresholds) {
      const textured = !this.isMuted && data.look === "both";
      drawThreshold(g, segment(grid, data.edge), data, cell, this.style, textured);
    }
  }

  private drawFreeInk(g: Graphics, topology: Topology, grid: SquareGrid): void {
    const cell = grid.cellSize;
    const toWorld = (p: Point): Point => cellPointToWorld(grid, p);
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

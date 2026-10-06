/**
 * ─ The area layer ─
 *
 * An area on the board: the footprint it covers, the cells it catches,
 * a badge naming it, and a dashed ring turning about every token it
 * holds. A flat form is a wash inside its ring; a solid is lit by its
 * own view, over the whole footprint traced in faint dashes and the
 * caught cells kept fainter beneath it. The ring is the one thing on
 * this board that moves on its own, so it is advanced by the frame
 * rather than by a change, and the host asks for the next frame while
 * one is on show.
 * Design: docs/design.md §5 "A cell is caught when the volume holds the
 * centre of its cube"; docs/templates.md "How it looks".
 */

import type { Visibility } from "@tablewright/schema";
import { Container, Graphics } from "pixi.js";
import { dashedLine } from "../draw/strokes.js";
import type { Point } from "../shared/geometry.js";
import {
  cellCenter,
  cellPointToWorld,
  insetCell,
  type Cell,
  type SquareGrid,
} from "../grid/square-grid.js";
import { tokenReach } from "../tokens/token-sprite.js";
import type { PackedColor } from "../theme/css-color.js";
import { Badge } from "../ruler/badge.js";
import { keptAlpha, withSeenByNote } from "../shared/seen.js";
import { FALLBACK } from "../theme/board-theme.js";
import { areaStyle } from "../theme/styles.js";
import type { Topology } from "../topology/derive.js";
import type { GridRule } from "../topology/rules/distance.js";
import { describeArea, spotToCellPoint, type Area, type Spot } from "./area.js";
import type { AreaCut } from "./cut.js";
import type { Outline } from "./outline.js";
import { SolidView, type SolidStyle } from "./solid-view.js";

/** The colours an area draws in. */
export interface AreaStyle {
  /** The board's ground, under the badge. */
  readonly ground: number;
  /** The footprint's edge and its badge's text, and the wash a solid is lit over. */
  readonly line: PackedColor;
  /**
   * The cells it catches, the ring about a token it holds, and the edge
   * of one the hand has not let go of yet.
   */
  readonly caught: PackedColor;
  /** A solid's lit side, and its shaded side with the shadow it throws. */
  readonly light: PackedColor;
  readonly shade: PackedColor;
  /** The face a measured figure is set in; the theme bridge supplies it. */
  readonly face: string;
}

const DEFAULT_STYLE: AreaStyle = areaStyle(FALLBACK);

// The footprint: a wash inside and a hairline round it, the same weight
// the drawing tool previews a gesture at.
const FILL_ALPHA = 0.12;
const EDGE_FRACTION = 0.04;
// A caught cell, washed just enough to read under the footprint, and
// fainter still under a solid, which carries its own light.
const CELL_ALPHA = 0.22;
const SOLID_CELL_ALPHA = 0.12;
const CELL_INSET = 0.06;
// The whole footprint traced behind a solid in faint dashes, so what is
// cut off is still read as the template's.
const TRACE_ALPHA = 0.26;
const TRACE_DASH = 0.15;
const TRACE_GAP = 0.125;
// The ring about a caught token sits clear of everything the token
// itself draws, the tip of its facing arrow included, by this much of a
// cell; and it turns once in this many seconds, slow enough to read as
// alive and no more.
const RING_GAP = 0.1;
const RING_WIDTH = 0.04;
const RING_DASHES = 12;
const TURN_SECONDS = 9;
// The heavier edge an area wears while the hand is still on it, over the
// hairline it settles to once it is down.
const LIVE_WIDTH = 0.05;

/** An area as the board shows it. */
export interface ShownArea {
  readonly area: Area;
  readonly origin: Spot;
  /** What it covers on the plan with nothing in its way. */
  readonly footprint: Outline;
  /** How it is cut to what it reaches: a flat form's ring, or what a solid must clear. */
  readonly cut: AreaCut;
  /** The scene it stands in, whose ground a solid is lit over. */
  readonly topology: Topology;
  /** The cells it catches. */
  readonly cells: readonly Cell[];
  /** Where the tokens it holds stand, each wearing a turning ring. */
  readonly tokens: readonly Cell[];
  /** Who it is for: the table reads it plain, anyone else's reads faint. */
  readonly seenBy: Visibility;
  /** Left on the board rather than under the hand, which its edge says. */
  readonly isPlaced: boolean;
}

/** What the layer last drew, for the debug view and the stories. */
export interface AreaDrawing {
  readonly kind: Area["kind"] | "none";
  readonly cells: number;
  readonly tokens: number;
  readonly badge: string;
}

/** Draws one area at a time: its footprint, what it caught, and its badge. */
export class AreaLayer {
  private readonly view = new Container({ label: "area" });
  private readonly shape = new Graphics();
  private readonly cells = new Graphics();
  private readonly rings = new Graphics();
  private readonly solid = new SolidView();
  private readonly badge = new Badge(DEFAULT_STYLE.face);
  private style: AreaStyle = DEFAULT_STYLE;
  private grid: SquareGrid;
  private rule: GridRule;
  private shown: ShownArea | undefined;
  private turned = 0;

  constructor(container: Container, grid: SquareGrid, rule: GridRule) {
    this.grid = grid;
    this.rule = rule;
    this.view.visible = false;
    this.view.addChild(this.cells, this.shape, this.solid.view, this.rings, this.badge.view);
    container.addChild(this.view);
    this.solid.setStyle(solidStyleOf(DEFAULT_STYLE));
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.redraw();
  }

  setRule(rule: GridRule): void {
    this.rule = rule;
    this.redraw();
  }

  setStyle(style: AreaStyle): void {
    this.style = style;
    this.badge.setFace(style.face);
    this.solid.setStyle(solidStyleOf(style));
    this.redraw();
  }

  /** Lay `shown` on the board. */
  show(shown: ShownArea): void {
    this.shown = shown;
    this.view.visible = true;
    this.view.alpha = keptAlpha(shown.seenBy);
    this.redraw();
  }

  /** Whether an area is on the board, and so whether its ring is turning. */
  get isShowing(): boolean {
    return this.shown !== undefined;
  }

  /**
   * Advance the turning ring by `seconds`. The rest of the drawing does
   * not move, so only the rings are redrawn.
   */
  turn(seconds: number): void {
    if (this.shown === undefined) {
      return;
    }
    this.turned = (this.turned + seconds / TURN_SECONDS) % 1;
    this.drawRings(this.shown.tokens);
  }

  /** What was last drawn. */
  drawing(): AreaDrawing {
    const shown = this.shown;
    if (shown === undefined) {
      return { kind: "none", cells: 0, tokens: 0, badge: "" };
    }
    return {
      kind: shown.area.kind,
      cells: shown.cells.length,
      tokens: shown.tokens.length,
      badge: this.badge.text,
    };
  }

  clear(): void {
    this.shown = undefined;
    this.shape.clear();
    this.cells.clear();
    this.rings.clear();
    this.solid.clear();
    this.badge.clear();
    this.view.visible = false;
  }

  destroy(): void {
    this.solid.destroy();
    this.view.destroy({ children: true });
  }

  private redraw(): void {
    const shown = this.shown;
    if (shown === undefined) {
      return;
    }
    this.drawCells(shown.cells, shown.cut.kind === "solid" ? SOLID_CELL_ALPHA : CELL_ALPHA);
    this.drawShape(shown);
    this.drawRings(shown.tokens);
    this.drawBadge(shown);
  }

  // A flat form is its ring, brass and heavier under the hand and the
  // ink's white once down, so the two never read the same. A solid is
  // lit by its own view over its footprint traced in dashes.
  private drawShape(shown: ShownArea): void {
    const g = this.shape;
    g.clear();
    if (shown.cut.kind === "solid") {
      this.drawTrace(shown);
      this.solid.show(
        shown.area,
        shown.origin,
        shown.footprint,
        shown.cut.clearance,
        shown.topology,
        this.grid,
        this.rule
      );
      return;
    }
    this.solid.clear();
    const { ring, hole } = shown.cut.outline;
    if (ring.length < 3) {
      return;
    }
    const { line, caught } = this.style;
    const world = (point: Point): Point => cellPointToWorld(this.grid, point);
    g.poly(ring.map(world));
    if (hole !== undefined) {
      g.poly(hole.map(world));
    }
    g.fill({ color: line.rgb, alpha: FILL_ALPHA * line.alpha });
    g.poly(ring.map(world), true);
    if (hole !== undefined) {
      g.poly(hole.map(world), true);
    }
    const edge = shown.isPlaced ? line : caught;
    g.stroke({
      width: this.grid.cellSize * (shown.isPlaced ? EDGE_FRACTION : LIVE_WIDTH),
      color: edge.rgb,
      alpha: edge.alpha,
      join: "round",
    });
  }

  // The whole footprint in faint dashes, in brass while the hand is on it.
  private drawTrace(shown: ShownArea): void {
    const g = this.shape;
    const cell = this.grid.cellSize;
    const world = (point: Point): Point => cellPointToWorld(this.grid, point);
    const { ring, hole } = shown.footprint;
    for (const loop of hole === undefined ? [ring] : [ring, hole]) {
      for (let i = 0; i < loop.length; i += 1) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        if (a !== undefined && b !== undefined) {
          dashedLine(g, world(a), world(b), cell * TRACE_DASH, cell * TRACE_GAP);
        }
      }
    }
    const edge = shown.isPlaced ? this.style.line : this.style.caught;
    g.stroke({
      width: cell * EDGE_FRACTION,
      color: edge.rgb,
      alpha: TRACE_ALPHA * edge.alpha,
      cap: "round",
    });
  }

  // Every cell the volume caught, washed inside the grid's own lines so
  // the cells stay separate under the footprint.
  private drawCells(cells: readonly Cell[], alpha: number): void {
    const g = this.cells;
    g.clear();
    if (cells.length === 0) {
      return;
    }
    for (const at of cells) {
      const { x, y, size } = insetCell(this.grid, at, CELL_INSET);
      g.rect(x, y, size, size);
    }
    const { caught } = this.style;
    g.fill({ color: caught.rgb, alpha: alpha * caught.alpha });
  }

  // A dashed ring about each token the area holds, turning as one. The
  // token keeps its own ring; this one says only that it is caught.
  private drawRings(tokens: readonly Cell[]): void {
    const g = this.rings;
    g.clear();
    if (tokens.length === 0) {
      return;
    }
    const cell = this.grid.cellSize;
    const radius = tokenReach(cell) + cell * RING_GAP;
    const arc = Math.PI / RING_DASHES;
    const lead = this.turned * Math.PI * 2;
    for (const at of tokens) {
      const { x: cx, y: cy } = cellCenter(this.grid, at);
      for (let dash = 0; dash < RING_DASHES; dash += 1) {
        const from = lead + (dash * Math.PI * 2) / RING_DASHES;
        g.moveTo(cx + Math.cos(from) * radius, cy + Math.sin(from) * radius);
        g.arc(cx, cy, radius, from, from + arc);
      }
    }
    const { caught } = this.style;
    g.stroke({ width: cell * RING_WIDTH, color: caught.rgb, alpha: caught.alpha, cap: "round" });
  }

  // One line beside the area's origin, as the ruler's badge is.
  private drawBadge(shown: ShownArea): void {
    this.badge.show(
      cellPointToWorld(this.grid, spotToCellPoint(shown.origin, this.rule)),
      this.grid.cellSize,
      withSeenByNote(describeArea(shown.area, this.rule), shown.seenBy),
      this.style.line.rgb,
      this.style.ground
    );
  }
}

// A solid is washed in the footprint's own colour and lit in its own two.
function solidStyleOf(style: AreaStyle): SolidStyle {
  return { base: style.line, light: style.light, shade: style.shade };
}

/**
 * ─ The area layer ─
 *
 * An area on the board: the footprint it covers, the cells it catches,
 * a badge naming it, and a dashed ring turning about every token it
 * holds. The ring is the one thing on this board that moves on its own,
 * so it is advanced by the frame rather than by a change, and the host
 * asks for the next frame while one is on show.
 * Design: docs/design.md §5 "A cell is caught when the volume holds the
 * centre of its cube".
 */

import type { Visibility } from "@tablewright/schema";
import { Container, Graphics, Text } from "pixi.js";
import type { Cell, SquareGrid } from "../grid/square-grid.js";
import { tokenReach } from "../tokens/token-sprite.js";
import type { PackedColor } from "../theme/css-color.js";
import { KEPT_ALPHA, seenByNote } from "../seen.js";
import type { GridRule } from "../topology/distance.js";
import { describeArea, type Area, type Spot } from "./area.js";
import { outline } from "./outline.js";

/** The colours an area draws in. */
export interface AreaStyle {
  /** The board's ground, under the badge. */
  readonly ground: number;
  /** The footprint's edge and its badge's text. */
  readonly line: PackedColor;
  /**
   * The cells it catches, the ring about a token it holds, and the edge
   * of one the hand has not let go of yet.
   */
  readonly caught: PackedColor;
}

const DEFAULT_STYLE: AreaStyle = {
  ground: 0x1b1d24,
  line: { rgb: 0xf1e6d2, alpha: 1 },
  caught: { rgb: 0xc9a24e, alpha: 1 },
};

// The footprint: a wash inside and a hairline round it, the same weight
// the drawing tool previews a gesture at.
const FILL_ALPHA = 0.12;
const EDGE_FRACTION = 0.04;
// A caught cell, washed just enough to read under the footprint.
const CELL_ALPHA = 0.22;
const CELL_INSET = 0.06;
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
const BADGE_FRACTION = 0.26;
const PILL_ALPHA = 0.8;

/** An area as the board shows it. */
export interface ShownArea {
  readonly area: Area;
  readonly origin: Spot;
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
  private readonly pill = new Graphics();
  private readonly badge: Text;
  private style: AreaStyle = DEFAULT_STYLE;
  private grid: SquareGrid;
  private rule: GridRule;
  private shown: ShownArea | undefined;
  private turned = 0;

  constructor(container: Container, grid: SquareGrid, rule: GridRule) {
    this.grid = grid;
    this.rule = rule;
    this.badge = new Text({
      text: "",
      style: { fontFamily: "system-ui, sans-serif", fontWeight: "600", align: "left" },
    });
    this.view.visible = false;
    this.view.addChild(this.cells, this.shape, this.rings, this.pill, this.badge);
    container.addChild(this.view);
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
    this.redraw();
  }

  /** Lay `shown` on the board. */
  show(shown: ShownArea): void {
    this.shown = shown;
    this.view.visible = true;
    this.view.alpha = shown.seenBy === "party" ? 1 : KEPT_ALPHA;
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
    this.pill.clear();
    this.badge.text = "";
    this.view.visible = false;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private redraw(): void {
    const shown = this.shown;
    if (shown === undefined) {
      return;
    }
    this.drawCells(shown.cells);
    this.drawShape(shown);
    this.drawRings(shown.tokens);
    this.drawBadge(shown);
  }

  private world(point: { x: number; y: number }): { x: number; y: number } {
    const cell = this.grid.cellSize;
    return { x: this.grid.originX + point.x * cell, y: this.grid.originY + point.y * cell };
  }

  // The footprint, and an edge that says which of the two this one is:
  // brass and a touch heavier while the hand is still on it, the paper
  // white of the ink once it is down, so the one being drawn out and the
  // one already lying there never read the same.
  private drawShape(shown: ShownArea): void {
    const g = this.shape;
    g.clear();
    const { ring, hole } = outline(shown.area, shown.origin, this.rule);
    if (ring.length < 3) {
      return;
    }
    const { line, caught } = this.style;
    g.poly(ring.map((point) => this.world(point)));
    if (hole !== undefined) {
      g.poly(hole.map((point) => this.world(point)));
    }
    g.fill({ color: line.rgb, alpha: FILL_ALPHA * line.alpha });
    g.poly(
      ring.map((point) => this.world(point)),
      true
    );
    if (hole !== undefined) {
      g.poly(
        hole.map((point) => this.world(point)),
        true
      );
    }
    const edge = shown.isPlaced ? line : caught;
    g.stroke({
      width: this.grid.cellSize * (shown.isPlaced ? EDGE_FRACTION : LIVE_WIDTH),
      color: edge.rgb,
      alpha: edge.alpha,
      join: "round",
    });
  }

  // Every cell the volume caught, washed inside the grid's own lines so
  // the cells stay separate under the footprint.
  private drawCells(cells: readonly Cell[]): void {
    const g = this.cells;
    g.clear();
    if (cells.length === 0) {
      return;
    }
    const cell = this.grid.cellSize;
    const inset = cell * CELL_INSET;
    for (const at of cells) {
      const x = this.grid.originX + at.col * cell;
      const y = this.grid.originY + at.row * cell;
      g.rect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
    }
    const { caught } = this.style;
    g.fill({ color: caught.rgb, alpha: CELL_ALPHA * caught.alpha });
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
      const cx = this.grid.originX + (at.col + 0.5) * cell;
      const cy = this.grid.originY + (at.row + 0.5) * cell;
      for (let dash = 0; dash < RING_DASHES; dash += 1) {
        const from = lead + (dash * Math.PI * 2) / RING_DASHES;
        g.moveTo(cx + Math.cos(from) * radius, cy + Math.sin(from) * radius);
        g.arc(cx, cy, radius, from, from + arc);
      }
    }
    const { caught } = this.style;
    g.stroke({ width: cell * RING_WIDTH, color: caught.rgb, alpha: caught.alpha, cap: "round" });
  }

  // One line beside the area, on a pill of the ground's darkness, as the
  // ruler's badge is.
  private drawBadge(shown: ShownArea): void {
    const cell = this.grid.cellSize;
    this.pill.clear();
    const note = seenByNote(shown.seenBy);
    const said = describeArea(shown.area, this.rule);
    this.badge.text = note === undefined ? said : `${said} — ${note}`;
    this.badge.style.fontSize = Math.max(11, Math.round(cell * BADGE_FRACTION));
    this.badge.style.fill = this.style.line.rgb;
    const at = this.world({
      x: shown.origin.x / this.rule.cellSize,
      y: shown.origin.y / this.rule.cellSize,
    });
    const pad = cell * 0.12;
    const x = at.x + cell * 0.55;
    const y = at.y - cell * 0.55 - this.badge.height;
    this.badge.position.set(x, y);
    this.pill
      .roundRect(x - pad, y - pad, this.badge.width + pad * 2, this.badge.height + pad * 2, pad)
      .fill({ color: this.style.ground, alpha: PILL_ALPHA });
  }
}

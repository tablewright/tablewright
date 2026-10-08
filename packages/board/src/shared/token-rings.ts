/**
 * ─ Rings about tokens ─
 *
 * A dashed ring turning about a token says something holds it: a template
 * that catches it, or the hand that picked it. Every such ring on the
 * board is drawn here, so all of them turn as one and a token held both
 * ways wears one ring. The ring is the one thing on the board that moves
 * on its own, so it is turned by the frame rather than by a change.
 * Design: docs/templates.md "How it looks" and "The Select tool".
 */

import { Graphics } from "pixi.js";
import { cellCenter, type Cell, type SquareGrid } from "../grid/square-grid.js";
import { FALLBACK } from "../theme/board-theme.js";
import type { PackedColor } from "../theme/css-color.js";
import { tokenReach } from "../tokens/token-sprite.js";

/** What holds a token in a ring: a template that catches it, or the hand that picked it. */
export type RingHolder = "area" | "picked";

/** The colour every ring is drawn in. */
export interface RingStyle {
  readonly ring: PackedColor;
}

/** One ring to draw: the cell its token stands on, and how strongly it reads. */
export interface Ring {
  readonly cell: Cell;
  readonly alpha: number;
}

// The ring sits clear of everything a token draws, the tip of its facing
// arrow included, by this much of a cell; and it turns once in this many
// seconds, slow enough to read as alive and no more.
const RING_GAP = 0.1;
const RING_WIDTH = 0.04;
const RING_DASHES = 12;
const TURN_SECONDS = 9;

/**
 * One ring for each cell anything holds, in the order first held, at the
 * strongest any holder asks for: a token held twice wears one ring.
 */
export function ringsOf(
  holds: Iterable<{ readonly cells: readonly Cell[]; readonly alpha: number }>
): Ring[] {
  const rings = new Map<string, Ring>();
  for (const { cells, alpha } of holds) {
    for (const cell of cells) {
      const key = `${cell.col}:${cell.row}`;
      const held = rings.get(key);
      if (held === undefined || held.alpha < alpha) {
        rings.set(key, { cell, alpha });
      }
    }
  }
  return [...rings.values()];
}

/** The rings about held tokens, all turning as one. */
export class TokenRings {
  /** The rings, for the host to place over what they sit about. */
  readonly view = new Graphics({ label: "rings" });
  private readonly holds = new Map<RingHolder, { cells: readonly Cell[]; alpha: number }>();
  private grid: SquareGrid;
  private style: RingStyle = { ring: FALLBACK.selection };
  private turned = 0;
  private turnedAt: number | undefined;

  constructor(grid: SquareGrid) {
    this.grid = grid;
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.draw();
  }

  setStyle(style: RingStyle): void {
    this.style = style;
    this.draw();
  }

  /**
   * Ring the tokens on `cells` for `holder`, read at `alpha`, in place of
   * whatever it held before; no cells lets go of them all.
   */
  hold(holder: RingHolder, cells: readonly Cell[], alpha = 1): void {
    this.holds.set(holder, { cells, alpha });
    this.draw();
  }

  /** Whether any ring is on the board, and so whether the rings are turning. */
  get isShowing(): boolean {
    return [...this.holds.values()].some((held) => held.cells.length > 0);
  }

  /**
   * Turn every ring by the time since the last frame, `now` in
   * milliseconds, and say whether the next frame is wanted. Still when the
   * person asked for less motion, and when no ring shows, so the board
   * rests.
   */
  tick(now: number, isStill: boolean): boolean {
    if (isStill || !this.isShowing) {
      this.turnedAt = undefined;
      return false;
    }
    const since = this.turnedAt === undefined ? 0 : (now - this.turnedAt) / 1000;
    this.turnedAt = now;
    this.turned = (this.turned + since / TURN_SECONDS) % 1;
    this.draw();
    return true;
  }

  destroy(): void {
    this.view.destroy();
  }

  // Each ring in dashes that turn as one; rings that read alike are
  // stroked together.
  private draw(): void {
    const g = this.view.clear();
    const rings = ringsOf(this.holds.values());
    const cell = this.grid.cellSize;
    const radius = tokenReach(cell) + cell * RING_GAP;
    const arc = Math.PI / RING_DASHES;
    const lead = this.turned * Math.PI * 2;
    const { ring: colour } = this.style;
    for (const alpha of new Set(rings.map((ring) => ring.alpha))) {
      for (const ring of rings) {
        if (ring.alpha !== alpha) {
          continue;
        }
        const { x: cx, y: cy } = cellCenter(this.grid, ring.cell);
        for (let dash = 0; dash < RING_DASHES; dash += 1) {
          const from = lead + (dash * Math.PI * 2) / RING_DASHES;
          g.moveTo(cx + Math.cos(from) * radius, cy + Math.sin(from) * radius);
          g.arc(cx, cy, radius, from, from + arc);
        }
      }
      g.stroke({
        width: cell * RING_WIDTH,
        color: colour.rgb,
        alpha: alpha * colour.alpha,
        cap: "round",
      });
    }
  }
}

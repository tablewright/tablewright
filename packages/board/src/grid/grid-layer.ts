/**
 * ─ Grid layer ─
 *
 * Draws the square grid as hairlines into its container. One Graphics
 * object, rebuilt only when the grid, extent, or style changes; the
 * camera feeds it the visible extent so the cost stays flat
 * whatever the map size.
 * Design: docs/design.md §5, engine/skin split.
 */

import { Graphics, type Container } from "pixi.js";
import { gridLines, type CellExtent } from "./grid-lines.js";
import type { SquareGrid } from "./square-grid.js";

export interface GridStyle {
  readonly color: number;
  readonly alpha: number;
}

// Neutral grey until the theme bridge supplies real tokens.
const DEFAULT_STYLE: GridStyle = { color: 0x8b8fa3, alpha: 0.35 };

/** The grid as a single stroked Graphics; call `draw` whenever grid or extent changes. */
export class GridLayer {
  private readonly graphics = new Graphics();
  private style: GridStyle = DEFAULT_STYLE;
  private last: { grid: SquareGrid; extent: CellExtent } | undefined;

  constructor(container: Container) {
    container.addChild(this.graphics);
  }

  /** Rebuild the lines for `grid` over `extent`. */
  draw(grid: SquareGrid, extent: CellExtent): void {
    this.last = { grid, extent };
    const lines = gridLines(grid, extent);
    const g = this.graphics;
    g.clear();
    for (const x of lines.xs) {
      g.moveTo(x, lines.top);
      g.lineTo(x, lines.bottom);
    }
    for (const y of lines.ys) {
      g.moveTo(lines.left, y);
      g.lineTo(lines.right, y);
    }
    // pixelLine keeps the stroke one device pixel wide at any zoom.
    g.stroke({ width: 1, color: this.style.color, alpha: this.style.alpha, pixelLine: true });
  }

  /** Change colour and opacity, redrawing if something has been drawn. */
  setStyle(style: GridStyle): void {
    this.style = style;
    if (this.last !== undefined) {
      this.draw(this.last.grid, this.last.extent);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

/**
 * ─ Draw layer ─
 *
 * Build mode's hand: takes the left button on the canvas before the
 * camera can, turns the drag into a gesture in cell units, shows it as
 * it goes, and hands the finished stroke to whoever records it. Off
 * when there is no tool, so Play mode never sees it.
 * Design: docs/design.md §5 "Six inks, one tool".
 */

import { Graphics, type Container } from "pixi.js";
import type { Stroke, Visibility } from "@tablewright/schema";
import type { Point } from "../geometry.js";
import {
  cellPointToWorld,
  worldToCellPoint,
  type Cell,
  type SquareGrid,
} from "../grid/square-grid.js";
import { Listeners } from "../stage/listeners.js";
import { PointerSession } from "../stage/pointer-session.js";
import { FALLBACK } from "../theme/board-theme.js";
import type { PackedColor } from "../theme/css-color.js";
import { drawStyle } from "../theme/styles.js";
import {
  beginGesture,
  cellOf,
  edgeNear,
  lockLine,
  moveGesture,
  normRect,
  strokeOf,
  type Gesture,
} from "./gestures.js";
import type { DrawTool } from "./tool.js";

export type StrokeListener = (stroke: Stroke) => void;
/** The cell under the pointer, or undefined once it has left the board. */
export type HoverListener = (cell: Cell | undefined) => void;

export interface DrawStyle {
  /** Previews and the edge a click would take. */
  readonly hover: PackedColor;
  /** A brush's trail. */
  readonly ink: PackedColor;
}

const DEFAULT_STYLE: DrawStyle = drawStyle(FALLBACK);

/** Turns presses on the canvas into strokes while a tool is set. */
export class DrawLayer {
  private readonly graphics = new Graphics();
  private readonly session: PointerSession;
  private readonly strokeListeners = new Listeners<Stroke>();
  private readonly hoverListeners = new Listeners<Cell | undefined>();
  private grid: SquareGrid;
  private style: DrawStyle = DEFAULT_STYLE;
  private tool: DrawTool | undefined;
  /** Who what this hand puts down is for. The table's, unless kept back. */
  private marking: Visibility = "party";
  private gesture: Gesture | undefined;
  private hover: Point | undefined;
  private hoverCell: Cell | undefined;

  /** `toWorld` maps a point on the canvas to world pixels: the camera's inverse. */
  constructor(
    canvas: HTMLElement,
    container: Container,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point
  ) {
    this.grid = grid;
    container.addChild(this.graphics);
    this.session = new PointerSession(canvas, toWorld, {
      takes: () => this.tool !== undefined,
      onDown: (at) => this.begin(at),
      onMove: (at) => this.follow(at, true),
      onHover: (at) => this.follow(at, false),
      onUp: () => this.finish(),
      onCancel: () => this.cancel(),
      onLeave: () => {
        this.hover = undefined;
        this.setHover(undefined);
        this.preview();
      },
      onEscape: (event) => {
        if (this.gesture === undefined) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
      },
    });
  }

  /**
   * Who the next stroke is for. A DM setting an ambush up marks what
   * they draw as their own, and the field a player sees is the field
   * without it.
   */
  setMarking(marking: Visibility): void {
    this.marking = marking;
  }

  /** Draw with `tool`, or with nothing: Play mode. */
  setTool(tool: DrawTool | undefined): void {
    this.tool = tool;
    if (this.session.setActive(tool !== undefined) && tool === undefined) {
      this.cancel();
      this.setHover(undefined);
    }
    this.preview();
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.preview();
  }

  setStyle(style: DrawStyle): void {
    this.style = style;
    this.preview();
  }

  /** Hear every finished stroke. Returns the unsubscribe. */
  onStroke(listener: StrokeListener): () => void {
    return this.strokeListeners.add(listener);
  }

  /** Hear the cell under the pointer as it changes. Returns the unsubscribe. */
  onHover(listener: HoverListener): () => void {
    return this.hoverListeners.add(listener);
  }

  destroy(): void {
    this.setTool(undefined);
    this.graphics.destroy();
  }

  // A press begins a gesture; a click is a whole stroke, so nothing is held.
  private begin(at: Point): boolean {
    if (this.tool === undefined) {
      return false;
    }
    const gesture = beginGesture(this.tool, worldToCellPoint(this.grid, at));
    if (gesture === undefined) {
      return false;
    }
    if (gesture.kind === "click") {
      this.emit(this.tool, gesture);
      return false;
    }
    this.gesture = gesture;
    this.preview();
    return true;
  }

  // The pointer shows what a press would take; held, it draws the gesture out.
  private follow(at: Point, isHeld: boolean): void {
    const p = worldToCellPoint(this.grid, at);
    this.hover = p;
    this.setHover(cellOf(p));
    if (isHeld && this.gesture !== undefined) {
      moveGesture(this.gesture, p);
    }
    this.preview();
  }

  private finish(): void {
    const { tool, gesture } = this;
    if (tool === undefined || gesture === undefined) {
      return;
    }
    this.gesture = undefined;
    this.emit(tool, gesture);
    this.preview();
  }

  private emit(tool: DrawTool, gesture: Gesture): void {
    const stroke = strokeOf(tool, gesture, this.marking);
    if (stroke === undefined) {
      return;
    }
    this.strokeListeners.emit(stroke);
  }

  private cancel(): void {
    this.session.release();
    this.gesture = undefined;
    this.preview();
  }

  private setHover(cell: Cell | undefined): void {
    const same =
      cell === undefined
        ? this.hoverCell === undefined
        : this.hoverCell !== undefined &&
          this.hoverCell.col === cell.col &&
          this.hoverCell.row === cell.row;
    if (same) {
      return;
    }
    this.hoverCell = cell;
    this.hoverListeners.emit(cell);
  }

  private preview(): void {
    const g = this.graphics;
    g.clear();
    if (this.tool === undefined) {
      return;
    }
    const cell = this.grid.cellSize;
    const { hover, ink } = this.style;
    const gesture = this.gesture;
    if (gesture?.kind === "rect") {
      const r = normRect(gesture.a, gesture.b);
      const corner = cellPointToWorld(this.grid, { x: r.col0, y: r.row0 });
      g.rect(corner.x, corner.y, (r.col1 - r.col0 + 1) * cell, (r.row1 - r.row0 + 1) * cell)
        .fill({ color: hover.rgb, alpha: 0.12 })
        .stroke({ width: 2, color: hover.rgb, alpha: hover.alpha, pixelLine: true });
    } else if (gesture?.kind === "line") {
      const [a, b] = lockLine(gesture.a, gesture.b);
      const from = cellPointToWorld(this.grid, a);
      const to = cellPointToWorld(this.grid, b);
      g.moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ width: cell * 0.08, color: hover.rgb, alpha: hover.alpha, cap: "round" });
    } else if (gesture?.kind === "free") {
      const points = gesture.points.map((p) => cellPointToWorld(this.grid, p));
      if (points.length >= 2) {
        g.poly(points, true)
          .fill({ color: hover.rgb, alpha: 0.15 })
          .stroke({ width: 2, color: hover.rgb, alpha: hover.alpha, pixelLine: true });
      }
    } else if (gesture?.kind === "brush") {
      const points = gesture.points.map((p) => cellPointToWorld(this.grid, p));
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
          width: this.tool.radius * 2 * cell,
          color: ink.rgb,
          alpha: 0.35,
          cap: "round",
          join: "round",
        });
      }
    }
    if (this.hover === undefined || gesture !== undefined) {
      return;
    }
    // At rest, the tool shows what a press would take: the brush's disc, or
    // the edge nearest the pointer.
    if (this.tool.shape === "brush") {
      const at = cellPointToWorld(this.grid, this.hover);
      g.circle(at.x, at.y, this.tool.radius * cell).stroke({
        width: 1.5,
        color: ink.rgb,
        alpha: ink.alpha,
        pixelLine: true,
      });
    } else if (this.tool.shape === "click") {
      const edge = edgeNear(this.hover);
      if (edge === undefined) {
        return;
      }
      const at = cellPointToWorld(this.grid, { x: edge.col, y: edge.row });
      const from = edge.side === "east" ? { x: at.x + cell, y: at.y } : { x: at.x, y: at.y + cell };
      const to = { x: at.x + cell, y: at.y + cell };
      g.moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ width: cell * 0.12, color: hover.rgb, alpha: 0.8, cap: "round" });
    }
  }
}

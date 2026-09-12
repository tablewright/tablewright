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
import type { Cell, SquareGrid } from "../grid/square-grid.js";
import type { PackedColor } from "../theme/css-color.js";
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

const DEFAULT_STYLE: DrawStyle = {
  hover: { rgb: 0xe4c57a, alpha: 1 },
  ink: { rgb: 0xc9a24e, alpha: 1 },
};

/** Turns presses on the canvas into strokes while a tool is set. */
export class DrawLayer {
  private readonly canvas: HTMLElement;
  private readonly graphics = new Graphics();
  private readonly toWorld: (screen: Point) => Point;
  private readonly strokeListeners = new Set<StrokeListener>();
  private readonly hoverListeners = new Set<HoverListener>();
  private grid: SquareGrid;
  private style: DrawStyle = DEFAULT_STYLE;
  private tool: DrawTool | undefined;
  /** Who what this hand puts down is for. The table's, unless kept back. */
  private marking: Visibility = "party";
  private gesture: Gesture | undefined;
  private pointerId: number | undefined;
  private hover: Point | undefined;
  private hoverCell: Cell | undefined;

  /** `toWorld` maps a point on the canvas to world pixels: the camera's inverse. */
  constructor(
    canvas: HTMLElement,
    container: Container,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point
  ) {
    this.canvas = canvas;
    this.grid = grid;
    this.toWorld = toWorld;
    container.addChild(this.graphics);
  }

  /** Draw with `tool`, or with nothing: Play mode. */
  /**
   * Who the next stroke is for. A DM setting an ambush up marks what
   * they draw as their own, and the field a player sees is the field
   * without it.
   */
  setMarking(marking: Visibility): void {
    this.marking = marking;
  }

  setTool(tool: DrawTool | undefined): void {
    const wasOn = this.tool !== undefined;
    this.tool = tool;
    if (tool !== undefined && !wasOn) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointercancel", this.onPointerCancel);
      this.canvas.addEventListener("pointerleave", this.onPointerLeave);
      window.addEventListener("keydown", this.onKeyDown);
    } else if (tool === undefined && wasOn) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      window.removeEventListener("keydown", this.onKeyDown);
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
    this.strokeListeners.add(listener);
    return () => this.strokeListeners.delete(listener);
  }

  /** Hear the cell under the pointer as it changes. Returns the unsubscribe. */
  onHover(listener: HoverListener): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  destroy(): void {
    this.setTool(undefined);
    this.graphics.destroy();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.tool === undefined || event.button !== 0 || this.gesture !== undefined) {
      return;
    }
    // The press is the tool's; the board element must not start a pan.
    event.stopPropagation();
    event.preventDefault();
    const p = this.cellPoint(event);
    const gesture = beginGesture(this.tool, p);
    if (gesture === undefined) {
      return;
    }
    if (gesture.kind === "click") {
      this.emit(this.tool, gesture);
      return;
    }
    this.gesture = gesture;
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.preview();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const p = this.cellPoint(event);
    this.hover = p;
    this.setHover(cellOf(p));
    if (this.gesture !== undefined && event.pointerId === this.pointerId) {
      moveGesture(this.gesture, p);
    }
    this.preview();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (
      this.gesture === undefined ||
      event.pointerId !== this.pointerId ||
      this.tool === undefined
    ) {
      return;
    }
    const { tool, gesture } = this;
    this.release();
    this.emit(tool, gesture);
    this.preview();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) {
      this.cancel();
    }
  };

  private readonly onPointerLeave = (): void => {
    this.hover = undefined;
    this.setHover(undefined);
    this.preview();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.gesture !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };

  private emit(tool: DrawTool, gesture: Gesture): void {
    const stroke = strokeOf(tool, gesture, this.marking);
    if (stroke === undefined) {
      return;
    }
    for (const listener of this.strokeListeners) {
      listener(stroke);
    }
  }

  private release(): void {
    if (this.pointerId !== undefined && this.canvas.hasPointerCapture(this.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerId);
    }
    this.gesture = undefined;
    this.pointerId = undefined;
  }

  private cancel(): void {
    this.release();
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
    for (const listener of this.hoverListeners) {
      listener(cell);
    }
  }

  // Canvas pixels to world pixels through the camera, then to cells.
  private cellPoint(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    return {
      x: (world.x - this.grid.originX) / this.grid.cellSize,
      y: (world.y - this.grid.originY) / this.grid.cellSize,
    };
  }

  private world(p: Point): Point {
    return {
      x: this.grid.originX + p.x * this.grid.cellSize,
      y: this.grid.originY + p.y * this.grid.cellSize,
    };
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
      const corner = this.world({ x: r.col0, y: r.row0 });
      g.rect(corner.x, corner.y, (r.col1 - r.col0 + 1) * cell, (r.row1 - r.row0 + 1) * cell)
        .fill({ color: hover.rgb, alpha: 0.12 })
        .stroke({ width: 2, color: hover.rgb, alpha: hover.alpha, pixelLine: true });
    } else if (gesture?.kind === "line") {
      const [a, b] = lockLine(gesture.a, gesture.b);
      const from = this.world(a);
      const to = this.world(b);
      g.moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ width: cell * 0.08, color: hover.rgb, alpha: hover.alpha, cap: "round" });
    } else if (gesture?.kind === "free") {
      const points = gesture.points.map((p) => this.world(p));
      if (points.length >= 2) {
        g.poly(points, true)
          .fill({ color: hover.rgb, alpha: 0.15 })
          .stroke({ width: 2, color: hover.rgb, alpha: hover.alpha, pixelLine: true });
      }
    } else if (gesture?.kind === "brush") {
      const points = gesture.points.map((p) => this.world(p));
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
      const at = this.world(this.hover);
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
      const at = this.world({ x: edge.col, y: edge.row });
      const from = edge.side === "east" ? { x: at.x + cell, y: at.y } : { x: at.x, y: at.y + cell };
      const to = { x: at.x + cell, y: at.y + cell };
      g.moveTo(from.x, from.y)
        .lineTo(to.x, to.y)
        .stroke({ width: cell * 0.12, color: hover.rgb, alpha: 0.8, cap: "round" });
    }
  }
}

/**
 * ─ Ruler ─
 *
 * Measuring is its own tool: a press on the board starts a measure at
 * the cell under it, from a token or the floor without moving anything,
 * the pointer draws it out, and the release pins it until Escape or the
 * next measure. Alt at the press makes the measure private. What shows
 * is the mode's answer alone, drawn by the measure view a token's drag
 * draws through too. The tool takes the left button on the canvas before
 * the camera can, as the drawing tool does.
 * Design: docs/design.md §5 "Measuring is its own tool".
 */

import type { Container } from "pixi.js";
import type { Point } from "../geometry.js";
import { worldToCell, type Cell, type SquareGrid } from "../grid/square-grid.js";
import type { Measurement } from "./measure.js";
import { MeasureView, type RulerStyle } from "./measure-view.js";
import type { RulerMode } from "./mode.js";

/** What the pointer does in Play: moves tokens, or measures. */
export type PlayTool = "move" | "ruler";

/** Answers a measure between two cells; the host composes it from the scene. */
export type Measurer = (from: Cell, to: Cell, isPrivate: boolean) => Measurement;
/** A measure as the ruler shows it: the numbers, and the mode they are read in. */
export type ShownMeasure = Measurement & { readonly mode: RulerMode };
/** Hears the measure on show, or nothing once it is taken off the board. */
export type MeasureListener = (measurement: ShownMeasure | undefined) => void;

/** Measures from a press to the pointer while active; the last measure stays until cleared. */
export class RulerTool {
  private readonly canvas: HTMLElement;
  private readonly drawn: MeasureView;
  private readonly toWorld: (screen: Point) => Point;
  private readonly measurer: Measurer;
  private readonly listeners = new Set<MeasureListener>();
  private grid: SquareGrid;
  private mode: RulerMode = "line";
  private isActive = false;
  private pointerId: number | undefined;
  private from: Cell | undefined;
  private isPrivate = false;
  private shown: Measurement | undefined;

  /** `toWorld` maps a point on the canvas to world pixels: the camera's inverse. */
  constructor(
    canvas: HTMLElement,
    container: Container,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point,
    measurer: Measurer
  ) {
    this.canvas = canvas;
    this.grid = grid;
    this.toWorld = toWorld;
    this.measurer = measurer;
    this.drawn = new MeasureView(container, grid);
  }

  /** Whether the pointer measures. Off, the tool hears nothing and shows nothing. */
  setActive(on: boolean): void {
    if (on === this.isActive) {
      return;
    }
    this.isActive = on;
    if (on) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointercancel", this.onPointerCancel);
      window.addEventListener("keydown", this.onKeyDown);
    } else {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
      window.removeEventListener("keydown", this.onKeyDown);
      this.release();
      this.clear();
    }
  }

  /** Read the measure as a line or as a path; the measure on show turns with it. */
  setMode(mode: RulerMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.redraw();
    this.notify();
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.drawn.setGrid(grid);
    this.redraw();
  }

  setStyle(style: RulerStyle): void {
    this.drawn.setStyle(style);
    this.redraw();
  }

  /** The measure on show, pinned or under the pointer, in the mode it is read in. */
  get measurement(): ShownMeasure | undefined {
    return this.shown === undefined ? undefined : { ...this.shown, mode: this.mode };
  }

  /** Hear the measure as it changes. Returns the unsubscribe. */
  onMeasure(listener: MeasureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Take the measure off the board. */
  clear(): void {
    if (this.shown === undefined) {
      return;
    }
    this.shown = undefined;
    this.redraw();
    this.notify();
  }

  destroy(): void {
    this.setActive(false);
    this.drawn.destroy();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointerId !== undefined) {
      return;
    }
    // The press is the ruler's; the board element must not start a pan.
    event.stopPropagation();
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    this.from = this.cellUnder(event);
    this.isPrivate = event.altKey;
    this.show(this.from);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.show(this.cellUnder(event));
  };

  // The release position is the last word, and the measure stays pinned.
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.show(this.cellUnder(event));
    this.release();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) {
      this.release();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || this.shown === undefined) {
      return;
    }
    event.preventDefault();
    this.release();
    this.clear();
  };

  private show(to: Cell): void {
    if (this.from === undefined) {
      return;
    }
    this.shown = this.measurer(this.from, to, this.isPrivate);
    this.redraw();
    this.notify();
  }

  private release(): void {
    if (this.pointerId !== undefined && this.canvas.hasPointerCapture(this.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerId);
    }
    this.pointerId = undefined;
    this.from = undefined;
  }

  private notify(): void {
    const measurement = this.measurement;
    for (const listener of this.listeners) {
      listener(measurement);
    }
  }

  private cellUnder(event: PointerEvent): Cell {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    return worldToCell(this.grid, world);
  }

  private redraw(): void {
    if (this.shown === undefined) {
      this.drawn.clear();
      return;
    }
    this.drawn.show(this.shown, this.mode);
  }
}

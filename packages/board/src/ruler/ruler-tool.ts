/**
 * ─ Ruler ─
 *
 * Measuring is its own tool: a press starts a measure at the cell under
 * it without moving anything, the drag draws it out, and the release
 * pins it until Escape or the next measure. A measure is the table's
 * unless the palette says otherwise; Alt at the press keeps it to
 * oneself. The tool takes the left button before the camera can, and
 * draws through the measure view a token's drag draws through too.
 * Design: docs/design.md §5 "Measuring is its own tool".
 */

import type { Visibility } from "@tablewright/schema";
import type { Container } from "pixi.js";
import { pointOn, type Point } from "../geometry.js";
import { Marking, type Seat } from "../seen.js";
import { worldToCell, type Cell, type SquareGrid } from "../grid/square-grid.js";
import { Listeners } from "../stage/listeners.js";
import type { Measurement } from "./measure.js";
import { MeasureView, type RulerStyle } from "./measure-view.js";
import type { RulerMode } from "./mode.js";

/** What the pointer does in Play: moves tokens, or measures. */
export type PlayTool = "move" | "ruler";

/** Answers a measure between two cells; the host composes it from the scene. */
export type Measurer = (from: Cell, to: Cell, seenBy: Visibility) => Measurement;
/** A measure as the ruler shows it: the numbers, the mode they are read in, and whose it is. */
export type ShownMeasure = Measurement & {
  readonly mode: RulerMode;
  /** The seat it was measured in, which is who counts as its maker. */
  readonly madeBy: string;
};
/** Hears the measure on show, or nothing once it is taken off the board. */
export type MeasureListener = (measurement: ShownMeasure | undefined) => void;

/** Measures from a press to the pointer while active; the last measure stays until cleared. */
export class RulerTool {
  private readonly canvas: HTMLElement;
  private readonly drawn: MeasureView;
  private readonly toWorld: (screen: Point) => Point;
  private readonly measurer: Measurer;
  private readonly listeners = new Listeners<ShownMeasure | undefined>();
  private grid: SquareGrid;
  private mode: RulerMode = "line";
  private isActive = false;
  private pointerId: number | undefined;
  private from: Cell | undefined;
  private readonly marking = new Marking();
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

  /** Who the next measure is for. What is on the board keeps what it has. */
  setSeenBy(seenBy: Visibility): void {
    this.marking.setChoice(seenBy);
  }

  /** The hand's own choice: the next measure, and the one on the board if this seat is shown it. */
  chooseSeenBy(seenBy: Visibility): void {
    if (!this.marking.choose(seenBy) || this.shown === undefined) {
      return;
    }
    // The measurement carries who it is for, so the badge can say so.
    this.shown = { ...this.shown, seenBy: this.marking.seenBy };
    this.redraw();
    this.notify();
  }

  /**
   * Who sits at this board. A measure another seat kept to itself is not
   * shown here, and comes back when that seat returns.
   */
  setSeat(seat: Seat): void {
    if (!this.marking.setSeat(seat)) {
      return;
    }
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
    const shown = this.shown;
    if (shown === undefined || !this.marking.isSeen) {
      return undefined;
    }
    return { ...shown, mode: this.mode, madeBy: this.marking.madeBy };
  }

  /** Hear the measure as it changes. Returns the unsubscribe. */
  onMeasure(listener: MeasureListener): () => void {
    return this.listeners.add(listener);
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
    this.marking.press(event.altKey);
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
    this.shown = this.measurer(this.from, to, this.marking.seenBy);
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
    this.listeners.emit(this.measurement);
  }

  private cellUnder(event: PointerEvent): Cell {
    return worldToCell(this.grid, this.toWorld(pointOn(this.canvas, event)));
  }

  private redraw(): void {
    const shown = this.measurement;
    if (shown === undefined) {
      this.drawn.clear();
      return;
    }
    this.drawn.show(shown, this.mode);
  }
}

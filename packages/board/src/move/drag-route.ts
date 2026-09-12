/**
 * ─ Drag route ─
 *
 * What a token's drag shows while the pointer is down: one route and one
 * badge, the same drawing the Path ruler makes, chosen in the tiers this
 * turn offers. Where the safe way and the quick one both fit, the way the
 * drag went picks between them. The drag itself belongs to the token
 * layer; this holds only the answer and how it looks.
 * Design: docs/design.md §5 "Moving shows movement only".
 */

import type { Container } from "pixi.js";
import type { Point } from "../geometry.js";
import { worldToCellPoint, type Cell, type SquareGrid } from "../grid/square-grid.js";
import { MeasureView, type RulerStyle } from "../ruler/measure-view.js";
import type { Measurement } from "../ruler/measure.js";
import { chooseRoute, type Budget } from "../topology/route.js";
import { pickRoute, type RoutePreference } from "./trail.js";

/** Answers a measure for a moving token, from where it stands to where the pointer is. */
export type MoveMeasurer = (id: string, from: Cell, to: Cell) => Measurement;
/** What this turn has left for the token being dragged. */
export type MoveBudget = (id: string) => Budget;

// A pointer that has barely moved adds nothing to the trail, in cells.
const STIR = 0.1;

/** The route under a drag: measured as the pointer moves, drawn, and read at the drop. */
export class DragRoute {
  private readonly drawn: MeasureView;
  private readonly measurer: MoveMeasurer;
  private readonly budgetOf: MoveBudget;
  private readonly trail: Point[] = [];
  private grid: SquareGrid;
  private id: string | undefined;
  private from: Cell | undefined;
  private to: Cell | undefined;
  private preference: RoutePreference = "safe";
  private current: Measurement | undefined;

  constructor(
    container: Container,
    grid: SquareGrid,
    measurer: MoveMeasurer,
    budgetOf: MoveBudget
  ) {
    this.grid = grid;
    this.measurer = measurer;
    this.budgetOf = budgetOf;
    this.drawn = new MeasureView(container, grid);
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.drawn.setGrid(grid);
  }

  setStyle(style: RulerStyle): void {
    this.drawn.setStyle(style);
  }

  /** The route as it now stands, or nothing when no drag is under way. */
  get shown(): Measurement | undefined {
    return this.current;
  }

  /** Start a drag of `id` from where it stands. The safe way leads until the trail says otherwise. */
  begin(id: string, from: Cell): void {
    this.id = id;
    this.from = from;
    this.to = undefined;
    this.trail.length = 0;
    this.preference = "safe";
    this.current = undefined;
  }

  /**
   * Measure to `to` with the pointer at `at` in world pixels, and draw the
   * answer. The trail takes every point, since the way the drag went is
   * what picks the route, but nothing is measured or drawn again while the
   * pointer stays in the cell it was in and keeps to the same way.
   */
  show(to: Cell, at: Point): void {
    const { id, from } = this;
    if (id === undefined || from === undefined) {
      return;
    }
    this.remember(at);
    const moved = this.to === undefined || to.col !== this.to.col || to.row !== this.to.row;
    const measured = moved ? this.measurer(id, from, to) : this.current;
    if (measured === undefined) {
      return;
    }
    const preference = pickRoute(measured.ways, this.trail, this.preference);
    if (!moved && preference === this.preference) {
      return;
    }
    this.to = to;
    this.preference = preference;
    const choice = chooseRoute(measured.ways, this.budgetOf(id), preference);
    this.current = { ...measured, choice };
    this.drawn.show(this.current, "path");
  }

  /** Take the route off the board and forget the drag. */
  end(): void {
    this.id = undefined;
    this.from = undefined;
    this.to = undefined;
    this.current = undefined;
    this.trail.length = 0;
    this.drawn.clear();
  }

  destroy(): void {
    this.drawn.destroy();
  }

  // The trail is kept in cells, so the same drag picks the same way at any zoom.
  private remember(at: Point): void {
    const point = worldToCellPoint(this.grid, at);
    const last = this.trail[this.trail.length - 1];
    if (last !== undefined && Math.hypot(point.x - last.x, point.y - last.y) <= STIR) {
      return;
    }
    this.trail.push(point);
  }
}

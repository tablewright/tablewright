/**
 * ─ Laying an area down ─
 *
 * Press, drag, release: the press puts the origin down, the drag aims it
 * and says how far it goes, the release leaves it on the board. What
 * separates an area from a measure is not the gesture but what happens
 * after: a measure answers and is gone, while an area stays, and a press
 * inside one takes hold of it and moves it, its origin snapping as the
 * palette says.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column".
 */

import type { Point } from "../geometry.js";
import { worldToCell, type Cell, type SquareGrid } from "../grid/square-grid.js";
import { facingToward, normalizeDegrees } from "../tokens/facing.js";
import type { GridRule } from "../topology/distance.js";
import { reached, snapOrigin, snapSize, type Area, type OriginSnap, type Spot } from "./area.js";
import { footprintCovers } from "./outline.js";

/** An area with a place and an aim, as the board is to draw it. */
export interface PlacedArea {
  readonly area: Area;
  readonly origin: Spot;
  /** Left on the board, or still under the hand. */
  readonly isPlaced: boolean;
}

export type AreaListener = (placed: PlacedArea | undefined) => void;

/**
 * Where an area starts when it is pressed: the place of a token standing
 * on `cell`, or the floor at `at`, which the tool has already snapped.
 */
export type OriginFor = (cell: Cell, at: { x: number; y: number }) => Spot;

// A press that neither aims nor reaches: laying one down without moving
// leaves it at the length the palette already holds.
type Phase = "idle" | "placing" | "moving";

// How far the wheel turns an area under the hand, and how far with a
// finer hand on it.
const TURN_STEP = 15;
const FINE_TURN = 5;

/** Takes the pointer while an area is being laid down or moved. */
export class AreaTool {
  private readonly canvas: HTMLElement;
  private readonly toWorld: (screen: Point) => Point;
  private readonly originFor: OriginFor;
  private readonly listeners = new Set<AreaListener>();
  private rule: GridRule;
  private grid: SquareGrid;
  private area: Area | undefined;
  private origin: Spot | undefined;
  private aim = 0;
  /** How far the drag reached, in the rule's unit; unset until it moves. */
  private reach: number | undefined;
  private snap: OriginSnap = "centre";
  /** Where the origin sat under the hand when a move began, in the rule's unit. */
  private grab: { x: number; y: number } | undefined;
  private phase: Phase = "idle";
  private pointerId: number | undefined;
  private isActive = false;

  constructor(
    canvas: HTMLElement,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point,
    rule: GridRule,
    originFor: OriginFor
  ) {
    this.canvas = canvas;
    this.grid = grid;
    this.toWorld = toWorld;
    this.rule = rule;
    this.originFor = originFor;
  }

  /** Whether the pointer lays areas down. Off, the tool hears nothing. */
  setActive(on: boolean): void {
    if (on === this.isActive) {
      return;
    }
    this.isActive = on;
    if (on) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointercancel", this.onPointerUp);
      this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
      window.addEventListener("keydown", this.onKeyDown);
    } else {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerUp);
      this.canvas.removeEventListener("wheel", this.onWheel);
      window.removeEventListener("keydown", this.onKeyDown);
      this.clear();
    }
  }

  /**
   * The area the palette has made: its kind, its sizes and its form. An
   * aim typed there is taken as the hand's own, so the number in the
   * palette and the gesture turn the same thing.
   */
  setArea(area: Area | undefined): void {
    if (area !== undefined && area.kind !== "circle" && area.aim !== this.aim) {
      this.aim = area.aim;
    }
    // Sizes typed into the palette are the hand's own, as a typed aim is:
    // they replace how far the drag reached rather than being overruled by
    // it, or the fields would do nothing to what is already down.
    this.reach = undefined;
    this.area = area;
    if (this.origin !== undefined) {
      this.notify();
    }
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
  }

  setRule(rule: GridRule): void {
    this.rule = rule;
  }

  /** Where an origin may sit when one is put down or moved. */
  setSnap(snap: OriginSnap): void {
    this.snap = snap;
  }

  /** The area on the board, under the hand or left there. */
  get placed(): PlacedArea | undefined {
    const { area, origin } = this;
    if (area === undefined || origin === undefined) {
      return undefined;
    }
    const turned = aimed(area, this.aim);
    const sized = this.reach === undefined ? turned : reached(turned, this.reach, this.rule);
    return { area: sized, origin, isPlaced: this.phase === "idle" };
  }

  onChange(listener: AreaListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Take the area off the board. */
  clear(): void {
    if (this.origin === undefined) {
      return;
    }
    this.origin = undefined;
    this.reach = undefined;
    this.grab = undefined;
    this.phase = "idle";
    this.release();
    this.notify();
  }

  destroy(): void {
    this.setActive(false);
    this.listeners.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.area === undefined || this.pointerId !== undefined) {
      return;
    }
    // The press belongs to the tool; the board element must not pan.
    event.stopPropagation();
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    // A press inside what is already drawn takes hold of it; anywhere
    // else starts a new one where the press landed.
    const placed = this.placed;
    if (
      placed !== undefined &&
      footprintCovers(placed.area, placed.origin, this.inCells(this.worldUnder(event)), this.rule)
    ) {
      this.phase = "moving";
      // The area moves with the hand rather than jumping under it: what
      // is held is the offset, not the origin.
      const at = this.inUnit(this.worldUnder(event));
      this.grab = { x: at.x - placed.origin.x, y: at.y - placed.origin.y };
      return;
    }
    this.phase = "placing";
    this.reach = undefined;
    this.grab = undefined;
    this.moveOrigin(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || this.origin === undefined) {
      return;
    }
    if (this.phase === "moving") {
      this.moveOrigin(event);
      return;
    }
    // The drag aims it and reaches: its bearing turns it and its
    // distance is how far it goes, so one gesture settles both.
    const at = this.worldUnder(event);
    const from = this.worldOf(this.origin);
    this.aim = facingToward(from, at) ?? this.aim;
    const away =
      (Math.hypot(at.x - from.x, at.y - from.y) / this.grid.cellSize) * this.rule.cellSize;
    this.reach = snapSize(away, this.rule);
    this.notify();
  };

  // The release is the gesture's last word: the area stays where it is.
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.phase = "idle";
    this.release();
    this.notify();
  };

  // The wheel turns what is under the hand. It is taken only while the
  // pointer is down, so the camera keeps the wheel the rest of the time.
  private readonly onWheel = (event: WheelEvent): void => {
    if (this.pointerId === undefined || this.origin === undefined) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? FINE_TURN : TURN_STEP;
    this.aim = normalizeDegrees(this.aim + (event.deltaY > 0 ? step : -step));
    this.notify();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || this.origin === undefined) {
      return;
    }
    event.preventDefault();
    this.clear();
  };

  // Put the origin where the pointer says, as near as the snap allows.
  // While one is being moved the hand carries it by the offset it was
  // taken hold of at, so it does not jump under the pointer.
  private moveOrigin(event: PointerEvent): void {
    const world = this.worldUnder(event);
    const under = this.inUnit(world);
    const wanted =
      this.grab === undefined ? under : { x: under.x - this.grab.x, y: under.y - this.grab.y };
    const at = snapOrigin(wanted, this.snap, this.rule);
    this.origin = this.originFor(worldToCell(this.grid, this.worldOf({ ...at, z: 0 })), at);
    this.notify();
  }

  private release(): void {
    if (this.pointerId !== undefined && this.canvas.hasPointerCapture(this.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerId);
    }
    this.pointerId = undefined;
  }

  // The canvas may sit anywhere on the page, so the press is read from
  // the client's own corner, as the ruler reads it.
  private worldUnder(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return this.toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  // An origin sits in the rule's unit; the pointer is in world pixels,
  // so the grid does the one conversion between them.
  private worldOf(origin: Spot): Point {
    return {
      x: this.grid.originX + (origin.x / this.rule.cellSize) * this.grid.cellSize,
      y: this.grid.originY + (origin.y / this.rule.cellSize) * this.grid.cellSize,
    };
  }

  private inUnit(at: Point): { x: number; y: number } {
    return {
      x: ((at.x - this.grid.originX) / this.grid.cellSize) * this.rule.cellSize,
      y: ((at.y - this.grid.originY) / this.grid.cellSize) * this.rule.cellSize,
    };
  }

  private inCells(at: Point): Point {
    return {
      x: (at.x - this.grid.originX) / this.grid.cellSize,
      y: (at.y - this.grid.originY) / this.grid.cellSize,
    };
  }

  private notify(): void {
    const placed = this.placed;
    for (const listener of this.listeners) {
      listener(placed);
    }
  }
}

// An area turned to face `aim`; a circle faces nowhere.
function aimed(area: Area, aim: number): Area {
  return area.kind === "circle" ? area : { ...area, aim };
}

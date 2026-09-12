/**
 * ─ Laying an area down ─
 *
 * Click, turn, click: the first press puts the origin where the pointer
 * is, or on the token the caster holds; the pointer then turns it; the
 * second press lays it on the board. A circle has nothing to turn, so
 * one press does it. This is deliberately not the ruler's press and
 * drag: a measure answers a question, an area is put somewhere.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column".
 */

import type { Point } from "../geometry.js";
import { worldToCell, type Cell, type SquareGrid } from "../grid/square-grid.js";
import { facingToward } from "../tokens/facing.js";
import type { GridRule } from "../topology/distance.js";
import type { Area, Spot } from "./area.js";

/** An area with a place and an aim, as the board is to draw it. */
export interface PlacedArea {
  readonly area: Area;
  readonly origin: Spot;
  /** Laid down, or still turning under the pointer. */
  readonly isPlaced: boolean;
}

export type AreaListener = (placed: PlacedArea | undefined) => void;

/** Where an area starts when it is pressed on `cell`: a token's place, or the floor. */
export type OriginFor = (cell: Cell) => Spot;

/** Takes the pointer while an area is being laid down. */
export class AreaTool {
  private readonly canvas: HTMLElement;
  private readonly toWorld: (screen: Point) => Point;
  private readonly originFor: OriginFor;
  private rule: GridRule;
  private readonly listeners = new Set<AreaListener>();
  private grid: SquareGrid;
  private area: Area | undefined;
  private origin: Spot | undefined;
  private aim = 0;
  private isActive = false;
  private isTurning = false;

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
      window.addEventListener("keydown", this.onKeyDown);
    } else {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      window.removeEventListener("keydown", this.onKeyDown);
      this.clear();
    }
  }

  /** The area the palette has made: its kind, its sizes and its form. */
  setArea(area: Area | undefined): void {
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

  /** The area on the board, laid down or still turning. */
  get placed(): PlacedArea | undefined {
    const { area, origin } = this;
    if (area === undefined || origin === undefined) {
      return undefined;
    }
    return { area: aimed(area, this.aim), origin, isPlaced: !this.isTurning };
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
    this.isTurning = false;
    this.notify();
  }

  destroy(): void {
    this.setActive(false);
    this.listeners.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.area === undefined) {
      return;
    }
    // The press belongs to the tool; the board element must not pan.
    event.stopPropagation();
    event.preventDefault();
    if (this.isTurning) {
      // The second press lays it down where it is pointing.
      this.isTurning = false;
      this.notify();
      return;
    }
    this.origin = this.originFor(this.cellUnder(event));
    // A circle has nothing to turn, so one press finishes it.
    this.isTurning = this.area.kind !== "circle";
    this.notify();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.isTurning || this.origin === undefined) {
      return;
    }
    const at = this.toWorld({ x: event.offsetX, y: event.offsetY });
    this.aim = facingToward(this.worldOf(this.origin), at) ?? this.aim;
    this.notify();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || this.origin === undefined) {
      return;
    }
    event.preventDefault();
    this.clear();
  };

  // An origin sits in the rule's unit; the pointer is in world pixels,
  // so the grid does the one conversion between them.
  private worldOf(origin: Spot): Point {
    return {
      x: this.grid.originX + (origin.x / this.rule.cellSize) * this.grid.cellSize,
      y: this.grid.originY + (origin.y / this.rule.cellSize) * this.grid.cellSize,
    };
  }

  private cellUnder(event: PointerEvent): Cell {
    return worldToCell(this.grid, this.toWorld({ x: event.offsetX, y: event.offsetY }));
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

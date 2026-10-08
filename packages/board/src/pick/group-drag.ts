/**
 * ─ Carrying what is picked ─
 *
 * Move's hold on more than one token alone, and Select's when a press
 * lands on what is picked: a press on anything picked, dragged, carries
 * all of it by whole cells, and the release lands it where it was
 * carried; let go in place, it is a click. A press anywhere
 * else is not taken, so it reaches a token or the camera as before. The
 * owner says what a press lands on and does the carrying; this knows the
 * pointer only.
 * Design: docs/templates.md "The Select tool".
 */

import { worldToCellPoint, type SquareGrid } from "../grid/square-grid.js";
import { pointOn, type Point } from "../shared/geometry.js";
import { PointerSession } from "../shared/pointer-session.js";
import { DRAG_THRESHOLD_PX } from "../tokens/press.js";
import { offsetOf, sameOffset, type Offset } from "./placement.js";

/** What the drag asks of the hand that holds the picked set. */
export interface CarryOwner {
  /**
   * Whether a press at `at`, in cells, with Shift held or not, lands on
   * something picked that moves with the rest.
   */
  takes(at: Point, isAdding: boolean): boolean;
  /** Carry what is picked `offset` from where it stood, or put it back with none. */
  carry(offset: Offset | undefined): void;
  /** Leave what was carried where it was carried. */
  land(): void;
  /** A press let go where it landed, at `at` in cells. */
  click(at: Point): void;
}

// The press held: where it landed, in cells and on the page, and how far
// it has carried what is picked once it is a drag.
interface Press {
  readonly from: Point;
  readonly startX: number;
  readonly startY: number;
  offset: Offset | undefined;
}

/** A drag that carries everything picked together, while active. */
export class GroupDrag {
  private readonly owner: CarryOwner;
  private readonly session: PointerSession;
  private grid: SquareGrid;
  private press: Press | undefined;

  /** `toWorld` maps a point on the canvas to world pixels: the camera's inverse. */
  constructor(
    canvas: HTMLElement,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point,
    owner: CarryOwner
  ) {
    this.grid = grid;
    this.owner = owner;
    this.session = new PointerSession(canvas, toWorld, {
      takes: (event) =>
        this.owner.takes(
          worldToCellPoint(this.grid, toWorld(pointOn(canvas, event))),
          event.shiftKey
        ),
      onDown: (at, event) => {
        this.press = {
          from: worldToCellPoint(this.grid, at),
          startX: event.clientX,
          startY: event.clientY,
          offset: undefined,
        };
        return true;
      },
      onMove: (at, event) => this.drag(at, event),
      onUp: () => {
        const press = this.press;
        this.press = undefined;
        if (press?.offset !== undefined) {
          this.owner.land();
        } else if (press !== undefined) {
          this.owner.click(press.from);
        }
      },
      onCancel: () => this.putBack(),
      onEscape: (event) => {
        if (!this.session.isHeld) {
          return;
        }
        event.preventDefault();
        this.session.release();
        this.putBack();
      },
    });
  }

  /** Whether a press on what is picked carries it. Off, any carry under way is put back. */
  setActive(on: boolean): void {
    if (this.session.setActive(on) && !on) {
      this.putBack();
    }
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
  }

  destroy(): void {
    this.setActive(false);
  }

  // Past a few pixels the press is a drag, and each new whole cell of
  // travel carries what is picked that much further.
  private drag(at: Point, event: PointerEvent): void {
    const press = this.press;
    if (press === undefined) {
      return;
    }
    const travel = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (press.offset === undefined && travel < DRAG_THRESHOLD_PX) {
      return;
    }
    const offset = offsetOf(press.from, worldToCellPoint(this.grid, at));
    if (press.offset === undefined || !sameOffset(press.offset, offset)) {
      press.offset = offset;
      this.owner.carry(offset);
    }
  }

  private putBack(): void {
    const press = this.press;
    this.press = undefined;
    if (press?.offset !== undefined) {
      this.owner.carry(undefined);
    }
  }
}

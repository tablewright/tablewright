/**
 * ─ Pointer session ─
 *
 * One press held on the canvas at a time, as the ruler, the area tool
 * and the drawing tool each take it: the left button is claimed before
 * the board element can pan, captured so the drag keeps reporting off
 * the canvas, and let go on release or cancel. The owner hears world
 * points and turns them into cells itself.
 */

import { pointOn, type Point } from "./geometry.js";

/** What a tool does with the pointer the session hands it. */
export interface PointerSessionOwner {
  /** Whether a left press is the owner's at all; refused, it goes to the board. Yes unless said. */
  takes?(event: PointerEvent): boolean;
  /** A press taken at `at`; answer whether to hold the pointer until it is let go. */
  onDown(at: Point, event: PointerEvent): boolean;
  /** The held pointer moved. */
  onMove(at: Point, event: PointerEvent): void;
  /** The pointer moved with nothing held. */
  onHover?(at: Point, event: PointerEvent): void;
  /** The held pointer was let go at `at`; the session releases it afterwards. */
  onUp(at: Point, event: PointerEvent): void;
  /** The held pointer was taken away; the session has released it. */
  onCancel(): void;
  /** The pointer left the canvas. */
  onLeave?(): void;
  /** The wheel turned while a pointer is held. */
  onWheel?(event: WheelEvent): void;
  /** Escape was pressed while active; the owner decides what it takes. */
  onEscape?(event: KeyboardEvent): void;
}

/** Binds a tool's pointer handling to the canvas while active. */
export class PointerSession {
  private readonly canvas: HTMLElement;
  private readonly toWorld: (screen: Point) => Point;
  private readonly owner: PointerSessionOwner;
  private isActive = false;
  private pointerId: number | undefined;

  /** `toWorld` maps a point on the canvas to world pixels: the camera's inverse. */
  constructor(canvas: HTMLElement, toWorld: (screen: Point) => Point, owner: PointerSessionOwner) {
    this.canvas = canvas;
    this.toWorld = toWorld;
    this.owner = owner;
  }

  /** Whether the owner hears the pointer. Off, any press held is let go. Says whether it changed. */
  setActive(on: boolean): boolean {
    if (on === this.isActive) {
      return false;
    }
    this.isActive = on;
    if (on) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointercancel", this.onPointerCancel);
      this.canvas.addEventListener("pointerleave", this.onPointerLeave);
      this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
      window.addEventListener("keydown", this.onKeyDown);
    } else {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
      this.canvas.removeEventListener("wheel", this.onWheel);
      window.removeEventListener("keydown", this.onKeyDown);
      this.release();
    }
    return true;
  }

  /** Whether a press is held. */
  get isHeld(): boolean {
    return this.pointerId !== undefined;
  }

  /** Let the held pointer go: its capture released and nothing more heard from it. */
  release(): void {
    if (this.pointerId !== undefined && this.canvas.hasPointerCapture(this.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerId);
    }
    this.pointerId = undefined;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.isHeld || this.owner.takes?.(event) === false) {
      return;
    }
    // The press is the tool's; the board element must not start a pan.
    event.stopPropagation();
    event.preventDefault();
    if (!this.owner.onDown(this.worldUnder(event), event)) {
      return;
    }
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) {
      this.owner.onMove(this.worldUnder(event), event);
    } else if (!this.isHeld) {
      this.owner.onHover?.(this.worldUnder(event), event);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.owner.onUp(this.worldUnder(event), event);
    this.release();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.release();
    this.owner.onCancel();
  };

  private readonly onPointerLeave = (): void => {
    this.owner.onLeave?.();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.isHeld) {
      this.owner.onWheel?.(event);
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.owner.onEscape?.(event);
    }
  };

  // The canvas may sit anywhere on the page, so the point is read from its
  // own corner, then through the camera.
  private worldUnder(event: PointerEvent): Point {
    return this.toWorld(pointOn(this.canvas, event));
  }
}

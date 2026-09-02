/**
 * ─ Camera input ─
 *
 * Maps pointer and wheel events on the board element to camera calls
 * the way VTT players expect, for mouse, touch, and pen alike: the
 * wheel zooms about the cursor (a trackpad pinch arrives as ctrl +
 * wheel), one pointer dragging empty board pans, two pointers pinch to
 * zoom and pan together. Anything in the scene that claims a
 * pointerdown stops the native event before it reaches the board
 * element, so the camera only ever moves from empty board. The board
 * element must set `touch-action: none`, or the browser takes touch
 * gestures for itself and cancels these events.
 */

import type { Point } from "../geometry.js";
import type { Camera } from "./camera.js";
import { pinchStep } from "./pinch-math.js";
import { wheelDeltaToPixels, wheelZoomFactor } from "./wheel-math.js";

const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;

/** Binds camera gestures to `target` until `dispose` is called. */
export class CameraInput {
  private readonly camera: Camera;
  private readonly target: HTMLElement;
  private readonly pointers = new Map<number, Point>();

  constructor(camera: Camera, target: HTMLElement) {
    this.camera = camera;
    this.target = target;
    target.addEventListener("wheel", this.onWheel, { passive: false });
    target.addEventListener("pointerdown", this.onPointerDown);
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerup", this.onPointerEnd);
    target.addEventListener("pointercancel", this.onPointerEnd);
  }

  dispose(): void {
    this.target.removeEventListener("wheel", this.onWheel);
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerup", this.onPointerEnd);
    this.target.removeEventListener("pointercancel", this.onPointerEnd);
    this.pointers.clear();
    this.target.removeAttribute("data-camera");
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.target.getBoundingClientRect();
    const dy = wheelDeltaToPixels(event.deltaY, event.deltaMode, rect.height);
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.camera.zoomAt(anchor, wheelZoomFactor(dy));
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const isPanButton = event.button === LEFT_BUTTON || event.button === MIDDLE_BUTTON;
    if (event.pointerType === "mouse" && !isPanButton) {
      return;
    }
    // A third finger adds nothing to a pinch and would only confuse it.
    if (this.pointers.size >= 2) {
      return;
    }
    event.preventDefault();
    this.target.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.target.setAttribute("data-camera", "panning");
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (previous === undefined) {
      return;
    }
    const current = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 1) {
      this.camera.panBy(current.x - previous.x, current.y - previous.y);
    } else {
      this.applyPinch(event.pointerId, previous, current);
    }
    this.pointers.set(event.pointerId, current);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (!this.pointers.delete(event.pointerId)) {
      return;
    }
    if (this.target.hasPointerCapture(event.pointerId)) {
      this.target.releasePointerCapture(event.pointerId);
    }
    if (this.pointers.size === 0) {
      this.target.removeAttribute("data-camera");
    }
  };

  private applyPinch(movedId: number, previous: Point, current: Point): void {
    const other = [...this.pointers].find(([id]) => id !== movedId);
    if (other === undefined) {
      return;
    }
    const rect = this.target.getBoundingClientRect();
    const step = pinchStep([previous, other[1]], [current, other[1]]);
    this.camera.panBy(step.dx, step.dy);
    this.camera.zoomAt({ x: step.anchor.x - rect.left, y: step.anchor.y - rect.top }, step.factor);
  }
}

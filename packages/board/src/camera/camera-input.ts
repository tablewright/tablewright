/**
 * ─ Camera input ─
 *
 * Maps pointer and wheel events on the board element to camera calls
 * the way VTT players expect: the wheel zooms about the cursor (a
 * trackpad pinch arrives as ctrl + wheel and zooms the same way),
 * left-drag or middle-drag on the board pans. Anything in the scene
 * that claims a pointerdown stops the native event before it reaches
 * the board element, so the camera only pans on empty board. The
 * panning state is published as a data attribute; CSS owns the cursor.
 */

import type { Camera } from "./camera.js";
import { wheelDeltaToPixels, wheelZoomFactor } from "./wheel-math.js";

const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;

/** Binds camera gestures to `target` until `dispose` is called. */
export class CameraInput {
  private readonly camera: Camera;
  private readonly target: HTMLElement;
  private panPointerId: number | undefined;
  private lastX = 0;
  private lastY = 0;

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
    if (event.button !== LEFT_BUTTON && event.button !== MIDDLE_BUTTON) {
      return;
    }
    event.preventDefault();
    this.target.setPointerCapture(event.pointerId);
    this.panPointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.target.setAttribute("data-camera", "panning");
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.panPointerId) {
      return;
    }
    this.camera.panBy(event.clientX - this.lastX, event.clientY - this.lastY);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.panPointerId) {
      return;
    }
    this.target.releasePointerCapture(event.pointerId);
    this.panPointerId = undefined;
    this.target.removeAttribute("data-camera");
  };
}

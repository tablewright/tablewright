/**
 * ─ Camera input ─
 *
 * Maps wheel, pointer, and keyboard events on the board element to
 * camera calls, Figma-style: wheel pans, ctrl or meta + wheel zooms
 * about the cursor (trackpad pinch arrives the same way), middle-drag
 * or space + drag pans. Pan-readiness is published as a data
 * attribute so the cursor is styled by CSS, never set here.
 */

import type { Camera } from "./camera.js";
import { wheelDeltaToPixels, wheelZoomFactor } from "./wheel-math.js";

const MIDDLE_BUTTON = 1;
const LEFT_BUTTON = 0;

/** Binds camera gestures to `target` until `dispose` is called. */
export class CameraInput {
  private readonly camera: Camera;
  private readonly target: HTMLElement;
  private isSpaceHeld = false;
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
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    this.target.removeEventListener("wheel", this.onWheel);
    this.target.removeEventListener("pointerdown", this.onPointerDown);
    this.target.removeEventListener("pointermove", this.onPointerMove);
    this.target.removeEventListener("pointerup", this.onPointerEnd);
    this.target.removeEventListener("pointercancel", this.onPointerEnd);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.target.removeAttribute("data-camera");
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.target.getBoundingClientRect();
    const dx = wheelDeltaToPixels(event.deltaX, event.deltaMode, rect.width);
    const dy = wheelDeltaToPixels(event.deltaY, event.deltaMode, rect.height);
    if (event.ctrlKey || event.metaKey) {
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.camera.zoomAt(anchor, wheelZoomFactor(dy));
      return;
    }
    // Shift turns a plain vertical wheel into horizontal travel, as in every canvas tool.
    if (event.shiftKey && dx === 0) {
      this.camera.panBy(-dy, 0);
      return;
    }
    this.camera.panBy(-dx, -dy);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const isPanButton =
      event.button === MIDDLE_BUTTON || (event.button === LEFT_BUTTON && this.isSpaceHeld);
    if (!isPanButton) {
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
    this.publishReadiness();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Space" || event.repeat || isEditable(event.target)) {
      return;
    }
    event.preventDefault();
    this.isSpaceHeld = true;
    this.publishReadiness();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== "Space") {
      return;
    }
    this.isSpaceHeld = false;
    this.publishReadiness();
  };

  private readonly onBlur = (): void => {
    this.isSpaceHeld = false;
    this.publishReadiness();
  };

  private publishReadiness(): void {
    if (this.panPointerId !== undefined) {
      return;
    }
    if (this.isSpaceHeld) {
      this.target.setAttribute("data-camera", "pan-ready");
    } else {
      this.target.removeAttribute("data-camera");
    }
  }
}

// Space inside a text field is typing, not a pan modifier.
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target.matches("input, textarea, select");
}

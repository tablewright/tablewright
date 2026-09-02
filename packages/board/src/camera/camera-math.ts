/**
 * ─ Camera math ─
 *
 * Pure pan and zoom over one world-to-screen transform:
 * screen = world * zoom + offset. The offset is where the world origin
 * lands on screen, which is exactly a Pixi container's position and
 * scale, so the board applies a camera state with no conversion.
 * Design: docs/design.md §5, one camera for canvas and DOM overlay.
 */

import type { Point, WorldRect } from "../geometry.js";

/** Screen position of the world origin, and screen pixels per world pixel. Zoom is positive. */
export interface CameraState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** Inclusive zoom bounds. Both positive, min at or below max. */
export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

/** Screen size in CSS pixels. */
export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

/** Project a world point onto the screen. */
export function worldToScreen(camera: CameraState, point: Point): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

/** Unproject a screen point into the world. */
export function screenToWorld(camera: CameraState, point: Point): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

/** Shift the view by a screen-space delta. */
export function pan(camera: CameraState, dx: number, dy: number): CameraState {
  return { x: camera.x + dx, y: camera.y + dy, zoom: camera.zoom };
}

/** Bring a zoom value inside the limits. */
export function clampZoom(zoom: number, limits: ZoomLimits): number {
  return Math.min(limits.max, Math.max(limits.min, zoom));
}

/**
 * Scale the view by `factor` while the world point under `anchor`, a screen
 * point, stays put. Zoom is clamped first so the anchor still holds at a limit.
 */
export function zoomAbout(
  camera: CameraState,
  anchor: Point,
  factor: number,
  limits: ZoomLimits
): CameraState {
  const zoom = clampZoom(camera.zoom * factor, limits);
  const ratio = zoom / camera.zoom;
  return {
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
    zoom,
  };
}

/**
 * The camera that shows all of `rect` centred in `view`, with `padding` screen
 * pixels kept clear around it. `rect` must have positive size.
 */
export function fitToRect(
  view: ViewSize,
  rect: WorldRect,
  limits: ZoomLimits,
  padding = 0
): CameraState {
  const rectWidth = rect.right - rect.left;
  const rectHeight = rect.bottom - rect.top;
  const zoom = clampZoom(
    Math.min((view.width - 2 * padding) / rectWidth, (view.height - 2 * padding) / rectHeight),
    limits
  );
  return {
    x: (view.width - rectWidth * zoom) / 2 - rect.left * zoom,
    y: (view.height - rectHeight * zoom) / 2 - rect.top * zoom,
    zoom,
  };
}

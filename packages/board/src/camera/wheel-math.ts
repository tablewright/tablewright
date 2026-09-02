/**
 * ─ Wheel math ─
 *
 * Wheel events differ by device and browser: pixels from trackpads,
 * lines or pages from some mouse drivers, tiny deltas from a pinch.
 * These two functions make them one currency so the input layer
 * stays a thin mapping of events to camera calls.
 */

// WheelEvent.deltaMode values; the DOM constants live on the event, not the type.
const DELTA_LINE = 1;
const DELTA_PAGE = 2;

// A line is roughly a text row; browsers that report lines do not say how tall.
const LINE_PX = 16;

// One mouse notch is 100 px in Chromium; a notch should feel like a clear step.
const NOTCH_PX = 100;
const ZOOM_PER_NOTCH = 1.1;

/** Normalise a wheel delta to pixels. `pageSize` is the viewport extent on that axis. */
export function wheelDeltaToPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === DELTA_LINE) {
    return delta * LINE_PX;
  }
  if (deltaMode === DELTA_PAGE) {
    return delta * pageSize;
  }
  return delta;
}

/** Zoom factor for a vertical wheel delta in pixels: scrolling up (negative) zooms in. */
export function wheelZoomFactor(deltaYPixels: number): number {
  return ZOOM_PER_NOTCH ** (-deltaYPixels / NOTCH_PX);
}

/** A position in whichever space the caller names: world pixels or screen pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An axis-aligned rectangle, left and top inclusive, in whichever space the caller names. */
export interface WorldRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Where a pointer event landed on `element`, in pixels from its top-left corner. */
export function pointOn(element: Element, event: { clientX: number; clientY: number }): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/** The straight distance from `from` to `to`, in whichever space both are in. */
export function lengthOf(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** The point `t` of the way from `from` to `to`: 0 is `from`, 1 is `to`. */
export function along(from: Point, to: Point, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

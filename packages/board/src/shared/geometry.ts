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

// Parallel segments, and an end within this much of the other segment,
// are told apart from a crossing by this.
const EPSILON = 1e-9;

/**
 * Where the segment `p` to `q` meets the segment `a` to `b`: `t` along
 * the first and `u` along the second, each 0 at its start and 1 at its
 * end, or undefined when they are parallel or do not meet. An end that
 * touches the other segment counts as meeting it.
 */
export function segmentsMeet(
  p: Point,
  q: Point,
  a: Point,
  b: Point
): { readonly t: number; readonly u: number } | undefined {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < EPSILON) {
    return undefined;
  }
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denominator;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / denominator;
  const within = (value: number): boolean => value >= -EPSILON && value <= 1 + EPSILON;
  return within(t) && within(u) ? { t, u } : undefined;
}

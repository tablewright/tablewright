import type { Graphics } from "pixi.js";
import { along, lengthOf, type Point } from "../shared/geometry.js";

/** Lay the line from `from` to `to` down in dashes, since Pixi strokes have none; the caller strokes it. */
export function dashedLine(g: Graphics, from: Point, to: Point, dash: number, gap: number): void {
  const length = lengthOf(from, to);
  for (let start = 0; start < length; start += dash + gap) {
    const end = Math.min(length, start + dash);
    const a = along(from, to, start / length);
    const b = along(from, to, end / length);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
}

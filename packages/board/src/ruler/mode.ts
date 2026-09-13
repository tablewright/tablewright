/**
 * ─ Ruler modes ─
 *
 * What a measure shows. Line measures as the crow flies, the everyday
 * question of how far a thing is; Path shows the way on foot as this
 * turn offers it, for a move about to be made. Templates join them
 * later. Each mode answers with one number in one badge, so a player
 * reads it at a glance.
 * Design: docs/design.md §5 "Measuring is its own tool".
 */

import type { Route } from "../topology/route.js";
import { seenByNote } from "../seen.js";
import type { Measurement } from "./measure.js";

/**
 * What the column does: the first two measure and lay nothing down, the
 * rest lay an area on the board (design §5 "Templates are areas, laid
 * down from the same column").
 */
export type RulerMode = "line" | "path" | "rect" | "cone" | "circle";

/** The modes that lay an area down rather than answer a question. */
export type AreaMode = Extract<RulerMode, "rect" | "cone" | "circle">;

export function isArea(mode: RulerMode): mode is AreaMode {
  return mode === "rect" || mode === "cone" || mode === "circle";
}

export interface RulerModeSpec {
  readonly mode: RulerMode;
  readonly name: string;
}

/** The modes in the order the rail shows them; the first is the default. */
export const RULER_MODES: readonly RulerModeSpec[] = [
  { mode: "line", name: "Line" },
  { mode: "path", name: "Path" },
  { mode: "rect", name: "Rectangle" },
  { mode: "cone", name: "Cone" },
  { mode: "circle", name: "Circle" },
];

/**
 * The rise and the fall, drawn from Material Symbols rather than borrowed:
 * no text face carries an arrow, so the one the badge used came from
 * whatever the system keeps its symbols in — another weight, another
 * optical size, and it read as pasted in beside the figures.
 *
 * Asked for by codepoint, not by the `arrow_upward` ligature the same file
 * answers to. The badge's text is read by more than the eye: a story
 * asserts on it and a log prints it, and neither wants the word.
 */
export const RISE_MARK = "\uE5D8";
export const FALL_MARK = "\uE5DB";

/**
 * The badge beside the far end. As a line: the distance, with the rise as
 * an arrow up or down when there is one. As a path: what the way costs,
 * led by Dash when it takes one, with the dice of a drop; beyond even a
 * dash the shortest way is named as such, and no way at all says so.
 */
export function badgeText(measurement: Measurement, mode: RulerMode): string {
  const note = seenByNote(measurement.seenBy);
  const said = reading(measurement, mode);
  return note === undefined ? said : `${said} — ${note}`;
}

// The numbers themselves, as the mode reads them.
function reading(measurement: Measurement, mode: RulerMode): string {
  const { distance, rise, unit, route, choice } = measurement;
  if (mode === "path") {
    // A refusal still names the way it would take, so the number is there.
    const way = choice.route ?? route;
    if (way === undefined) {
      return "No way";
    }
    const cost = `${tidy(way.cost)} ${unit}${fall(way)}`;
    switch (choice.phase) {
      case "dash":
        return `Dash: ${cost}`;
      case "refused":
        return `Beyond dash: ${cost}`;
      default:
        return cost;
    }
  }
  // The rise does not say the unit twice: the distance has said it
  // already, and a mark with a number reads at a glance where "10 ft
  // ↓ 10 ft" reads as clutter.
  const climb = rise === 0 ? "" : ` ${rise > 0 ? RISE_MARK : FALL_MARK}${tidy(Math.abs(rise))}`;
  return `${tidy(distance)} ${unit}${climb}`;
}

// A drop's dice, a d6 each until the system's manifest says otherwise.
function fall(route: Route): string {
  return route.dice > 0 ? `, ${route.dice}d6 fall` : "";
}

// Whole numbers stay whole; the exact rule's lengths keep two places.
function tidy(value: number): string {
  return String(Math.round(value * 100) / 100);
}

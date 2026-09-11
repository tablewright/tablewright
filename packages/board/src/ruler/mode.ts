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
import type { Measurement } from "./measure.js";

export type RulerMode = "line" | "path";

export interface RulerModeSpec {
  readonly mode: RulerMode;
  readonly name: string;
}

/** The modes in the order the rail shows them; the first is the default. */
export const RULER_MODES: readonly RulerModeSpec[] = [
  { mode: "line", name: "Line" },
  { mode: "path", name: "Path" },
];

/**
 * The badge beside the far end. As a line: the distance, with the rise as
 * an arrow up or down when there is one. As a path: what the way costs,
 * led by Dash when it takes one, with the dice of a drop; beyond even a
 * dash the shortest way is named as such, and no way at all says so.
 */
export function badgeText(measurement: Measurement, mode: RulerMode): string {
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
  const climb = rise === 0 ? "" : ` ${rise > 0 ? "↑" : "↓"}${tidy(Math.abs(rise))} ${unit}`;
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

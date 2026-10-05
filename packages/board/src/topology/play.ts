import type { PlayState } from "@tablewright/schema";
import type { ThresholdEdge } from "./derive.js";

/**
 * What a tap does to a threshold in Play: either a state for the scene, or
 * words for the DM. A door opens or shuts, a locked one says so, a large
 * window is smashed through (an action, not a step), a small one is sight
 * only, and a secret door worked is revealed, shut. An arch is always open
 * and has nothing to work, so the tap that finds a threshold never offers one.
 */
export function worked(threshold: ThresholdEdge): { state: PlayState } | { notice: string } {
  if (threshold.state === "secret") {
    return { state: "closed" };
  }
  if (threshold.threshold === "window" || threshold.threshold === "frosted") {
    if (threshold.state === "smashed") {
      return { notice: "Smashed: the way through is open." };
    }
    if (threshold.size !== "large") {
      return { notice: "Too small to pass: sight only." };
    }
    return { state: "smashed" };
  }
  switch (threshold.state) {
    case "open":
      return { state: "closed" };
    case "locked":
      return { notice: "Locked: a key, a spell, or the DM's word." };
    default:
      return { state: "open" };
  }
}

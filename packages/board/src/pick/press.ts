/**
 * ─ A press under Select ─
 *
 * What a press with Select comes to. On something picked it carries what
 * is picked straight away, as Move would, for a hand that may move it.
 * With Shift held it always picks, adding or taking out, and never
 * carries. Anywhere else it picks, by a click or a box. While Shift is
 * held the board shows the hand adding.
 * Design: docs/templates.md "The Select tool".
 */

import type { PlayTool } from "../ruler/ruler-tool.js";

/** What a press under Select does: carry what is picked, or pick by a click or a box. */
export type SelectPress = "carry" | "pick";

/**
 * What a press under Select does, with Shift held or not, on something
 * picked or not, for a hand that may move what it has picked or not.
 */
export function selectPress(
  isAdding: boolean,
  isOnPicked: boolean,
  isMovable: boolean
): SelectPress {
  return !isAdding && isOnPicked && isMovable ? "carry" : "pick";
}

/** Whether the board shows the hand adding to what is picked: Select held with Shift down. */
export function showsAdding(hand: PlayTool | undefined, isShiftDown: boolean): boolean {
  return hand === "select" && isShiftDown;
}

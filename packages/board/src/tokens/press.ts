/**
 * ─ Press timing ─
 *
 * A press on a token becomes a turn only when the pointer has been
 * still for the hold time by the pointer's own clock. A busy main
 * thread can run the hold timer before a move that was already on its
 * way, so the move's timestamp, not the timer, has the last word.
 */

// Pointer travel before a press becomes a drag rather than a click.
export const DRAG_THRESHOLD_PX = 4;
// A press held still this long becomes a turn instead of a click.
export const HOLD_MS = 400;

/**
 * What the first move after the hold timer fired means. `moveStamp` is the
 * move event's timestamp, `holdStamp` the time the timer ran, both on the
 * document's clock; `travel` is the pointer's distance from the press.
 */
export function afterHold(moveStamp: number, holdStamp: number, travel: number): "drag" | "turn" {
  return travel >= DRAG_THRESHOLD_PX && moveStamp < holdStamp ? "drag" : "turn";
}

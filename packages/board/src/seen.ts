/**
 * ─ Who sees it ─
 *
 * A measure or an area says who it is for: everyone at the table, the DM,
 * or the one who made it. The first two are the compendium's own tiers,
 * so they are judged by the rule strokes are judged by; the third has no
 * tier, since it is about the hand that made the thing rather than how
 * open it is. Until the table is networked there is one hand per page,
 * so the maker is the view it was made in, and the dev view toggle is
 * what puts another pair of eyes on it.
 * Design: docs/design.md §5 "Every measure and every area says who sees
 * it".
 */

import type { Visibility } from "@tablewright/schema";
import { seenAt } from "./topology/derive.js";

/** Who a measure or an area is for. */
export type SeenBy = "party" | "dm" | "own";

/** The choices in the order they are offered, the open one first. */
export const SEEN_BY: readonly SeenBy[] = ["party", "dm", "own"];

/**
 * Whether a viewer at `viewer` tier sees a thing marked `seenBy`, `isMine`
 * when it is theirs. The one who made it sees their own, which is why a
 * player who sends a measure to the DM still has it on their own board.
 * A page standing at a side that is not its own is nobody's maker: the
 * dev mirror shows what a player sees and nothing besides.
 */
export function seesIt(seenBy: SeenBy, isMine: boolean, viewer: Visibility): boolean {
  if (isMine) {
    return true;
  }
  return seenBy !== "own" && seenAt(seenBy, viewer);
}

/** How faint a measure or an area reads when it is not the whole table's. */
export const KEPT_ALPHA = 0.6;

/** What the board says beside a measure or an area that is not the table's, if anything. */
export function seenByNote(seenBy: SeenBy): string | undefined {
  switch (seenBy) {
    case "dm":
      return "DM only";
    case "own":
      return "Just you";
    default:
      return undefined;
  }
}

/**
 * ─ A template's cards ─
 *
 * A template laid down deals a card for each token its side view names to
 * every seat but two: the one that laid it, which has the strip, and the
 * DM's, which already sees everything a card could say. Tokens have no
 * owners yet, so every other seat gets every card. A card closed in a seat
 * stays closed for that laying, and laying the template again opens them all.
 * Design: docs/templates.md "The side view".
 */

import type { Seat } from "../../shared/seen.js";
import { seenAt } from "../../topology/derive.js";
import type { PlacedArea } from "../area-tool.js";
import type { SideView } from "./side-view.js";

/**
 * Whether `seat` is dealt cards for `placed`: it lies on the board, another
 * seat laid it, and this is not the DM's seat. The DM's seat is told by its
 * role, as the one that sees what is kept for the DM.
 */
export function isDealt(placed: PlacedArea, seat: Seat): boolean {
  return placed.isPlaced && placed.madeBy !== seat.id && !seenAt("dm", seat.role.sees);
}

/** Which cards of one laying each seat has closed. */
export class CardDeck {
  private laying: number | undefined;
  private readonly closed = new Map<string, Set<string>>();

  /**
   * `view` with only the cards `seat` still has open from `laying`, in the
   * order the side view names their tokens, so the last is the newest. A new
   * laying opens every card again.
   */
  deal(view: SideView, laying: number, seat: string): SideView {
    this.turnTo(laying);
    const shut = this.closed.get(seat);
    if (shut === undefined) {
      return view;
    }
    return { ...view, tokens: view.tokens.filter((token) => !shut.has(token.id)) };
  }

  /** Close the card for the token `id` in `seat`, for `laying` alone. */
  close(id: string, laying: number, seat: string): void {
    this.turnTo(laying);
    const shut = this.closed.get(seat) ?? new Set<string>();
    shut.add(id);
    this.closed.set(seat, shut);
  }

  // A laying the deck has not seen forgets what was closed in the last.
  private turnTo(laying: number): void {
    if (laying !== this.laying) {
      this.laying = laying;
      this.closed.clear();
    }
  }
}

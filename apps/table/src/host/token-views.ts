import {
  DEFAULT_MOVER,
  NO_LIMIT,
  heightAt,
  seenAt,
  type Budget,
  type Mover,
  type Seat,
  type TokenView,
  type Topology,
} from "@tablewright/board";
import type { Scene } from "@tablewright/schema";

/** The scene's tokens as the board draws them. */
export function tokenViews(scene: Scene): TokenView[] {
  return scene.tokens.map((token) => ({
    id: token.id,
    label: token.label,
    cell: { col: token.col, row: token.row },
    facing: token.facing,
    visibility: token.visibility,
  }));
}

// What stands on the board as this viewer sees it: a token kept for the
// DM is not on a player's board at all, so it cannot be seen, caught by
// an area, or dragged.
function seenTokens(tokens: readonly TokenView[], seat: Seat): readonly TokenView[] {
  return tokens.filter((token) => seenAt(token.visibility ?? "party", seat.role.sees));
}

/** Every token `seat` sees, each wearing the height of the ground under it. */
export function tokensWithHeights(
  tokens: readonly TokenView[],
  topology: Topology,
  seat: Seat
): TokenView[] {
  return seenTokens(tokens, seat).map((token) => ({
    ...token,
    height: heightAt(topology, token.cell),
    // Still on this seat's board, but not on the table's.
    isKept: (token.visibility ?? "party") !== "party",
  }));
}

/**
 * How the token `id` moves. Without a sheet a token walks as a person on
 * foot and nothing limits it: a route still prices, and a drag of any
 * length lands.
 */
export function moverOf(tokens: readonly TokenView[], id: string): Mover {
  return tokens.find((token) => token.id === id)?.mover ?? DEFAULT_MOVER;
}

/** What the token `id` has left this turn: its sheet's budget, else no limit. */
export function budgetOf(tokens: readonly TokenView[], id: string): Budget {
  return tokens.find((token) => token.id === id)?.budget ?? NO_LIMIT;
}

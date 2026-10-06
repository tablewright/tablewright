/**
 * ─ Who sees it, and who may do it ─
 *
 * One vocabulary for both halves of the same question. A thing carries
 * one of four words saying who it is for: world, party, dm, own. A role
 * carries how far it sees, in the same words, and what it may do, as
 * the permissions the core names. The first three words are a ladder,
 * so a viewer sees everything at or below their own; the fourth is
 * about whose a thing is, so it is read against the maker instead.
 * Design: docs/permissions.md
 */

import type { Permission, Role, Visibility } from "@tablewright/schema";
import { seenAt } from "../topology/derive.js";

/** What a measure or an area may be made for, as the palette offers them. */
export const SEEN_BY: readonly Visibility[] = ["party", "dm", "own"];

/**
 * Whether a role sees a thing marked `marked`, `isMine` when it is
 * theirs. The one who made it sees their own, which is why a player who
 * sends a measure to the DM still has it on their own board.
 */
export function seesIt(marked: Visibility, isMine: boolean, role: Role): boolean {
  if (isMine) {
    return true;
  }
  return marked !== "own" && seenAt(marked, role.sees);
}

/** Whether a role may do this at all. */
export function allows(role: Role, permission: Permission): boolean {
  return role.permissions.includes(permission);
}

/**
 * How far a permission carries for this role: one's own, unless the file
 * says wider.
 */
export function reachOf(role: Role, permission: Permission): Visibility {
  return role.reach?.[permission] ?? "own";
}

/** How faint a measure or an area reads when it is not the whole table's. */
export const KEPT_ALPHA = 0.6;

/** What the board says beside a measure or an area that is not the table's, if anything. */
export function seenByNote(marked: Visibility): string | undefined {
  switch (marked) {
    case "dm":
      return "DM only";
    case "own":
      return "Just you";
    default:
      return undefined;
  }
}

/** `text` with the note for who a thing is for after a dash, when there is one. */
export function withSeenByNote(text: string, seenBy: Visibility): string {
  const note = seenByNote(seenBy);
  return note === undefined ? text : `${text} — ${note}`;
}

/** How a thing kept back from the table reads: faint when it is, plain when it is not. */
export function keptAlphaIf(isKept: boolean | undefined): number {
  return isKept === true ? KEPT_ALPHA : 1;
}

/** How a measure or an area reads by who it is for: plain for the table, faint for anyone else. */
export function keptAlpha(seenBy: Visibility): number {
  return keptAlphaIf(seenBy !== "party");
}

/**
 * A role that may do nothing and sees nothing, so a surface that is
 * never told which role it serves shows nothing rather than everything.
 */
export const NO_ROLE: Role = { name: "", sees: "world", permissions: [] };

/**
 * Who this page is: the role it holds and the name that role goes by.
 * One seat a page until the table is networked, when a seat becomes a
 * person and the name becomes theirs.
 */
export interface Seat {
  readonly id: string;
  readonly role: Role;
}

/** The seat before the app names one: NO_ROLE, so a board fails closed. */
export const NOBODY: Seat = { id: "", role: NO_ROLE };

/**
 * Who a measure or an area is for, and whose it is: the palette's choice
 * for the next one, the seat this board sits in, and what the one on the
 * board was made as and by. The ruler and the area tool each keep one.
 */
export class Marking {
  private seat: Seat = NOBODY;
  private choice: Visibility = "party";
  private made: Visibility = "party";
  private maker = NOBODY.id;

  /** Who the next one is for. What is on the board keeps what it has. */
  setChoice(seenBy: Visibility): void {
    this.choice = seenBy;
  }

  /**
   * The hand's own choice: the next one, and the one on the board when
   * this seat is shown it, which is how a thing already down is shared
   * without making it again. Says whether the one on the board changed.
   */
  choose(seenBy: Visibility): boolean {
    this.choice = this.canShow ? seenBy : "own";
    if (!this.isSeen) {
      return false;
    }
    this.made = this.choice;
    return true;
  }

  /** Who sits at this board. Says whether the seat changed. */
  setSeat(seat: Seat): boolean {
    if (seat.id === this.seat.id) {
      return false;
    }
    this.seat = seat;
    return true;
  }

  /**
   * A press makes a new one: for whom the palette says, or one's own with
   * Alt held, and one's own either way for a seat that may not show.
   */
  press(altKey: boolean): void {
    this.made = this.canShow && !altKey ? this.choice : "own";
    this.maker = this.seat.id;
  }

  /** Who the one on the board is for. */
  get seenBy(): Visibility {
    return this.made;
  }

  /** The seat the one on the board was made in, which is who counts as its maker. */
  get madeBy(): string {
    return this.maker;
  }

  /** Whether this seat is shown the one on the board: its own, or open to its role. */
  get isSeen(): boolean {
    return seesIt(this.made, this.maker === this.seat.id, this.seat.role);
  }

  /** Whether this seat may let the table see what it makes at all. */
  get canShow(): boolean {
    return allows(this.seat.role, "ruler:show");
  }
}

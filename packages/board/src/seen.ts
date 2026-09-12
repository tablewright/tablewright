/**
 * ─ Who sees it, and who may do it ─
 *
 * One vocabulary for both halves of the same question. A thing carries
 * one of four words saying who it is for: world, party, dm, own. A role
 * carries how far it sees, in those same words, and what it may do, as
 * the permissions the core's own file names. The first three words are
 * a ladder, so a viewer sees everything at or below their own; the
 * fourth is about whose a thing is rather than how open it is, so it is
 * read against the maker instead.
 * Design: docs/permissions.md
 */

import type { Permission, Role, Visibility } from "@tablewright/schema";
import { seenAt } from "./topology/derive.js";

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

/**
 * The seat a board holds before the app says who is sitting in it: it
 * may do nothing and sees nothing, so a board that is never told fails
 * closed rather than open.
 */
export const NOBODY: Seat = { id: "", role: NO_ROLE };

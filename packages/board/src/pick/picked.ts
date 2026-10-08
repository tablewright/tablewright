/**
 * ─ Picked ─
 *
 * What the hand has picked on the board, in the order it was picked:
 * tokens by their ids, and the template lying there. Select picks with a
 * box or a click and Move carries what Select picked, so both read and
 * write the one set here. The order is kept, since a line drawn between
 * two things runs from the first picked to the next.
 * Design: docs/templates.md "The Select tool".
 */

import { Listeners } from "../shared/listeners.js";

/** One thing on the board a hand can pick: a token by its id, or the template lying there. */
export type Thing = { readonly kind: "token"; readonly id: string } | { readonly kind: "area" };

/** The template on the board, as a thing picked. The board holds one at a time. */
export const THE_AREA: Thing = { kind: "area" };

/**
 * How a click or a box changes what is picked: put in place of it, added
 * after it, or each thing taken out if it was picked and added if not.
 */
export type PickHow = "replace" | "add" | "toggle";

/** The token `id`, as a thing picked. */
export function tokenThing(id: string): Thing {
  return { kind: "token", id };
}

/** Whether `a` and `b` are the same thing. */
export function sameThing(a: Thing, b: Thing): boolean {
  if (a.kind === "token" && b.kind === "token") {
    return a.id === b.id;
  }
  return a.kind === b.kind;
}

/**
 * What is picked once `hits` are, `how` says, from `picked`. The order is
 * the order things were picked, and nothing is in it twice.
 */
export function pickedAfter(
  picked: readonly Thing[],
  hits: readonly Thing[],
  how: PickHow
): readonly Thing[] {
  const result = how === "replace" ? [] : [...picked];
  for (const hit of hits) {
    const at = result.findIndex((thing) => sameThing(thing, hit));
    if (at < 0) {
      result.push(hit);
    } else if (how === "toggle") {
      result.splice(at, 1);
    }
  }
  return result;
}

/**
 * The tokens that wear the picking ring: each one picked, and the one
 * under the pointer while Shift is held, `hovered`, as a preview of what
 * a Shift-click adds, unless it is picked already.
 */
export function ringedTokens(picked: readonly Thing[], hovered: string | undefined): string[] {
  const ids = picked.flatMap((thing) => (thing.kind === "token" ? [thing.id] : []));
  return hovered === undefined || ids.includes(hovered) ? ids : [...ids, hovered];
}

/** The picked set every hand on the board shares, told to whoever listens as it changes. */
export class Picked {
  private things: readonly Thing[] = [];
  private isHeldNow = false;
  private readonly listeners = new Listeners<readonly Thing[]>();

  /** What is picked, in the order it was picked. */
  get all(): readonly Thing[] {
    return this.things;
  }

  /** Pick `things` in place of whatever was picked. */
  set(things: readonly Thing[]): void {
    const isSame =
      things.length === this.things.length &&
      things.every((thing, i) => {
        const was = this.things[i];
        return was !== undefined && sameThing(thing, was);
      });
    if (isSame) {
      return;
    }
    this.things = things;
    this.listeners.emit(things);
  }

  /** Whether `thing` is picked. */
  has(thing: Thing): boolean {
    return this.things.some((one) => sameThing(one, thing));
  }

  /** The ids of the tokens picked, in the order they were picked. */
  get tokenIds(): string[] {
    return this.things.flatMap((thing) => (thing.kind === "token" ? [thing.id] : []));
  }

  /**
   * The token picked when it is the only thing picked. That one moves
   * with its rules; anything more moves together as a free placement.
   */
  get loneToken(): string | undefined {
    const [only, ...rest] = this.things;
    return only?.kind === "token" && rest.length === 0 ? only.id : undefined;
  }

  /**
   * Whether a gesture has hold of what is picked: a box being drawn, or
   * the set being carried. Escape is then that gesture's to answer.
   */
  get isHeld(): boolean {
    return this.isHeldNow;
  }

  hold(on: boolean): void {
    this.isHeldNow = on;
  }

  /** Hear what is picked as it changes. Returns the unsubscribe. */
  onChange(listener: (things: readonly Thing[]) => void): () => void {
    return this.listeners.add(listener);
  }
}

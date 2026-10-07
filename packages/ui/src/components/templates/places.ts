/**
 * ─ Where the cards sit ─
 *
 * Each card sits beside its token on screen, with a thin line from the
 * token's edge to the card. It takes the first spot that is free: right of
 * the token, left, under, over, then each of those slid a little further at
 * a time. Free means inside the screen and clear of every card's token and
 * of the cards placed before it, so a later card steps aside.
 * Design: docs/templates.md "The side view".
 */

import type { Point } from "@tablewright/board";

/** Where a card's token stands on screen: its centre, and how far its drawing reaches from it. */
export interface CardAnchor {
  readonly x: number;
  readonly y: number;
  readonly reach: number;
}

/** A box on screen, in pixels from its top left corner. */
export interface ScreenBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A card to place: its token, where the token stands, and how large the card is. */
export interface CardToPlace {
  readonly id: string;
  readonly anchor: CardAnchor;
  readonly width: number;
  readonly height: number;
}

/** Where a card goes, and the line from its token's edge to it, if the card leaves room for one. */
export interface PlacedCard {
  readonly id: string;
  readonly box: ScreenBox;
  readonly line: { readonly from: Point; readonly to: Point } | undefined;
}

// In pixels: between a token's reach and its card; kept clear between a
// card and anything else; kept from the screen's edges; and how far a card
// slides at a time when a spot is taken.
const GAP = 14;
const SPACE = 8;
const EDGE = 8;
const SLIDE = 16;

/**
 * Where each card goes, in the order given, each clear of the ones before
 * it; a card with nowhere free goes to its first spot all the same.
 */
export function placeCards(
  cards: readonly CardToPlace[],
  screen: { readonly width: number; readonly height: number }
): PlacedCard[] {
  const tokens = cards.map((card) => tokenBox(card.anchor));
  const placed: PlacedCard[] = [];
  for (const card of cards) {
    const taken = [...tokens, ...placed.map((one) => one.box)];
    const box = spotFor(card, screen, taken);
    placed.push({ id: card.id, box, line: lineTo(card.anchor, box) });
  }
  return placed;
}

// The first free spot beside the card's token, or the first of all.
function spotFor(
  card: CardToPlace,
  screen: { readonly width: number; readonly height: number },
  taken: readonly ScreenBox[]
): ScreenBox {
  const { anchor, width, height } = card;
  const out = anchor.reach + GAP;
  // Right and left slide up and down; under and over slide across.
  const right = { left: anchor.x + out, top: anchor.y - height / 2, isAcross: false };
  const sides = [
    right,
    { left: anchor.x - out - width, top: anchor.y - height / 2, isAcross: false },
    { left: anchor.x - width / 2, top: anchor.y + out, isAcross: true },
    { left: anchor.x - width / 2, top: anchor.y - out - height, isAcross: true },
  ];
  const spotAt = (side: typeof right, shift: number): ScreenBox =>
    inside(screen, {
      left: side.left + (side.isAcross ? shift : 0),
      top: side.top + (side.isAcross ? 0 : shift),
      width,
      height,
    });
  const steps = Math.ceil(Math.max(screen.width, screen.height) / SLIDE);
  for (let step = 0; step <= steps; step += 1) {
    for (const shift of step === 0 ? [0] : [step * SLIDE, -step * SLIDE]) {
      for (const side of sides) {
        const spot = spotAt(side, shift);
        if (!taken.some((other) => meet(spot, other))) {
          return spot;
        }
      }
    }
  }
  return spotAt(right, 0);
}

// The square a token's drawing fills.
function tokenBox(anchor: CardAnchor): ScreenBox {
  const size = anchor.reach * 2;
  return { left: anchor.x - anchor.reach, top: anchor.y - anchor.reach, width: size, height: size };
}

// A box moved the least way that keeps it inside the screen, its top left
// kept in where it is larger than the screen.
function inside(
  screen: { readonly width: number; readonly height: number },
  box: ScreenBox
): ScreenBox {
  return {
    ...box,
    left: Math.max(EDGE, Math.min(box.left, screen.width - EDGE - box.width)),
    top: Math.max(EDGE, Math.min(box.top, screen.height - EDGE - box.height)),
  };
}

// Whether two boxes come closer than the space kept between things.
function meet(a: ScreenBox, b: ScreenBox): boolean {
  return (
    a.left < b.left + b.width + SPACE &&
    b.left < a.left + a.width + SPACE &&
    a.top < b.top + b.height + SPACE &&
    b.top < a.top + a.height + SPACE
  );
}

// From the token's edge, toward the nearest point of the card, to that
// point; none when the card covers the token's edge.
function lineTo(anchor: CardAnchor, box: ScreenBox): PlacedCard["line"] {
  const to = {
    x: Math.max(box.left, Math.min(anchor.x, box.left + box.width)),
    y: Math.max(box.top, Math.min(anchor.y, box.top + box.height)),
  };
  const length = Math.hypot(to.x - anchor.x, to.y - anchor.y);
  if (length <= anchor.reach) {
    return undefined;
  }
  const out = anchor.reach / length;
  return {
    from: { x: anchor.x + (to.x - anchor.x) * out, y: anchor.y + (to.y - anchor.y) * out },
    to,
  };
}

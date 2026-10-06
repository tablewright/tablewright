/**
 * ─ Spotlight keys ─
 *
 * What a key does in the box, from the input or from a tile, answered as
 * data for the box to apply: the arrows step the selection and wrap at
 * both ends, Home and End jump on a tile, Enter chooses, Escape closes,
 * and on a tile's Share button Enter and Space are the button's own click.
 * Pure, so the wrap-around is tested without a DOM.
 * Design: docs/design.md §3
 */

/** The key pressed, with the one modifier the box reads. */
export interface KeyPress {
  key: string;
  shift: boolean;
}

/**
 * Where the press landed: how many tiles show, which is selected, whether a
 * tile had focus, and whether it was the tile's Share button that had it.
 */
export interface KeyPlace {
  count: number;
  selected: number;
  fromTile: boolean;
  fromShare: boolean;
}

/**
 * What the box does for a key: nothing; a new selection, with focus on it
 * when `focus` is set; focus on the tile already selected; the selected
 * entry chosen; or the box closed. A key that does anything is used up,
 * its own default with it.
 */
export type KeyEffect =
  | { effect: "none" }
  | { effect: "select"; index: number; focus: boolean }
  | { effect: "focus" }
  | { effect: "choose" }
  | { effect: "close" };

/** The effect, and whether the key is the box's own: nothing behind it may act on one that is. */
export type KeyAnswer = KeyEffect & { own: boolean };

// The keys the box keeps to itself wherever they are pressed.
const OWN_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"]);

/** The selection `delta` tiles on from `selected`, wrapping at both ends as Spotlight does. */
export function step(selected: number, delta: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  return (selected + delta + count) % count;
}

/** What the box does with `press` at `place`. */
export function answerKey(press: KeyPress, place: KeyPlace): KeyAnswer {
  const own = OWN_KEYS.has(press.key);
  // On the Share button, Enter and Space are the button's click: the box
  // leaves their default alone so the click comes, and chooses nothing.
  if (place.fromShare && (press.key === "Enter" || press.key === " ")) {
    return { own: true, effect: "none" };
  }
  switch (press.key) {
    case "Tab":
      // From the input, Tab lands on the selected tile rather than the
      // first; from there the native order takes over.
      if (!place.fromTile && !press.shift && place.count > 0) {
        return { own, effect: "focus" };
      }
      return { own, effect: "none" };
    case "ArrowDown":
      return {
        own,
        effect: "select",
        index: step(place.selected, 1, place.count),
        focus: place.fromTile,
      };
    case "ArrowUp":
      return {
        own,
        effect: "select",
        index: step(place.selected, -1, place.count),
        focus: place.fromTile,
      };
    case "Home":
    case "End":
      // In the input these move the caret, as in any text field; on a
      // tile they jump to the first or the last tile.
      if (!place.fromTile) {
        return { own, effect: "none" };
      }
      return {
        own,
        effect: "select",
        index: press.key === "Home" ? 0 : place.count - 1,
        focus: true,
      };
    case "Enter":
      return { own, effect: "choose" };
    case "Escape":
      return { own, effect: "close" };
    case " ":
      // Space activates a focused tile, as it does a button.
      return place.fromTile ? { own: true, effect: "choose" } : { own, effect: "none" };
    default:
      return { own, effect: "none" };
  }
}

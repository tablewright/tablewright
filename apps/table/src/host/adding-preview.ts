/**
 * ─ Adding preview ─
 *
 * While Select is held with Shift down, the board shows the hand adding
 * to what is picked: the pointer for a cursor, and the ring on the token
 * under it that a Shift-click would add. Shift let go, the window left
 * or the hand changed, both go. Tokens are inert to the pointer's hover
 * here, so what is under it is read off the board's own pointer moves.
 * Design: docs/templates.md "The Select tool".
 */

import {
  isTypingTarget,
  showsAdding,
  worldToCell,
  type PlayTool,
  type Point,
  type SquareGrid,
  type TokenView,
} from "@tablewright/board";

/** The cursor and the ring that say a Shift-click would add, under Select. */
export class AddingPreview {
  private readonly board: HTMLElement;
  private readonly toWorld: (screen: Point) => Point;
  private readonly tokens: () => readonly TokenView[];
  private readonly onChange: () => void;
  private grid: SquareGrid;
  private hand: PlayTool | undefined;
  private isShiftDown = false;
  // Where the pointer is over the board, in pixels from its corner.
  private pointer: Point | undefined;
  private shown: string | undefined;

  /**
   * `board` is the element the board's cursor is set on; `tokens` are the
   * ones this seat sees; `onChange` hears the token under the pointer change.
   */
  constructor(
    board: HTMLElement,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point,
    tokens: () => readonly TokenView[],
    onChange: () => void
  ) {
    this.board = board;
    this.grid = grid;
    this.toWorld = toWorld;
    this.tokens = tokens;
    this.onChange = onChange;
    window.addEventListener("keydown", (event) => {
      if (event.key === "Shift" && !isTypingTarget(event)) {
        this.setShift(true);
      }
    });
    window.addEventListener("keyup", (event) => {
      if (event.key === "Shift") {
        this.setShift(false);
      }
    });
    window.addEventListener("blur", () => this.setShift(false));
  }

  /** The hand in Play, or none while a pen is held. */
  setHand(hand: PlayTool | undefined): void {
    this.hand = hand;
    this.update();
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.update();
  }

  /** Where the pointer is over the board, or nothing once it has left. */
  pointAt(at: Point | undefined): void {
    this.pointer = at;
    this.update();
  }

  /** The token under the pointer a Shift-click would pick, while the hand shows adding. */
  get hovered(): string | undefined {
    if (!showsAdding(this.hand, this.isShiftDown) || this.pointer === undefined) {
      return undefined;
    }
    const cell = worldToCell(this.grid, this.toWorld(this.pointer));
    return this.tokens().find((token) => token.cell.col === cell.col && token.cell.row === cell.row)
      ?.id;
  }

  private setShift(isDown: boolean): void {
    if (isDown === this.isShiftDown) {
      return;
    }
    this.isShiftDown = isDown;
    this.update();
  }

  // The cursor follows the state at once; the ring only when the token
  // under the pointer changes, so a move within a cell redraws nothing.
  private update(): void {
    if (showsAdding(this.hand, this.isShiftDown)) {
      this.board.dataset["adding"] = "true";
    } else {
      delete this.board.dataset["adding"];
    }
    const hovered = this.hovered;
    if (hovered !== this.shown) {
      this.shown = hovered;
      this.onChange();
    }
  }
}

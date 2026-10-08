/**
 * ─ Aim host ─
 *
 * The line between two tokens picked one after the other: drawn from the
 * first to the second with its distance and cover on a badge, and a card
 * beside the target saying what hides it. It is marked by the ruler's Seen
 * by as it is drawn, as a measure is, and shows with its card to every
 * seat that sees it, judged from that seat's own topology and tokens. It
 * goes when what is picked stops being those two tokens.
 * Design: docs/templates.md "A spell aimed at one creature".
 */

import {
  Listeners,
  Marking,
  MeasureView,
  aimOf,
  aimText,
  aimViewOf,
  pairOf,
  type Aim,
  type BoardStage,
  type GridRule,
  type Pair,
  type Picked,
  type RulerStyle,
  type Seat,
  type SideView,
  type SquareGrid,
  type TokenView,
  type Topology,
} from "@tablewright/board";
import type { Visibility } from "@tablewright/schema";

/** What the host hands over: the scene as it holds it now. */
export interface AimSources {
  topology(): Topology;
  /** The tokens this seat sees, each at the height of the ground under it. */
  tokens(): readonly TokenView[];
  rule(): GridRule;
}

/** The line as this seat is shown it, and who it is for. */
export type ShownAim = Aim & { readonly seenBy: Visibility };

/** The line between two picked tokens over one board, and its card. */
export class AimHost {
  private readonly stage: BoardStage;
  private readonly picked: Picked;
  private readonly sources: AimSources;
  private readonly view: MeasureView;
  private readonly marking = new Marking();
  private readonly cards = new Listeners<SideView | undefined>();
  private pair: Pair | undefined;
  // Where the two stood when the line was last drawn, so one moved draws it
  // anew and opens its card again.
  private ends: string | undefined;
  private isCardClosed = false;
  private shownAim: ShownAim | undefined;

  constructor(stage: BoardStage, grid: SquareGrid, picked: Picked, sources: AimSources) {
    this.stage = stage;
    this.picked = picked;
    this.sources = sources;
    this.view = new MeasureView(stage.layers.overlay, grid);
    picked.onChange(() => this.update());
  }

  setGrid(grid: SquareGrid): void {
    this.view.setGrid(grid);
    this.update();
  }

  setStyle(style: RulerStyle): void {
    this.view.setStyle(style);
    this.update();
  }

  /** Who sits at this board; the line shows here only if this seat sees it. */
  setSeat(seat: Seat): void {
    this.marking.setSeat(seat);
    this.update();
  }

  /** The hand's choice of who the next line is for, and the one on the board if this seat sees it. */
  chooseSeenBy(seenBy: Visibility): void {
    if (this.marking.choose(seenBy)) {
      this.update();
    }
  }

  /** The line on the board as this seat is shown it, or nothing. */
  get shown(): ShownAim | undefined {
    return this.shownAim;
  }

  /** Hear the card the line deals this seat, or its going. Returns the unsubscribe. */
  onCard(listener: (card: SideView | undefined) => void): () => void {
    return this.cards.add(listener);
  }

  /** Close the line's card until the line is drawn anew. */
  closeCard(): void {
    this.isCardClosed = true;
    this.cards.emit(undefined);
  }

  /** Judge the line again from the scene as it stands, and draw it or take it off. */
  update(): void {
    this.follow(pairOf(this.picked.all));
    const { pair } = this;
    const tokens = this.sources.tokens();
    const from = tokens.find((token) => token.id === pair?.from);
    const to = tokens.find((token) => token.id === pair?.to);
    if (from === undefined || to === undefined || !this.marking.isSeen) {
      this.show(undefined);
      return;
    }
    const ends = `${from.cell.col},${from.cell.row} ${to.cell.col},${to.cell.row}`;
    if (ends !== this.ends) {
      this.ends = ends;
      this.isCardClosed = false;
    }
    const topology = this.sources.topology();
    const rule = this.sources.rule();
    const aim = aimOf(from, to, topology, rule);
    this.view.showLine(from.cell, to.cell, aimText(aim, rule.unit), this.marking.seenBy);
    this.show({ ...aim, seenBy: this.marking.seenBy });
    this.cards.emit(this.isCardClosed ? undefined : aimViewOf(aim, from, to, topology, rule));
  }

  // A pair picked anew is a line drawn anew, marked for whom the palette
  // says as a press marks a measure; one that stays keeps its marking.
  private follow(pair: Pair | undefined): void {
    if (pair?.from === this.pair?.from && pair?.to === this.pair?.to) {
      return;
    }
    this.pair = pair;
    this.ends = undefined;
    if (pair !== undefined) {
      this.marking.press(false);
    }
  }

  // A line already off the board asks for nothing, so a board with no pair
  // picked stays still as the scene comes and goes.
  private show(aim: ShownAim | undefined): void {
    const wasShown = this.shownAim !== undefined;
    this.shownAim = aim;
    if (aim === undefined) {
      if (!wasShown) {
        return;
      }
      this.view.clear();
      this.cards.emit(undefined);
    }
    this.stage.requestFrame();
  }
}

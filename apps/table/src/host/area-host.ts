/**
 * ─ Area host ─
 *
 * The area tool and its layer, wired as one: the tool takes the pointer
 * and says where an area lies and which way it aims; the layer draws what
 * it covers and whom it catches, judged against the scene as it stands,
 * each token it catches ringed among the board's rings about tokens.
 * An area with a direction that this seat laid has a side view too, worked
 * out from the same scene; one another seat laid deals this one its cards,
 * unless this is the DM's seat.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column"; docs/templates.md "The side view".
 */

import {
  AreaLayer,
  AreaTool,
  CardDeck,
  Listeners,
  NOBODY,
  catchesToken,
  caughtCells,
  cubeCentre,
  cutOf,
  footprint,
  heightAt,
  isDealt,
  sideViewOf,
  type Area,
  type AreaDrawing,
  type AreaListener,
  type AreaStyle,
  type BoardStage,
  type Cell,
  type GridRule,
  type Offset,
  type Origin,
  type OriginSnap,
  type Outline,
  type PlacedArea,
  type Point,
  type Seat,
  type SideView,
  type SquareGrid,
  type TokenRings,
  type TokenView,
  type Topology,
} from "@tablewright/board";
import type { Visibility } from "@tablewright/schema";

// The side view a seat is dealt cards from, and the laying it came from.
type Dealt = { readonly view: SideView; readonly laying: number };

/** The area tool and its layer over one stage, reading the scene as the host holds it now. */
export class AreaHost {
  private readonly stage: BoardStage;
  private readonly layer: AreaLayer;
  private readonly tool: AreaTool;
  private readonly listeners = new Listeners<PlacedArea | undefined>();
  private readonly sideViews = new Listeners<SideView | undefined>();
  private readonly cards = new Listeners<SideView | undefined>();
  private readonly deck = new CardDeck();
  // What this seat was last dealt, so a card closed is closed for that laying.
  private dealt: Dealt | undefined;
  private readonly topology: () => Topology;
  private readonly tokens: () => readonly TokenView[];
  private rule: GridRule;
  private seat: Seat = NOBODY;

  /**
   * `topology` and `tokens` are asked at each use, since the host replaces
   * both as the scene changes; `tokens` are the ones this seat sees, each
   * at the height of the ground under it, and where a carry is taking them.
   * `rings` are the board's rings about tokens.
   */
  constructor(
    stage: BoardStage,
    grid: SquareGrid,
    rule: GridRule,
    toWorld: (screen: Point) => Point,
    topology: () => Topology,
    tokens: () => readonly TokenView[],
    rings: TokenRings
  ) {
    this.stage = stage;
    this.rule = rule;
    this.topology = topology;
    this.tokens = tokens;
    this.layer = new AreaLayer(stage.layers.overlay, grid, rule, rings);
    this.tool = new AreaTool(stage.app.canvas, grid, toWorld, rule, topology, (cell, at) =>
      this.originAt(cell, at)
    );
    this.tool.onChange((placed) => this.show(placed));
  }

  setGrid(grid: SquareGrid): void {
    this.layer.setGrid(grid);
    this.tool.setGrid(grid);
  }

  /**
   * Measure by `rule`; an area already down is measured again, since what
   * it catches is in the rule's unit.
   */
  setRule(rule: GridRule): void {
    this.rule = rule;
    this.layer.setRule(rule);
    this.tool.setRule(rule);
    const placed = this.tool.placed;
    if (placed !== undefined) {
      this.show(placed);
    }
  }

  setStyle(style: AreaStyle): void {
    this.layer.setStyle(style);
  }

  /**
   * Who sits here: the area shows to the seats that see it, its side view
   * to the seat that laid it, and its cards to the rest but the DM's.
   */
  setSeat(seat: Seat): void {
    this.seat = seat;
    this.tool.setSeat(seat);
  }

  /**
   * Take the pointer, or let it go. Let go, what is on the board comes
   * off it unless `keep` says it stays, for the hands that pick it and
   * carry it.
   */
  setActive(on: boolean, keep = false): void {
    this.tool.setActive(on, keep);
  }

  /** What the area this seat sees covers on the plan, in cells, with nothing in its way. */
  footprint(): Outline | undefined {
    const placed = this.tool.placed;
    return placed === undefined ? undefined : footprint(placed.area, placed.origin, this.rule);
  }

  /** Carry the area `offset` cells with the rest of what is picked, or put it back with none. */
  carry(offset: Offset | undefined): void {
    this.tool.carry(offset);
  }

  /** Leave the carried area where it was carried. */
  land(): void {
    this.tool.land();
  }

  /** Whether the area is picked, which its edge says. */
  setPicked(isPicked: boolean): void {
    this.layer.setPicked(isPicked);
    this.stage.requestFrame();
  }

  /** The area the palette has made: its kind, its sizes and its form. */
  setArea(area: Area | undefined): void {
    this.tool.setArea(area);
  }

  /** Where an area's origin may sit when one is put down. */
  setSnap(snap: OriginSnap): void {
    this.tool.setSnap(snap);
  }

  /** Who the next area is for; it marks the one on the board too. */
  chooseSeenBy(seenBy: Visibility): void {
    this.tool.chooseSeenBy(seenBy);
  }

  /** Take the area off the board. */
  clear(): void {
    this.tool.clear();
  }

  /** Whether an area is on the board. */
  get isShowing(): boolean {
    return this.layer.isShowing;
  }

  /** Hear the area as it is turned and laid down, so a palette can follow it. */
  onArea(listener: AreaListener): () => void {
    return this.listeners.add(listener);
  }

  /** Hear the side view of this seat's own area with a direction, and its going. */
  onSideView(listener: (view: SideView | undefined) => void): () => void {
    return this.sideViews.add(listener);
  }

  /**
   * Hear the cards another seat's area deals this one: its side view, with
   * only the tokens whose cards are still open, or nothing.
   */
  onCards(listener: (cards: SideView | undefined) => void): () => void {
    return this.cards.add(listener);
  }

  /** Close this seat's card for the token `id`, for the laying it came from. */
  closeCard(id: string): void {
    if (this.dealt === undefined) {
      return;
    }
    this.deck.close(id, this.dealt.laying, this.seat.id);
    this.deal(this.dealt);
  }

  /** What the layer last drew, for a dev build to read. */
  drawing(): AreaDrawing {
    return this.layer.drawing();
  }

  // An area leaves from the middle of the cube of the token pressed on, and
  // names that token as its source, else from the snapped point half a cell
  // up: cells are judged by their cube's centre, so a floor-level origin
  // loses the nearest ones.
  private originAt(cell: Cell, at: { x: number; y: number }): Origin {
    const token = this.tokens().find(
      (one) => one.cell.col === cell.col && one.cell.row === cell.row
    );
    const ground = heightAt(this.topology(), cell);
    if (token !== undefined) {
      const spot = cubeCentre(cell, ground + (token.elevation ?? 0), this.rule);
      return { spot, source: token.id };
    }
    return { spot: { x: at.x, y: at.y, z: ground + this.rule.cellSize / 2 }, source: undefined };
  }

  // An area laid down or turning: what it covers, what it reaches of that,
  // and who it holds, and for the seat that laid it the side view, or for
  // another its cards.
  private show(placed: PlacedArea | undefined): void {
    this.listeners.emit(placed);
    if (placed === undefined) {
      this.layer.clear();
      this.sideViews.emit(undefined);
      this.deal(undefined);
      this.stage.requestFrame();
      return;
    }
    const { area, origin, source } = placed;
    const topology = this.topology();
    const seen = this.tokens();
    const cells = caughtCells(area, origin, topology, this.rule);
    const tokens = seen
      .filter((token) => catchesToken(area, origin, token, topology, this.rule, source))
      .map((token) => token.cell);
    const whole = footprint(area, origin, this.rule);
    this.layer.show({
      area,
      origin,
      topology,
      footprint: whole,
      cut: cutOf(area, origin, topology, this.rule),
      cells,
      tokens,
      seenBy: placed.seenBy,
      isPlaced: placed.isPlaced,
    });
    const isMine = placed.madeBy === this.seat.id;
    const hasCards = isDealt(placed, this.seat);
    const view =
      isMine || hasCards ? sideViewOf(area, origin, topology, seen, this.rule, source) : undefined;
    this.sideViews.emit(isMine ? view : undefined);
    this.deal(hasCards && view !== undefined ? { view, laying: placed.laying } : undefined);
    this.stage.requestFrame();
  }

  // Hand this seat the cards still open from `dealt`, or none.
  private deal(dealt: Dealt | undefined): void {
    this.dealt = dealt;
    this.cards.emit(
      dealt === undefined ? undefined : this.deck.deal(dealt.view, dealt.laying, this.seat.id)
    );
  }
}

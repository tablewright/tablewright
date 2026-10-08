/**
 * ─ Pick host ─
 *
 * Select and Move over the one picked set. Select's clicks and boxes pick
 * among what this seat sees: its tokens, and the template when it is
 * shown here. Move carries what is picked, tokens and template together,
 * as a free placement, and so does Select from a press on what is picked;
 * the arrow keys step it a cell at a time. One token alone is the token
 * layer's, with its rules. Every picked token wears a ring among the
 * board's rings, the area host says whether the template is picked, and
 * the scene hears where the tokens land.
 * Design: docs/templates.md "The Select tool".
 */

import {
  GroupDrag,
  Listeners,
  SelectTool,
  THE_AREA,
  boxHits,
  clickHit,
  isStill,
  isTypingTarget,
  pickedAfter,
  ringedTokens,
  selectPress,
  standingAfter,
  stepOf,
  type BoardStage,
  type Offset,
  type PickGesture,
  type PickStyle,
  type PlacedArea,
  type PlayTool,
  type Picked,
  type Point,
  type SquareGrid,
  type TokenLayer,
  type TokenMove,
  type TokenRings,
  type TokenView,
} from "@tablewright/board";
import { AddingPreview } from "./adding-preview.js";
import type { AreaHost } from "./area-host.js";

/** What the host hands over: the board's layers, and what the scene holds as it holds it now. */
export interface PickSources {
  readonly stage: BoardStage;
  /** The element the board's cursor is set on. */
  readonly board: HTMLElement;
  readonly grid: SquareGrid;
  readonly toWorld: (screen: Point) => Point;
  readonly picked: Picked;
  readonly tokenLayer: TokenLayer;
  readonly area: AreaHost;
  readonly rings: TokenRings;
  /** The tokens this seat sees, where the scene has them. */
  tokens(): readonly TokenView[];
  /** Whether this seat may move what stands on the board. */
  isMovable(): boolean;
  /** A second finger landed while Select held the first: the camera takes it. */
  handOff(pointerId: number, at: { clientX: number; clientY: number }): void;
}

// What is being carried: the tokens picked when it began, whether the
// template was, and how far.
interface Carrying {
  readonly ids: ReadonlySet<string>;
  readonly hasArea: boolean;
  readonly offset: Offset;
}

/** Select and Move's hold on what is picked, over one board. */
export class PickHost {
  private readonly sources: PickSources;
  private readonly picked: Picked;
  private readonly select: SelectTool;
  private readonly group: GroupDrag;
  private readonly preview: AddingPreview;
  private readonly placeListeners = new Listeners<readonly TokenMove[]>();
  private hand: PlayTool | undefined;
  // Which template the area host last showed, so one laid in its place is
  // not taken for the one picked.
  private areaId: number | undefined;
  private carrying: Carrying | undefined;
  // Where the last carry landed, until the scene comes back saying so.
  private landed: Carrying | undefined;

  constructor(sources: PickSources) {
    this.sources = sources;
    this.picked = sources.picked;
    const { stage, grid, toWorld } = sources;
    this.select = new SelectTool(stage.app.canvas, stage.layers.overlay, grid, toWorld, {
      takes: (at, isAdding) =>
        selectPress(isAdding, this.isOnPicked(at), sources.isMovable()) === "pick",
      pick: (gesture) => this.pick(gesture),
      hold: (on) => this.picked.hold(on),
      handOff: (pointerId, at) => sources.handOff(pointerId, at),
    });
    this.group = new GroupDrag(stage.app.canvas, grid, toWorld, {
      takes: (at, isAdding) => this.takes(at, isAdding),
      carry: (offset) => this.carry(offset),
      land: () => this.land(),
      click: (at) => {
        const hit = clickHit(at, sources.tokens(), sources.area.footprint());
        if (hit !== undefined) {
          this.picked.set([hit]);
        }
      },
    });
    this.preview = new AddingPreview(sources.board, grid, toWorld, sources.tokens, () =>
      this.showRings()
    );
    sources.area.onArea((placed) => this.followArea(placed));
    this.picked.onChange(() => {
      sources.area.setPicked(this.picked.has(THE_AREA));
      this.showRings();
    });
    window.addEventListener("keydown", this.onKeyDown);
  }

  /**
   * The hand in Play: Select picks, and carries from a press on what is
   * picked; Move carries what is picked; a pen or the ruler, neither.
   */
  setTool(tool: PlayTool | undefined): void {
    this.hand = tool;
    this.select.setActive(tool === "select");
    this.group.setActive(tool === "move" || tool === "select");
    this.preview.setHand(tool);
  }

  setGrid(grid: SquareGrid): void {
    this.select.setGrid(grid);
    this.group.setGrid(grid);
    this.preview.setGrid(grid);
  }

  setStyle(style: PickStyle): void {
    this.select.setStyle(style);
  }

  /** Where the pointer is over the board, in pixels from its corner, or nothing once it has left. */
  pointAt(at: Point | undefined): void {
    this.preview.pointAt(at);
  }

  /**
   * The scene's tokens were set again: a carry that landed has been
   * answered, and the rings go where the tokens now stand.
   */
  tokensChanged(): void {
    this.landed = undefined;
    this.showRings();
  }

  /**
   * `tokens` as they will stand once what is being carried lands, so a
   * template carried with them is judged against where they are going,
   * and a ring stays with its token until the scene says where it went.
   */
  standing<T extends TokenView>(tokens: readonly T[]): readonly T[] {
    let standing = tokens;
    for (const move of [this.landed, this.carrying]) {
      if (move !== undefined) {
        standing = standingAfter(standing, move.ids, move.offset);
      }
    }
    return standing;
  }

  /** Hear tokens land together, as one placement. Returns the unsubscribe. */
  onPlace(listener: (moves: readonly TokenMove[]) => void): () => void {
    return this.placeListeners.add(listener);
  }

  // A click picks the thing under it, or nothing; with Shift it takes that
  // thing out if it was picked and adds it if not. A box picks what it
  // touches, or with Shift adds it.
  private pick(gesture: PickGesture): void {
    const tokens = this.sources.tokens();
    const footprint = this.sources.area.footprint();
    const { all } = this.picked;
    if (gesture.kind === "click") {
      const hit = clickHit(gesture.at, tokens, footprint);
      const hits = hit === undefined ? [] : [hit];
      this.picked.set(pickedAfter(all, hits, gesture.isAdding ? "toggle" : "replace"));
      return;
    }
    const hits = boxHits(gesture.box, tokens, footprint);
    this.picked.set(pickedAfter(all, hits, gesture.isAdding ? "add" : "replace"));
  }

  // The picked set is carried from a press on any of it, unless what is
  // picked is one token alone, whose own drag keeps its rules. Under
  // Select, a press with Shift held picks instead.
  private takes(at: Point, isAdding: boolean): boolean {
    if (this.picked.loneToken !== undefined) {
      return false;
    }
    const isOnPicked = this.isOnPicked(at);
    const isMovable = this.sources.isMovable();
    return this.hand === "select"
      ? selectPress(isAdding, isOnPicked, isMovable) === "carry"
      : isMovable && isOnPicked;
  }

  // Whether a press at `at`, in cells, lands on something picked.
  private isOnPicked(at: Point): boolean {
    const under = boxHits(
      { from: at, to: at },
      this.sources.tokens(),
      this.sources.area.footprint()
    );
    return under.some((thing) => this.picked.has(thing));
  }

  // Every picked token wears the ring, and so does the one a Shift-click
  // would add, each where it stands or is being carried to.
  private showRings(): void {
    const ids = new Set(ringedTokens(this.picked.all, this.preview.hovered));
    const cells = this.standing(this.sources.tokens())
      .filter((token) => ids.has(token.id))
      .map((token) => token.cell);
    this.sources.rings.hold("picked", cells);
    this.sources.stage.requestFrame();
  }

  private carry(offset: Offset | undefined): void {
    const { tokenLayer, area } = this.sources;
    if (offset === undefined) {
      if (this.carrying?.hasArea === true) {
        area.carry(undefined);
      }
      tokenLayer.carry(undefined);
      this.carrying = undefined;
      this.picked.hold(false);
      this.showRings();
      return;
    }
    this.carrying = {
      ids: this.carrying?.ids ?? new Set(this.picked.tokenIds),
      hasArea: this.carrying?.hasArea ?? this.picked.has(THE_AREA),
      offset,
    };
    this.picked.hold(true);
    tokenLayer.carry(offset);
    if (this.carrying.hasArea) {
      area.carry(offset);
    }
    this.showRings();
  }

  // The template lands while the carry still stands, so what it catches is
  // judged where the tokens are going rather than where they were; the
  // tokens are taken as standing there until the scene answers.
  private land(): void {
    const carrying = this.carrying;
    if (carrying === undefined) {
      return;
    }
    if (isStill(carrying.offset)) {
      this.carry(undefined);
      return;
    }
    const moves = this.sources.tokenLayer.land();
    if (carrying.hasArea) {
      this.sources.area.land();
    }
    this.carrying = undefined;
    this.landed = moves.length > 0 ? carrying : undefined;
    this.picked.hold(false);
    this.showRings();
    if (moves.length > 0) {
      this.placeListeners.emit(moves);
    }
  }

  // The template picked goes from the set when it leaves the board, or
  // when another is laid in its place.
  private followArea(placed: PlacedArea | undefined): void {
    const id = placed?.id;
    if (id === this.areaId) {
      return;
    }
    this.areaId = id;
    this.picked.set(this.picked.all.filter((thing) => thing.kind !== "area"));
  }

  // The keys step what is picked a cell, as a placement; one token alone
  // the token layer steps by its rules.
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const step = stepOf(event.key);
    const { all, loneToken, isHeld } = this.picked;
    if (
      step === undefined ||
      isTypingTarget(event) ||
      all.length === 0 ||
      loneToken !== undefined ||
      isHeld ||
      !this.sources.isMovable()
    ) {
      return;
    }
    event.preventDefault();
    this.carry(step);
    this.land();
  };
}

/**
 * ─ Laying an area down ─
 *
 * Press, drag, release: the press puts the origin down, the drag aims it
 * and says how far it goes, the release leaves it on the board. What
 * separates an area from a measure is not the gesture but what happens
 * after: a measure answers and is gone, while an area stays, and a press
 * inside one takes hold of it and moves it, its origin snapping as the
 * palette says.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column".
 */

import type { Visibility } from "@tablewright/schema";
import { lengthOf, type Point } from "../geometry.js";
import { Marking, type Seat } from "../seen.js";
import {
  cellPointToWorld,
  worldToCell,
  worldToCellPoint,
  type Cell,
  type SquareGrid,
} from "../grid/square-grid.js";
import { Listeners } from "../stage/listeners.js";
import { PointerSession } from "../stage/pointer-session.js";
import { facingToward, normalizeDegrees } from "../tokens/facing.js";
import type { GridRule } from "../topology/distance.js";
import {
  reached,
  snapOrigin,
  snapSize,
  spotToCellPoint,
  type Area,
  type OriginSnap,
  type Spot,
} from "./area.js";
import { footprintCovers } from "./outline.js";

/** An area with a place and an aim, as the board is to draw it. */
export interface PlacedArea {
  readonly area: Area;
  readonly origin: Spot;
  /** Who it is for: everyone at the table, the DM, or the one who laid it. */
  readonly seenBy: Visibility;
  /** The seat it was laid in, which is who counts as its maker. */
  readonly madeBy: string;
  /** Left on the board, or still under the hand. */
  readonly isPlaced: boolean;
}

export type AreaListener = (placed: PlacedArea | undefined) => void;

/**
 * Where an area starts when it is pressed: the place of a token standing
 * on `cell`, or the floor at `at`, which the tool has already snapped.
 */
export type OriginFor = (cell: Cell, at: { x: number; y: number }) => Spot;

type Phase = "idle" | "placing" | "moving";

// How far the wheel turns an area under the hand, and how far with a
// finer hand on it.
const TURN_STEP = 15;
const FINE_TURN = 5;

/** Takes the pointer while an area is being laid down or moved. */
export class AreaTool {
  private readonly originFor: OriginFor;
  private readonly listeners = new Listeners<PlacedArea | undefined>();
  private readonly session: PointerSession;
  private rule: GridRule;
  private grid: SquareGrid;
  private area: Area | undefined;
  private origin: Spot | undefined;
  private aim = 0;
  // How far the drag reached, in the rule's unit. Unset until it moves, so
  // one laid down without moving keeps the length the palette holds.
  private reach: number | undefined;
  private snap: OriginSnap = "centre";
  private readonly marking = new Marking();
  /** Where the origin sat under the hand when a move began, in the rule's unit. */
  private grab: { x: number; y: number } | undefined;
  private phase: Phase = "idle";

  constructor(
    canvas: HTMLElement,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point,
    rule: GridRule,
    originFor: OriginFor
  ) {
    this.grid = grid;
    this.rule = rule;
    this.originFor = originFor;
    this.session = new PointerSession(canvas, toWorld, {
      takes: () => this.area !== undefined,
      onDown: (at, event) => this.press(at, event),
      onMove: (at) => this.drag(at),
      onUp: () => this.settle(),
      onCancel: () => this.settle(),
      onWheel: (event) => this.turn(event),
      onEscape: (event) => {
        if (this.origin === undefined) {
          return;
        }
        event.preventDefault();
        this.clear();
      },
    });
  }

  /** Whether the pointer lays areas down. Off, the tool hears nothing. */
  setActive(on: boolean): void {
    if (this.session.setActive(on) && !on) {
      this.clear();
    }
  }

  /**
   * The area the palette has made: its kind, its sizes and its form. An
   * aim typed there is taken as the hand's own, so the number in the
   * palette and the gesture turn the same thing.
   */
  setArea(area: Area | undefined): void {
    if (area !== undefined && area.kind !== "circle" && area.aim !== this.aim) {
      this.aim = area.aim;
    }
    // Sizes typed into the palette are the hand's own, as a typed aim is:
    // they replace how far the drag reached rather than being overruled by
    // it, or the fields would do nothing to what is already down.
    this.reach = undefined;
    this.area = area;
    if (this.origin !== undefined) {
      this.notify();
    }
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
  }

  setRule(rule: GridRule): void {
    this.rule = rule;
  }

  /** Where an origin may sit when one is put down or moved. */
  setSnap(snap: OriginSnap): void {
    this.snap = snap;
  }

  /** Who the next area laid is for. What is on the board keeps what it has. */
  setSeenBy(seenBy: Visibility): void {
    this.marking.setChoice(seenBy);
  }

  /** The hand's own choice: the next area, and the one on the board if this seat is shown it. */
  chooseSeenBy(seenBy: Visibility): void {
    if (!this.marking.choose(seenBy) || this.area === undefined || this.origin === undefined) {
      return;
    }
    this.notify();
  }

  /** Who sits at this board. An area another seat kept to itself is not shown here. */
  setSeat(seat: Seat): void {
    if (!this.marking.setSeat(seat)) {
      return;
    }
    this.notify();
  }

  /** The area on the board, under the hand or left there. */
  get placed(): PlacedArea | undefined {
    const { area, origin } = this;
    if (area === undefined || origin === undefined || !this.marking.isSeen) {
      return undefined;
    }
    const turned = aimed(area, this.aim);
    const sized = this.reach === undefined ? turned : reached(turned, this.reach, this.rule);
    return {
      area: sized,
      origin,
      seenBy: this.marking.seenBy,
      madeBy: this.marking.madeBy,
      isPlaced: this.phase === "idle",
    };
  }

  onChange(listener: AreaListener): () => void {
    return this.listeners.add(listener);
  }

  /** Take the area off the board. */
  clear(): void {
    if (this.origin === undefined) {
      return;
    }
    this.origin = undefined;
    this.reach = undefined;
    this.grab = undefined;
    this.phase = "idle";
    this.session.release();
    this.notify();
  }

  destroy(): void {
    this.setActive(false);
    this.listeners.clear();
  }

  // A press inside what is already drawn takes hold of it; anywhere else
  // starts a new one where the press landed.
  private press(at: Point, event: PointerEvent): boolean {
    const placed = this.placed;
    if (
      placed !== undefined &&
      footprintCovers(placed.area, placed.origin, worldToCellPoint(this.grid, at), this.rule)
    ) {
      this.phase = "moving";
      // The area moves with the hand rather than jumping under it: what
      // is held is the offset, not the origin.
      const under = this.inUnit(at);
      this.grab = { x: under.x - placed.origin.x, y: under.y - placed.origin.y };
      return true;
    }
    this.phase = "placing";
    this.reach = undefined;
    this.grab = undefined;
    this.marking.press(event.altKey);
    this.moveOrigin(at);
    return true;
  }

  // The drag aims it and reaches: its bearing turns it and its distance is
  // how far it goes, so one gesture settles both.
  private drag(at: Point): void {
    if (this.origin === undefined) {
      return;
    }
    if (this.phase === "moving") {
      this.moveOrigin(at);
      return;
    }
    const from = this.worldOf(this.origin);
    this.aim = facingToward(from, at) ?? this.aim;
    const away = (lengthOf(from, at) / this.grid.cellSize) * this.rule.cellSize;
    this.reach = snapSize(away, this.rule);
    this.notify();
  }

  // The release leaves the area where it is.
  private settle(): void {
    this.phase = "idle";
    this.notify();
  }

  // The wheel turns what is under the hand. It is taken only while the
  // pointer is down, so the camera keeps the wheel the rest of the time.
  private turn(event: WheelEvent): void {
    if (this.origin === undefined) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? FINE_TURN : TURN_STEP;
    this.aim = normalizeDegrees(this.aim + (event.deltaY > 0 ? step : -step));
    this.notify();
  }

  // Put the origin where the pointer says, as near as the snap allows.
  private moveOrigin(world: Point): void {
    const under = this.inUnit(world);
    const wanted =
      this.grab === undefined ? under : { x: under.x - this.grab.x, y: under.y - this.grab.y };
    const at = snapOrigin(wanted, this.snap, this.rule);
    this.origin = this.originFor(worldToCell(this.grid, this.worldOf({ ...at, z: 0 })), at);
    this.notify();
  }

  // An origin sits in the rule's unit; the pointer is in world pixels,
  // so the grid does the one conversion between them.
  private worldOf(origin: Spot): Point {
    return cellPointToWorld(this.grid, spotToCellPoint(origin, this.rule));
  }

  private inUnit(at: Point): { x: number; y: number } {
    const cells = worldToCellPoint(this.grid, at);
    return { x: cells.x * this.rule.cellSize, y: cells.y * this.rule.cellSize };
  }

  private notify(): void {
    this.listeners.emit(this.placed);
  }
}

// An area turned to face `aim`; a circle faces nowhere.
function aimed(area: Area, aim: number): Area {
  return area.kind === "circle" ? area : { ...area, aim };
}

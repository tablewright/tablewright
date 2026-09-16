/**
 * ─ Token layer ─
 *
 * Tokens on the board and the gestures on them: hover, select, drag,
 * step with the keys, and turn in place. A press on a token stops the
 * native event, so the camera never pans from it. Movement is reported
 * once per gesture end, never per pointer move. A drag reads the graph
 * as it goes, and the drop lands, asks for a dash, or refuses.
 * Design: docs/design.md §5 "Moving shows movement only".
 */

import type { Visibility } from "@tablewright/schema";
import { Graphics, type Container, type FederatedPointerEvent } from "pixi.js";
import type { Point } from "../geometry.js";
import {
  cellCenter,
  snapToCellCenter,
  worldToCell,
  type Cell,
  type SquareGrid,
} from "../grid/square-grid.js";
import type { DragRoute } from "../move/drag-route.js";
import { Listeners } from "../stage/listeners.js";
import type { Mover } from "../topology/cost.js";
import type { Budget } from "../topology/route.js";
import { facingBetween, facingToward, normalizeDegrees } from "./facing.js";
import { DRAG_THRESHOLD_PX, HOLD_MS, afterHold, isTypingTarget } from "./press.js";
import { keptAlphaIf } from "../seen.js";
import { TokenSprite, type TokenStyle } from "./token-sprite.js";

/** What the layer needs to show a token; the scene owns everything else. */
export interface TokenView {
  readonly id: string;
  readonly label: string;
  readonly cell: Cell;
  /** Degrees clockwise from north. */
  readonly facing: number;
  /** The height the field gives the token's cell, worn as a badge when not zero. */
  readonly height?: number;
  /** Who is moving: the speeds and Strength a move is priced by, from the sheet. */
  readonly mover?: Mover;
  /** What this turn allows, from the sheet; a token standing for none has no limit. */
  readonly budget?: Budget;
  /** Who may see it stand there; the party by default, as the scene has it. */
  readonly visibility?: Visibility;
  /** Whether it reads faint: kept back from the table, but shown to this seat. */
  readonly isKept?: boolean;
  /**
   * How far it stands above the floor under it: a flier's own height.
   * Its place in the scene is `height` plus this, so an area tests it
   * where it actually is rather than where the ground is.
   */
  readonly elevation?: number;
}

/** The right button on a token: which one, and where on the screen. */
export interface TokenAsk {
  readonly id: string;
  readonly at: Point;
}

export type TokenAskListener = (ask: TokenAsk) => void;

/** One committed move: where the token now stands and which way it faces. */
export interface TokenMove {
  readonly id: string;
  readonly cell: Cell;
  readonly facing: number;
}

/** The one question a move asks: the way costs more than the movement left. */
export interface DashAsk {
  readonly id: string;
  /** What the way costs, in the rule's unit. */
  readonly cost: number;
  /** Movement left this turn before the dash, in the same unit. */
  readonly left: number;
  readonly unit: string;
}

export type TokenMoveListener = (move: TokenMove) => void;
export type TokenSelectListener = (id: string | undefined) => void;
/** Hears the question while it stands, and nothing once it is answered. */
export type DashAskListener = (ask: DashAsk | undefined) => void;

// A drop waiting on the dash question: the token stands at the destination
// until the answer comes, and goes back to `origin` if it is no.
interface PendingDash extends DashAsk {
  readonly cell: Cell;
  readonly facing: number | undefined;
  readonly origin: Point;
  readonly originFacing: number;
}

const GHOST_WIDTH = 2;
const GHOST_ALPHA = 0.7;

// Arrow keys and WASD both step the selected token one cell.
const STEP_KEYS: Readonly<Record<string, { dc: number; dr: number }>> = {
  ArrowUp: { dc: 0, dr: -1 },
  ArrowDown: { dc: 0, dr: 1 },
  ArrowLeft: { dc: -1, dr: 0 },
  ArrowRight: { dc: 1, dr: 0 },
  w: { dc: 0, dr: -1 },
  s: { dc: 0, dr: 1 },
  a: { dc: -1, dr: 0 },
  d: { dc: 1, dr: 0 },
  W: { dc: 0, dr: -1 },
  S: { dc: 0, dr: 1 },
  A: { dc: -1, dr: 0 },
  D: { dc: 1, dr: 0 },
};

// A press starts undecided and becomes a drag, a turn, or a click on release.
type PressMode = "pending" | "drag" | "turn";

interface PressState {
  readonly id: string;
  readonly pointerId: number;
  readonly canvas: HTMLElement;
  readonly canvasLeft: number;
  readonly canvasTop: number;
  readonly startX: number;
  readonly startY: number;
  readonly origin: Point;
  readonly originFacing: number;
  mode: PressMode;
  holdTimer: number | undefined;
  /** When the hold timer ran, until the next move has judged it; unset for a corner turn. */
  holdStamp: number | undefined;
}

/** Renders `TokenView`s into a container and turns gestures into move and select events. */
export class TokenLayer {
  private readonly container: Container;
  private readonly ghost = new Graphics();
  private readonly sprites = new Map<string, TokenSprite>();
  private readonly moveListeners = new Listeners<TokenMove>();
  private readonly selectListeners = new Listeners<string | undefined>();
  private readonly askListeners = new Listeners<TokenAsk>();
  private movable = true;
  private readonly dashListeners = new Listeners<DashAsk | undefined>();
  private readonly route: DragRoute;
  private grid: SquareGrid;
  private style: TokenStyle;
  private selected: string | undefined;
  private press: PressState | undefined;
  private pending: PendingDash | undefined;

  constructor(container: Container, grid: SquareGrid, style: TokenStyle, route: DragRoute) {
    this.container = container;
    this.grid = grid;
    this.style = style;
    this.route = route;
    this.ghost.visible = false;
    container.addChild(this.ghost);
    window.addEventListener("keydown", this.onKeyDown);
  }

  /** Whether presses reach the tokens; off while Build mode draws over them. */
  setInteractive(enabled: boolean): void {
    this.container.eventMode = enabled ? "passive" : "none";
  }

  /**
   * Whether this hand may move what stands on the board. A hand that may
   * not still chooses a token and asks what may be done with it: it
   * simply cannot drag it, turn it, or step it with the keys.
   */
  setMovable(movable: boolean): void {
    this.movable = movable;
  }

  /** Make the layer show exactly `tokens`, reusing sprites by id. */
  set(tokens: readonly TokenView[]): void {
    const seen = new Set<string>();
    for (const token of tokens) {
      seen.add(token.id);
      const existing = this.sprites.get(token.id);
      if (existing === undefined) {
        this.add(token);
      } else {
        existing.setLabel(token.label);
        existing.setBadge(badgeOf(token));
        existing.view.alpha = keptAlphaIf(token.isKept);
        if (this.press?.id !== token.id && this.pending?.id !== token.id) {
          existing.setFacing(token.facing);
          existing.setPosition(cellCenter(this.grid, token.cell));
        }
      }
    }
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  setGrid(grid: SquareGrid, tokens: readonly TokenView[]): void {
    this.grid = grid;
    for (const sprite of this.sprites.values()) {
      sprite.setCellSize(grid.cellSize);
    }
    this.set(tokens);
  }

  setStyle(style: TokenStyle): void {
    this.style = style;
    for (const sprite of this.sprites.values()) {
      sprite.setStyle(style);
    }
  }

  /** The selected token, if any. */
  get selectedId(): string | undefined {
    return this.selected;
  }

  select(id: string | undefined): void {
    if (id === this.selected) {
      return;
    }
    this.sprites.get(this.selected ?? "")?.setSelected(false);
    this.selected = id;
    this.sprites.get(id ?? "")?.setSelected(true);
    this.selectListeners.emit(id);
  }

  onMove(listener: TokenMoveListener): () => void {
    return this.moveListeners.add(listener);
  }

  /** Hear the right button ask what may be done with one. */
  onAsk(listener: TokenAskListener): () => void {
    return this.askListeners.add(listener);
  }

  onSelect(listener: TokenSelectListener): () => void {
    return this.selectListeners.add(listener);
  }

  /** Hear the dash question as it is asked and answered. Returns the unsubscribe. */
  onDashAsk(listener: DashAskListener): () => void {
    return this.dashListeners.add(listener);
  }

  /** Answer the dash question: the token moves and spends the action, or stays. */
  answerDash(use: boolean): void {
    const pending = this.pending;
    if (pending === undefined) {
      return;
    }
    this.pending = undefined;
    this.route.end();
    const sprite = this.sprites.get(pending.id);
    if (sprite !== undefined) {
      if (use) {
        this.commitMove(pending.id, sprite, pending.cell, pending.facing);
      } else {
        sprite.setPosition(pending.origin);
        sprite.setFacing(pending.originFacing);
      }
    }
    this.askDash(undefined);
  }

  destroy(): void {
    this.endPress();
    this.route.end();
    window.removeEventListener("keydown", this.onKeyDown);
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
    this.ghost.destroy();
  }

  private add(token: TokenView): void {
    const sprite = new TokenSprite(token.label, this.grid.cellSize, this.style);
    // Kept back from the table: the seats that may still see it are shown
    // it faintly, as a measure that is not the table's reads faint.
    sprite.view.alpha = keptAlphaIf(token.isKept);
    sprite.setPosition(cellCenter(this.grid, token.cell));
    sprite.setFacing(token.facing);
    sprite.setBadge(badgeOf(token));
    sprite.view.on("pointerover", () => sprite.setHovered(true));
    sprite.view.on("pointerout", () => sprite.setHovered(false));
    sprite.view.on("pointerdown", (event: FederatedPointerEvent) => {
      // The right button asks what may be done with this one instead of moving it.
      if (event.button === 2) {
        event.stopPropagation();
        this.askListeners.emit({ id: token.id, at: { x: event.global.x, y: event.global.y } });
        return;
      }
      // A selected token covers its whole cell: outside the disc is a turn handle.
      const local = sprite.view.toLocal(event.global);
      const isOnDisc = Math.hypot(local.x, local.y) <= sprite.discRadius;
      this.beginPress(token.id, event, isOnDisc ? "pending" : "turn");
    });
    this.container.addChild(sprite.view);
    this.sprites.set(token.id, sprite);
  }

  private beginPress(id: string, event: FederatedPointerEvent, mode: PressMode): void {
    if (event.button !== 0 || this.press !== undefined) {
      return;
    }
    // Let through, the press would pan the board and end as a tap that deselects.
    if (!this.movable) {
      if (event.nativeEvent instanceof PointerEvent) {
        event.nativeEvent.stopPropagation();
      }
      this.select(id);
      return;
    }
    const sprite = this.sprites.get(id);
    const native = event.nativeEvent;
    if (
      sprite === undefined ||
      !(native instanceof PointerEvent) ||
      !(native.target instanceof HTMLElement)
    ) {
      return;
    }
    native.stopPropagation();
    const canvas = native.target;
    const rect = canvas.getBoundingClientRect();
    canvas.setPointerCapture(native.pointerId);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.press = {
      id,
      pointerId: native.pointerId,
      canvas,
      canvasLeft: rect.left,
      canvasTop: rect.top,
      startX: native.clientX,
      startY: native.clientY,
      origin: sprite.position,
      originFacing: sprite.facing,
      mode,
      holdTimer: undefined,
      holdStamp: undefined,
    };
    if (mode === "turn") {
      this.enterTurn(sprite);
    } else {
      this.press.holdTimer = window.setTimeout(() => this.onHoldElapsed(id), HOLD_MS);
    }
  }

  private onHoldElapsed(id: string): void {
    const press = this.press;
    const sprite = this.sprites.get(id);
    if (
      press === undefined ||
      press.id !== id ||
      press.mode !== "pending" ||
      sprite === undefined
    ) {
      return;
    }
    press.holdTimer = undefined;
    press.holdStamp = performance.now();
    press.mode = "turn";
    this.enterTurn(sprite);
  }

  private enterTurn(sprite: TokenSprite): void {
    if (this.press !== undefined) {
      this.select(this.press.id);
    }
    sprite.setRotating(true);
  }

  private toWorld(press: PressState, event: PointerEvent): Point {
    return this.container.toLocal({
      x: event.clientX - press.canvasLeft,
      y: event.clientY - press.canvasTop,
    });
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const press = this.press;
    if (press === undefined || event.pointerId !== press.pointerId) {
      return;
    }
    const sprite = this.sprites.get(press.id);
    if (sprite === undefined) {
      return;
    }
    if (press.mode === "pending") {
      const travel = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
      if (travel < DRAG_THRESHOLD_PX) {
        return;
      }
      window.clearTimeout(press.holdTimer);
      press.holdTimer = undefined;
      this.beginDrag(press, sprite);
    } else if (press.mode === "turn" && press.holdStamp !== undefined) {
      // The timer may have run before a move that was already on its way: the
      // move's own clock decides whether this press was a drag all along.
      const travel = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
      const verdict = afterHold(event.timeStamp, press.holdStamp, travel);
      press.holdStamp = undefined;
      if (verdict === "drag") {
        sprite.setRotating(false);
        sprite.setFacing(press.originFacing);
        this.beginDrag(press, sprite);
      }
    }
    this.follow(press, sprite, event);
  };

  private beginDrag(press: PressState, sprite: TokenSprite): void {
    press.mode = "drag";
    sprite.setDragging(true);
    this.container.addChild(sprite.view);
    this.ghost.visible = true;
    // A new drag drops whatever question the last one left standing.
    this.answerDash(false);
    this.route.begin(press.id, worldToCell(this.grid, press.origin));
  }

  // Move the token or its facing to where the pointer is now.
  private follow(press: PressState, sprite: TokenSprite, event: PointerEvent): void {
    const world = this.toWorld(press, event);
    if (press.mode === "turn") {
      const facing = facingToward(sprite.position, world);
      if (facing !== undefined) {
        sprite.setFacing(facing);
      }
      return;
    }
    sprite.setPosition(world);
    this.drawGhost(snapToCellCenter(this.grid, world));
    this.route.show(worldToCell(this.grid, world), world);
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    if (press === undefined || event.pointerId !== press.pointerId) {
      return;
    }
    const sprite = this.sprites.get(press.id);
    if (sprite !== undefined) {
      if (press.mode !== "pending") {
        this.follow(press, sprite, event);
      }
      if (press.mode === "drag") {
        this.drop(press, sprite, worldToCell(this.grid, sprite.position));
      } else if (press.mode === "turn") {
        this.commitMove(press.id, sprite, worldToCell(this.grid, sprite.position), sprite.facing);
      } else {
        this.select(press.id);
      }
    }
    this.endPress();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.press !== undefined && event.pointerId === this.press.pointerId) {
      this.cancelPress();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event)) {
      return;
    }
    if (event.key === "Escape") {
      if (this.pending !== undefined) {
        event.preventDefault();
        this.answerDash(false);
      } else if (this.press !== undefined) {
        this.cancelPress();
      } else {
        this.select(undefined);
      }
      return;
    }
    const step = this.movable ? STEP_KEYS[event.key] : undefined;
    if (step !== undefined && this.press === undefined) {
      event.preventDefault();
      this.moveSelectedBy(step.dc, step.dr);
    }
  };

  // One press moves the selected token one cell: the same scene command as a
  // drop, so the move listeners fire exactly as they do for a drag.
  private moveSelectedBy(dc: number, dr: number): void {
    const id = this.selected;
    const sprite = id === undefined ? undefined : this.sprites.get(id);
    if (id === undefined || sprite === undefined) {
      return;
    }
    const from = worldToCell(this.grid, sprite.position);
    const cell = { col: from.col + dc, row: from.row + dr };
    this.commitMove(id, sprite, cell, facingBetween(from, cell));
  }

  private drop(press: PressState, sprite: TokenSprite, cell: Cell): void {
    const shown = this.route.shown;
    const from = worldToCell(this.grid, press.origin);
    const facing = facingBetween(from, cell);
    if (shown === undefined || shown.choice.phase === "move") {
      this.route.end();
      this.commitMove(press.id, sprite, cell, facing);
      return;
    }
    if (shown.choice.phase === "dash") {
      this.place(sprite, cell, facing);
      this.pending = {
        id: press.id,
        cost: shown.choice.route?.cost ?? 0,
        left: shown.reach,
        unit: shown.unit,
        cell,
        facing,
        origin: press.origin,
        originFacing: press.originFacing,
      };
      this.askDash(this.pending);
      return;
    }
    this.route.end();
    sprite.setPosition(press.origin);
    sprite.setFacing(press.originFacing);
  }

  // A move faces the token along its travel; a move that went nowhere keeps
  // its facing.
  private commitMove(
    id: string,
    sprite: TokenSprite,
    cell: Cell,
    travelFacing: number | undefined
  ): void {
    const facing = this.place(sprite, cell, travelFacing);
    this.moveListeners.emit({ id, cell, facing });
  }

  // Stand the sprite on a cell, facing the way it travelled. The scene keeps
  // whole degrees, so the facing rounds here and the sprite shows the same.
  private place(sprite: TokenSprite, cell: Cell, travelFacing: number | undefined): number {
    const facing = Math.round(normalizeDegrees(travelFacing ?? sprite.facing)) % 360;
    sprite.setPosition(cellCenter(this.grid, cell));
    sprite.setFacing(facing);
    return facing;
  }

  private askDash(ask: DashAsk | undefined): void {
    this.dashListeners.emit(ask);
  }

  private cancelPress(): void {
    const press = this.press;
    this.route.end();
    if (press !== undefined) {
      const sprite = this.sprites.get(press.id);
      sprite?.setPosition(press.origin);
      sprite?.setFacing(press.originFacing);
    }
    this.endPress();
  }

  private endPress(): void {
    const press = this.press;
    if (press === undefined) {
      return;
    }
    window.clearTimeout(press.holdTimer);
    const sprite = this.sprites.get(press.id);
    sprite?.setDragging(false);
    sprite?.setRotating(false);
    this.ghost.visible = false;
    press.canvas.removeEventListener("pointermove", this.onPointerMove);
    press.canvas.removeEventListener("pointerup", this.onPointerUp);
    press.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    if (press.canvas.hasPointerCapture(press.pointerId)) {
      press.canvas.releasePointerCapture(press.pointerId);
    }
    this.press = undefined;
  }

  private drawGhost(centre: Point): void {
    const radius = (this.grid.cellSize * 0.8) / 2 + GHOST_WIDTH;
    this.ghost
      .clear()
      .circle(centre.x, centre.y, radius)
      .stroke({ width: GHOST_WIDTH, color: this.style.hover.rgb, alpha: GHOST_ALPHA });
  }
}

// A token on raised or sunken ground says so; at ground level it says nothing.
function badgeOf(token: TokenView): string | undefined {
  const height = token.height ?? 0;
  return height === 0 ? undefined : `${height > 0 ? "+" : "−"}${Math.abs(Math.round(height))}`;
}

/**
 * ─ Token press ─
 *
 * One press on a token, from the button going down to its release: held
 * still it turns the token, moved it drags it, let go at once it selects
 * it. The layer owns the sprites, the selection and what a drop does; the
 * press tells it which, and keeps the ghost that shows where a drag would
 * land.
 * Design: docs/design.md §5 "Moving shows movement only".
 */

import { Graphics, type Container, type FederatedPointerEvent } from "pixi.js";
import { snapToCellCenter, worldToCell, type Cell, type SquareGrid } from "../grid/square-grid.js";
import type { DragRoute } from "../move/drag-route.js";
import type { Point } from "../shared/geometry.js";
import { facingToward } from "./facing.js";
import { DRAG_THRESHOLD_PX, HOLD_MS, afterHold } from "./press.js";
import type { TokenSprite, TokenStyle } from "./token-sprite.js";

const GHOST_WIDTH = 2;
const GHOST_ALPHA = 0.7;

// A press starts undecided and becomes a drag, a turn, or a click on release.
export type PressMode = "pending" | "drag" | "turn";

export interface PressState {
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

/** What the press asks of the layer that owns the tokens. */
export interface TokenPressOwner {
  /** The grid the tokens stand on, as it is now. */
  grid(): SquareGrid;
  /** The tokens' colours, as they are now. */
  style(): TokenStyle;
  /** Whether this hand may move what stands on the board. */
  isMovable(): boolean;
  /** The sprite standing for a token, if it is shown. */
  spriteOf(id: string): TokenSprite | undefined;
  select(id: string | undefined): void;
  /** Answer the dash question, if one stands. */
  answerDash(use: boolean): void;
  /** A drag let go over `cell`. */
  drop(press: PressState, sprite: TokenSprite, cell: Cell): void;
  /** A turn let go: the token stands on `cell`, facing `travelFacing`. */
  commitMove(id: string, sprite: TokenSprite, cell: Cell, travelFacing: number | undefined): void;
}

/** The press held on a token, if any, and what it has become. */
export class TokenPress {
  private readonly container: Container;
  private readonly route: DragRoute;
  private readonly owner: TokenPressOwner;
  private readonly ghost = new Graphics();
  private press: PressState | undefined;

  constructor(container: Container, route: DragRoute, owner: TokenPressOwner) {
    this.container = container;
    this.route = route;
    this.owner = owner;
    this.ghost.visible = false;
    container.addChild(this.ghost);
  }

  /** The press held, if any. */
  get held(): PressState | undefined {
    return this.press;
  }

  beginPress(id: string, event: FederatedPointerEvent, mode: PressMode): void {
    if (event.button !== 0 || this.press !== undefined) {
      return;
    }
    // Let through, the press would pan the board and end as a tap that deselects.
    if (!this.owner.isMovable()) {
      if (event.nativeEvent instanceof PointerEvent) {
        event.nativeEvent.stopPropagation();
      }
      this.owner.select(id);
      return;
    }
    const sprite = this.owner.spriteOf(id);
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
    const sprite = this.owner.spriteOf(id);
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
      this.owner.select(this.press.id);
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
    const sprite = this.owner.spriteOf(press.id);
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
    this.owner.answerDash(false);
    this.route.begin(press.id, worldToCell(this.owner.grid(), press.origin));
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
    this.drawGhost(snapToCellCenter(this.owner.grid(), world));
    this.route.show(worldToCell(this.owner.grid(), world), world);
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    if (press === undefined || event.pointerId !== press.pointerId) {
      return;
    }
    const sprite = this.owner.spriteOf(press.id);
    if (sprite !== undefined) {
      if (press.mode !== "pending") {
        this.follow(press, sprite, event);
      }
      if (press.mode === "drag") {
        this.owner.drop(press, sprite, worldToCell(this.owner.grid(), sprite.position));
      } else if (press.mode === "turn") {
        const cell = worldToCell(this.owner.grid(), sprite.position);
        this.owner.commitMove(press.id, sprite, cell, sprite.facing);
      } else {
        this.owner.select(press.id);
      }
    }
    this.endPress();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.press !== undefined && event.pointerId === this.press.pointerId) {
      this.cancelPress();
    }
  };

  cancelPress(): void {
    const press = this.press;
    this.route.end();
    if (press !== undefined) {
      const sprite = this.owner.spriteOf(press.id);
      sprite?.setPosition(press.origin);
      sprite?.setFacing(press.originFacing);
    }
    this.endPress();
  }

  endPress(): void {
    const press = this.press;
    if (press === undefined) {
      return;
    }
    window.clearTimeout(press.holdTimer);
    const sprite = this.owner.spriteOf(press.id);
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

  destroy(): void {
    this.endPress();
    this.ghost.destroy();
  }

  private drawGhost(centre: Point): void {
    const radius = (this.owner.grid().cellSize * 0.8) / 2 + GHOST_WIDTH;
    this.ghost
      .clear()
      .circle(centre.x, centre.y, radius)
      .stroke({ width: GHOST_WIDTH, color: this.owner.style().hover.rgb, alpha: GHOST_ALPHA });
  }
}

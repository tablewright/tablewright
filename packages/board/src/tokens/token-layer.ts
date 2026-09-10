/**
 * ─ Token layer ─
 *
 * Tokens on the board and the gestures on them: hover, select, drag
 * with a live snap preview, drop on a cell centre, arrow or WASD keys
 * stepping the selected token one cell, and two ways to turn in
 * place: press and hold a token, or press the selected token's cell
 * outside its disc, where the corner brackets are, then the facing
 * follows the pointer until release.
 * A press on a token stops the native event so the camera never pans
 * from it (design §5). Movement is reported once per drop, key press,
 * or release of a turn, never per pointer move: the scene commits on
 * gesture end.
 */

import { Graphics, type Container, type FederatedPointerEvent } from "pixi.js";
import type { Point } from "../geometry.js";
import {
  cellCenter,
  snapToCellCenter,
  worldToCell,
  type Cell,
  type SquareGrid,
} from "../grid/square-grid.js";
import { facingBetween, facingToward } from "./facing.js";
import { DRAG_THRESHOLD_PX, HOLD_MS, afterHold } from "./press.js";
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
}

/** One committed move: where the token now stands and which way it faces. */
export interface TokenMove {
  readonly id: string;
  readonly cell: Cell;
  readonly facing: number;
}

export type TokenMoveListener = (move: TokenMove) => void;
export type TokenSelectListener = (id: string | undefined) => void;

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

// Keys typed into a field are text, not token commands.
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || target.matches("input, textarea, select");
}

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
  private readonly moveListeners = new Set<TokenMoveListener>();
  private readonly selectListeners = new Set<TokenSelectListener>();
  private grid: SquareGrid;
  private style: TokenStyle;
  private selected: string | undefined;
  private press: PressState | undefined;

  constructor(container: Container, grid: SquareGrid, style: TokenStyle) {
    this.container = container;
    this.grid = grid;
    this.style = style;
    this.ghost.visible = false;
    container.addChild(this.ghost);
    window.addEventListener("keydown", this.onKeyDown);
  }

  /** Whether presses reach the tokens; off while Build mode draws over them. */
  setInteractive(enabled: boolean): void {
    this.container.eventMode = enabled ? "passive" : "none";
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
        if (this.press?.id !== token.id) {
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
    for (const listener of this.selectListeners) {
      listener(id);
    }
  }

  onMove(listener: TokenMoveListener): () => void {
    this.moveListeners.add(listener);
    return () => {
      this.moveListeners.delete(listener);
    };
  }

  onSelect(listener: TokenSelectListener): () => void {
    this.selectListeners.add(listener);
    return () => {
      this.selectListeners.delete(listener);
    };
  }

  destroy(): void {
    this.endPress();
    window.removeEventListener("keydown", this.onKeyDown);
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
    this.ghost.destroy();
  }

  private add(token: TokenView): void {
    const sprite = new TokenSprite(token.label, this.grid.cellSize, this.style);
    sprite.setPosition(cellCenter(this.grid, token.cell));
    sprite.setFacing(token.facing);
    sprite.setBadge(badgeOf(token));
    sprite.view.on("pointerover", () => sprite.setHovered(true));
    sprite.view.on("pointerout", () => sprite.setHovered(false));
    sprite.view.on("pointerdown", (event: FederatedPointerEvent) => {
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
    const sprite = this.sprites.get(id);
    const native = event.nativeEvent;
    if (
      sprite === undefined ||
      !(native instanceof PointerEvent) ||
      !(native.target instanceof HTMLElement)
    ) {
      return;
    }
    // The press belongs to the token; the board element must not start a pan.
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
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    if (press === undefined || event.pointerId !== press.pointerId) {
      return;
    }
    const sprite = this.sprites.get(press.id);
    if (sprite !== undefined) {
      // The release position is the gesture's last word: engines may coalesce
      // or reorder the final move, so it is applied here rather than trusted.
      if (press.mode !== "pending") {
        this.follow(press, sprite, event);
      }
      if (press.mode === "drag") {
        const cell = worldToCell(this.grid, sprite.position);
        const from = worldToCell(this.grid, press.origin);
        this.commitMove(press.id, sprite, cell, facingBetween(from, cell));
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
    // The first element on the composed path is the real target, even inside
    // another component's shadow tree; `event.target` is retargeted to its host.
    if (isEditable(event.composedPath()[0] ?? event.target)) {
      return;
    }
    if (event.key === "Escape") {
      if (this.press !== undefined) {
        this.cancelPress();
      } else {
        this.select(undefined);
      }
      return;
    }
    const step = STEP_KEYS[event.key];
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

  // A move faces the token along its travel; a move that went nowhere keeps its facing.
  private commitMove(
    id: string,
    sprite: TokenSprite,
    cell: Cell,
    travelFacing: number | undefined
  ): void {
    const facing = travelFacing ?? sprite.facing;
    sprite.setPosition(cellCenter(this.grid, cell));
    sprite.setFacing(facing);
    for (const listener of this.moveListeners) {
      listener({ id, cell, facing });
    }
  }

  private cancelPress(): void {
    const press = this.press;
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

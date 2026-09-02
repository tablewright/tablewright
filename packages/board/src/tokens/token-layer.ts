/**
 * ─ Token layer ─
 *
 * Tokens on the board and the pointer gestures on them: hover, select,
 * drag with a live snap preview, drop on a cell centre. A press on a
 * token stops the native event so the camera never pans from it
 * (design §5). Movement is reported once per drop, never per move:
 * the scene commits on gesture end.
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
import { TokenSprite, type TokenStyle } from "./token-sprite.js";

/** What the layer needs to show a token; the scene owns everything else. */
export interface TokenView {
  readonly id: string;
  readonly label: string;
  readonly cell: Cell;
}

export type TokenMoveListener = (id: string, cell: Cell) => void;
export type TokenSelectListener = (id: string | undefined) => void;

// Pointer travel before a press becomes a drag rather than a click.
const DRAG_THRESHOLD_PX = 4;
const GHOST_WIDTH = 2;
const GHOST_ALPHA = 0.7;

interface DragState {
  readonly id: string;
  readonly pointerId: number;
  readonly canvas: HTMLElement;
  readonly canvasLeft: number;
  readonly canvasTop: number;
  readonly startX: number;
  readonly startY: number;
  readonly origin: Point;
  isActive: boolean;
}

/** Renders `TokenView`s into a container and turns pointer gestures into move and select events. */
export class TokenLayer {
  private readonly container: Container;
  private readonly ghost = new Graphics();
  private readonly sprites = new Map<string, TokenSprite>();
  private readonly moveListeners = new Set<TokenMoveListener>();
  private readonly selectListeners = new Set<TokenSelectListener>();
  private grid: SquareGrid;
  private style: TokenStyle;
  private selectedId: string | undefined;
  private drag: DragState | undefined;

  constructor(container: Container, grid: SquareGrid, style: TokenStyle) {
    this.container = container;
    this.grid = grid;
    this.style = style;
    this.ghost.visible = false;
    container.addChild(this.ghost);
    window.addEventListener("keydown", this.onKeyDown);
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
        if (this.drag?.id !== token.id) {
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

  select(id: string | undefined): void {
    if (id === this.selectedId) {
      return;
    }
    this.sprites.get(this.selectedId ?? "")?.setSelected(false);
    this.selectedId = id;
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
    this.endDrag();
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
    sprite.view.on("pointerover", () => sprite.setHovered(true));
    sprite.view.on("pointerout", () => sprite.setHovered(false));
    sprite.view.on("pointerdown", (event: FederatedPointerEvent) =>
      this.beginPress(token.id, event)
    );
    this.container.addChild(sprite.view);
    this.sprites.set(token.id, sprite);
  }

  private beginPress(id: string, event: FederatedPointerEvent): void {
    if (event.button !== 0 || this.drag !== undefined) {
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
    this.drag = {
      id,
      pointerId: native.pointerId,
      canvas,
      canvasLeft: rect.left,
      canvasTop: rect.top,
      startX: native.clientX,
      startY: native.clientY,
      origin: sprite.position,
      isActive: false,
    };
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === undefined || event.pointerId !== drag.pointerId) {
      return;
    }
    const sprite = this.sprites.get(drag.id);
    if (sprite === undefined) {
      return;
    }
    if (!drag.isActive) {
      const travel = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (travel < DRAG_THRESHOLD_PX) {
        return;
      }
      drag.isActive = true;
      sprite.setDragging(true);
      this.container.addChild(sprite.view);
      this.ghost.visible = true;
    }
    const world = this.container.toLocal({
      x: event.clientX - drag.canvasLeft,
      y: event.clientY - drag.canvasTop,
    });
    sprite.setPosition(world);
    this.drawGhost(snapToCellCenter(this.grid, world));
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === undefined || event.pointerId !== drag.pointerId) {
      return;
    }
    const sprite = this.sprites.get(drag.id);
    if (sprite !== undefined) {
      if (drag.isActive) {
        const cell = worldToCell(this.grid, sprite.position);
        sprite.setPosition(cellCenter(this.grid, cell));
        for (const listener of this.moveListeners) {
          listener(drag.id, cell);
        }
      } else {
        this.select(drag.id);
      }
    }
    this.endDrag();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.drag !== undefined && event.pointerId === this.drag.pointerId) {
      this.cancelDrag();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }
    if (this.drag !== undefined) {
      this.cancelDrag();
    } else {
      this.select(undefined);
    }
  };

  private cancelDrag(): void {
    const drag = this.drag;
    if (drag !== undefined) {
      this.sprites.get(drag.id)?.setPosition(drag.origin);
    }
    this.endDrag();
  }

  private endDrag(): void {
    const drag = this.drag;
    if (drag === undefined) {
      return;
    }
    this.sprites.get(drag.id)?.setDragging(false);
    this.ghost.visible = false;
    drag.canvas.removeEventListener("pointermove", this.onPointerMove);
    drag.canvas.removeEventListener("pointerup", this.onPointerUp);
    drag.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    if (drag.canvas.hasPointerCapture(drag.pointerId)) {
      drag.canvas.releasePointerCapture(drag.pointerId);
    }
    this.drag = undefined;
  }

  private drawGhost(centre: Point): void {
    const radius = (this.grid.cellSize * 0.8) / 2 + GHOST_WIDTH;
    this.ghost
      .clear()
      .circle(centre.x, centre.y, radius)
      .stroke({ width: GHOST_WIDTH, color: this.style.hover.rgb, alpha: GHOST_ALPHA });
  }
}

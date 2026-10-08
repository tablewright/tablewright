/**
 * ─ Select ─
 *
 * The hand that picks. A press let go in place is a click; dragged past a
 * few pixels it draws a box, and the release picks what the box touches.
 * Shift at the press adds to what is picked rather than replacing it.
 * Every left press is Select's while it is held but one on something
 * picked, which carries it as Move would; so a drag on empty board draws
 * a box instead of panning. The middle button still pans, and a second
 * finger hands the first to the camera so the two pinch.
 * Design: docs/templates.md "The Select tool".
 */

import { Graphics, type Container } from "pixi.js";
import { dashedLine } from "../draw/strokes.js";
import { cellPointToWorld, worldToCellPoint, type SquareGrid } from "../grid/square-grid.js";
import { pointOn, type Point } from "../shared/geometry.js";
import { PointerSession } from "../shared/pointer-session.js";
import { FALLBACK } from "../theme/board-theme.js";
import type { PackedColor } from "../theme/css-color.js";
import { pickStyle } from "../theme/styles.js";
import { DRAG_THRESHOLD_PX } from "../tokens/press.js";
import type { PickBox } from "./box.js";

/** The colour Select draws its box in. */
export interface PickStyle {
  readonly box: PackedColor;
}

/** What a press with Select came to, in cells, and whether Shift was held at the press. */
export type PickGesture =
  | { readonly kind: "click"; readonly at: Point; readonly isAdding: boolean }
  | { readonly kind: "box"; readonly box: PickBox; readonly isAdding: boolean };

/** What Select tells the hand that wires it to the board. */
export interface SelectOwner {
  /** Whether a press at `at`, in cells, with Shift held or not, picks; one that carries is not Select's. */
  takes(at: Point, isAdding: boolean): boolean;
  /** A click or a box, let go. */
  pick(gesture: PickGesture): void;
  /** Whether a box is being drawn; Escape is the box's while one is. */
  hold(on: boolean): void;
  /** A second finger landed: the camera takes the one held, still down at `at` on the page. */
  handOff(pointerId: number, at: { clientX: number; clientY: number }): void;
}

const DEFAULT_STYLE: PickStyle = pickStyle(FALLBACK);

// The box: a faint wash inside and a dashed edge, its dashes a share of a
// cell so the box reads the same at any zoom as a template's trace does.
const FILL_ALPHA = 0.08;
const EDGE_WIDTH = 2;
const DASH = 0.2;
const GAP = 0.15;

// The press Select holds: where it landed, in cells and on the page.
interface Press {
  readonly pointerId: number;
  readonly from: Point;
  readonly startX: number;
  readonly startY: number;
  readonly isAdding: boolean;
  clientX: number;
  clientY: number;
  box: PickBox | undefined;
}

/** Picks with a click or a box while active. */
export class SelectTool {
  private readonly owner: SelectOwner;
  private readonly session: PointerSession;
  private readonly drawn = new Graphics();
  private grid: SquareGrid;
  private style: PickStyle = DEFAULT_STYLE;
  private press: Press | undefined;

  /** `toWorld` maps a point on the canvas to world pixels: the camera's inverse. */
  constructor(
    canvas: HTMLElement,
    container: Container,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point,
    owner: SelectOwner
  ) {
    this.grid = grid;
    this.owner = owner;
    container.addChild(this.drawn);
    this.session = new PointerSession(canvas, toWorld, {
      takes: (event) =>
        this.owner.takes(this.cellsOf(toWorld(pointOn(canvas, event))), event.shiftKey),
      onDown: (at, event) => {
        this.press = {
          pointerId: event.pointerId,
          from: worldToCellPoint(this.grid, at),
          startX: event.clientX,
          startY: event.clientY,
          isAdding: event.shiftKey,
          clientX: event.clientX,
          clientY: event.clientY,
          box: undefined,
        };
        return true;
      },
      onMove: (at, event) => this.drag(at, event),
      onUp: (at) => {
        const press = this.press;
        if (press !== undefined) {
          const isAdding = press.isAdding;
          this.owner.pick(
            press.box === undefined
              ? { kind: "click", at: press.from, isAdding }
              : { kind: "box", box: { from: press.from, to: this.cellsOf(at) }, isAdding }
          );
        }
        this.end();
      },
      onCancel: () => this.end(),
      onEscape: (event) => {
        if (!this.session.isHeld) {
          return;
        }
        event.preventDefault();
        this.session.release();
        this.end();
      },
      onOther: (event) => {
        const press = this.press;
        if (event.pointerType !== "touch" || press === undefined) {
          return;
        }
        this.session.release();
        this.end();
        this.owner.handOff(press.pointerId, press);
      },
    });
  }

  /** Whether the pointer picks. Off, the tool hears nothing and draws nothing. */
  setActive(on: boolean): void {
    if (this.session.setActive(on) && !on) {
      this.end();
    }
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
  }

  setStyle(style: PickStyle): void {
    this.style = style;
  }

  destroy(): void {
    this.setActive(false);
    this.drawn.destroy();
  }

  // Past a few pixels a press is a box, drawn from where it landed to the
  // pointer.
  private drag(at: Point, event: PointerEvent): void {
    const press = this.press;
    if (press === undefined) {
      return;
    }
    press.clientX = event.clientX;
    press.clientY = event.clientY;
    const travel = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (press.box === undefined && travel < DRAG_THRESHOLD_PX) {
      return;
    }
    if (press.box === undefined) {
      this.owner.hold(true);
    }
    press.box = { from: press.from, to: this.cellsOf(at) };
    this.draw(press.box);
  }

  private draw(box: PickBox): void {
    const g = this.drawn.clear();
    const colour = this.style.box;
    const cell = this.grid.cellSize;
    const a = cellPointToWorld(this.grid, box.from);
    const c = cellPointToWorld(this.grid, box.to);
    const b = { x: c.x, y: a.y };
    const d = { x: a.x, y: c.y };
    g.poly([a, b, c, d]).fill({ color: colour.rgb, alpha: FILL_ALPHA * colour.alpha });
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ] as const) {
      dashedLine(g, from, to, cell * DASH, cell * GAP);
    }
    g.stroke({ width: EDGE_WIDTH, color: colour.rgb, alpha: colour.alpha, pixelLine: true });
  }

  private end(): void {
    if (this.press?.box !== undefined) {
      this.owner.hold(false);
    }
    this.press = undefined;
    this.drawn.clear();
  }

  private cellsOf(at: Point): Point {
    return worldToCellPoint(this.grid, at);
  }
}

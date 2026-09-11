/**
 * ─ Ruler ─
 *
 * Measuring is its own tool: a press on the board starts a measure at
 * the cell under it, from a token or the floor without moving anything,
 * the pointer draws it out, and the release pins it until Escape or the
 * next measure. Alt at the press makes the measure private. What shows
 * is the mode's answer alone: as a line, the crow-flies distance with
 * an arrow at the far end, faint past where a wall or a shut door
 * breaks the line of effect, a bar across it there; as a path, the way
 * on foot this turn offers, drawn the same way, brass past what the
 * movement left reaches, red past even a dash, and dashed where it
 * drops. One badge beside the far end carries the number. The tool
 * takes the left button on the canvas before the camera can, as the
 * drawing tool does.
 * Design: docs/design.md §5 "Measuring is its own tool".
 */

import { Container, Graphics, Text } from "pixi.js";
import type { Point } from "../geometry.js";
import { cellCenter, worldToCell, type Cell, type SquareGrid } from "../grid/square-grid.js";
import type { PackedColor } from "../theme/css-color.js";
import type { Measurement } from "./measure.js";
import { badgeText, type RulerMode } from "./mode.js";

/** What the pointer does in Play: moves tokens, or measures. */
export type PlayTool = "move" | "ruler";

/** Answers a measure between two cells; the host composes it from the scene. */
export type Measurer = (from: Cell, to: Cell, isPrivate: boolean) => Measurement;
/** A measure as the ruler shows it: the numbers, and the mode they are read in. */
export type ShownMeasure = Measurement & { readonly mode: RulerMode };
/** Hears the measure on show, or nothing once it is taken off the board. */
export type MeasureListener = (measurement: ShownMeasure | undefined) => void;

export interface RulerStyle {
  /** The line or the way, its ends, its arrow and the badge text. */
  readonly line: PackedColor;
  /** The way past what the movement reaches but within a dash: the tokens' brass. */
  readonly dash: PackedColor;
  /** The way past even a dash: the one red on the board. */
  readonly beyond: PackedColor;
  /** The pill under the badge. */
  readonly ground: number;
}

interface StrokeOptions {
  /** Past a break in the line of effect: the same colour, thinned to a hint. */
  readonly isFaint?: boolean;
  /** A drop: the step is dashed. */
  readonly isDashed?: boolean;
}

const DEFAULT_STYLE: RulerStyle = {
  line: { rgb: 0xf1e6d2, alpha: 1 },
  dash: { rgb: 0xc9a24e, alpha: 1 },
  beyond: { rgb: 0xc8553d, alpha: 1 },
  ground: 0x1b1d24,
};

// A private measure reads as one's own: fainter throughout.
const PRIVATE_ALPHA = 0.6;
// Past a break the line keeps its colour at this much of its alpha.
const FAINT_ALPHA = 0.4;
// Fractions of the cell: the line never under two pixels, a dash and its
// gap, the bar across a break, the arrow long enough to read at any zoom
// the grid reads at.
const LINE_FRACTION = 0.05;
const DASH_FRACTION = 0.25;
const BAR_FRACTION = 0.35;
const END_FRACTION = 0.08;
const ARROW_FRACTION = 0.3;
const BADGE_FRACTION = 0.26;
const PILL_ALPHA = 0.8;

/** Measures from a press to the pointer while active; the last measure stays until cleared. */
export class RulerTool {
  private readonly canvas: HTMLElement;
  private readonly view = new Container();
  private readonly graphics = new Graphics();
  private readonly pill = new Graphics();
  private readonly badge: Text;
  private readonly toWorld: (screen: Point) => Point;
  private readonly measurer: Measurer;
  private readonly listeners = new Set<MeasureListener>();
  private grid: SquareGrid;
  private style: RulerStyle = DEFAULT_STYLE;
  private mode: RulerMode = "line";
  private isActive = false;
  private pointerId: number | undefined;
  private from: Cell | undefined;
  private isPrivate = false;
  private shown: Measurement | undefined;

  /** `toWorld` maps a point on the canvas to world pixels: the camera's inverse. */
  constructor(
    canvas: HTMLElement,
    container: Container,
    grid: SquareGrid,
    toWorld: (screen: Point) => Point,
    measurer: Measurer
  ) {
    this.canvas = canvas;
    this.grid = grid;
    this.toWorld = toWorld;
    this.measurer = measurer;
    this.badge = new Text({
      text: "",
      style: { fontFamily: "system-ui, sans-serif", fontWeight: "600", align: "left" },
    });
    this.view.addChild(this.graphics, this.pill, this.badge);
    this.view.visible = false;
    container.addChild(this.view);
  }

  /** Whether the pointer measures. Off, the tool hears nothing and shows nothing. */
  setActive(on: boolean): void {
    if (on === this.isActive) {
      return;
    }
    this.isActive = on;
    if (on) {
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointercancel", this.onPointerCancel);
      window.addEventListener("keydown", this.onKeyDown);
    } else {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
      window.removeEventListener("keydown", this.onKeyDown);
      this.release();
      this.clear();
    }
  }

  /** Read the measure as a line or as a path; the measure on show turns with it. */
  setMode(mode: RulerMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.redraw();
    this.notify();
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
    this.redraw();
  }

  setStyle(style: RulerStyle): void {
    this.style = style;
    this.redraw();
  }

  /** The measure on show, pinned or under the pointer, in the mode it is read in. */
  get measurement(): ShownMeasure | undefined {
    return this.shown === undefined ? undefined : { ...this.shown, mode: this.mode };
  }

  /** Hear the measure as it changes. Returns the unsubscribe. */
  onMeasure(listener: MeasureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Take the measure off the board. */
  clear(): void {
    if (this.shown === undefined) {
      return;
    }
    this.shown = undefined;
    this.redraw();
    this.notify();
  }

  destroy(): void {
    this.setActive(false);
    this.view.destroy({ children: true });
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.pointerId !== undefined) {
      return;
    }
    // The press is the ruler's; the board element must not start a pan.
    event.stopPropagation();
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    this.from = this.cellUnder(event);
    this.isPrivate = event.altKey;
    this.show(this.from);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.show(this.cellUnder(event));
  };

  // The release position is the last word, and the measure stays pinned.
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.show(this.cellUnder(event));
    this.release();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) {
      this.release();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || this.shown === undefined) {
      return;
    }
    event.preventDefault();
    this.release();
    this.clear();
  };

  private show(to: Cell): void {
    if (this.from === undefined) {
      return;
    }
    this.shown = this.measurer(this.from, to, this.isPrivate);
    this.redraw();
    this.notify();
  }

  private release(): void {
    if (this.pointerId !== undefined && this.canvas.hasPointerCapture(this.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerId);
    }
    this.pointerId = undefined;
    this.from = undefined;
  }

  private notify(): void {
    const measurement = this.measurement;
    for (const listener of this.listeners) {
      listener(measurement);
    }
  }

  private cellUnder(event: PointerEvent): Cell {
    const rect = this.canvas.getBoundingClientRect();
    const world = this.toWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    return worldToCell(this.grid, world);
  }

  private redraw(): void {
    const shown = this.shown;
    const g = this.graphics;
    g.clear();
    this.pill.clear();
    if (shown === undefined) {
      this.view.visible = false;
      return;
    }
    this.view.visible = true;
    this.view.alpha = shown.isPrivate ? PRIVATE_ALPHA : 1;
    if (this.mode === "path") {
      this.drawPath(g, shown);
    } else {
      this.drawLine(g, shown);
    }
    this.drawBadge(shown);
  }

  // The crow-flies line with an arrow at its far end. Past where the line
  // of effect breaks it goes faint, with a bar across it at the wall.
  private drawLine(g: Graphics, shown: Measurement): void {
    const { line } = this.style;
    const near = cellCenter(this.grid, shown.from);
    const far = cellCenter(this.grid, shown.to);
    this.dot(g, near, line);
    if (near.x === far.x && near.y === far.y) {
      return;
    }
    // The line ends where the head begins, so the head's tip is the true end.
    const base = this.arrowBase(near, far);
    const isBroken = shown.blockedAt !== undefined;
    const cut = shown.blockedAt === undefined ? base : this.world(shown.blockedAt);
    this.strokeLine(g, near, cut, line);
    if (isBroken) {
      this.strokeLine(g, cut, base, line, { isFaint: true });
      this.bar(g, near, far, cut, line);
    }
    this.arrowhead(g, near, far, line, isBroken);
  }

  // The way on foot as the turn offers it, step by step: in the line's
  // colour within what the movement left reaches, brass within a dash,
  // red past even that, and dashed where it drops. Refused, the shortest
  // way shows so the badge has a number to name; no way at all shows the
  // two ends alone.
  private drawPath(g: Graphics, shown: Measurement): void {
    const { line } = this.style;
    const near = cellCenter(this.grid, shown.from);
    const far = cellCenter(this.grid, shown.to);
    this.dot(g, near, line);
    const steps = (shown.choice.route ?? shown.route)?.steps ?? [];
    const centres = steps.map((step) => cellCenter(this.grid, step.cell));
    const last = centres[centres.length - 1];
    const before = centres[centres.length - 2];
    if (last === undefined || before === undefined) {
      if (near.x !== far.x || near.y !== far.y) {
        this.dot(g, far, line);
      }
      return;
    }
    const ends = [...centres.slice(0, -1), this.arrowBase(before, last)];
    for (let i = 1; i < ends.length; i += 1) {
      const from = ends[i - 1];
      const to = ends[i];
      const step = steps[i];
      if (from === undefined || to === undefined || step === undefined) {
        continue;
      }
      this.strokeLine(g, from, to, this.bandOf(step.cost, shown), {
        isDashed: step.kind === "drop",
      });
    }
    const arrival = steps[steps.length - 1];
    this.arrowhead(
      g,
      before,
      last,
      arrival === undefined ? line : this.bandOf(arrival.cost, shown)
    );
  }

  // The colour a step wears by how much movement it has spent.
  private bandOf(spent: number, shown: Measurement): PackedColor {
    const { line, dash, beyond } = this.style;
    if (spent <= shown.reach) {
      return line;
    }
    return spent <= shown.dashReach ? dash : beyond;
  }

  // One number on a pill of the ground's darkness, beside the far end.
  private drawBadge(shown: Measurement): void {
    const cell = this.grid.cellSize;
    const far = cellCenter(this.grid, shown.to);
    this.badge.text = badgeText(shown, this.mode);
    this.badge.style.fontSize = Math.max(11, Math.round(cell * BADGE_FRACTION));
    this.badge.style.fill = this.style.line.rgb;
    const pad = cell * 0.12;
    const x = far.x + cell * 0.55;
    const y = far.y - cell * 0.55 - this.badge.height;
    this.badge.position.set(x, y);
    this.pill
      .roundRect(x - pad, y - pad, this.badge.width + pad * 2, this.badge.height + pad * 2, pad)
      .fill({ color: this.style.ground, alpha: PILL_ALPHA });
  }

  private dot(g: Graphics, at: Point, color: PackedColor): void {
    g.circle(at.x, at.y, this.grid.cellSize * END_FRACTION).fill({
      color: color.rgb,
      alpha: color.alpha,
    });
  }

  // A short bar across the line at `at`: where the line of effect breaks.
  private bar(g: Graphics, from: Point, to: Point, at: Point, color: PackedColor): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) {
      return;
    }
    const half = (this.grid.cellSize * BAR_FRACTION) / 2;
    const nx = -(to.y - from.y) / length;
    const ny = (to.x - from.x) / length;
    g.moveTo(at.x - nx * half, at.y - ny * half)
      .lineTo(at.x + nx * half, at.y + ny * half)
      .stroke({ width: this.lineWidth(), color: color.rgb, alpha: color.alpha, cap: "round" });
  }

  // Where a line ends and its head begins: one head short of `to`.
  private arrowBase(from: Point, to: Point): Point {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const size = this.grid.cellSize * ARROW_FRACTION;
    return length <= size ? from : along(from, to, 1 - size / length);
  }

  // A filled head pointing from `from` to `to`, its tip at `to`.
  private arrowhead(
    g: Graphics,
    from: Point,
    to: Point,
    color: PackedColor,
    isFaint = false
  ): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) {
      return;
    }
    const ux = (to.x - from.x) / length;
    const uy = (to.y - from.y) / length;
    const size = this.grid.cellSize * ARROW_FRACTION;
    const half = size * 0.5;
    const base = { x: to.x - ux * size, y: to.y - uy * size };
    g.poly(
      [to.x, to.y, base.x - uy * half, base.y + ux * half, base.x + uy * half, base.y - ux * half],
      true
    ).fill({ color: color.rgb, alpha: color.alpha * (isFaint ? FAINT_ALPHA : 1) });
  }

  private strokeLine(
    g: Graphics,
    from: Point,
    to: Point,
    color: PackedColor,
    options: StrokeOptions = {}
  ): void {
    const style = {
      width: this.lineWidth(),
      color: color.rgb,
      alpha: color.alpha * (options.isFaint ? FAINT_ALPHA : 1),
      cap: "round" as const,
    };
    if (!options.isDashed) {
      g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke(style);
      return;
    }
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const dash = this.grid.cellSize * DASH_FRACTION;
    for (let start = 0; start < length; start += dash * 2) {
      const end = Math.min(length, start + dash);
      const a = along(from, to, start / length);
      const b = along(from, to, end / length);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke(style);
  }

  private lineWidth(): number {
    return Math.max(2, this.grid.cellSize * LINE_FRACTION);
  }

  private world(point: Point): Point {
    return {
      x: this.grid.originX + point.x * this.grid.cellSize,
      y: this.grid.originY + point.y * this.grid.cellSize,
    };
  }
}

function along(from: Point, to: Point, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

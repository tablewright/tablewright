/**
 * ─ Token sprite ─
 *
 * One token as Pixi display objects: a disc, its label, and a ring
 * open at the rear with an arrow at the front, so facing reads at a
 * glance the way an FF14 target ring does, instead of rotating the
 * art. The ring is always present, dim at rest and lit by hover or
 * selection; a selected token also shows corner brackets, and its
 * hit area grows from the disc to the whole cell so a press in the
 * corners can become a turn. The layer decides state and position;
 * the sprite only knows how a token looks and what it covers.
 */

import { Circle, Container, Graphics, Rectangle, Text } from "pixi.js";
import type { Point } from "../geometry.js";
import { mixColors, type PackedColor } from "../theme/css-color.js";
import { facingToRadians, ringArc } from "./facing.js";

export interface TokenStyle {
  readonly fill: PackedColor;
  readonly label: PackedColor;
  readonly hover: PackedColor;
  readonly selection: PackedColor;
}

// The disc leaves a margin inside its cell so the grid line stays visible around it.
const DISC_FRACTION = 0.8;
const RING_WIDTH = 3;
const LABEL_FRACTION = 0.36;
// The open rear of the ring: a quarter turn centred behind the facing, so three quarters remain.
const RING_GAP_DEGREES = 90;
// Arrow proportions relative to the disc radius.
const ARROW_LENGTH = 0.32;
const ARROW_HALF_WIDTH = 0.22;
// At rest the ring and its arrow are one quiet outline: the label colour
// mixed this far toward the disc colour, opaque.
const IDLE_MIX = 0.45;
// Corner brackets: arm length as a fraction of the cell.
const HANDLE_ARM = 0.18;
const HANDLE_WIDTH = 2;
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** A disc with a label and facing; call the setters and it redraws itself. */
export class TokenSprite {
  readonly view = new Container();
  private readonly disc = new Graphics();
  private readonly ring = new Graphics();
  private readonly brackets = new Graphics();
  private readonly text: Text;
  private cellSize: number;
  private style: TokenStyle;
  private currentFacing = 0;
  private isHovered = false;
  private isSelected = false;

  constructor(label: string, cellSize: number, style: TokenStyle) {
    this.cellSize = cellSize;
    this.style = style;
    this.text = new Text({
      text: label,
      style: { fontFamily: "system-ui, sans-serif", fontWeight: "600", align: "center" },
    });
    this.text.anchor.set(0.5);
    this.brackets.visible = false;
    this.view.addChild(this.disc, this.ring, this.text, this.brackets);
    this.view.eventMode = "static";
    this.view.cursor = "grab";
    this.redraw();
  }

  setPosition(point: Point): void {
    this.view.position.set(point.x, point.y);
  }

  get position(): Point {
    return { x: this.view.position.x, y: this.view.position.y };
  }

  /** Disc radius in world pixels; presses beyond it on a selected token are turns. */
  get discRadius(): number {
    return (this.cellSize * DISC_FRACTION) / 2;
  }

  setLabel(label: string): void {
    this.text.text = label;
  }

  /** Degrees clockwise from north. */
  get facing(): number {
    return this.currentFacing;
  }

  setFacing(facing: number): void {
    this.currentFacing = facing;
    this.redrawRing();
  }

  setCellSize(cellSize: number): void {
    this.cellSize = cellSize;
    this.redraw();
  }

  setStyle(style: TokenStyle): void {
    this.style = style;
    this.redraw();
  }

  setHovered(isHovered: boolean): void {
    this.isHovered = isHovered;
    this.redrawRing();
  }

  setSelected(isSelected: boolean): void {
    this.isSelected = isSelected;
    this.brackets.visible = isSelected;
    this.applyHitArea();
    this.redrawRing();
  }

  setDragging(isDragging: boolean): void {
    this.view.alpha = isDragging ? 0.85 : 1;
    this.view.cursor = isDragging ? "grabbing" : "grab";
  }

  setRotating(isRotating: boolean): void {
    this.view.cursor = isRotating ? "alias" : "grab";
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private redraw(): void {
    const r = this.discRadius;
    this.disc
      .clear()
      .circle(0, 0, r)
      .fill({ color: this.style.fill.rgb, alpha: this.style.fill.alpha });
    this.applyHitArea();
    this.text.style.fontSize = Math.max(10, Math.round(this.cellSize * LABEL_FRACTION));
    this.text.style.fill = this.style.label.rgb;
    this.text.alpha = this.style.label.alpha;
    this.redrawBrackets();
    this.redrawRing();
  }

  // Selected: the whole cell, so the corners are pressable. Otherwise just the disc.
  private applyHitArea(): void {
    const half = this.cellSize / 2;
    this.view.hitArea = this.isSelected
      ? new Rectangle(-half, -half, this.cellSize, this.cellSize)
      : new Circle(0, 0, this.discRadius);
  }

  // The ring and the arrow share one Graphics because both depend on facing.
  // The ring is always drawn so facing reads at rest; state only changes its colour.
  private redrawRing(): void {
    const g = this.ring.clear();
    const r = this.discRadius;
    // At rest the colour is dimmed by mixing, not by alpha: the arrow overlaps
    // the ring band, and two translucent layers would double-print there.
    const colour = this.isSelected
      ? this.style.selection
      : this.isHovered
        ? this.style.hover
        : { rgb: mixColors(this.style.label.rgb, this.style.fill.rgb, IDLE_MIX), alpha: 1 };
    const arc = ringArc(this.currentFacing, RING_GAP_DEGREES);
    g.arc(0, 0, r + RING_WIDTH / 2, arc.start, arc.end).stroke({
      width: RING_WIDTH,
      color: colour.rgb,
      alpha: colour.alpha,
      cap: "round",
    });
    // The arrow grows out of the ring band itself, same colour and alpha, so the
    // two read as one shape at rest as much as when lit.
    const angle = facingToRadians(this.currentFacing);
    const tip = r + RING_WIDTH + r * ARROW_LENGTH;
    const base = r;
    const half = r * ARROW_HALF_WIDTH;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    g.poly([
      tip * cos,
      tip * sin,
      base * cos - half * sin,
      base * sin + half * cos,
      base * cos + half * sin,
      base * sin - half * cos,
    ]).fill({ color: colour.rgb, alpha: colour.alpha });
  }

  private redrawBrackets(): void {
    const half = this.cellSize / 2;
    const arm = this.cellSize * HANDLE_ARM;
    const g = this.brackets.clear();
    for (const [sx, sy] of CORNERS) {
      const x = sx * half;
      const y = sy * half;
      g.moveTo(x - sx * arm, y)
        .lineTo(x, y)
        .lineTo(x, y - sy * arm);
    }
    g.stroke({
      width: HANDLE_WIDTH,
      color: this.style.selection.rgb,
      alpha: this.style.selection.alpha,
      cap: "round",
      join: "round",
    });
  }
}

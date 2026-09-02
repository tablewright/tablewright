/**
 * ─ Token sprite ─
 *
 * One token as Pixi display objects: a disc, its label, a facing arrow
 * that is always visible, and a ring for hover or selection that is
 * open at the rear so the facing reads at a glance, the way a target
 * ring does in FF14, instead of rotating the art. The layer decides
 * state and position; the sprite only knows how a token looks.
 */

import { Circle, Container, Graphics, Text } from "pixi.js";
import type { Point } from "../geometry.js";
import type { PackedColor } from "../theme/css-color.js";
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
// The open rear of the ring, in degrees, wide enough to read as a gap at small sizes.
const RING_GAP_DEGREES = 80;
// Arrow proportions relative to the disc radius.
const ARROW_LENGTH = 0.32;
const ARROW_HALF_WIDTH = 0.22;
const IDLE_ARROW_ALPHA = 0.85;

/** A disc with a label and facing; call the setters and it redraws itself. */
export class TokenSprite {
  readonly view = new Container();
  private readonly disc = new Graphics();
  private readonly ring = new Graphics();
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
    this.view.addChild(this.disc, this.ring, this.text);
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
    this.redrawRing();
  }

  setDragging(isDragging: boolean): void {
    this.view.alpha = isDragging ? 0.85 : 1;
    this.view.cursor = isDragging ? "grabbing" : "grab";
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private get radius(): number {
    return (this.cellSize * DISC_FRACTION) / 2;
  }

  private redraw(): void {
    const r = this.radius;
    this.disc
      .clear()
      .circle(0, 0, r)
      .fill({ color: this.style.fill.rgb, alpha: this.style.fill.alpha });
    this.view.hitArea = new Circle(0, 0, r);
    this.text.style.fontSize = Math.max(10, Math.round(this.cellSize * LABEL_FRACTION));
    this.text.style.fill = this.style.label.rgb;
    this.text.alpha = this.style.label.alpha;
    this.redrawRing();
  }

  // The ring and the arrow share one Graphics because both depend on facing.
  private redrawRing(): void {
    const g = this.ring.clear();
    const r = this.radius;
    const accent = this.isSelected
      ? this.style.selection
      : this.isHovered
        ? this.style.hover
        : undefined;
    if (accent !== undefined) {
      const arc = ringArc(this.currentFacing, RING_GAP_DEGREES);
      g.arc(0, 0, r + RING_WIDTH / 2, arc.start, arc.end).stroke({
        width: RING_WIDTH,
        color: accent.rgb,
        alpha: accent.alpha,
        cap: "round",
      });
    }
    const arrow = accent ?? this.style.label;
    const angle = facingToRadians(this.currentFacing);
    const tip = r * (1 + ARROW_LENGTH) + RING_WIDTH;
    const base = r + RING_WIDTH;
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
    ]).fill({ color: arrow.rgb, alpha: accent === undefined ? IDLE_ARROW_ALPHA : arrow.alpha });
  }
}

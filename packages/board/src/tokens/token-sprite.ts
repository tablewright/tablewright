/**
 * ─ Token sprite ─
 *
 * One token as Pixi display objects: a disc, its label, and a ring for
 * hover or selection. The layer decides state and position; the sprite
 * only knows how a token looks, never what it means.
 */

import { Circle, Container, Graphics, Text } from "pixi.js";
import type { Point } from "../geometry.js";
import type { PackedColor } from "../theme/css-color.js";

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

/** A disc with a label; call the setters and it redraws itself. */
export class TokenSprite {
  readonly view = new Container();
  private readonly disc = new Graphics();
  private readonly ring = new Graphics();
  private readonly text: Text;
  private cellSize: number;
  private style: TokenStyle;
  private isHovered = false;
  private isSelected = false;
  private isDragging = false;

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
    this.isDragging = isDragging;
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

  private redrawRing(): void {
    this.ring.clear();
    const colour = this.isSelected
      ? this.style.selection
      : this.isHovered
        ? this.style.hover
        : undefined;
    if (colour === undefined) {
      return;
    }
    this.ring
      .circle(0, 0, this.radius + RING_WIDTH / 2)
      .stroke({ width: RING_WIDTH, color: colour.rgb, alpha: colour.alpha });
  }
}

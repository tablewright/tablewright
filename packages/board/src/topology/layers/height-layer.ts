/**
 * ─ Height layer ─
 *
 * Shows the elevation field as the scene's height display asks: a
 * shadow, a wash, or a tag at each rise, over the field's own contours.
 * The contours are iso-lines, one per band, so they follow the art's
 * curve. The shadow and the wash are rasters painted at the field's
 * resolution and stretched over the map; the rest is drawn. Rebuilt
 * when the field, the mode or the grid changes; strength is opacity.
 * Design: docs/design.md §5 "Height is displayed per scene".
 */

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { HeightDisplay, HeightMode } from "@tablewright/schema";
import { signed } from "../../draw/tool.js";
import type { Point } from "../../shared/geometry.js";
import { cellPointToWorld, cellToWorld, type SquareGrid } from "../../grid/square-grid.js";
import { FALLBACK } from "../../theme/board-theme.js";
import type { PackedColor } from "../../theme/css-color.js";
import { heightStyle } from "../../theme/styles.js";
import type { Topology } from "../derive.js";
import { contoursOf, thresholdsOf, type Contour } from "../field/iso.js";
import { tagPlaces } from "../field/tags.js";
import { shadowCanvas, washCanvas } from "./height-raster.js";

export const HEIGHT_MODES: readonly HeightMode[] = ["shaded", "washed", "marked", "data"];

/** How a scene shows its heights until its DM says otherwise, as the core's own default has it. */
export const DEFAULT_DISPLAY: HeightDisplay = { mode: "shaded", strength: 80 };

export interface HeightStyle {
  /** The board's ground, behind a tag. */
  readonly ground: number;
  readonly shade: PackedColor;
  readonly line: PackedColor;
  readonly up: PackedColor;
  readonly down: PackedColor;
  readonly tag: PackedColor;
  /** The face a measured figure is set in; the theme bridge supplies it. */
  readonly face: string;
}

/** What the layer last drew, for tests and the readout. */
export interface HeightDrawing {
  readonly mode: HeightMode;
  readonly strength: number;
  /** Contour segments drawn, over every band. */
  readonly contours: number;
  readonly tags: number;
}

const DEFAULT_STYLE: HeightStyle = heightStyle(FALLBACK);

interface Drawn {
  readonly topology: Topology;
  readonly grid: SquareGrid;
  readonly mode: HeightMode;
  readonly band: number;
}

/** The scene's height display; call `draw` whenever the topology, grid or display changes. */
export class HeightLayer {
  private readonly overlay = new Container({ label: "height-overlay" });
  private readonly raster = new Sprite();
  private readonly lines = new Graphics();
  private readonly tags = new Container({ label: "height-tags" });
  private style: HeightStyle = DEFAULT_STYLE;
  private drawn: Drawn | undefined;
  private counts = { contours: 0, tags: 0 };

  constructor(container: Container) {
    this.raster.visible = false;
    this.overlay.addChild(this.raster, this.lines, this.tags);
    container.addChild(this.overlay);
  }

  /** Show `topology`'s field on `grid` as `display` asks, with bands `band` high. */
  draw(topology: Topology, grid: SquareGrid, display: HeightDisplay, band: number): void {
    this.overlay.alpha = display.strength / 100;
    this.overlay.visible = display.mode !== "data" && display.strength > 0;
    const same =
      this.drawn !== undefined &&
      this.drawn.topology === topology &&
      this.drawn.grid === grid &&
      this.drawn.mode === display.mode &&
      this.drawn.band === band;
    if (same) {
      return;
    }
    this.drawn = { topology, grid, mode: display.mode, band };
    this.rebuild();
  }

  /** What was last drawn. */
  drawing(): HeightDrawing {
    return {
      mode: this.drawn?.mode ?? "data",
      strength: Math.round(this.overlay.alpha * 100),
      ...this.counts,
    };
  }

  clear(): void {
    this.drawn = undefined;
    this.counts = { contours: 0, tags: 0 };
    this.lines.clear();
    this.dropRaster();
    this.dropTags();
  }

  setStyle(style: HeightStyle): void {
    this.style = style;
    if (this.drawn !== undefined) {
      this.rebuild();
    }
  }

  destroy(): void {
    this.clear();
    this.overlay.destroy({ children: true });
  }

  private rebuild(): void {
    const drawn = this.drawn;
    this.lines.clear();
    this.dropRaster();
    this.dropTags();
    this.counts = { contours: 0, tags: 0 };
    if (drawn === undefined || drawn.mode === "data") {
      return;
    }
    const { topology, grid, band } = drawn;
    const thresholds = thresholdsOf(topology.field, band);
    const contours = contoursOf(topology, band);
    if (drawn.mode === "shaded") {
      this.paintRaster(topology, grid, shadowCanvas(topology, thresholds, this.style.shade));
    } else if (drawn.mode === "washed") {
      this.paintRaster(topology, grid, washCanvas(topology, band, this.style));
    }
    this.drawContours(contours, grid);
    if (drawn.mode === "marked") {
      this.drawTags(topology, contours, grid, band);
    }
  }

  private drawContours(contours: readonly Contour[], grid: SquareGrid): void {
    const g = this.lines;
    let count = 0;
    for (const { segments } of contours) {
      for (const { from, to } of segments) {
        const a = cellPointToWorld(grid, from);
        const b = cellPointToWorld(grid, to);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
        count += 1;
      }
    }
    if (count > 0) {
      const { line } = this.style;
      g.stroke({ width: 1, color: line.rgb, alpha: line.alpha, pixelLine: true, cap: "round" });
    }
    this.counts = { ...this.counts, contours: count };
  }

  private drawTags(
    topology: Topology,
    contours: readonly Contour[],
    grid: SquareGrid,
    band: number
  ): void {
    const places = tagPlaces(topology, contours, band);
    for (const { level, top } of places) {
      this.tags.addChild(this.tag(signed(level), grid, top));
    }
    this.counts = { ...this.counts, tags: places.length };
  }

  private tag(label: string, grid: SquareGrid, at: Point): Container {
    const cell = grid.cellSize;
    const size = Math.max(9, Math.round(cell * 0.22));
    const text = new Text({
      text: label,
      style: {
        fontFamily: this.style.face,
        fontSize: size,
        fontWeight: "600",
        fill: this.style.tag.rgb,
      },
    });
    text.anchor.set(0.5);
    text.alpha = this.style.tag.alpha;
    const padX = size * 0.5;
    const padY = size * 0.25;
    const pill = new Graphics()
      .roundRect(
        -text.width / 2 - padX,
        -text.height / 2 - padY,
        text.width + padX * 2,
        text.height + padY * 2,
        size * 0.4
      )
      .fill({ color: this.style.ground, alpha: 0.85 })
      .stroke({ width: 1, color: this.style.tag.rgb, alpha: 0.5 });
    const holder = new Container();
    holder.addChild(pill, text);
    const world = cellPointToWorld(grid, at);
    holder.position.set(world.x, world.y + size * 0.9);
    return holder;
  }

  private paintRaster(topology: Topology, grid: SquareGrid, canvas: HTMLCanvasElement): void {
    const texture = Texture.from(canvas);
    texture.source.scaleMode = "linear";
    const { samples } = topology;
    const cell = grid.cellSize;
    this.raster.texture = texture;
    const corner = cellToWorld(grid, { col: samples.bounds.colMin, row: samples.bounds.rowMin });
    this.raster.position.set(corner.x, corner.y);
    this.raster.scale.set(cell / samples.per);
    this.raster.visible = true;
  }

  private dropRaster(): void {
    if (this.raster.visible) {
      const old = this.raster.texture;
      this.raster.texture = Texture.EMPTY;
      this.raster.visible = false;
      old.destroy(true);
    }
  }

  private dropTags(): void {
    for (const child of this.tags.removeChildren()) {
      child.destroy({ children: true });
    }
  }
}

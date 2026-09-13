/**
 * ─ Height layer ─
 *
 * Shows the elevation field the way the scene asks: Shaded lays a soft
 * shadow on the low side of every rise and a hairline along it; Washed
 * tints the ground warm going up and cool going down; Marked draws the
 * hairline and a small tag at each rise; Data shows nothing. The
 * contours are the field's own iso-lines, one per band, so they follow
 * the art's curve. The shadow and the wash are rasters painted at the
 * field's own resolution and stretched over the map; the rest is drawn.
 * Rebuilt only when the field, the mode or the grid changes; the
 * strength is the overlay's opacity and costs nothing.
 * Design: docs/design.md §5 "Height is displayed per scene".
 */

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { HeightDisplay, HeightMode } from "@tablewright/schema";
import { signed } from "../draw/tool.js";
import type { Point } from "../geometry.js";
import type { SquareGrid } from "../grid/square-grid.js";
import type { PackedColor } from "../theme/css-color.js";
import type { Topology } from "./derive.js";
import { contourGroups, isoLines, type Segment } from "./iso.js";
import { sampleHeight, sampleWidth } from "./shapes.js";

export const HEIGHT_MODES: readonly HeightMode[] = ["shaded", "washed", "marked", "data"];

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

const DEFAULT_STYLE: HeightStyle = {
  face: "ui-monospace, monospace",
  ground: 0x1b1d24,
  shade: { rgb: 0x000000, alpha: 1 },
  line: { rgb: 0xf1e6d2, alpha: 0.6 },
  up: { rgb: 0xe4c57a, alpha: 1 },
  down: { rgb: 0x5fa8bd, alpha: 1 },
  tag: { rgb: 0xf1e6d2, alpha: 1 },
};

// The shadow: the raised region's mask spread this many samples in every
// direction and softened, with the region itself cut out, each band this
// dark on its own.
const SHADOW_SPREAD = 1.5;
const SHADOW_BLUR = 1;
const SHADOW_ALPHA = 0.5;
const SHADOW_DIRECTIONS = 8;
// The wash: how much tint one band adds, and the most it reaches.
const WASH_UP = { perBand: 0.125, most: 0.4 };
const WASH_DOWN = { perBand: 0.175, most: 0.5 };
// A tag reads the ground this many samples either side of its contour.
const TAG_REACH = 1.5;
// A contour shorter than this many cells of line is a speck of a slope,
// not a rise worth naming.
const TAG_LEAST_CELLS = 2;

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
    const contours = thresholds.map((threshold) => ({
      threshold,
      segments: isoLines(topology, threshold),
    }));
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

  private drawContours(
    contours: readonly { readonly segments: readonly Segment[] }[],
    grid: SquareGrid
  ): void {
    const g = this.lines;
    let count = 0;
    for (const { segments } of contours) {
      for (const { from, to } of segments) {
        g.moveTo(grid.originX + from.x * grid.cellSize, grid.originY + from.y * grid.cellSize);
        g.lineTo(grid.originX + to.x * grid.cellSize, grid.originY + to.y * grid.cellSize);
        count += 1;
      }
    }
    if (count > 0) {
      const { line } = this.style;
      g.stroke({ width: 1, color: line.rgb, alpha: line.alpha, pixelLine: true, cap: "round" });
    }
    this.counts = { ...this.counts, contours: count };
  }

  // One tag per contour, at its top, naming the level beyond the line: the
  // ground above a rise, the floor below a drop. Two bands ringing the same
  // rise at the same spot give one tag, the higher level's.
  private drawTags(
    topology: Topology,
    contours: readonly { readonly threshold: number; readonly segments: readonly Segment[] }[],
    grid: SquareGrid,
    band: number
  ): void {
    const { samples, field } = topology;
    const width = sampleWidth(samples);
    const height = sampleHeight(samples);
    const at = (x: number, y: number): number => {
      const i = Math.max(
        0,
        Math.min(width - 1, Math.floor((x - samples.bounds.colMin) * samples.per))
      );
      const j = Math.max(
        0,
        Math.min(height - 1, Math.floor((y - samples.bounds.rowMin) * samples.per))
      );
      return field[j * width + i] ?? 0;
    };
    const seen = new Set<string>();
    let count = 0;
    const reach = TAG_REACH / samples.per;
    const least = TAG_LEAST_CELLS * samples.per;
    for (const { threshold, segments } of contours) {
      for (const contour of contourGroups(segments)) {
        if (contour.length < least) {
          continue;
        }
        let top: Point | undefined;
        for (const { from, to } of contour) {
          const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
          if (top === undefined || mid.y < top.y) {
            top = mid;
          }
        }
        if (top === undefined) {
          continue;
        }
        const above = at(top.x, top.y - reach);
        const below = at(top.x, top.y + reach);
        const beyond = threshold > 0 ? Math.max(above, below) : Math.min(above, below);
        const level = Math.round(beyond / band) * band;
        if (level === 0) {
          continue;
        }
        const key = `${level}:${Math.round(top.x)}:${Math.round(top.y)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        this.tags.addChild(this.tag(signed(level), grid, top));
        count += 1;
      }
    }
    this.counts = { ...this.counts, tags: count };
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
    holder.position.set(grid.originX + at.x * cell, grid.originY + at.y * cell + size * 0.9);
    return holder;
  }

  private paintRaster(topology: Topology, grid: SquareGrid, canvas: HTMLCanvasElement): void {
    const texture = Texture.from(canvas);
    texture.source.scaleMode = "linear";
    const { samples } = topology;
    const cell = grid.cellSize;
    this.raster.texture = texture;
    this.raster.position.set(
      grid.originX + samples.bounds.colMin * cell,
      grid.originY + samples.bounds.rowMin * cell
    );
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

/** The band thresholds the field crosses: halfway through each band it reaches. */
export function thresholdsOf(field: Float32Array, band: number): number[] {
  let lowest = Infinity;
  let highest = -Infinity;
  for (const value of field) {
    lowest = Math.min(lowest, value);
    highest = Math.max(highest, value);
  }
  if (lowest === highest) {
    return [];
  }
  const thresholds: number[] = [];
  const first = Math.floor(lowest / band);
  const last = Math.ceil(highest / band);
  for (let k = first; k < last; k += 1) {
    const threshold = (k + 0.5) * band;
    if (threshold > lowest && threshold <= highest) {
      thresholds.push(threshold);
    }
  }
  return thresholds;
}

// The raised region of each band, spread outward and softened, minus the
// region itself: a shadow on the low side, darker where bands stack.
function shadowCanvas(
  topology: Topology,
  thresholds: readonly number[],
  shade: PackedColor
): HTMLCanvasElement {
  const width = sampleWidth(topology.samples);
  const height = sampleHeight(topology.samples);
  const result = canvasOf(width, height);
  const mask = canvasOf(width, height);
  const scratch = canvasOf(width, height);
  const out = contextOf(result);
  const maskContext = contextOf(mask);
  const scratchContext = contextOf(scratch);
  const [r, g, b] = channels(shade.rgb);
  for (const threshold of thresholds) {
    const image = maskContext.createImageData(width, height);
    const { field } = topology;
    for (let index = 0; index < width * height; index += 1) {
      if ((field[index] ?? 0) >= threshold) {
        const o = index * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
    maskContext.putImageData(image, 0, 0);
    scratchContext.clearRect(0, 0, width, height);
    scratchContext.save();
    scratchContext.filter = `blur(${SHADOW_BLUR}px)`;
    scratchContext.globalAlpha = SHADOW_ALPHA * shade.alpha;
    for (let k = 0; k < SHADOW_DIRECTIONS; k += 1) {
      const angle = (k / SHADOW_DIRECTIONS) * Math.PI * 2;
      scratchContext.drawImage(
        mask,
        Math.cos(angle) * SHADOW_SPREAD,
        Math.sin(angle) * SHADOW_SPREAD
      );
    }
    scratchContext.restore();
    scratchContext.save();
    scratchContext.globalCompositeOperation = "destination-out";
    scratchContext.drawImage(mask, 0, 0);
    scratchContext.restore();
    out.drawImage(scratch, 0, 0);
  }
  return result;
}

// A tint per sample: warm above zero, cool below, stronger by the band.
function washCanvas(topology: Topology, band: number, style: HeightStyle): HTMLCanvasElement {
  const width = sampleWidth(topology.samples);
  const height = sampleHeight(topology.samples);
  const canvas = canvasOf(width, height);
  const context = contextOf(canvas);
  const image = context.createImageData(width, height);
  const up = channels(style.up.rgb);
  const down = channels(style.down.rgb);
  const { field } = topology;
  for (let index = 0; index < width * height; index += 1) {
    const value = field[index] ?? 0;
    if (value === 0) {
      continue;
    }
    const o = index * 4;
    const bands = Math.abs(value) / band;
    const [r, g, b] = value > 0 ? up : down;
    const wash = value > 0 ? WASH_UP : WASH_DOWN;
    const tint = value > 0 ? style.up.alpha : style.down.alpha;
    image.data[o] = r;
    image.data[o + 1] = g;
    image.data[o + 2] = b;
    image.data[o + 3] = Math.round(Math.min(wash.most, bands * wash.perBand) * tint * 255);
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("The height display needs a 2D canvas context.");
  }
  return context;
}

function channels(rgb: number): [number, number, number] {
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}

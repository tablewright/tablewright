/**
 * ─ Height raster ─
 *
 * The two rasters the height display paints at the field's own
 * resolution and stretches over the map: the shadow a raised region
 * throws, and the wash that tints each band. Canvas work only; the layer
 * turns the canvas into a texture.
 * Design: docs/design.md §5 "Height is displayed per scene".
 */

import { channelsOf, type PackedColor } from "../../theme/css-color.js";
import type { Topology } from "../derive.js";
import { sampleHeight, sampleWidth } from "../shapes.js";
import type { HeightStyle } from "./height-layer.js";

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

/**
 * The raised region of each band, spread outward and softened, minus the
 * region itself: a shadow on the low side, darker where bands stack.
 */
export function shadowCanvas(
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
  const [r, g, b] = channelsOf(shade.rgb);
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

/** A tint per sample: warm above zero, cool below, stronger by the band. */
export function washCanvas(
  topology: Topology,
  band: number,
  style: HeightStyle
): HTMLCanvasElement {
  const width = sampleWidth(topology.samples);
  const height = sampleHeight(topology.samples);
  const canvas = canvasOf(width, height);
  const context = contextOf(canvas);
  const image = context.createImageData(width, height);
  const up = channelsOf(style.up.rgb);
  const down = channelsOf(style.down.rgb);
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

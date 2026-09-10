/**
 * ─ The drawing tool ─
 *
 * One tool, six inks, five shapes: what the DM is about to draw. The
 * catalogue says which shapes each ink takes; the tool holds the current
 * choice, options and all; the record describes each stroke in the DM's
 * words. Design: docs/design.md §5 "Six inks, one tool".
 */

import type {
  GroundState,
  OpeningSize,
  Shape,
  Stroke,
  ThresholdKind,
  ThresholdState,
} from "@tablewright/schema";

/** The inks a pen draws with; a reset is a stroke too, but nothing draws it. */
export type Ink = Exclude<Stroke["ink"], "clear">;
export type DrawShape = "rect" | "free" | "brush" | "line" | "click";

export interface InkSpec {
  readonly ink: Ink;
  readonly name: string;
  /** The shapes the ink takes; the first is its default. */
  readonly shapes: readonly DrawShape[];
}

export const INKS: readonly InkSpec[] = [
  { ink: "ground", name: "Ground", shapes: ["rect", "free", "brush"] },
  { ink: "threshold", name: "Threshold", shapes: ["click"] },
  { ink: "wall", name: "Wall", shapes: ["line", "rect"] },
  { ink: "height", name: "Height", shapes: ["brush", "rect", "free"] },
  { ink: "level-change", name: "Level change", shapes: ["brush"] },
  { ink: "free", name: "Free ink", shapes: ["brush", "free", "rect"] },
];

export const DRAW_SHAPES: readonly { readonly shape: DrawShape; readonly name: string }[] = [
  { shape: "brush", name: "Brush" },
  { shape: "rect", name: "Rect" },
  { shape: "free", name: "Free shape" },
  { shape: "line", name: "Line" },
  { shape: "click", name: "Click" },
];

export const GROUND_STATES: readonly GroundState[] = ["ground", "difficult", "air", "void"];
export const THRESHOLD_KINDS: readonly ThresholdKind[] = ["door", "arch", "window", "frosted"];
export const THRESHOLD_STATES: readonly ThresholdState[] = ["open", "closed", "locked", "secret"];
export const OPENING_SIZES: readonly OpeningSize[] = ["small", "large"];
/** How wide a brush may be, in cells: a dab within a cell up to a broad sweep. */
export const RADIUS_RANGE = { min: 0.25, max: 3, step: 0.25 } as const;

export interface ThresholdChoice {
  readonly kind: ThresholdKind;
  readonly state: ThresholdState;
  readonly size: OpeningSize;
}

/** What the next stroke will be: an ink, a shape, and the options each ink reads. */
export interface DrawTool {
  readonly ink: Ink;
  readonly shape: DrawShape;
  readonly ground: GroundState;
  readonly threshold: ThresholdChoice;
  /** In the system's distance unit. */
  readonly height: number;
  /** The brush's radius, in cells. */
  readonly radius: number;
}

export const DEFAULT_TOOL: DrawTool = {
  ink: "ground",
  shape: "rect",
  ground: "ground",
  threshold: { kind: "door", state: "closed", size: "small" },
  height: 5,
  radius: 0.6,
};

/** The shapes `ink` takes. */
export function shapesOf(ink: Ink): readonly DrawShape[] {
  return INKS.find((spec) => spec.ink === ink)?.shapes ?? [];
}

/** `tool` drawing with `ink`; the shape stays unless the ink does not take it. */
export function withInk(tool: DrawTool, ink: Ink): DrawTool {
  const shapes = shapesOf(ink);
  const shape = shapes.includes(tool.shape) ? tool.shape : (shapes[0] ?? tool.shape);
  return { ...tool, ink, shape };
}

/** One line for the record: what a stroke is, in the DM's words. */
export function describeStroke(stroke: Stroke): string {
  switch (stroke.ink) {
    case "ground":
      return `Ground, ${stroke.state}, ${area(stroke.shape)}`;
    case "threshold": {
      const sized = stroke.kind === "window" || stroke.kind === "frosted";
      return `${capital(stroke.kind)}, ${stroke.state}${sized ? `, ${stroke.size}` : ""}`;
    }
    case "wall":
      return stroke.shape.kind === "rect"
        ? `Walls around ${size(stroke.shape.rect.col1 - stroke.shape.rect.col0 + 1, stroke.shape.rect.row1 - stroke.shape.rect.row0 + 1)}`
        : `Wall along ${count(stroke.shape.edges.length, "edge")}`;
    case "height":
      return `Height ${signed(stroke.value)}, ${area(stroke.shape)}`;
    case "level-change":
      return `Level change, ${area(stroke.shape)}`;
    case "free":
      return `Free ink, ${area(stroke.shape)}`;
    case "clear":
      return "Reset: everything before it cleared";
  }
}

/** A height with its sign, as the tool and the record show it. */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function area(shape: Shape): string {
  switch (shape.kind) {
    case "rect":
      return size(shape.rect.col1 - shape.rect.col0 + 1, shape.rect.row1 - shape.rect.row0 + 1);
    case "free":
      return "a free shape";
    case "brush":
      return count(shape.points.length, "dab");
  }
}

function size(cols: number, rows: number): string {
  return `${cols} × ${rows} cells`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

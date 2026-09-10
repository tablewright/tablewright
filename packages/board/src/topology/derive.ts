/**
 * ─ Derivation ─
 *
 * Rebuilds what the rules and the display read from the strokes, in
 * the order they were drawn: the ground state of every cell, the wall
 * or threshold on every edge, the elevation field at eight samples to
 * a cell, and where a level change was painted across it. A later
 * stroke overrides an earlier one; removing a stroke is a rebuild
 * without it. Cheap at map scale, so it runs on every change.
 * Design: docs/design.md §5 "Topology and measurement".
 */

import type {
  Edge,
  GroundState,
  OpeningSize,
  PlayState,
  Shape,
  Stroke,
  ThresholdKind,
  ThresholdPlay,
  ThresholdState,
  Visibility,
} from "@tablewright/schema";
import type { CellExtent } from "../grid/grid-lines.js";
import type { Cell } from "../grid/square-grid.js";
import { edgeCells, edgeKey, rectEdges } from "./edges.js";
import {
  forCellsInShape,
  forCellsTouchedByBrush,
  forSamplesInShape,
  radiusOf,
  sampleHeight,
  sampleWidth,
  type SampleGrid,
} from "./shapes.js";

// A fixed fraction of the cell, never the picture's pixels: contours follow
// the art's curve at any cell size, and the field costs the same everywhere.
export const SAMPLES_PER_CELL = 8;

const GROUND_CODES: Record<GroundState, number> = { void: 0, ground: 1, difficult: 2, air: 3 };
const GROUND_STATES: readonly GroundState[] = ["void", "ground", "difficult", "air"];

// world < party < dm, the same order the core keeps.
const TIER: Record<Visibility, number> = { world: 0, party: 1, dm: 2 };

/** What sits on an edge: solid wall, or an opening with its kind and state. */
export type EdgeData = { readonly edge: Edge } & (
  | { readonly kind: "wall" }
  | {
      readonly kind: "threshold";
      readonly threshold: ThresholdKind;
      /** As drawn, or as play left it. */
      readonly state: ThresholdState | PlayState;
      readonly size: OpeningSize;
    }
);

export type ThresholdEdge = Extract<EdgeData, { kind: "threshold" }>;

export type FreeStroke = Extract<Stroke, { ink: "free" }>;

/** Everything derived from the strokes over one extent of cells. */
export interface Topology {
  readonly bounds: CellExtent;
  readonly samples: SampleGrid;
  /** A ground code per cell, row-major over `bounds`; read it with `groundAt`. */
  readonly ground: Uint8Array;
  readonly edges: ReadonlyMap<string, EdgeData>;
  /** The elevation field, row-major over the samples, in the system's distance unit. */
  readonly field: Float32Array;
  /** 1 where a level change was painted, per sample. */
  readonly levelChange: Uint8Array;
  /** Free ink, kept as drawn; it means nothing to the rules. */
  readonly free: readonly FreeStroke[];
}

/**
 * Apply `strokes` in order over `bounds`, then what `play` did to the
 * thresholds among them. Cells outside the bounds are void.
 */
export function derive(
  strokes: readonly Stroke[],
  bounds: CellExtent,
  play: readonly ThresholdPlay[] = []
): Topology {
  const samples: SampleGrid = { bounds, per: SAMPLES_PER_CELL };
  const field = new Float32Array(sampleWidth(samples) * sampleHeight(samples));
  const topology = {
    bounds,
    samples,
    ground: new Uint8Array(bounds.cols * bounds.rows),
    edges: new Map<string, EdgeData>(),
    field,
    levelChange: new Uint8Array(field.length),
    free: [] as FreeStroke[],
  };
  for (const stroke of strokes) {
    apply(stroke, topology);
  }
  // Play state sits over the record: a door opened stays a door, opened.
  for (const entry of play) {
    const key = edgeKey(entry.edge);
    const data = topology.edges.get(key);
    if (data?.kind === "threshold") {
      topology.edges.set(key, { ...data, state: entry.state });
    }
  }
  return topology;
}

/**
 * The strokes a viewer of `viewer` tier may see. A secret threshold worked
 * in play is revealed: everyone sees the door, in the state play left it.
 */
export function visibleTo(
  strokes: readonly Stroke[],
  viewer: Visibility,
  play: readonly ThresholdPlay[] = []
): Stroke[] {
  const revealed = new Set(play.map((entry) => edgeKey(entry.edge)));
  return strokes.filter(
    (stroke) =>
      TIER[stroke.visibility] <= TIER[viewer] ||
      (stroke.ink === "threshold" && revealed.has(edgeKey(stroke.edge)))
  );
}

/** A cell's place in the ground array, or undefined outside the bounds. */
export function cellIndex(bounds: CellExtent, cell: Cell): number | undefined {
  const col = cell.col - bounds.colMin;
  const row = cell.row - bounds.rowMin;
  if (col < 0 || row < 0 || col >= bounds.cols || row >= bounds.rows) {
    return undefined;
  }
  return row * bounds.cols + col;
}

/** What a cell is for movement; void outside the bounds. */
export function groundAt(topology: Topology, cell: Cell): GroundState {
  const index = cellIndex(topology.bounds, cell);
  const code = index === undefined ? 0 : (topology.ground[index] ?? 0);
  return GROUND_STATES[code] ?? "void";
}

/** The wall or threshold on an edge, if any. */
export function edgeAt(topology: Topology, edge: Edge): EdgeData | undefined {
  return topology.edges.get(edgeKey(edge));
}

/** The field at a cell's centre: the height the rules give the cell. Zero outside. */
export function heightAt(topology: Topology, cell: Cell): number {
  const index = centreSample(topology, cell);
  return index === undefined ? 0 : (topology.field[index] ?? 0);
}

/** Whether a level change was painted over the cell's centre. */
export function isLevelChangeAt(topology: Topology, cell: Cell): boolean {
  const index = centreSample(topology, cell);
  return index !== undefined && topology.levelChange[index] === 1;
}

interface Mutable {
  readonly bounds: CellExtent;
  readonly samples: SampleGrid;
  readonly ground: Uint8Array;
  readonly edges: Map<string, EdgeData>;
  readonly field: Float32Array;
  readonly levelChange: Uint8Array;
  readonly free: FreeStroke[];
}

function apply(stroke: Stroke, topology: Mutable): void {
  switch (stroke.ink) {
    case "ground": {
      const code = GROUND_CODES[stroke.state];
      const paint = (col: number, row: number): void => {
        const index = cellIndex(topology.bounds, { col, row });
        if (index !== undefined) {
          topology.ground[index] = code;
        }
      };
      // A ground brush converts every cell it touches, however thin; the
      // field's brushes cover the samples under the disc instead.
      if (stroke.shape.kind === "brush") {
        forCellsTouchedByBrush(
          stroke.shape.points,
          radiusOf(stroke.shape.radius),
          topology.bounds,
          paint
        );
      } else {
        forCellsInShape(stroke.shape, topology.bounds, paint);
      }
      break;
    }
    case "wall": {
      const edges =
        stroke.shape.kind === "line" ? stroke.shape.edges : rectEdges(stroke.shape.rect);
      for (const edge of edges) {
        if (touchesBounds(edge, topology.bounds)) {
          topology.edges.set(edgeKey(edge), { edge, kind: "wall" });
        }
      }
      break;
    }
    case "threshold":
      if (touchesBounds(stroke.edge, topology.bounds)) {
        topology.edges.set(edgeKey(stroke.edge), {
          edge: stroke.edge,
          kind: "threshold",
          threshold: stroke.kind,
          state: stroke.state,
          size: stroke.size,
        });
      }
      break;
    case "height":
      forSamplesInShape(stroke.shape, topology.samples, (index) => {
        topology.field[index] = stroke.value;
        topology.levelChange[index] = 0;
      });
      break;
    case "level-change":
      paintLevelChange(stroke.shape, topology);
      break;
    case "free":
      topology.free.push(stroke);
      break;
    case "clear":
      topology.ground.fill(0);
      topology.edges.clear();
      topology.field.fill(0);
      topology.levelChange.fill(0);
      topology.free.length = 0;
      break;
  }
}

// A level change smooths the field under it into a slope between the
// heights on either side, so crossing it is a step rather than a climb,
// and marks the samples for the rules and the display.
function paintLevelChange(shape: Shape, topology: Mutable): void {
  const { samples, field } = topology;
  const width = sampleWidth(samples);
  const height = sampleHeight(samples);
  const reach = samples.per;
  forSamplesInShape(shape, samples, (index, i, j) => {
    let sum = 0;
    let count = 0;
    for (let dj = -reach; dj <= reach; dj += 2) {
      for (let di = -reach; di <= reach; di += 2) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= width || jj >= height) {
          continue;
        }
        sum += field[jj * width + ii] ?? 0;
        count += 1;
      }
    }
    field[index] = count === 0 ? 0 : sum / count;
    topology.levelChange[index] = 1;
  });
}

function touchesBounds(edge: Edge, bounds: CellExtent): boolean {
  const [a, b] = edgeCells(edge);
  return cellIndex(bounds, a) !== undefined || cellIndex(bounds, b) !== undefined;
}

function centreSample(topology: Topology, cell: Cell): number | undefined {
  if (cellIndex(topology.bounds, cell) === undefined) {
    return undefined;
  }
  const { bounds, per } = topology.samples;
  const half = Math.floor(per / 2);
  const i = (cell.col - bounds.colMin) * per + half;
  const j = (cell.row - bounds.rowMin) * per + half;
  return j * sampleWidth(topology.samples) + i;
}

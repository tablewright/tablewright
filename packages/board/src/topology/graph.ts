/**
 * ─ Movement graph ─
 *
 * What the rules read of a topology, flat: a code and a height per cell,
 * whether stairs are painted on it, and whether its east and south edges
 * let movement through. Built once per topology and kept beside it, so a
 * search reads typed arrays and never a string key. The graph the design
 * names among the derived rasters.
 * Design: docs/design.md §5 "The record is strokes".
 */

import type { CellExtent } from "../grid/grid-lines.js";
import type { Cell } from "../grid/square-grid.js";
import { cellIndex, heightAt, isLevelChangeAt, type Topology } from "./derive.js";
import { passes } from "./effect.js";

/** Ground codes as `Topology.ground` keeps them. */
export const VOID = 0;
export const GROUND = 1;
export const DIFFICULT = 2;
export const AIR = 3;

export interface MovementGraph {
  readonly bounds: CellExtent;
  /** A ground code per cell, row-major: the topology's own array. */
  readonly ground: Uint8Array;
  /** The field at each cell's centre. */
  readonly height: Float32Array;
  /** 1 where a level change is painted over the cell's centre. */
  readonly stairs: Uint8Array;
  /** 1 where movement passes the cell's east edge. */
  readonly east: Uint8Array;
  /** 1 where movement passes the cell's south edge. */
  readonly south: Uint8Array;
}

const graphs = new WeakMap<Topology, MovementGraph>();

/** The movement graph of `topology`, built on first ask and kept with it. */
export function movementGraph(topology: Topology): MovementGraph {
  const kept = graphs.get(topology);
  if (kept !== undefined) {
    return kept;
  }
  const built = build(topology);
  graphs.set(topology, built);
  return built;
}

/** A cell's place in the graph's arrays, or undefined outside the bounds. */
export function graphIndex(graph: MovementGraph, cell: Cell): number | undefined {
  return cellIndex(graph.bounds, cell);
}

/** The cell at a place in the graph's arrays. */
export function graphCell(graph: MovementGraph, index: number): Cell {
  const { colMin, rowMin, cols } = graph.bounds;
  return { col: colMin + (index % cols), row: rowMin + Math.floor(index / cols) };
}

function build(topology: Topology): MovementGraph {
  const { bounds } = topology;
  const cells = bounds.cols * bounds.rows;
  const height = new Float32Array(cells);
  const stairs = new Uint8Array(cells);
  const east = new Uint8Array(cells).fill(1);
  const south = new Uint8Array(cells).fill(1);
  for (let index = 0; index < cells; index += 1) {
    const cell = graphCell({ bounds, ground: topology.ground, height, stairs, east, south }, index);
    height[index] = heightAt(topology, cell);
    stairs[index] = isLevelChangeAt(topology, cell) ? 1 : 0;
  }
  for (const data of topology.edges.values()) {
    if (passes(data, "move")) {
      continue;
    }
    const index = cellIndex(bounds, data.edge);
    if (index === undefined) {
      continue;
    }
    if (data.edge.side === "east") {
      east[index] = 0;
    } else {
      south[index] = 0;
    }
  }
  return { bounds, ground: topology.ground, height, stairs, east, south };
}

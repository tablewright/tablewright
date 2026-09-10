/**
 * ─ Cost ─
 *
 * One step priced for a mover: the ground it lands on, the edge it
 * crosses, and the rise it makes, which is walked, climbed, dropped or
 * flown. A diagonal needs both ways round the corner open. A jump
 * clears a gap of lower cells by Strength. Every number here is 5e's
 * and becomes a manifest parameter with the next system.
 * Design: docs/design.md §5 "Vertical edges have kinds".
 */

import type { Cell } from "../grid/square-grid.js";
import type { Topology } from "./derive.js";
import { diagonalCost, distance, type GridRule } from "./distance.js";
import {
  AIR,
  DIFFICULT,
  GROUND,
  VOID,
  graphCell,
  graphIndex,
  movementGraph,
  type MovementGraph,
} from "./graph.js";

/** Who is moving: their speeds and what a jump reaches. */
export interface Mover {
  /** Walking speed in the rule's unit; what a turn budgets on foot. */
  readonly walk: number;
  /** A fly speed: the mover flies, crossing air and pricing steps by their 3D length. */
  readonly fly?: number;
  /** A climb speed makes a climb cost 1:1 instead of 2:1. */
  readonly climb?: number;
  /** Strength score: how far a long jump reaches, in the rule's unit. */
  readonly strength: number;
}

/** A person on foot with nothing special, until sheets bring the real numbers. */
export const DEFAULT_MOVER: Mover = { walk: 30, strength: 10 };

export type StepKind = "walk" | "climb" | "drop" | "fly" | "jump";

/** One step into an adjacent cell, priced. */
export interface Step {
  readonly kind: StepKind;
  /** Movement spent, in the rule's unit. */
  readonly cost: number;
  /** The height gained, negative for a fall. */
  readonly rise: number;
  /** Dice of falling damage a drop costs; the drop itself is free. */
  readonly dice: number;
}

export interface StepOptions {
  /** Whether the mover will take a fall rather than be stopped by it. */
  readonly drops: boolean;
  /** How many diagonals the path has taken, for the alternating rule. */
  readonly diagonals: number;
}

/** A long jump: over a gap, landing level, priced by the cells crossed. */
export interface Jump {
  readonly to: Cell;
  readonly cost: number;
  /** The gap cleared, in the rule's unit. */
  readonly gap: number;
  readonly over: readonly Cell[];
}

// A fall costs a die for every this much fallen, up to so many dice.
const DROP_PER_DIE = 10;
const MOST_DICE = 20;
// Without a climb speed every unit risen costs two of movement.
const CLIMB_WITHOUT_SPEED = 2;

const ORTHOGONAL: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Whether the mover flies: a fly speed means it does. */
export function isFlying(mover: Mover): boolean {
  return mover.fly !== undefined && mover.fly > 0;
}

/** The speed a turn budgets: the fly speed of a flier, else the walk. */
export function speedOf(mover: Mover): number {
  return isFlying(mover) ? (mover.fly ?? 0) : mover.walk;
}

/** A step is walked when the rise is within this; more is a climb or a drop. */
export function stepHeight(rule: GridRule): number {
  return rule.cellSize;
}

/**
 * The cost of stepping from `from` into the adjacent `to`, or undefined
 * when the mover cannot: a wall or a shut door between, void, air under
 * a walker, a corner that cannot be cut, or a fall the mover will not
 * take.
 */
export function stepCost(
  topology: Topology,
  from: Cell,
  to: Cell,
  mover: Mover,
  rule: GridRule,
  options: StepOptions
): Step | undefined {
  const graph = movementGraph(topology);
  const start = graphIndex(graph, from);
  const end = graphIndex(graph, to);
  if (start === undefined || end === undefined) {
    return undefined;
  }
  return stepCostAt(graph, start, end, to.col - from.col, to.row - from.row, mover, rule, options);
}

/**
 * `stepCost` on the graph's own indices, with the step as a direction: the
 * form a search takes, with no cell in hand.
 */
export function stepCostAt(
  graph: MovementGraph,
  from: number,
  to: number,
  dc: number,
  dr: number,
  mover: Mover,
  rule: GridRule,
  options: StepOptions
): Step | undefined {
  if (Math.abs(dc) > 1 || Math.abs(dr) > 1 || (dc === 0 && dr === 0)) {
    return undefined;
  }
  const flying = isFlying(mover);
  const diagonal = dc !== 0 && dr !== 0;
  if (diagonal) {
    const viaCol = from + dc;
    const viaRow = from + dr * graph.bounds.cols;
    if (
      !legOpen(graph, from, viaCol, dc, 0, flying) ||
      !legOpen(graph, viaCol, to, 0, dr, flying) ||
      !legOpen(graph, from, viaRow, 0, dr, flying) ||
      !legOpen(graph, viaRow, to, dc, 0, flying)
    ) {
      return undefined;
    }
  } else if (!legOpen(graph, from, to, dc, dr, flying)) {
    return undefined;
  }
  const rise = (graph.height[to] ?? 0) - (graph.height[from] ?? 0);
  const stairs = graph.stairs[from] === 1 || graph.stairs[to] === 1;
  const vertical = priceRise(rise, mover, rule, stairs, options.drops);
  if (vertical === undefined) {
    return undefined;
  }
  let base: number;
  if (flying) {
    base = distance(
      { col: 0, row: 0, height: 0 },
      { col: Math.abs(dc), row: Math.abs(dr), height: rise },
      rule
    );
  } else {
    base = diagonal ? diagonalCost(rule, options.diagonals) : rule.cellSize;
    if (graph.ground[to] === DIFFICULT) {
      base *= 2;
    }
  }
  return { kind: vertical.kind, cost: base + vertical.extra, rise, dice: vertical.dice };
}

/**
 * The long jumps open to the mover from `from`: straight over one or
 * more cells of air or lower ground, landing level, as far as Strength
 * reaches. Fliers have no need of them.
 */
export function jumpsFrom(topology: Topology, from: Cell, mover: Mover, rule: GridRule): Jump[] {
  const graph = movementGraph(topology);
  const start = graphIndex(graph, from);
  return start === undefined ? [] : jumpsAt(graph, start, mover, rule);
}

/** `jumpsFrom` on a graph index. */
export function jumpsAt(graph: MovementGraph, from: number, mover: Mover, rule: GridRule): Jump[] {
  if (isFlying(mover)) {
    return [];
  }
  const { cols, rows } = graph.bounds;
  const col = from % cols;
  const row = Math.floor(from / cols);
  const here = graph.height[from] ?? 0;
  const jumps: Jump[] = [];
  for (const [dc, dr] of ORTHOGONAL) {
    for (let cells = 2; (cells - 1) * rule.cellSize <= mover.strength; cells += 1) {
      const over: Cell[] = [];
      let previous = from;
      let clear = true;
      for (let i = 1; i < cells && clear; i += 1) {
        const c = col + dc * i;
        const r = row + dr * i;
        if (c < 0 || r < 0 || c >= cols || r >= rows) {
          clear = false;
          break;
        }
        const index = r * cols + c;
        const ground = graph.ground[index] ?? VOID;
        const isGap =
          ground === AIR ||
          (ground !== VOID && (graph.height[index] ?? 0) < here - stepHeight(rule));
        clear = isGap && edgeOpen(graph, previous, index, dc, dr);
        over.push(graphCell(graph, index));
        previous = index;
      }
      // A cell that is no gap stops every longer jump over it too.
      if (!clear) {
        break;
      }
      const c = col + dc * cells;
      const r = row + dr * cells;
      if (c < 0 || r < 0 || c >= cols || r >= rows) {
        break;
      }
      const land = r * cols + c;
      const ground = graph.ground[land] ?? VOID;
      if (
        (ground === GROUND || ground === DIFFICULT) &&
        Math.abs((graph.height[land] ?? 0) - here) <= stepHeight(rule) &&
        edgeOpen(graph, previous, land, dc, dr)
      ) {
        jumps.push({
          to: graphCell(graph, land),
          cost: cells * rule.cellSize,
          gap: (cells - 1) * rule.cellSize,
          over,
        });
      }
    }
  }
  return jumps;
}

// Whether one orthogonal leg can be taken: the cell entered is not void,
// not air under a walker, and the edge between lets movement through.
function legOpen(
  graph: MovementGraph,
  from: number,
  to: number,
  dc: number,
  dr: number,
  flying: boolean
): boolean {
  const ground = graph.ground[to] ?? VOID;
  if (ground === VOID || (ground === AIR && !flying)) {
    return false;
  }
  return edgeOpen(graph, from, to, dc, dr);
}

// The edge between two orthogonal neighbours: the east edge of the western
// cell, or the south edge of the northern one.
function edgeOpen(graph: MovementGraph, from: number, to: number, dc: number, dr: number): boolean {
  if (dc !== 0) {
    return graph.east[dc > 0 ? from : to] === 1;
  }
  return graph.south[dr > 0 ? from : to] === 1;
}

// What the rise costs on top of the step: nothing walked or flown, the
// climb's extra movement, or a fall's dice; undefined for a fall refused.
function priceRise(
  rise: number,
  mover: Mover,
  rule: GridRule,
  stairs: boolean,
  drops: boolean
): { kind: StepKind; extra: number; dice: number } | undefined {
  if (isFlying(mover)) {
    return { kind: "fly", extra: 0, dice: 0 };
  }
  if (stairs || Math.abs(rise) <= stepHeight(rule)) {
    return { kind: "walk", extra: 0, dice: 0 };
  }
  if (rise > 0) {
    return {
      kind: "climb",
      extra: rise * (mover.climb === undefined ? CLIMB_WITHOUT_SPEED : 1),
      dice: 0,
    };
  }
  return drops
    ? { kind: "drop", extra: 0, dice: Math.min(MOST_DICE, Math.floor(-rise / DROP_PER_DIE)) }
    : undefined;
}

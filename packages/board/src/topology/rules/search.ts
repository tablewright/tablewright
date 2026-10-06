/**
 * ─ Search ─
 *
 * One A* search over the movement graph, as the routes run it: the state
 * per cell and diagonal parity in flat arrays, a binary heap for the open
 * set, and the route read back from the goal's state.
 * Design: docs/design.md §5 "Moving shows movement only".
 */

import type { Cell } from "../../grid/square-grid.js";
import { jumpsAt, stepCostAt, type Mover, type StepKind } from "./cost.js";
import type { Topology } from "../derive.js";
import type { GridRule } from "./distance.js";
import { graphCell, graphIndex, movementGraph, type MovementGraph } from "./graph.js";
import type { Route, RouteStep } from "./route.js";

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const JUMP = DIRECTIONS.length;
const NONE = -1;

// Far below a cell, as fractions of one: they order equal routes and never
// change a cost that matters.
const TURN = 0.001;
export const STRAY = 0.0001;

const KIND_CODES: readonly StepKind[] = ["walk", "climb", "drop", "fly", "jump"];
const START = 255;

/**
 * One search over the cells, its state per cell and diagonal parity kept in
 * flat arrays: the best total so far, the movement alone, the tie-break
 * alone, and how each state was reached.
 */
export class Search {
  private readonly graph: MovementGraph;
  private readonly best: Float64Array;
  private readonly spent: Float64Array;
  private readonly tie: Float64Array;
  private readonly parent: Int32Array;
  private readonly kind: Uint8Array;
  private readonly rise: Float32Array;
  private readonly dice: Uint8Array;
  private readonly direction: Int8Array;
  private readonly heapKeys: number[] = [];
  private readonly heapStates: number[] = [];

  constructor(
    topology: Topology,
    private readonly mover: Mover,
    private readonly rule: GridRule,
    private readonly drops: boolean
  ) {
    const { cols, rows } = topology.bounds;
    const states = cols * rows * 2;
    this.graph = movementGraph(topology);
    this.best = new Float64Array(states).fill(Infinity);
    this.spent = new Float64Array(states);
    this.tie = new Float64Array(states);
    this.parent = new Int32Array(states).fill(NONE);
    this.kind = new Uint8Array(states);
    this.rise = new Float32Array(states);
    this.dice = new Uint8Array(states);
    this.direction = new Int8Array(states).fill(NONE);
  }

  /**
   * Expand from `from` until `isGoal` names a cell or the movement passes
   * `limit`; the goal's state, or undefined.
   */
  run(
    from: Cell,
    isGoal: (index: number) => boolean,
    guide: (cell: Cell) => number,
    limit: number
  ): number | undefined {
    const start = graphIndex(this.graph, from);
    if (start === undefined) {
      return undefined;
    }
    const { cols, rows } = this.graph.bounds;
    const alternating = this.rule.diagonals === "alternate";
    const origin = start * 2;
    this.best[origin] = 0;
    this.kind[origin] = START;
    this.push(guide(from), origin);
    while (this.heapKeys.length > 0) {
      const { key, state } = this.pop();
      if (key - guide(this.cellOf(state)) > (this.best[state] ?? Infinity) + 1e-9) {
        continue;
      }
      const index = state >> 1;
      if (isGoal(index)) {
        return state;
      }
      const g = this.spent[state] ?? 0;
      if (g > limit) {
        break;
      }
      const parity = state & 1;
      const col = index % cols;
      const row = Math.floor(index / cols);
      for (let d = 0; d < DIRECTIONS.length; d += 1) {
        const [dc, dr] = DIRECTIONS[d] ?? [0, 0];
        const nextCol = col + dc;
        const nextRow = row + dr;
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) {
          continue;
        }
        const nextIndex = nextRow * cols + nextCol;
        const step = stepCostAt(this.graph, index, nextIndex, dc, dr, this.mover, this.rule, {
          drops: this.drops,
          diagonals: parity,
        });
        if (step === undefined) {
          continue;
        }
        const diagonal = dc !== 0 && dr !== 0;
        const nextParity = alternating && diagonal ? 1 - parity : parity;
        this.relax(
          state,
          nextIndex * 2 + nextParity,
          step.cost,
          step.kind,
          step.rise,
          step.dice,
          d,
          guide
        );
      }
      for (const jump of jumpsAt(this.graph, index, this.mover, this.rule)) {
        const landing = graphIndex(this.graph, jump.to);
        if (landing !== undefined) {
          this.relax(state, landing * 2 + parity, jump.cost, "jump", 0, 0, JUMP, guide);
        }
      }
    }
    return undefined;
  }

  /** The route that reached `state`, from the start. */
  routeTo(state: number): Route {
    const steps: RouteStep[] = [];
    const kinds = new Set<StepKind>();
    let dice = 0;
    for (let at = state; at !== NONE; at = this.parent[at] ?? NONE) {
      const code = this.kind[at] ?? START;
      const kind = code === START ? "start" : (KIND_CODES[code] ?? "walk");
      if (kind !== "start") {
        kinds.add(kind);
      }
      dice += this.dice[at] ?? 0;
      steps.push({
        cell: this.cellOf(at),
        kind,
        rise: this.rise[at] ?? 0,
        cost: this.spent[at] ?? 0,
        dice: this.dice[at] ?? 0,
      });
    }
    steps.reverse();
    return { steps, cost: this.spent[state] ?? 0, dice, kinds };
  }

  /** Movement spent per cell, the lesser parity, Infinity past `limit` or unreached. */
  costs(limit: number): Float32Array {
    const cells = this.best.length / 2;
    const costs = new Float32Array(cells).fill(Infinity);
    for (let state = 0; state < this.best.length; state += 1) {
      if ((this.best[state] ?? Infinity) === Infinity) {
        continue;
      }
      const g = this.spent[state] ?? 0;
      const cell = state >> 1;
      if (g <= limit && g < (costs[cell] ?? Infinity)) {
        costs[cell] = g;
      }
    }
    return costs;
  }

  private relax(
    from: number,
    to: number,
    cost: number,
    kind: StepKind,
    rise: number,
    dice: number,
    direction: number,
    guide: (cell: Cell) => number
  ): void {
    const g = (this.spent[from] ?? 0) + cost;
    const previous = this.direction[from] ?? NONE;
    const turned = previous !== NONE && previous !== direction;
    const tie = (this.tie[from] ?? 0) + (turned ? TURN * this.rule.cellSize : 0);
    const total = g + tie;
    if (total >= (this.best[to] ?? Infinity)) {
      return;
    }
    this.best[to] = total;
    this.spent[to] = g;
    this.tie[to] = tie;
    this.parent[to] = from;
    this.kind[to] = KIND_CODES.indexOf(kind);
    this.rise[to] = rise;
    this.dice[to] = dice;
    this.direction[to] = direction;
    this.push(total + guide(this.cellOf(to)), to);
  }

  private cellOf(state: number): Cell {
    return graphCell(this.graph, state >> 1);
  }

  // A binary heap on two parallel arrays: the key, and the state it orders.
  private push(key: number, state: number): void {
    const keys = this.heapKeys;
    const states = this.heapStates;
    keys.push(key);
    states.push(state);
    let i = keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((keys[p] ?? 0) <= (keys[i] ?? 0)) {
        break;
      }
      swap(keys, states, p, i);
      i = p;
    }
  }

  private pop(): { key: number; state: number } {
    const keys = this.heapKeys;
    const states = this.heapStates;
    const top = { key: keys[0] ?? Infinity, state: states[0] ?? 0 };
    const lastKey = keys.pop() ?? 0;
    const lastState = states.pop() ?? 0;
    if (keys.length > 0) {
      keys[0] = lastKey;
      states[0] = lastState;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < keys.length && (keys[l] ?? 0) < (keys[m] ?? 0)) {
          m = l;
        }
        if (r < keys.length && (keys[r] ?? 0) < (keys[m] ?? 0)) {
          m = r;
        }
        if (m === i) {
          break;
        }
        swap(keys, states, m, i);
        i = m;
      }
    }
    return top;
  }
}

function swap(keys: number[], states: number[], a: number, b: number): void {
  const key = keys[a] ?? 0;
  const state = states[a] ?? 0;
  keys[a] = keys[b] ?? 0;
  states[a] = states[b] ?? 0;
  keys[b] = key;
  states[b] = state;
}

import type { GroundState } from "@tablewright/schema";
import type { Cell } from "../grid/square-grid.js";
import { groundAt, heightAt, isLevelChangeAt, type Topology } from "./derive.js";

/** What the topology says about the cell under the tool. */
export interface CellReadout {
  readonly cell: Cell;
  readonly ground: GroundState;
  /** In the rule's unit. */
  readonly height: number;
  readonly isLevelChange: boolean;
}

/** What `topology` says about `cell`: its ground, its height, and whether a level change crosses it. */
export function readoutAt(topology: Topology, cell: Cell): CellReadout {
  return {
    cell,
    ground: groundAt(topology, cell),
    height: heightAt(topology, cell),
    isLevelChange: isLevelChangeAt(topology, cell),
  };
}

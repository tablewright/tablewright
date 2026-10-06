/**
 * ─ Threshold tap ─
 *
 * A tap in Play near a threshold's edge is for the threshold, and the
 * pointer over one lights it first, so a door reads as something to work.
 * An arch is always open, so it is never offered. The host feeds the tool
 * the points the camera's input reports and hears what it found, as it
 * does for the ruler.
 * Design: docs/design.md §5 "Topology and measurement".
 */

import type { Edge } from "@tablewright/schema";
import { edgeNear } from "../../draw/gestures.js";
import type { Point } from "../../shared/geometry.js";
import { worldToCellPoint, type SquareGrid } from "../../grid/square-grid.js";
import { Listeners } from "../../shared/listeners.js";
import { edgeAt, type ThresholdEdge, type Topology } from "../derive.js";
import { edgeKey } from "../edges.js";

// How near a tap must be to an edge, in cells, to mean the threshold on it
// rather than the cell; tighter than the pen's reach, since a tap on a cell
// is also how a selection is cleared.
const TAP_REACH = 0.25;

/** A tap in Play landed on a threshold: what it is, and where. */
export type ThresholdListener = (threshold: ThresholdEdge) => void;

/** Finds the threshold under a tap or under the pointer, and tells who listens. */
export class ThresholdTap {
  private readonly toWorld: (screen: Point) => Point;
  private readonly topology: () => Topology;
  private readonly tapListeners = new Listeners<ThresholdEdge>();
  private readonly highlightListeners = new Listeners<Edge | undefined>();
  private grid: SquareGrid;
  private highlighted: string | undefined;

  /**
   * `toWorld` maps a point on the canvas to world pixels: the camera's
   * inverse. `topology` is asked at each point, since the host derives it
   * afresh whenever the strokes change.
   */
  constructor(grid: SquareGrid, toWorld: (screen: Point) => Point, topology: () => Topology) {
    this.grid = grid;
    this.toWorld = toWorld;
    this.topology = topology;
  }

  setGrid(grid: SquareGrid): void {
    this.grid = grid;
  }

  /** Hear every threshold tapped. Returns the unsubscribe. */
  onThreshold(listener: ThresholdListener): () => void {
    return this.tapListeners.add(listener);
  }

  /** Hear the threshold lit under the pointer, or none. Returns the unsubscribe. */
  onHighlight(listener: (edge: Edge | undefined) => void): () => void {
    return this.highlightListeners.add(listener);
  }

  /**
   * Whether a tap at `at` landed on a threshold, which the listeners then
   * hear; anywhere else is a tap on nothing, which is the host's to answer.
   */
  tap(at: Point): boolean {
    const threshold = this.thresholdNear(at);
    if (threshold === undefined) {
      return false;
    }
    this.tapListeners.emit(threshold);
    return true;
  }

  /** Light the threshold under `at`, and put out any other. */
  hover(at: Point): void {
    this.setHighlight(this.thresholdNear(at)?.edge);
  }

  /** Put the light out, as when the pointer leaves the board or a tool is taken up. */
  clear(): void {
    this.setHighlight(undefined);
  }

  // The threshold a point on the board is over, if it is one a tap can
  // work: an arch is always open, so it is not offered.
  private thresholdNear(at: Point): ThresholdEdge | undefined {
    const edge = edgeNear(worldToCellPoint(this.grid, this.toWorld(at)), TAP_REACH);
    const data = edge === undefined ? undefined : edgeAt(this.topology(), edge);
    return data?.kind === "threshold" && data.threshold !== "arch" ? data : undefined;
  }

  private setHighlight(edge: Edge | undefined): void {
    const key = edge === undefined ? undefined : edgeKey(edge);
    if (key === this.highlighted) {
      return;
    }
    this.highlighted = key;
    this.highlightListeners.emit(edge);
  }
}

/**
 * ─ Area host ─
 *
 * The area tool and its layer, wired as one: the tool takes the pointer
 * and says where an area lies and which way it aims; the layer draws what
 * it covers and whom it catches, judged against the scene as it stands.
 * The ring about a caught token is the one thing on the board that moves
 * on its own, so while an area shows each frame asks for the next, unless
 * the person asked for less motion: then it stands still and the board rests.
 * Design: docs/design.md §5 "Templates are areas, laid down from the
 * same column".
 */

import {
  AreaLayer,
  AreaTool,
  Listeners,
  catchesToken,
  caughtCells,
  cubeCentre,
  heightAt,
  type Area,
  type AreaDrawing,
  type AreaListener,
  type AreaStyle,
  type BoardStage,
  type Cell,
  type GridRule,
  type OriginSnap,
  type PlacedArea,
  type Point,
  type Seat,
  type Spot,
  type SquareGrid,
  type TokenView,
  type Topology,
} from "@tablewright/board";
import type { Visibility } from "@tablewright/schema";
import { REDUCED_MOTION } from "../shell/motion.js";

/** The area tool and its layer over one stage, reading the scene as the host holds it now. */
export class AreaHost {
  private readonly stage: BoardStage;
  private readonly layer: AreaLayer;
  private readonly tool: AreaTool;
  private readonly listeners = new Listeners<PlacedArea | undefined>();
  private readonly topology: () => Topology;
  private readonly tokens: () => readonly TokenView[];
  private rule: GridRule;
  private turnedAt = 0;

  /**
   * `topology` and `tokens` are asked at each use, since the host replaces
   * both as the scene changes; `tokens` are the ones this seat sees, each
   * at the height of the ground under it.
   */
  constructor(
    stage: BoardStage,
    grid: SquareGrid,
    rule: GridRule,
    toWorld: (screen: Point) => Point,
    topology: () => Topology,
    tokens: () => readonly TokenView[]
  ) {
    this.stage = stage;
    this.rule = rule;
    this.topology = topology;
    this.tokens = tokens;
    this.layer = new AreaLayer(stage.layers.overlay, grid, rule);
    this.tool = new AreaTool(stage.app.canvas, grid, toWorld, rule, (cell, at) =>
      this.originAt(cell, at)
    );
    this.tool.onChange((placed) => this.show(placed));
    // The wish for less motion can turn mid-show; the next frame answers it
    // either way, so it is asked for.
    REDUCED_MOTION.addEventListener("change", () => this.stage.requestFrame());
  }

  setGrid(grid: SquareGrid): void {
    this.layer.setGrid(grid);
    this.tool.setGrid(grid);
  }

  /**
   * Measure by `rule`; an area already down is measured again, since what
   * it catches is in the rule's unit.
   */
  setRule(rule: GridRule): void {
    this.rule = rule;
    this.layer.setRule(rule);
    this.tool.setRule(rule);
    const placed = this.tool.placed;
    if (placed !== undefined) {
      this.show(placed);
    }
  }

  setStyle(style: AreaStyle): void {
    this.layer.setStyle(style);
  }

  setSeat(seat: Seat): void {
    this.tool.setSeat(seat);
  }

  /** Take the pointer, or let it go. */
  setActive(on: boolean): void {
    this.tool.setActive(on);
  }

  /** The area the palette has made: its kind, its sizes and its form. */
  setArea(area: Area | undefined): void {
    this.tool.setArea(area);
  }

  /** Where an area's origin may sit when one is put down. */
  setSnap(snap: OriginSnap): void {
    this.tool.setSnap(snap);
  }

  /** Who the next area is for; it marks the one on the board too. */
  chooseSeenBy(seenBy: Visibility): void {
    this.tool.chooseSeenBy(seenBy);
  }

  /** Take the area off the board. */
  clear(): void {
    this.tool.clear();
  }

  /** Whether an area is on the board. */
  get isShowing(): boolean {
    return this.layer.isShowing;
  }

  /** Hear the area as it is turned and laid down, so a palette can follow it. */
  onArea(listener: AreaListener): () => void {
    return this.listeners.add(listener);
  }

  /** What the layer last drew, for a dev build to read. */
  drawing(): AreaDrawing {
    return this.layer.drawing();
  }

  /**
   * The ring is the one thing that moves on its own, so while an area shows the
   * board asks for the next frame and turns it by the time that passed. Asked
   * for less motion, it stands still and asks for none, so the board rests.
   */
  turnRing(): void {
    if (!this.layer.isShowing || REDUCED_MOTION.matches) {
      this.turnedAt = 0;
      return;
    }
    const now = performance.now();
    const since = this.turnedAt === 0 ? 0 : (now - this.turnedAt) / 1000;
    this.turnedAt = now;
    this.layer.turn(since);
    this.stage.requestFrame();
  }

  // An area leaves from the middle of the cube of the token pressed on, else
  // from the snapped point half a cell up: cells are judged by their cube's
  // centre, so a floor-level origin loses the nearest ones.
  private originAt(cell: Cell, at: { x: number; y: number }): Spot {
    const token = this.tokens().find(
      (one) => one.cell.col === cell.col && one.cell.row === cell.row
    );
    const ground = heightAt(this.topology(), cell);
    if (token !== undefined) {
      return cubeCentre(cell, ground + (token.elevation ?? 0), this.rule);
    }
    return { x: at.x, y: at.y, z: ground + this.rule.cellSize / 2 };
  }

  // An area laid down or turning: what it covers, and who it holds.
  private show(placed: PlacedArea | undefined): void {
    this.listeners.emit(placed);
    if (placed === undefined) {
      this.layer.clear();
      this.stage.requestFrame();
      return;
    }
    const cells = caughtCells(placed.area, placed.origin, this.topology(), this.rule);
    const tokens = this.tokens()
      .filter((token) => catchesToken(placed.area, placed.origin, token, this.rule))
      .map((token) => token.cell);
    this.layer.show({
      area: placed.area,
      origin: placed.origin,
      cells,
      tokens,
      seenBy: placed.seenBy,
      isPlaced: placed.isPlaced,
    });
    this.stage.requestFrame();
  }
}

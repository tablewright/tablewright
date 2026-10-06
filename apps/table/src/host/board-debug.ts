/**
 * ─ Board debug ─
 *
 * What a dev build exposes on `window.__tablewright` for the stories, and
 * the placeholders a stress run spreads over the map. Every read is asked
 * at the moment a test wants it: the host replaces the scene whole as it
 * changes, so nothing here keeps a copy.
 */

import {
  DEFAULT_MOVER,
  cellCenter,
  distance,
  findRoute,
  heightAt,
  type AreaDrawing,
  type BoardStage,
  type Camera,
  type CameraState,
  type Cell,
  type CellExtent,
  type GridRule,
  type HeightDrawing,
  type HeightLayer,
  type MapLayer,
  type MapSize,
  type NumbersDrawing,
  type NumbersLayer,
  type Point,
  type Route,
  type RouteOptions,
  type RulerTool,
  type ShownMeasure,
  type SquareGrid,
  type TokenLayer,
  type TokenView,
  type Topology,
} from "@tablewright/board";
import type { Stroke } from "@tablewright/schema";
import type { AreaHost } from "./area-host.js";

/** What a dev build exposes on `window.__tablewright` for tests: reads only, no mutation. */
export interface BoardDebug {
  tokens(): readonly TokenView[];
  selectedId(): string | undefined;
  camera(): CameraState;
  bounds(): CellExtent;
  /** The picture on the board by its pixel size, once it has loaded. */
  picture(): MapSize | undefined;
  /** The scene's strokes in the order drawn: the record the board derives from. */
  strokes(): readonly Stroke[];
  /** What the strokes derived to, as this viewer sees it. */
  topology(): Topology;
  /** Screen position of a cell's centre, for pointing a test's mouse at it. */
  cellToScreen(cell: Cell): Point;
  /** The grid rule the board measures by. */
  rule(): GridRule;
  /** The cheapest route for a person on foot, as the rules read this viewer's scene. */
  route(from: Cell, to: Cell, options?: RouteOptions): Route | undefined;
  /** The straight distance between two cells' centres at the field's heights. */
  distance(from: Cell, to: Cell): number;
  /** What the height display last drew. */
  heights(): HeightDrawing;
  /** What the DM's Topology view last printed; nothing while it is off. */
  numbers(): NumbersDrawing;
  /** The area on the board, or nothing while none is laid down. */
  area(): AreaDrawing;
  /** Frames the board has drawn; still while nothing changes. */
  framesDrawn(): number;
  /** The board's clear colour, as the desk's theme last set it. */
  ground(): number;
  /** The measure the ruler shows, in the mode it is read in, or nothing. */
  measurement(): ShownMeasure | undefined;
}

/** What the view reads: the host's layers, and the scene as it holds it now. */
export interface DebugSources {
  readonly stage: BoardStage;
  readonly camera: Camera;
  readonly tokenLayer: TokenLayer;
  readonly mapLayer: MapLayer;
  readonly heightLayer: HeightLayer;
  readonly numbersLayer: NumbersLayer;
  readonly area: AreaHost;
  readonly ruler: RulerTool;
  grid(): SquareGrid;
  rule(): GridRule;
  bounds(): CellExtent;
  topology(): Topology;
  strokes(): readonly Stroke[];
  /** The tokens this seat sees, each at the height of the ground under it. */
  tokens(): readonly TokenView[];
  /** The board's clear colour. */
  ground(): number;
}

/** Read-only view of the scene for dev builds and end-to-end tests. */
export function debugView(board: DebugSources): BoardDebug {
  return {
    tokens: () => board.tokens(),
    selectedId: () => board.tokenLayer.selectedId,
    camera: () => board.camera.current,
    bounds: () => board.bounds(),
    picture: () => board.mapLayer.size(),
    strokes: () => board.strokes(),
    topology: () => board.topology(),
    cellToScreen: (cell) => board.camera.toScreen(cellCenter(board.grid(), cell)),
    rule: () => board.rule(),
    route: (from, to, options) =>
      findRoute(board.topology(), from, to, DEFAULT_MOVER, board.rule(), options),
    distance: (from, to) =>
      distance(
        { ...from, height: heightAt(board.topology(), from) },
        { ...to, height: heightAt(board.topology(), to) },
        board.rule()
      ),
    heights: () => board.heightLayer.drawing(),
    numbers: () => board.numbersLayer.drawing(),
    area: () => board.area.drawing(),
    framesDrawn: () => board.stage.framesDrawn,
    ground: () => board.ground(),
    measurement: () => board.ruler.measurement,
  };
}

/** `count` placeholders spread over `bounds` two cells apart, for stress runs. */
export function placeholderTokens(count: number, bounds: CellExtent): TokenView[] {
  const step = 2;
  const perRow = Math.max(1, Math.floor((bounds.cols - 2) / step));
  return Array.from({ length: count }, (_, index) => ({
    id: `seed-${index}`,
    label: String(index + 1),
    cell: {
      col: 1 + (index % perRow) * step,
      row: Math.min(bounds.rows - 1, 1 + Math.floor(index / perRow) * step),
    },
    facing: (index * 37) % 360,
  }));
}

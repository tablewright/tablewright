/**
 * ─ Board host ─
 *
 * Wires the board package into the Table window: stage, camera, input,
 * map, grid, tokens, and theme. The scene it shows is the core's document
 * (design §5): the host renders what it is given and reports gestures;
 * it never decides what the scene is.
 */

import {
  Camera,
  CameraInput,
  DrawLayer,
  GridLayer,
  MapLayer,
  TokenLayer,
  TopologyLayer,
  cellCenter,
  derive,
  extentCovering,
  groundAt,
  heightAt,
  isLevelChangeAt,
  readBoardTheme,
  visibleExtent,
  visibleTo,
  watchBoardTheme,
  worldToCell,
  type BoardStage,
  type BoardTheme,
  type CameraState,
  type Cell,
  type CellExtent,
  type DrawStyle,
  type DrawTool,
  type Point,
  type SquareGrid,
  type StrokeListener,
  type TokenMove,
  type TokenStyle,
  type TokenView,
  type Topology,
  type TopologyStyle,
} from "@tablewright/board";
import type { GroundState, Scene, Stroke, Visibility } from "@tablewright/schema";

/** What the topology says about the cell under the tool. */
export interface CellReadout {
  readonly cell: Cell;
  readonly ground: GroundState;
  readonly height: number;
  readonly isLevelChange: boolean;
}

export type HoverListener = (readout: CellReadout | undefined) => void;

/** What a dev build exposes on `window.__tablewright` for tests: reads only, no mutation. */
export interface BoardDebug {
  tokens(): readonly TokenView[];
  selectedId(): string | undefined;
  camera(): CameraState;
  bounds(): CellExtent;
  /** What the strokes derived to, as this viewer sees it. */
  topology(): Topology;
  /** Screen position of a cell's centre, for pointing a test's mouse at it. */
  cellToScreen(cell: Cell): Point;
}

/** A finished gesture the scene should record: which token, where, facing what. */
export type TokenMoveListener = (move: TokenMove) => void;

// Screen pixels kept clear around a map when the camera fits to it.
const FIT_PADDING = 24;

function tokenStyle(theme: BoardTheme): TokenStyle {
  return {
    fill: theme.token,
    label: theme.tokenLabel,
    hover: theme.hover,
    selection: theme.selection,
  };
}

function topologyStyle(theme: BoardTheme): TopologyStyle {
  return {
    ground: theme.ground,
    wall: theme.wall,
    threshold: theme.threshold,
    sight: theme.sight,
    difficult: theme.difficult,
    air: theme.air,
  };
}

function drawStyle(theme: BoardTheme): DrawStyle {
  return { hover: theme.hover, ink: theme.threshold };
}

function tokenViews(scene: Scene): TokenView[] {
  return scene.tokens.map((token) => ({
    id: token.id,
    label: token.label,
    cell: { col: token.col, row: token.row },
    facing: token.facing,
  }));
}

export class BoardHost {
  readonly camera: Camera;
  private readonly stage: BoardStage;
  private readonly gridLayer: GridLayer;
  private readonly mapLayer: MapLayer;
  private readonly tokenLayer: TokenLayer;
  private readonly topologyLayer: TopologyLayer;
  private readonly drawLayer: DrawLayer;
  private readonly target: HTMLElement;
  private readonly moveListeners = new Set<TokenMoveListener>();
  private readonly strokeListeners = new Set<StrokeListener>();
  private readonly hoverListeners = new Set<HoverListener>();
  /** Whose view this is: strokes above this tier are never derived, let alone drawn. */
  private readonly viewer: Visibility;
  private grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
  private bounds: CellExtent = { colMin: 0, rowMin: 0, cols: 20, rows: 15 };
  private tokens: readonly TokenView[] = [];
  private strokes: readonly Stroke[] = [];
  private topology: Topology = derive([], this.bounds);
  private isGridStale = true;

  constructor(stage: BoardStage, target: HTMLElement, viewer: Visibility = "dm") {
    this.stage = stage;
    this.target = target;
    this.viewer = viewer;
    this.camera = new Camera(stage.world);
    this.gridLayer = new GridLayer(stage.layers.grid);
    this.mapLayer = new MapLayer(stage.layers.map);
    this.topologyLayer = new TopologyLayer(stage.layers.topology);
    const theme = readBoardTheme(target);
    this.tokenLayer = new TokenLayer(stage.layers.tokens, this.grid, tokenStyle(theme));
    this.drawLayer = new DrawLayer(stage.app.canvas, stage.layers.overlay, this.grid, (screen) =>
      this.camera.toWorld(screen)
    );
    const input = new CameraInput(this.camera, target);
    // Clicking empty board clears the selection, the same as pressing Escape.
    input.onTap(() => this.tokenLayer.select(undefined));

    this.gridLayer.setStyle(theme.grid);
    this.topologyLayer.setStyle(topologyStyle(theme));
    this.drawLayer.setStyle(drawStyle(theme));
    watchBoardTheme(target, (next) => {
      stage.setBackground(next.ground);
      this.gridLayer.setStyle(next.grid);
      this.tokenLayer.setStyle(tokenStyle(next));
      this.topologyLayer.setStyle(topologyStyle(next));
      this.drawLayer.setStyle(drawStyle(next));
    });

    // A finished stroke is the DM's to record; the hovered cell is read
    // off the topology so the tool can say what it is over.
    this.drawLayer.onStroke((stroke) => {
      for (const listener of this.strokeListeners) {
        listener(stroke);
      }
    });
    this.drawLayer.onHover((cell) => {
      const readout = cell === undefined ? undefined : this.readout(cell);
      for (const listener of this.hoverListeners) {
        listener(readout);
      }
    });

    // A drop is the commit point. The layer has already snapped the token to
    // its cell; the host only passes the gesture on, and the scene answers.
    this.tokenLayer.onMove((move) => {
      for (const listener of this.moveListeners) {
        listener(move);
      }
    });

    // Camera and resize events can arrive several times per frame; the grid
    // is rebuilt at most once, just before the frame renders.
    this.camera.onChange(() => {
      this.isGridStale = true;
    });
    stage.onResize(() => {
      this.isGridStale = true;
    });
    stage.app.ticker.add(() => {
      if (this.isGridStale) {
        this.isGridStale = false;
        this.redrawGrid();
      }
    });
  }

  /** Show `scene`: its grid, its bounds, and its tokens. */
  setScene(scene: Scene): void {
    const grid: SquareGrid = {
      cellSize: scene.grid.cell_size,
      originX: scene.grid.origin_x,
      originY: scene.grid.origin_y,
    };
    if (grid.cellSize !== this.grid.cellSize || grid.originX !== this.grid.originX) {
      this.grid = grid;
      this.tokenLayer.setGrid(grid, tokenViews(scene));
      this.drawLayer.setGrid(grid);
      this.isGridStale = true;
    }
    // A loaded map sets its own bounds; the scene's are the fallback.
    if (scene.map === null) {
      this.bounds = { colMin: 0, rowMin: 0, cols: scene.grid.cols, rows: scene.grid.rows };
      this.isGridStale = true;
    }
    this.strokes = scene.strokes;
    this.redrawTopology();
    this.setTokens(tokenViews(scene));
  }

  /** Replace what stands on the board. */
  setTokens(tokens: readonly TokenView[]): void {
    this.tokens = tokens;
    this.tokenLayer.set(tokens);
  }

  /** Hear every finished move gesture. Returns the unsubscribe. */
  onTokenMove(listener: TokenMoveListener): () => void {
    this.moveListeners.add(listener);
    return () => this.moveListeners.delete(listener);
  }

  /** Draw with `tool`, or with nothing: Play mode, where the tokens take presses. */
  setBuildTool(tool: DrawTool | undefined): void {
    this.drawLayer.setTool(tool);
    this.tokenLayer.setInteractive(tool === undefined);
    if (tool === undefined) {
      delete this.target.dataset["tool"];
    } else {
      this.target.dataset["tool"] = tool.shape;
    }
  }

  /** Hear every stroke the tool finishes. Returns the unsubscribe. */
  onStroke(listener: StrokeListener): () => void {
    this.strokeListeners.add(listener);
    return () => this.strokeListeners.delete(listener);
  }

  /** Hear what the tool is over as it moves. Returns the unsubscribe. */
  onHover(listener: HoverListener): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  /** The cell under the middle of the view: where a placed token lands. */
  centerCell(): Cell {
    const { width, height } = this.stage.app.screen;
    return worldToCell(this.grid, this.camera.toWorld({ x: width / 2, y: height / 2 }));
  }

  /** Read-only view of the scene for dev builds and end-to-end tests. */
  debug(): BoardDebug {
    return {
      tokens: () => this.tokens,
      selectedId: () => this.tokenLayer.selectedId,
      camera: () => this.camera.current,
      bounds: () => this.bounds,
      topology: () => this.topology,
      cellToScreen: (cell) => this.camera.toScreen(cellCenter(this.grid, cell)),
    };
  }

  /** Replace the tokens with `count` placeholders spread over the map, for stress runs. */
  seedTokens(count: number): void {
    const step = 2;
    const perRow = Math.max(1, Math.floor((this.bounds.cols - 2) / step));
    this.setTokens(
      Array.from({ length: count }, (_, index) => ({
        id: `seed-${index}`,
        label: String(index + 1),
        cell: {
          col: 1 + (index % perRow) * step,
          row: Math.min(this.bounds.rows - 1, 1 + Math.floor(index / perRow) * step),
        },
        facing: (index * 37) % 360,
      }))
    );
  }

  /** Load a map image, size the grid to it, and frame it in the view. */
  async loadMap(url: string): Promise<void> {
    const size = await this.mapLayer.setImage(url);
    this.bounds = extentCovering(this.grid, size.width, size.height);
    this.redrawTopology();
    this.camera.fit(
      this.stage.app.screen,
      { left: 0, top: 0, right: size.width, bottom: size.height },
      FIT_PADDING
    );
  }

  private readout(cell: Cell): CellReadout {
    return {
      cell,
      ground: groundAt(this.topology, cell),
      height: heightAt(this.topology, cell),
      isLevelChange: isLevelChangeAt(this.topology, cell),
    };
  }

  // The strokes are the record; what the board reads is derived from them
  // afresh, cheap at map scale, whenever they, the bounds or the grid change.
  private redrawTopology(): void {
    this.topology = derive(visibleTo(this.strokes, this.viewer), this.bounds);
    this.topologyLayer.draw(this.topology, this.grid);
  }

  private redrawGrid(): void {
    const { width, height } = this.stage.app.screen;
    const topLeft = this.camera.toWorld({ x: 0, y: 0 });
    const bottomRight = this.camera.toWorld({ x: width, y: height });
    const extent = visibleExtent(
      this.grid,
      { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y },
      this.bounds
    );
    if (extent === undefined) {
      this.gridLayer.clear();
    } else {
      this.gridLayer.draw(this.grid, extent);
    }
  }
}

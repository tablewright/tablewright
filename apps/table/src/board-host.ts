/**
 * ─ Board host ─
 *
 * Wires the board package into the Table window: stage, camera, input,
 * map, grid, tokens, and theme, plus the in-memory scene they show.
 * Scene state lives here only until the Rust scene document arrives.
 */

import {
  Camera,
  CameraInput,
  GridLayer,
  MapLayer,
  TokenLayer,
  cellCenter,
  extentCovering,
  readBoardTheme,
  visibleExtent,
  watchBoardTheme,
  type BoardStage,
  type BoardTheme,
  type CameraState,
  type Cell,
  type CellExtent,
  type Point,
  type SquareGrid,
  type TokenStyle,
  type TokenView,
} from "@tablewright/board";

/** What a dev build exposes on `window.__tablewright` for tests: reads only, no mutation. */
export interface BoardDebug {
  tokens(): readonly TokenView[];
  selectedId(): string | undefined;
  camera(): CameraState;
  bounds(): CellExtent;
  /** Screen position of a cell's centre, for pointing a test's mouse at it. */
  cellToScreen(cell: Cell): Point;
}

// Pixels per cell until a per-map setting exists; 50 px is five feet here.
const CELL_SIZE = 50;

// Screen pixels kept clear around a map when the camera fits to it.
const FIT_PADDING = 24;

// Three tokens inside the dev tavern so dragging can be tried at once.
const SEED_TOKENS: readonly TokenView[] = [
  { id: "seed-a", label: "A", cell: { col: 4, row: 5 }, facing: 90 },
  { id: "seed-b", label: "B", cell: { col: 7, row: 6 }, facing: 0 },
  { id: "seed-c", label: "C", cell: { col: 11, row: 9 }, facing: 315 },
];

function tokenStyle(theme: BoardTheme): TokenStyle {
  return {
    fill: theme.token,
    label: theme.tokenLabel,
    hover: theme.hover,
    selection: theme.selection,
  };
}

export class BoardHost {
  readonly camera: Camera;
  private readonly stage: BoardStage;
  private readonly gridLayer: GridLayer;
  private readonly mapLayer: MapLayer;
  private readonly tokenLayer: TokenLayer;
  private readonly grid: SquareGrid = { cellSize: CELL_SIZE, originX: 0, originY: 0 };
  private bounds: CellExtent = { colMin: 0, rowMin: 0, cols: 40, rows: 30 };
  private tokens: readonly TokenView[] = SEED_TOKENS;
  private isGridStale = true;

  constructor(stage: BoardStage, target: HTMLElement) {
    this.stage = stage;
    this.camera = new Camera(stage.world);
    this.gridLayer = new GridLayer(stage.layers.grid);
    this.mapLayer = new MapLayer(stage.layers.map);
    const theme = readBoardTheme(target);
    this.tokenLayer = new TokenLayer(stage.layers.tokens, this.grid, tokenStyle(theme));
    const input = new CameraInput(this.camera, target);
    // Clicking empty board clears the selection, the same as pressing Escape.
    input.onTap(() => this.tokenLayer.select(undefined));

    this.gridLayer.setStyle(theme.grid);
    watchBoardTheme(target, (next) => {
      stage.setBackground(next.ground);
      this.gridLayer.setStyle(next.grid);
      this.tokenLayer.setStyle(tokenStyle(next));
    });

    this.tokenLayer.set(this.tokens);
    // A drop is the commit point: the scene records the new cell once per gesture.
    this.tokenLayer.onMove(({ id, cell, facing }) => {
      this.tokens = this.tokens.map((token) =>
        token.id === id ? { ...token, cell, facing } : token
      );
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

  /** Read-only view of the scene for dev builds and end-to-end tests. */
  debug(): BoardDebug {
    return {
      tokens: () => this.tokens,
      selectedId: () => this.tokenLayer.selectedId,
      camera: () => this.camera.current,
      bounds: () => this.bounds,
      cellToScreen: (cell) => this.camera.toScreen(cellCenter(this.grid, cell)),
    };
  }

  /** Replace the tokens with `count` placeholders spread over the map, for stress runs. */
  seedTokens(count: number): void {
    const step = 2;
    const perRow = Math.max(1, Math.floor((this.bounds.cols - 2) / step));
    this.tokens = Array.from({ length: count }, (_, index) => ({
      id: `seed-${index}`,
      label: String(index + 1),
      cell: {
        col: 1 + (index % perRow) * step,
        row: Math.min(this.bounds.rows - 1, 1 + Math.floor(index / perRow) * step),
      },
      facing: (index * 37) % 360,
    }));
    this.tokenLayer.set(this.tokens);
  }

  /** Load a map image, size the grid to it, and frame it in the view. */
  async loadMap(url: string): Promise<void> {
    const size = await this.mapLayer.setImage(url);
    this.bounds = extentCovering(this.grid, size.width, size.height);
    this.camera.fit(
      this.stage.app.screen,
      { left: 0, top: 0, right: size.width, bottom: size.height },
      FIT_PADDING
    );
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

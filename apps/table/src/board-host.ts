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
  extentCovering,
  readBoardTheme,
  visibleExtent,
  watchBoardTheme,
  type BoardStage,
  type BoardTheme,
  type CellExtent,
  type SquareGrid,
  type TokenStyle,
  type TokenView,
} from "@tablewright/board";

// Pixels per cell until a per-map setting exists; 50 px is five feet here.
const CELL_SIZE = 50;

// Screen pixels kept clear around a map when the camera fits to it.
const FIT_PADDING = 24;

// Three tokens inside the dev tavern so dragging can be tried at once.
const SEED_TOKENS: readonly TokenView[] = [
  { id: "seed-a", label: "A", cell: { col: 4, row: 5 } },
  { id: "seed-b", label: "B", cell: { col: 7, row: 6 } },
  { id: "seed-c", label: "C", cell: { col: 11, row: 9 } },
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
    new CameraInput(this.camera, target);

    this.gridLayer.setStyle(theme.grid);
    watchBoardTheme(target, (next) => {
      stage.setBackground(next.ground);
      this.gridLayer.setStyle(next.grid);
      this.tokenLayer.setStyle(tokenStyle(next));
    });

    this.tokenLayer.set(this.tokens);
    // A drop is the commit point: the scene records the new cell once per gesture.
    this.tokenLayer.onMove((id, cell) => {
      this.tokens = this.tokens.map((token) => (token.id === id ? { ...token, cell } : token));
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

/**
 * ─ Board host ─
 *
 * Wires the board package into the Table window: stage, camera, input,
 * map, grid, and theme, plus the in-memory scene the grid follows.
 * Scene state lives here only until the Rust scene document arrives.
 */

import {
  Camera,
  CameraInput,
  GridLayer,
  MapLayer,
  extentCovering,
  readBoardTheme,
  visibleExtent,
  watchBoardTheme,
  type BoardStage,
  type CellExtent,
  type SquareGrid,
} from "@tablewright/board";

// Pixels per cell until a per-map setting exists; 50 px is five feet here.
const CELL_SIZE = 50;

// Screen pixels kept clear around a map when the camera fits to it.
const FIT_PADDING = 24;

export class BoardHost {
  readonly camera: Camera;
  private readonly stage: BoardStage;
  private readonly gridLayer: GridLayer;
  private readonly mapLayer: MapLayer;
  private readonly grid: SquareGrid = { cellSize: CELL_SIZE, originX: 0, originY: 0 };
  private bounds: CellExtent = { colMin: 0, rowMin: 0, cols: 40, rows: 30 };
  private isGridStale = true;

  constructor(stage: BoardStage, target: HTMLElement) {
    this.stage = stage;
    this.camera = new Camera(stage.world);
    this.gridLayer = new GridLayer(stage.layers.grid);
    this.mapLayer = new MapLayer(stage.layers.map);
    new CameraInput(this.camera, target);

    this.gridLayer.setStyle(readBoardTheme(target).grid);
    watchBoardTheme(target, (theme) => {
      stage.setBackground(theme.ground);
      this.gridLayer.setStyle(theme.grid);
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

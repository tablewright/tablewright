import "@tablewright/ui/theme.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  BoardStage,
  Camera,
  CameraInput,
  GridLayer,
  readBoardTheme,
  visibleExtent,
  watchBoardTheme,
  type CellExtent,
  type SquareGrid,
} from "@tablewright/board";

const host = document.getElementById("board");
if (host === null) {
  throw new Error("index.html must contain a #board element to mount into");
}

// Placeholder scene until a map defines the grid: 40 x 30 cells of 50 px.
const grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
const bounds: CellExtent = { colMin: 0, rowMin: 0, cols: 40, rows: 30 };

// A board that cannot start is a named state, never a hidden window.
function showFatal(reason: string): void {
  const notice = document.createElement("p");
  notice.className = "fatal";
  notice.textContent = `The board could not start: ${reason}. WebGL is required; check graphics drivers and try again.`;
  document.body.append(notice);
}

function mountBoard(stage: BoardStage, target: HTMLElement): void {
  const camera = new Camera(stage.world);
  const gridLayer = new GridLayer(stage.layers.grid);
  new CameraInput(camera, target);

  gridLayer.setStyle(readBoardTheme(target).grid);
  watchBoardTheme(target, (theme) => {
    stage.setBackground(theme.ground);
    gridLayer.setStyle(theme.grid);
  });

  // Camera and resize events can arrive several times per frame; the grid
  // is rebuilt at most once, just before the frame renders.
  let isGridStale = true;
  const redrawGrid = (): void => {
    const { width, height } = stage.app.screen;
    const topLeft = camera.toWorld({ x: 0, y: 0 });
    const bottomRight = camera.toWorld({ x: width, y: height });
    const extent = visibleExtent(
      grid,
      { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y },
      bounds
    );
    if (extent === undefined) {
      gridLayer.clear();
    } else {
      gridLayer.draw(grid, extent);
    }
  };
  camera.onChange(() => {
    isGridStale = true;
  });
  stage.onResize(() => {
    isGridStale = true;
  });
  stage.app.ticker.add(() => {
    if (isGridStale) {
      isGridStale = false;
      redrawGrid();
    }
  });
}

// The window starts hidden (tauri.conf.json) and shows only after the board
// has rendered its first frame, so the user never sees an empty frame.
try {
  const stage = await BoardStage.create(host, { background: readBoardTheme(host).ground });
  mountBoard(stage, host);
  await stage.firstFrame;
} catch (error) {
  showFatal(error instanceof Error ? error.message : String(error));
}
await getCurrentWindow().show();

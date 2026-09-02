import { getCurrentWindow } from "@tauri-apps/api/window";
import { BoardStage, GridLayer, type CellExtent, type SquareGrid } from "@tablewright/board";

const host = document.getElementById("board");
if (host === null) {
  throw new Error("index.html must contain a #board element to mount into");
}

// Placeholder scene until a map defines the grid: 40 x 30 cells of 50 px.
const grid: SquareGrid = { cellSize: 50, originX: 0, originY: 0 };
const extent: CellExtent = { colMin: 0, rowMin: 0, cols: 40, rows: 30 };

// A board that cannot start is a named state, never a hidden window.
function showFatal(reason: string): void {
  const notice = document.createElement("p");
  notice.className = "fatal";
  notice.textContent = `The board could not start: ${reason}. WebGL is required; check graphics drivers and try again.`;
  document.body.append(notice);
}

// The window starts hidden (tauri.conf.json) and shows only after the board
// has rendered its first frame, so the user never sees an empty frame.
try {
  const stage = await BoardStage.create(host);
  const gridLayer = new GridLayer(stage.layers.grid);
  gridLayer.draw(grid, extent);
  await stage.firstFrame;
} catch (error) {
  showFatal(error instanceof Error ? error.message : String(error));
}
await getCurrentWindow().show();

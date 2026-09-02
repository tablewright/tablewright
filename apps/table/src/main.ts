import { getCurrentWindow } from "@tauri-apps/api/window";
import { snapToCellCenter } from "@tablewright/board";

const app = document.getElementById("app");
if (app === null) {
  throw new Error("index.html must contain a #app element to mount into");
}

// Placeholder until the board mounts in the next step. Calling into the
// board package here proves the workspace wiring end to end.
const snapped = snapToCellCenter({ cellSize: 50, originX: 0, originY: 0 }, { x: 120, y: 80 });
app.textContent = `Table shell ready. Board math answers (${snapped.x}, ${snapped.y}).`;

// The window starts hidden (tauri.conf.json) so the user never sees an empty
// frame. Show it once the first paint has actually happened.
requestAnimationFrame(() => {
  void getCurrentWindow().show();
});

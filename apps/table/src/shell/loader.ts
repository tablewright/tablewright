import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_DESKTOP } from "../core/core.js";

/**
 * Show the desktop app's window. Shown after the first paint: sooner shows
 * the webview's blank white, later leaves the loader's wait unfilled.
 */
export async function showWindow(): Promise<void> {
  if (IS_DESKTOP) {
    await new Promise<number>((painted) => requestAnimationFrame(painted));
    try {
      await getCurrentWindow().show();
    } catch {
      // A window that will not show is no reason to stop loading the board.
    }
  }
}

// The three lengths the wordmark is set to, all of them written down in
// #loading's rules in apps/table/index.html: how long a letter takes to
// draw, the head start the second one gives the first, and how long the
// curtain takes to open.
const DRAW_MS = 1150;
const SECOND_LETTER_MS = 180;
const OPEN_MS = 520;

// Nothing animates while the page is unpainted, so a timer bounds the wait;
// reduced motion draws the mark still, and waits for nothing.
function drawnOnce(mark: Element): Promise<void> {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    mark
      .querySelector("path:last-of-type")
      ?.addEventListener("animationend", () => resolve(), { once: true });
    setTimeout(resolve, DRAW_MS + SECOND_LETTER_MS + OPEN_MS);
  });
}

/** Take the wordmark off the page, once it has drawn: the curtain opens on whatever is behind it. */
export async function openCurtain(): Promise<void> {
  const loading = document.querySelector<HTMLElement>("#loading");
  if (loading !== null) {
    await drawnOnce(loading);
    loading.classList.add("done");
    // Taken off on a timer rather than on transitionend, which does not fire
    // when the page is not being painted, and the curtain would then sit over
    // the board for good.
    setTimeout(() => loading.remove(), OPEN_MS);
  }
}

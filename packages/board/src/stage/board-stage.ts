/**
 * ─ Board stage ─
 *
 * Owns the Pixi application and the layer tree every other board module
 * draws into. The world container is the one thing the camera moves;
 * the layers inside it are ordered map, grid, tokens, overlay, so draw
 * order is a fact of the tree rather than a convention each layer
 * has to remember.
 * Design: docs/design.md §5, hybrid rendering.
 */

import { Application, Container, UPDATE_PRIORITY } from "pixi.js";

export interface BoardStageOptions {
  /** Canvas clear colour as 0xRRGGBB. The theme bridge supplies it once it exists. */
  readonly background?: number;
}

/** World-space layers in draw order. Plain containers that other modules populate. */
export interface BoardLayers {
  readonly map: Container;
  readonly grid: Container;
  readonly tokens: Container;
  readonly overlay: Container;
}

// A shade lighter than the page ground so an empty board is visibly a board.
const DEFAULT_BACKGROUND = 0x1b1d24;

/** A full-size Pixi canvas inside a host element, resized and DPR-corrected automatically. */
export class BoardStage {
  readonly app: Application;
  /** The camera applies its transform here; everything in world space hangs below it. */
  readonly world: Container;
  readonly layers: BoardLayers;
  /** Resolves after the first frame has rendered, for hosts that keep their window hidden until then. */
  readonly firstFrame: Promise<void>;
  private readonly host: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly resizeListeners = new Set<() => void>();
  private dprQuery: MediaQueryList | undefined;

  private constructor(app: Application, host: HTMLElement) {
    this.app = app;
    this.host = host;
    this.world = new Container({ label: "world" });
    this.layers = {
      map: new Container({ label: "map" }),
      grid: new Container({ label: "grid" }),
      tokens: new Container({ label: "tokens" }),
      overlay: new Container({ label: "overlay" }),
    };
    this.world.addChild(this.layers.map, this.layers.grid, this.layers.tokens, this.layers.overlay);
    app.stage.addChild(this.world);

    this.firstFrame = new Promise((resolve) => {
      // UTILITY runs after the application's own render pass (LOW) within a tick.
      app.ticker.addOnce(() => resolve(), undefined, UPDATE_PRIORITY.UTILITY);
    });

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(host);
    this.watchDpr();
  }

  /** Create the Pixi application inside `host`, attach its canvas, and start rendering. */
  static async create(host: HTMLElement, options: BoardStageOptions = {}): Promise<BoardStage> {
    const app = new Application();
    await app.init({
      // WebGL only: the frontend stays engine-neutral (design §4, Platforms).
      preference: "webgl",
      background: options.background ?? DEFAULT_BACKGROUND,
      width: host.clientWidth,
      height: host.clientHeight,
      resolution: window.devicePixelRatio,
      autoDensity: true,
      antialias: true,
    });
    host.appendChild(app.canvas);
    return new BoardStage(app, host);
  }

  /** Stop rendering, detach the canvas, and release GPU resources. */
  destroy(): void {
    this.resizeObserver.disconnect();
    this.dprQuery?.removeEventListener("change", this.onDprChange);
    this.app.destroy({ removeView: true }, { children: true });
  }

  /** Subscribe to canvas size changes; returns the unsubscribe function. */
  onResize(listener: () => void): () => void {
    this.resizeListeners.add(listener);
    return () => {
      this.resizeListeners.delete(listener);
    };
  }

  private fit(): void {
    this.app.renderer.resize(
      this.host.clientWidth,
      this.host.clientHeight,
      window.devicePixelRatio
    );
    for (const listener of this.resizeListeners) {
      listener();
    }
  }

  // A media query matching the current ratio fires once when the window moves
  // to a display with a different one; re-arm it for the new ratio each time.
  private watchDpr(): void {
    this.dprQuery?.removeEventListener("change", this.onDprChange);
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.dprQuery.addEventListener("change", this.onDprChange);
  }

  private readonly onDprChange = (): void => {
    this.fit();
    this.watchDpr();
  };
}

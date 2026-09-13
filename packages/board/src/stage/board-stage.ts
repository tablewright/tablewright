/**
 * ─ Board stage ─
 *
 * Owns the Pixi application and the layer tree every other board module
 * draws into. The world container is the one thing the camera moves;
 * the layers inside it are ordered map, grid, height, topology, tokens,
 * overlay, so draw order is a fact of the tree rather than a convention
 * each layer has to remember. The stage draws on request: its ticker
 * never runs, and a frame comes only when something asks for one.
 * Design: docs/design.md §5, hybrid rendering; the board draws on request.
 */

import { Application, Container, Text } from "pixi.js";
import { FrameScheduler } from "./frame-scheduler.js";

export interface BoardStageOptions {
  /** Canvas clear colour as 0xRRGGBB. The theme bridge supplies it once it exists. */
  readonly background?: number;
}

/** World-space layers in draw order. Plain containers that other modules populate. */
export interface BoardLayers {
  readonly map: Container;
  readonly grid: Container;
  /** How the scene shows its heights over the picture, under what the DM drew. */
  readonly height: Container;
  /** What the DM drew: ground states, walls and thresholds, under the tokens. */
  readonly topology: Container;
  /** The DM's Topology view: the rules' reading printed in every cell that has one. */
  readonly numbers: Container;
  readonly tokens: Container;
  readonly overlay: Container;
}

// A shade lighter than the page ground so an empty board is visibly a board.
const DEFAULT_BACKGROUND = 0x1b1d24;

// Input on the board that can change what it shows; each asks for a frame.
// Caught in the capture phase, since a layer that claims a press stops the
// event before it would bubble to the host element.
const INPUT_EVENTS = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "pointerleave",
  "wheel",
] as const;
const INPUT_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

// How long after the last change of scale the text is drawn again, and how
// far the scale has to have moved to be worth it: an eighth of a doubling,
// which is about the point the eye starts to notice.
const SETTLE_MS = 160;
const SCALE_STEP = 0.125;
// Four times the device's own pixels. A texture grows with the square of
// this, and past here nobody is reading the board anyway.
const MAX_TEXT_RESOLUTION = 4;

/** Draw every piece of text under `root` again at `resolution`. */
function sharpen(root: Container, resolution: number): void {
  for (const child of root.children) {
    if (child instanceof Text) {
      if (child.resolution !== resolution) {
        child.resolution = resolution;
      }
    } else if (child instanceof Container) {
      sharpen(child, resolution);
    }
  }
}

/** A full-size Pixi canvas inside a host element, resized and DPR-corrected automatically. */
export class BoardStage {
  readonly app: Application;
  /** The camera applies its transform here; everything in world space hangs below it. */
  readonly world: Container;
  readonly layers: BoardLayers;
  /** Resolves once the first frame has been drawn, for hosts that keep their window hidden until then. */
  readonly firstFrame: Promise<void>;
  private readonly host: HTMLElement;
  private readonly scheduler: FrameScheduler;
  private readonly resizeObserver: ResizeObserver;
  private readonly resizeListeners = new Set<() => void>();
  private readonly beforeDrawListeners = new Set<() => void>();
  private resolveFirstFrame: () => void = () => {};
  private sharpenAt: ReturnType<typeof setTimeout> | undefined;
  private sharpenedFor = 0;
  private dprQuery: MediaQueryList | undefined;

  private constructor(app: Application, host: HTMLElement) {
    this.app = app;
    this.host = host;
    this.world = new Container({ label: "world" });
    this.layers = {
      map: new Container({ label: "map" }),
      grid: new Container({ label: "grid" }),
      height: new Container({ label: "height" }),
      topology: new Container({ label: "topology" }),
      numbers: new Container({ label: "numbers" }),
      tokens: new Container({ label: "tokens" }),
      overlay: new Container({ label: "overlay" }),
    };
    this.world.addChild(
      this.layers.map,
      this.layers.grid,
      this.layers.height,
      this.layers.topology,
      this.layers.numbers,
      this.layers.tokens,
      this.layers.overlay
    );
    app.stage.addChild(this.world);

    this.firstFrame = new Promise((resolve) => {
      this.resolveFirstFrame = resolve;
    });
    this.scheduler = new FrameScheduler(
      (draw) => {
        requestAnimationFrame(draw);
      },
      () => this.draw()
    );
    for (const type of INPUT_EVENTS) {
      host.addEventListener(type, this.onInput, INPUT_OPTIONS);
    }
    // The board acts on key presses; a release changes nothing it shows.
    window.addEventListener("keydown", this.onInput, INPUT_OPTIONS);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(host);
    this.watchDpr();
    // The stage asks for its own first frame, so a host that waits on it
    // never waits on a change that has yet to come.
    this.requestFrame();
  }

  /** Create the Pixi application inside `host` and attach its canvas; the first frame follows. */
  static async create(host: HTMLElement, options: BoardStageOptions = {}): Promise<BoardStage> {
    const app = new Application();
    await app.init({
      // WebGL only: the frontend stays engine-neutral (design §4, Platforms).
      preference: "webgl",
      // The ticker never runs: a frame is drawn when asked for, never on a loop.
      autoStart: false,
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

  /** Stop drawing, detach the canvas, and release GPU resources. */
  destroy(): void {
    clearTimeout(this.sharpenAt);
    this.scheduler.dispose();
    for (const type of INPUT_EVENTS) {
      this.host.removeEventListener(type, this.onInput, INPUT_OPTIONS);
    }
    window.removeEventListener("keydown", this.onInput, INPUT_OPTIONS);
    this.resizeObserver.disconnect();
    this.dprQuery?.removeEventListener("change", this.onDprChange);
    this.app.destroy({ removeView: true }, { children: true });
  }

  /** Ask for a frame: drawn at the next screen refresh, together with every other ask until then. */
  requestFrame(): void {
    this.scheduler.ask();
  }

  /** Frames drawn since the stage was made; still while nothing changes. */
  get framesDrawn(): number {
    return this.scheduler.framesDrawn;
  }

  /**
   * Run `listener` just before each frame is drawn, for work that waits on
   * the frame rather than on each change, such as a grid rebuilt once per
   * camera move. Returns the unsubscribe function.
   */
  onBeforeDraw(listener: () => void): () => void {
    this.beforeDrawListeners.add(listener);
    return () => {
      this.beforeDrawListeners.delete(listener);
    };
  }

  /** Change the canvas clear colour, for example on a theme switch. */
  setBackground(color: number): void {
    this.app.renderer.background.color = color;
    this.requestFrame();
  }

  /** Subscribe to canvas size changes; returns the unsubscribe function. */
  onResize(listener: () => void): () => void {
    this.resizeListeners.add(listener);
    return () => {
      this.resizeListeners.delete(listener);
    };
  }

  private readonly onInput = (): void => {
    this.requestFrame();
  };

  // One frame: the work that waited for it, then the render.
  private draw(): void {
    for (const listener of this.beforeDrawListeners) {
      listener();
    }
    this.app.render();
    this.resolveFirstFrame();
    this.watchScale();
  }

  /**
   * Text is drawn once into a texture and the world then magnifies it, so at
   * four times in it is four times the pixels it was drawn with. The way out
   * is the one Figma and Miro take: do not magnify, draw again at the scale
   * being looked at.
   *
   * Drawing again is a canvas redraw and an upload for every piece of text on
   * the board, which is no way to spend a pinch. So it waits until the zoom
   * has settled (user, 2026-09-13), and only for a change worth the work.
   */
  private watchScale(): void {
    const wanted = this.world.scale.x;
    if (Math.abs(Math.log2(wanted / this.sharpenedFor)) < SCALE_STEP) {
      return;
    }
    clearTimeout(this.sharpenAt);
    this.sharpenAt = setTimeout(() => {
      this.sharpenedFor = this.world.scale.x;
      const resolution = Math.min(
        MAX_TEXT_RESOLUTION,
        Math.max(1, this.sharpenedFor) * window.devicePixelRatio
      );
      sharpen(this.world, resolution);
      this.requestFrame();
    }, SETTLE_MS);
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
    // Resizing blanks the canvas, so this frame cannot wait for the next refresh.
    this.scheduler.drawNow();
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

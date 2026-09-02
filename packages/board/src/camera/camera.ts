/**
 * ─ Camera ─
 *
 * One transform for the whole world. Pan and zoom go through the pure
 * camera math and land on the world container as position and scale;
 * listeners fire once per change so the grid and, later, the DOM
 * overlay follow the same numbers in the same frame.
 * Design: docs/design.md §5, one camera for canvas and DOM overlay.
 */

import type { Container } from "pixi.js";
import type { Point } from "../geometry.js";
import {
  pan,
  screenToWorld,
  worldToScreen,
  zoomAbout,
  type CameraState,
  type ZoomLimits,
} from "./camera-math.js";

export type CameraListener = (state: CameraState) => void;

// Wide enough to read a 200-cell map whole or fill the screen with one cell.
const DEFAULT_LIMITS: ZoomLimits = { min: 0.1, max: 8 };

/** Owns the view transform and applies it to the world container. */
export class Camera {
  private readonly world: Container;
  private readonly limits: ZoomLimits;
  private readonly listeners = new Set<CameraListener>();
  private state: CameraState = { x: 0, y: 0, zoom: 1 };

  constructor(world: Container, limits: ZoomLimits = DEFAULT_LIMITS) {
    this.world = world;
    this.limits = limits;
    this.apply();
  }

  get current(): CameraState {
    return this.state;
  }

  /** Shift the view by a screen-space delta. */
  panBy(dx: number, dy: number): void {
    this.set(pan(this.state, dx, dy));
  }

  /** Scale the view by `factor`, keeping the world point under `anchor` (screen space) fixed. */
  zoomAt(anchor: Point, factor: number): void {
    this.set(zoomAbout(this.state, anchor, factor, this.limits));
  }

  /** Replace the whole state, for example when a scene loads. */
  set(state: CameraState): void {
    this.state = state;
    this.apply();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  toWorld(screen: Point): Point {
    return screenToWorld(this.state, screen);
  }

  toScreen(world: Point): Point {
    return worldToScreen(this.state, world);
  }

  /** Subscribe to changes; returns the unsubscribe function. */
  onChange(listener: CameraListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private apply(): void {
    this.world.position.set(this.state.x, this.state.y);
    this.world.scale.set(this.state.zoom);
  }
}

/**
 * ─ Map layer ─
 *
 * The map image as one sprite at the world origin. It loads by URL and
 * knows nothing about where files come from: the Table app hands it an
 * asset-protocol URL, the browser client a plain one.
 * Design: docs/design.md §5, hybrid rendering.
 */

import { Assets, Sprite, type Container, type Texture } from "pixi.js";

/** Natural pixel size of a loaded map. */
export interface MapSize {
  readonly width: number;
  readonly height: number;
}

/** Holds the current map sprite; `setImage` swaps it for another. */
export class MapLayer {
  private readonly container: Container;
  private sprite: Sprite | undefined;

  constructor(container: Container) {
    this.container = container;
  }

  /**
   * Replace the map with the image at `url` and resolve with its pixel size.
   * Rejects when the image cannot be fetched or decoded; the previous map stays.
   */
  async setImage(url: string): Promise<MapSize> {
    // Name the parser: the loader otherwise guesses from the extension, and
    // content-addressed asset URLs have none.
    const texture: Texture | undefined = await Assets.load({
      src: url,
      loadParser: "loadTextures",
    });
    if (!texture) {
      throw new Error(`no image could be decoded from ${url}`);
    }
    this.clear();
    const sprite = new Sprite(texture);
    this.container.addChild(sprite);
    this.sprite = sprite;
    return { width: texture.width, height: texture.height };
  }

  clear(): void {
    if (this.sprite !== undefined) {
      this.sprite.destroy();
      this.sprite = undefined;
    }
  }
}

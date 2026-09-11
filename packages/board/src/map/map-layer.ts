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

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|avif|gif|svg)(\?.*)?$/i;
const SVG_URL = /(\.svg(\?.*)?$)|(^data:image\/svg\+xml)/i;

/**
 * Which loader parser to name. Pixi picks one from the file extension, so a
 * URL without one, such as a content-addressed asset, needs the texture parser
 * named; SVG needs its own parser even as a data URL.
 */
export function parserFor(url: string): "loadSVG" | "loadTextures" | undefined {
  if (SVG_URL.test(url)) {
    return "loadSVG";
  }
  return IMAGE_EXTENSION.test(url) ? undefined : "loadTextures";
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
    const loadParser = parserFor(url);
    const texture: Texture | undefined = await Assets.load(
      loadParser === undefined ? url : { src: url, loadParser }
    );
    if (!texture) {
      throw new Error(`no image could be decoded from ${url}`);
    }
    this.clear();
    const sprite = new Sprite(texture);
    this.container.addChild(sprite);
    this.sprite = sprite;
    return { width: texture.width, height: texture.height };
  }

  /** The shown map's pixel size, or nothing while there is none. */
  size(): MapSize | undefined {
    if (this.sprite === undefined) {
      return undefined;
    }
    return { width: this.sprite.texture.width, height: this.sprite.texture.height };
  }

  clear(): void {
    if (this.sprite !== undefined) {
      this.sprite.destroy();
      this.sprite = undefined;
    }
  }
}

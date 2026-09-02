import { describe, expect, test } from "bun:test";
import { parserFor } from "../src/index.js";

describe("parserFor", () => {
  test("svg files and svg data urls take the svg parser", () => {
    expect(parserFor("/dev/tavern.svg")).toBe("loadSVG");
    expect(parserFor("http://asset.localhost/maps/keep.SVG?v=2")).toBe("loadSVG");
    expect(parserFor("data:image/svg+xml;base64,PHN2Zz4=")).toBe("loadSVG");
  });

  test("known raster extensions are left for the loader to detect", () => {
    expect(parserFor("/dev/fixtures/araitael-world.jpg")).toBeUndefined();
    expect(parserFor("http://asset.localhost/C%3A/maps/tavern.PNG")).toBeUndefined();
    expect(parserFor("https://example.test/map.webp?token=abc")).toBeUndefined();
  });

  test("an extension-less url names the texture parser", () => {
    expect(parserFor("http://localhost:1423/")).toBe("loadTextures");
    expect(parserFor("http://asset.localhost/sha256/9f1c")).toBe("loadTextures");
  });
});

import { describe, expect, test } from "bun:test";
import { mixColors, parseCssColor } from "../src/index.js";

describe("parseCssColor", () => {
  test("six-digit hex packs to rgb with full alpha", () => {
    expect(parseCssColor("#1B1D24")).toEqual({ rgb: 0x1b1d24, alpha: 1 });
  });

  test("eight-digit hex carries its alpha", () => {
    const parsed = parseCssColor("#8b8fa359");
    expect(parsed?.rgb).toBe(0x8b8fa3);
    expect(parsed?.alpha).toBeCloseTo(0x59 / 255, 6);
  });

  test("short hex doubles each digit", () => {
    expect(parseCssColor("#abc")).toEqual({ rgb: 0xaabbcc, alpha: 1 });
    expect(parseCssColor("#abcf")?.alpha).toBe(1);
    expect(parseCssColor("#abc8")?.alpha).toBeCloseTo(0x88 / 255, 6);
  });

  test("rgb and rgba forms parse with commas, spaces, or a slash", () => {
    expect(parseCssColor("rgb(217, 166, 72)")).toEqual({ rgb: 0xd9a648, alpha: 1 });
    expect(parseCssColor("rgba(217, 166, 72, 0.5)")?.alpha).toBe(0.5);
    expect(parseCssColor("rgb(217 166 72 / 25%)")?.alpha).toBe(0.25);
  });

  test("surrounding whitespace from a computed style is tolerated", () => {
    expect(parseCssColor("  #ffffff ")).toEqual({ rgb: 0xffffff, alpha: 1 });
  });

  test("unknown forms are reported, not guessed", () => {
    expect(parseCssColor("brass")).toBe(undefined);
    expect(parseCssColor("")).toBe(undefined);
    expect(parseCssColor("var(--tw-primary)")).toBe(undefined);
  });
});

describe("mixColors", () => {
  test("zero keeps the first colour and one gives the second", () => {
    expect(mixColors(0x102030, 0xf0e0d0, 0)).toBe(0x102030);
    expect(mixColors(0x102030, 0xf0e0d0, 1)).toBe(0xf0e0d0);
  });

  test("halfway lands between each channel pair", () => {
    expect(mixColors(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColors(0x102030, 0x304050, 0.5)).toBe(0x203040);
  });

  test("amounts outside the range are clamped", () => {
    expect(mixColors(0x000000, 0xffffff, 2)).toBe(0xffffff);
    expect(mixColors(0x000000, 0xffffff, -1)).toBe(0x000000);
  });
});

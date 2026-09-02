/**
 * ─ CSS colour parsing ─
 *
 * Turns the colour strings that come out of getComputedStyle for a
 * custom property into the packed integer and alpha Pixi wants.
 * Handles hex in every length and the rgb()/rgba() forms; anything
 * else is reported as unparseable rather than guessed.
 */

export interface PackedColor {
  /** 0xRRGGBB. */
  readonly rgb: number;
  /** 0 to 1. */
  readonly alpha: number;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;

/** Parse a CSS colour string; undefined when the form is not recognised. */
export function parseCssColor(value: string): PackedColor | undefined {
  const text = value.trim();
  const hex = HEX.exec(text);
  if (hex !== null) {
    return fromHex(hex[1] ?? "");
  }
  const rgb = RGB.exec(text);
  if (rgb !== null) {
    return fromChannels(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), parseAlpha(rgb[4]));
  }
  return undefined;
}

/** Blend `from` toward `to` by `amount` in [0, 1], channel by channel; alpha stays 1. */
export function mixColors(from: number, to: number, amount: number): number {
  const t = Math.min(1, Math.max(0, amount));
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function fromHex(digits: string): PackedColor {
  // Short forms double each digit: #abc is #aabbcc, #abcd is #aabbccdd.
  const full =
    digits.length <= 4
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const alpha = full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  return fromChannels(r, g, b, alpha);
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) {
    return 1;
  }
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

function fromChannels(r: number, g: number, b: number, alpha: number): PackedColor {
  return {
    rgb: (clamp(r) << 16) | (clamp(g) << 8) | clamp(b),
    alpha: Math.min(1, Math.max(0, alpha)),
  };
}

function clamp(channel: number): number {
  return Math.min(255, Math.max(0, Math.round(channel)));
}

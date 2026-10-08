/**
 * ─ The side view's lines ─
 *
 * A token's verdict in words: caught, how far out and on what, or clear,
 * and why; or, for the target of a line, where the line leaves from and
 * what hides which part of it. The numbers are whole units, and a gap
 * under one is "just".
 * Design: docs/templates.md "The side view" and "A spell aimed at one
 * creature".
 */

import { signed, type SideHider, type SliceStop, type Verdict } from "@tablewright/board";

const OFF: Readonly<Record<Extract<Verdict, { kind: "off" }>["side"], string>> = {
  beside: "off to one side of it",
  past: "past its far end",
  behind: "behind where it starts",
};

const EDGES: Readonly<Record<"wall" | "door" | "secret", string>> = {
  wall: "a wall",
  door: "a shut door",
  secret: "a secret door",
};

// The lower part of a target by the cover it would give alone.
const LOWER: Readonly<Record<SideHider["cover"], string>> = {
  none: "its lower part",
  half: "its lower half",
  "three-quarters": "its lower three-quarters",
  total: "all of it",
};

const PARTS: Readonly<Record<Exclude<SideHider["part"], "lower">, string>> = {
  all: "all of it",
  left: "its left side",
  right: "its right side",
  some: "part of it",
};

/** What a side view says of a token, in the rule's unit. */
export function lineOf(verdict: Verdict, unit: string): string {
  switch (verdict.kind) {
    case "caught":
      return `Caught: ${whole(verdict.out)} ${unit} out, ${standing(verdict, unit)}`;
    case "off":
      return `Clear: ${OFF[verdict.side]}`;
    case "over":
      return `Clear: it passes ${gap(verdict.gap, unit, "over its head", "over its middle")}`;
    case "under":
      return `Clear: it passes ${gap(verdict.gap, unit, "under its feet", "under its middle")}`;
    case "hidden":
      return `Clear: ${hider(verdict, unit)} hides it`;
    case "aimed":
      return `${aimedFrom(verdict, unit)}, ${hidden(verdict.hiders, unit)}`;
  }
}

function whole(value: number): number {
  return Math.round(value) || 0;
}

// What a caught token stands on: the floor, ground raised or sunk from it,
// or the air above the ground under it.
function standing(verdict: Extract<Verdict, { kind: "caught" }>, unit: string): string {
  if (verdict.elevation > 0) {
    return `in the air ${whole(verdict.elevation)} ${unit} up`;
  }
  return `on ${ground(verdict.ground, unit)}`;
}

// Where a line is aimed from, by the same measure.
function aimedFrom(verdict: Extract<Verdict, { kind: "aimed" }>, unit: string): string {
  if (verdict.elevation > 0) {
    return `From the air ${whole(verdict.elevation)} ${unit} up`;
  }
  return `From ${ground(verdict.ground, unit)}`;
}

function ground(height: number, unit: string): string {
  if (height === 0) {
    return "the floor";
  }
  const at = `${signed(whole(height))} ${unit}`;
  return height > 0 ? `raised ground at ${at}` : `sunken ground at ${at}`;
}

// What hides a target and which part of it, the most first.
function hidden(hiders: readonly SideHider[], unit: string): string {
  if (hiders.length === 0) {
    return "nothing hides it";
  }
  return hiders
    .map(
      (one) =>
        `${hider(one, unit)} hides ${one.part === "lower" ? LOWER[one.cover] : PARTS[one.part]}`
    )
    .join(", and ");
}

// A gap clear of the cube by a whole number, by less, or none at all, where
// the area reaches into the cube and misses only its middle.
function gap(value: number, unit: string, clear: string, middle: string): string {
  if (value <= 0) {
    return middle;
  }
  return value < 0.5 ? `just ${clear}` : `${whole(value)} ${unit} ${clear}`;
}

function hider(stop: Pick<SliceStop, "by" | "height">, unit: string): string {
  if (stop.by !== "ground") {
    return EDGES[stop.by];
  }
  if (stop.height === 0) {
    return "the floor";
  }
  const height = `${signed(whole(stop.height))} ${unit}`;
  return stop.height > 0 ? `raised ground at ${height}` : `the ground at ${height}`;
}

/**
 * ─ The side view's lines ─
 *
 * A token's verdict in words: caught, how far out and on what, or clear,
 * and why. The numbers are whole units, and a gap under one is "just".
 * Design: docs/templates.md "The side view".
 */

import { signed, type Verdict } from "@tablewright/board";

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
  if (verdict.ground === 0) {
    return "on the floor";
  }
  const height = `${signed(whole(verdict.ground))} ${unit}`;
  return verdict.ground > 0 ? `on raised ground at ${height}` : `on sunken ground at ${height}`;
}

// A gap clear of the cube by a whole number, by less, or none at all, where
// the area reaches into the cube and misses only its middle.
function gap(value: number, unit: string, clear: string, middle: string): string {
  if (value <= 0) {
    return middle;
  }
  return value < 0.5 ? `just ${clear}` : `${whole(value)} ${unit} ${clear}`;
}

function hider(verdict: Extract<Verdict, { kind: "hidden" }>, unit: string): string {
  if (verdict.by !== "ground") {
    return EDGES[verdict.by];
  }
  if (verdict.height === 0) {
    return "the floor";
  }
  const height = `${signed(whole(verdict.height))} ${unit}`;
  return verdict.height > 0 ? `raised ground at ${height}` : `the ground at ${height}`;
}

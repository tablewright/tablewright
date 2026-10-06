/**
 * ─ Reference drawings ─
 *
 * The drawings a DM can add as a scene from the scene tab, until the
 * drawing tool and imports cover the need: the mansion and the hill of
 * the design mocks, so every step can be seen on the same maps.
 */

import type { Stroke } from "@tablewright/schema";
import { mansionStrokes } from "./mansion.js";
import { terraceHillStrokes } from "./terrace-hill.js";

export interface ReferenceScene {
  readonly name: string;
  readonly strokes: () => Stroke[];
}

export const REFERENCE_SCENES: readonly ReferenceScene[] = [
  { name: "Halloway House", strokes: mansionStrokes },
  { name: "Terrace Hill", strokes: terraceHillStrokes },
];

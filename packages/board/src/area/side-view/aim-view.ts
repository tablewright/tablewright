/**
 * ─ A line's side view ─
 *
 * The slice along a line between two tokens, for the card beside its
 * target: the ground and what stands on it, the attacker at the origin,
 * and the target with each line to its face drawn as far as it reaches.
 * It is worked out from what one seat sees, as the line itself is.
 * Design: docs/templates.md "A spell aimed at one creature".
 */

import { aimText, type Aim } from "../../pick/aim.js";
import { facingToward } from "../../tokens/facing.js";
import type { TokenView } from "../../tokens/token-layer.js";
import type { Topology } from "../../topology/derive.js";
import type { CoverRay } from "../../topology/rules/cover.js";
import type { GridRule } from "../../topology/rules/distance.js";
import type { Spot } from "../area.js";
import { tokenSpot } from "../catches.js";
import type { SideView } from "./side-view.js";
import { alongOf, groundAlong, sliceFrame, uprightsAlong } from "./slice.js";
import { sidePlaceOf, sliceStopOf, type SideHider, type SideRay } from "./verdict.js";

/**
 * The side view of `aim`, the line from the token `from` to the token
 * `to`, judged against `topology` as one seat sees it. Its one token is
 * the target, and the attacker stands at the origin.
 */
export function aimViewOf(
  aim: Aim,
  from: TokenView,
  to: TokenView,
  topology: Topology,
  rule: GridRule
): SideView {
  const cell = rule.cellSize;
  const origin = tokenSpot(from, rule);
  const target = tokenSpot(to, rule);
  // Straight above or below, any way serves.
  const yaw = facingToward(origin, target) ?? 0;
  const out = alongOf(sliceFrame(origin, yaw, 0, 0, rule), target);
  // A cell behind the attacker and past the target, so both cubes stand whole.
  const frame = sliceFrame(origin, yaw, -cell, out + cell, rule);
  const { cover, rays, hiders } = aim.cover;
  const spotOf = (ray: CoverRay): Spot => ({ x: ray.to.x * cell, y: ray.to.y * cell, z: ray.to.z });
  const sideRays: SideRay[] = rays.map((ray) => {
    const spot = spotOf(ray);
    return ray.stop === undefined
      ? { end: { along: alongOf(frame, spot), z: spot.z }, isStopped: false }
      : { end: sliceStopOf(ray.stop, spot, topology, frame).at, isStopped: true };
  });
  const sideHiders: SideHider[] = hiders.flatMap((hider) => {
    const first = rays[hider.rays[0] ?? -1];
    return first === undefined
      ? []
      : [
          {
            ...sliceStopOf(hider.stop, spotOf(first), topology, frame),
            part: hider.part,
            cover: hider.cover,
          },
        ];
  });
  return {
    label: aimText(aim, rule.unit),
    unit: rule.unit,
    cell,
    from: frame.from,
    to: frame.to,
    origin: origin.z,
    pitch: undefined,
    ground: groundAlong(topology, frame),
    uprights: uprightsAlong(topology, frame),
    area: [],
    lands: [],
    tokens: [
      {
        ...sidePlaceOf(to, frame),
        verdict: {
          kind: "aimed",
          cover,
          ground: from.height ?? 0,
          elevation: from.elevation ?? 0,
          rays: sideRays,
          hiders: sideHiders,
        },
      },
    ],
    source: sidePlaceOf(from, frame),
  };
}

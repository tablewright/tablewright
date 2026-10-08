/**
 * ─ The side view's plot ─
 *
 * The slice, or a card's window on it, drawn into a box at one scale both
 * ways, so a pitch reads at its true angle. The template's cut goes down
 * first and the ground over it, so what lies under the ground is not
 * there, as on the board; then the stretches it lands on, the walls and
 * doors, the distance marks along the foot, the tilt at the origin, and
 * the tokens as cubes with their labels at their middles, the point the
 * rule asks about. The token the template leaves from stands at the
 * origin with no ring and no line. A line's target has each line to its
 * face drawn, as far as it reaches.
 * Design: docs/templates.md "The side view".
 */

import { nothing, svg, type SVGTemplateResult } from "lit";
import {
  signed,
  type SidePlace,
  type SidePoint,
  type SideRay,
  type SideView,
  type Verdict,
} from "@tablewright/board";
import { scaleIn, wholeWindow, type PlotRoom, type PlotWindow } from "./window.js";

// Room kept clear inside the box, in pixels: the distance marks under the
// lowest ground, and a little at the sides and the top.
const PAD = { left: 18, right: 14, top: 14, bottom: 22 };
// The closest two distance marks may sit, in pixels, and the steps a mark
// may take, in the rule's unit.
const MARK_GAP = 40;
const MARK_STEPS = [5, 10, 20, 25, 50, 100, 200, 500, 1000];
// A label's disc and the ring about a caught token's, in pixels.
const DISC = 8.5;
const RING = 13;
// The tilt's arc and its level line, in pixels from the origin.
const ARC = 24;
const LEVEL = 40;

/** Where the slice lands in the box: one scale, `k` pixels to the unit, both ways. */
interface Scale {
  readonly k: number;
  /** The box's line under the window's foot, where the distance marks hang. */
  readonly base: number;
  /** The stretch along the slice the window shows, for the marks. */
  readonly from: number;
  readonly to: number;
  x(along: number): number;
  y(z: number): number;
}

/**
 * The room a plot draws its slice in, inside a box `width` by `height`
 * pixels: the box less what is kept clear.
 */
export function plotRoom(width: number, height: number): PlotRoom {
  return { width: width - PAD.left - PAD.right, height: height - PAD.top - PAD.bottom };
}

// The largest scale that fits the window whole, its start at the left and
// its foot on the base.
function scaleOf(shown: PlotWindow, width: number, height: number): Scale {
  const k = scaleIn(shown, plotRoom(width, height));
  const base = height - PAD.bottom;
  return {
    k,
    base,
    from: shown.from,
    to: shown.to,
    x: (along) => PAD.left + (along - shown.from) * k,
    y: (z) => base - (z - shown.low) * k,
  };
}

/**
 * The plot, for an `svg` element `width` by `height` pixels to hold: the
 * whole slice, or only the window `shown`.
 */
export function plotOf(
  view: SideView,
  width: number,
  height: number,
  shown: PlotWindow = wholeWindow(view)
): SVGTemplateResult {
  const scale = scaleOf(shown, width, height);
  const line = (points: readonly SidePoint[]): string =>
    points.map((point) => `${scale.x(point.along)},${scale.y(point.z)}`).join(" ");
  const first = view.ground[0];
  const last = view.ground[view.ground.length - 1];
  const ground =
    first === undefined || last === undefined
      ? nothing
      : svg`<polygon class="ground" points=${`${scale.x(first.along)},${height} ${line(view.ground)} ${scale.x(last.along)},${height}`}></polygon>
          <polyline class="ground-line" points=${line(view.ground)}></polyline>`;
  return svg`
    <polygon class="area" points=${line(view.area)}></polygon>
    ${ground}
    ${view.lands.map((stretch) => svg`<polyline class="lands" points=${line(stretch)}></polyline>`)}
    ${view.uprights.map(
      (upright) =>
        svg`<line class=${upright.kind} x1=${scale.x(upright.along)} y1=${scale.y(upright.foot)} x2=${scale.x(upright.along)} y2=${scale.y(upright.top)}></line>`
    )}
    ${marksOf(scale)}
    ${tiltOf(view, scale)}
    ${view.source === undefined ? nothing : tokenOf(view.source, undefined, view, scale)}
    ${view.tokens.map((token) => tokenOf(token, token.verdict, view, scale))}
  `;
}

/** A token's label on its disc, centred on a point of an `svg` element. */
export function discOf(x: number, y: number, label: string): SVGTemplateResult {
  return svg`<circle class="disc" cx=${x} cy=${y} r=${DISC}></circle>
    <text class="disc-label" x=${x} y=${y + 3.5}>${label}</text>`;
}

// The distances along the foot, from the origin out, as far apart as the
// scale needs to keep their figures from meeting.
function marksOf(scale: Scale): SVGTemplateResult[] {
  const step = MARK_STEPS.find((one) => one * scale.k >= MARK_GAP) ?? 1000;
  const marks: SVGTemplateResult[] = [];
  for (
    let along = Math.max(0, Math.ceil(scale.from / step) * step);
    along <= scale.to;
    along += step
  ) {
    const x = scale.x(along);
    marks.push(svg`<line class="mark" x1=${x} y1=${scale.base} x2=${x} y2=${scale.base + 5}></line>
      <text class="mark-label" x=${x} y=${scale.base + 17}>${along}</text>`);
  }
  return marks;
}

// The origin, and for a form that tilts its pitch from level: an arc from
// a level line to the pitch, and the angle beside it.
function tiltOf(view: SideView, scale: Scale): SVGTemplateResult {
  const x = scale.x(0);
  const y = scale.y(view.origin);
  const origin = svg`<circle class="origin" cx=${x} cy=${y} r="3.5"></circle>`;
  const { pitch } = view;
  if (pitch === undefined) {
    return origin;
  }
  const tilt = (pitch * Math.PI) / 180;
  const end = { x: x + ARC * Math.cos(tilt), y: y - ARC * Math.sin(tilt) };
  // Down is clockwise on screen, which draws y downward.
  const sweep = pitch < 0 ? 1 : 0;
  return svg`<line class="level" x1=${x} y1=${y} x2=${x + LEVEL} y2=${y}></line>
    <path class="tilt" d=${`M${x + ARC} ${y} A${ARC} ${ARC} 0 0 ${sweep} ${end.x} ${end.y}`}></path>
    ${origin}
    <text class="tilt-label" x=${x + ARC + 6} y=${pitch < 0 ? y - 6 : y + 14}>${signed(Math.round(pitch))}°</text>`;
}

// A token as its cube, to scale, with its label on a disc at the cube's
// middle and a ring about it when it is caught; one cut off from the
// origin has the line to it drawn as far as it is stopped, a line's target
// has each of its lines, and the source, with no verdict, has neither.
function tokenOf(
  token: SidePlace,
  verdict: Verdict | undefined,
  view: SideView,
  scale: Scale
): SVGTemplateResult {
  const half = view.cell / 2;
  const left = scale.x(token.along - half);
  const top = scale.y(token.z + view.cell);
  const x = scale.x(token.along);
  const y = scale.y(token.z + half);
  const sight =
    verdict?.kind === "hidden"
      ? stoppedAt(verdict.at, view, scale)
      : verdict?.kind === "aimed"
        ? raysOf(verdict.rays, view, scale)
        : nothing;
  const ring =
    verdict?.kind === "caught"
      ? svg`<circle class="ring" cx=${x} cy=${y} r=${RING}></circle>`
      : nothing;
  return svg`${sight}
    <rect class="cube" x=${left} y=${top} width=${view.cell * scale.k} height=${view.cell * scale.k}></rect>
    ${ring}
    ${discOf(x, y, token.label)}`;
}

// The line from the origin as far as `at`, where it is stopped.
function stoppedAt(at: SidePoint, view: SideView, scale: Scale): SVGTemplateResult {
  return svg`<line class="sight" x1=${scale.x(0)} y1=${scale.y(view.origin)} x2=${scale.x(at.along)} y2=${scale.y(at.z)}></line>
    <circle class="stop" cx=${scale.x(at.along)} cy=${scale.y(at.z)} r="2.6"></circle>`;
}

// Each line from the origin to a point of a target's face: the clear ones
// whole, and the stopped ones over them as far as they are stopped.
function raysOf(rays: readonly SideRay[], view: SideView, scale: Scale): SVGTemplateResult {
  const clear = rays.filter((ray) => !ray.isStopped);
  const stopped = rays.filter((ray) => ray.isStopped);
  return svg`${clear.map(
    (ray) =>
      svg`<line class="ray" x1=${scale.x(0)} y1=${scale.y(view.origin)} x2=${scale.x(ray.end.along)} y2=${scale.y(ray.end.z)}></line>`
  )}
    ${stopped.map((ray) => stoppedAt(ray.end, view, scale))}`;
}

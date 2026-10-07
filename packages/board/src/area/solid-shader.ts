/**
 * ─ The solid's shader ─
 *
 * The program that lights a 3D form, run once per pixel on the GPU. The
 * vertex half places a quad over the footprint and hands each pixel its
 * place in cells; the fragment half works the top of the form out there,
 * exactly as `surface` does, marches the straight line from the origin to
 * creature height at that point, the ground and half a cell up, across
 * the field's samples and the solid edges, exactly as `firstStop` does
 * for the caught cells, so the solid is cut where the squares are and
 * climbs where they do, and lays the wash, the light, the shade, the
 * lines of equal height, the shadow and the edge over one another as
 * round two of the design did. The solid's own top is what is drawn and
 * lit, and it is cut too where that top is under the ground. Outside the
 * form nothing is drawn, the shadow included,
 * so the shadow falls only within the footprint and the dotted trace sits
 * on the solid's true edge. A beam is drawn as the round tube inside the
 * box that catches, so there the solid and the squares part on purpose.
 * WebGL 2 only, as the board is.
 * Design: docs/templates.md "How it looks", "What stops it" and "How it
 * is worked out".
 */

import { GlProgram } from "pixi.js";
import { TUBE_AT } from "./solid-beam.js";
import { CONE_AT } from "./solid-cone.js";

/** Where the light comes from: above, and from the top left of the board. */
export const LIGHT = normalised(-0.55, -0.7, 0.62);

/** How far a point's shadow falls for each unit of its height, across and down the board. */
export const SHADOW_CAST = { x: 0.05, y: 0.07 } as const;

// The quad is the unit square scaled over the footprint; a pixel's place
// in cells is read back from it.
const VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vCell;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
uniform vec4 uQuad;

void main() {
  mat3 model = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((model * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vCell = uQuad.xy + aPosition * uQuad.zw;
  vColor = uColor * uWorldColorAlpha;
}
`;

// Every height is in the rule's unit, as the area's sizes are; a point of
// the plan is taken from cells to that unit with the cell's size, and the
// field and the edges are read at their own samples and cells.
const FRAGMENT = /* glsl */ `#version 300 es
in vec2 vCell;
in vec4 vColor;
out vec4 finalColor;

uniform vec3 uOrigin;
uniform float uCell;
uniform float uForm;
uniform vec3 uAxis;
uniform vec2 uAcross;
uniform float uTan;
uniform float uLength;
uniform float uWidth;
uniform float uRoundEdge;
uniform float uRadius;
uniform float uInner;
uniform float uHeight;
uniform float uHighest;
uniform float uStep;
uniform float uLift;
uniform float uReaches;
uniform vec3 uLightDir;
uniform vec2 uFieldOrigin;
uniform vec2 uFieldSize;
uniform float uPer;
uniform vec2 uEdgeSize;
uniform vec4 uBase;
uniform vec4 uLight;
uniform vec4 uShade;
uniform vec2 uShadowCast;
uniform highp sampler2D uField;
uniform highp sampler2D uEdges;

const float FORM_CONE = 0.0;
const float FORM_ROUND = 1.0;
const float FORM_BEAM = 3.0;
const float SHADOW_ALPHA = 0.42;
const float SHADOW_UNDER = 0.35;
const int SHADOW_STEPS = 8;
const float EDGE_PIXELS = 1.5;
const float EDGE_ALPHA = 0.5;
const float STEEP = 2.6;
// The most samples a line is marched across: about ninety cells of reach
// on the diagonal at eight samples to a cell.
const int MARCH_STEPS = 1024;
// A horizon nothing on the way rises over, and one nothing clears.
const float NO_HORIZON = -1e9;
const float BURIED = 1e9;
// A span shorter than this along a line is a touch at a corner, not a crossing.
const float TOUCH = 1e-9;
// A height no cut of a cone or a beam reaches.
const float UNBOUNDED = 1e9;
${CONE_AT}
${TUBE_AT}

// The top of the form at a point taken from the origin, how far inside
// the form the point lies, and the top's slope across the plan.
float surfaceAt(vec2 plan, out float margin, out vec2 slope) {
  if (uForm == FORM_CONE) {
    return coneAt(plan, margin, slope);
  }
  if (uForm == FORM_BEAM) {
    return tubeAt(plan, margin, slope);
  }
  float d = length(plan);
  if (uForm == FORM_ROUND) {
    margin = uRadius - d;
    float top = sqrt(max(uRadius * uRadius - d * d, 0.0));
    slope = -plan / max(top, 1e-3);
    return top;
  }
  margin = uInner > 0.0 ? min(uRadius - d, d - uInner) : uRadius - d;
  slope = vec2(0.0);
  return uHeight;
}

// The field at a sample, counted from the field's first; level at nought off the map.
float fieldAt(vec2 at) {
  if (at.x < 0.0 || at.y < 0.0 || at.x >= uFieldSize.x || at.y >= uFieldSize.y) {
    return 0.0;
  }
  return texelFetch(uField, ivec2(at), 0).r;
}

// The ground under a point of the plan in cells.
float groundAt(vec2 cell) {
  return fieldAt(floor((cell - uFieldOrigin) * uPer));
}

// The top of a cell's east or south edge, the cell counted from the
// field's first; open past the map. Cell (col, row) is texel (col + 1,
// row + 1), as edgeTops lays them out.
float edgeTopAt(vec2 cell, bool isEast) {
  vec2 texel = cell + 1.0;
  if (texel.x < 0.0 || texel.y < 0.0 || texel.x >= uEdgeSize.x || texel.y >= uEdgeSize.y) {
    return NO_HORIZON;
  }
  vec2 tops = texelFetch(uEdges, ivec2(texel), 0).rg;
  return isEast ? tops.r : tops.g;
}

// The horizon of the straight line from the origin to a point of the plan
// in cells: the steepest climb anything on its way asks of it, as height
// over distance in cells, so the line reaches a height z at that distance
// d exactly when z >= uOrigin.z + d * horizon. One walk over the field's
// samples, stepping whichever boundary comes first as forSamplesAlong
// does, each boundary's t taken fresh from its whole number. A sample
// asks that the line be over its ground where it enters and where it
// leaves, which is firstStop's test for the ground; a boundary that is a
// cell's edge asks that the line be over the edge's top where it crosses,
// which is firstStop's test for a wall or a shut door. Which edge a
// crossing meets is the convention edgeTops states: across the vertical
// boundary at x = c cells, the east edge of col c - 1 in the row of the
// crossing; across the horizontal boundary at y = r, the south edge of
// row r - 1 in the column of the crossing.
float horizonTo(vec2 cell) {
  vec2 p0 = (uOrigin.xy - uFieldOrigin) * uPer;
  vec2 p1 = (cell - uFieldOrigin) * uPer;
  vec2 delta = p1 - p0;
  float run = length(cell - uOrigin.xy);
  if (run < 1e-6) {
    return NO_HORIZON;
  }
  float z0 = uOrigin.z;
  float i = floor(p0.x);
  float j = floor(p0.y);
  float crossings = abs(floor(p1.x) - i) + abs(floor(p1.y) - j);
  float horizon = NO_HORIZON;
  float tIn = 0.0;
  for (int n = 0; n < MARCH_STEPS; n += 1) {
    float walked = float(n);
    float tI = delta.x == 0.0 ? BURIED : ((delta.x > 0.0 ? i + 1.0 : i) - p0.x) / delta.x;
    float tJ = delta.y == 0.0 ? BURIED : ((delta.y > 0.0 ? j + 1.0 : j) - p0.y) / delta.y;
    float tOut = walked >= crossings ? 1.0 : min(tI, tJ);
    if (tOut - tIn > TOUCH) {
      float ground = fieldAt(vec2(i, j));
      if (tIn == 0.0) {
        if (ground > z0) {
          return BURIED;
        }
      } else {
        horizon = max(horizon, (ground - z0) / (tIn * run));
      }
      horizon = max(horizon, (ground - z0) / (tOut * run));
    }
    if (walked >= crossings) {
      break;
    }
    tIn = tOut;
    if (tI < tJ) {
      float boundary = delta.x > 0.0 ? i + 1.0 : i;
      if (mod(boundary, uPer) == 0.0) {
        float row = floor((p0.y + delta.y * tI) / uPer);
        float top = edgeTopAt(vec2(boundary / uPer - 1.0, row), true);
        horizon = max(horizon, (top - z0) / (tI * run));
      }
      i += delta.x > 0.0 ? 1.0 : -1.0;
    } else {
      float boundary = delta.y > 0.0 ? j + 1.0 : j;
      if (mod(boundary, uPer) == 0.0) {
        float col = floor((p0.x + delta.x * tJ) / uPer);
        float top = edgeTopAt(vec2(col, boundary / uPer - 1.0), false);
        horizon = max(horizon, (top - z0) / (tJ * run));
      }
      j += delta.y > 0.0 ? 1.0 : -1.0;
    }
  }
  return horizon;
}

// Whether the solid is drawn at a point in cells, and how high its top
// stands there above the ground under it: the top stands above that
// ground, and the line from the origin to creature height there, the
// ground and half a cell up, is not stopped, which is the test the
// caught cells make, so the solid is cut where they are and climbs where
// they do. The horizon is the pixel's own: a tap a pixel or a short cast
// away is read against the line to this pixel rather than marched
// afresh, an approximation only a hairline edge and a soft shadow could
// hide.
bool drawnAt(vec2 cell, float horizon, out float rise) {
  float margin;
  vec2 slope;
  float top = surfaceAt((cell - uOrigin.xy) * uCell, margin, slope);
  float ground = groundAt(cell);
  rise = uOrigin.z + top - ground;
  if (margin <= 0.0) {
    return false;
  }
  float reach = uOrigin.z + length(cell - uOrigin.xy) * horizon;
  return rise > 0.0 && ground + uCell * 0.5 >= reach;
}

// How deep the shadow falls at a point: every level of the solid, counted
// up from the ground beneath it, cast a short way in the light's
// direction, soft where it ends. Counted from the ground, a cone breathed
// from high up throws its shadow as far as it stands above the floor,
// and a top tilted below its origin still throws one. It falls only
// within the footprint, since a pixel outside the form draws nothing.
float shadowAt(vec2 cell, float horizon) {
  float best = -1e9;
  for (int k = 0; k <= SHADOW_STEPS; k += 1) {
    float z = uHighest * float(k) / float(SHADOW_STEPS);
    float rise;
    if (drawnAt(cell - uShadowCast * z / uCell, horizon, rise)) {
      best = max(best, rise - z);
    }
  }
  float soft = uCell * 0.1;
  return smoothstep(-soft, soft, best);
}

// A colour laid at some alpha over what is there, both straight.
vec4 over(vec4 under, vec3 rgb, float a) {
  float outA = a + under.a * (1.0 - a);
  vec3 outRgb = (rgb * a + under.rgb * under.a * (1.0 - a)) / max(outA, 1e-6);
  return vec4(outRgb, outA);
}

void main() {
  float margin;
  vec2 slope;
  float top = surfaceAt((vCell - uOrigin.xy) * uCell, margin, slope);
  float above = uOrigin.z + top;
  // Derivatives are taken where every fragment reaches them, before any
  // branch, as the spec asks: a pixel's step in cells, and how fast the
  // lines of equal height come round. Those lines fall at whole steps of
  // height from the scene's nought, as the height display's bands do, so
  // they stay put as the origin moves.
  vec2 px = dFdx(vCell) * EDGE_PIXELS;
  vec2 py = dFdy(vCell) * EDGE_PIXELS;
  float level = above / uStep;
  float width = fwidth(level);
  // Outside the form nothing is drawn, the shadow included, so the trace
  // sits on the solid's true edge, and no line is marched.
  if (margin <= 0.0) {
    finalColor = vec4(0.0);
    return;
  }
  // Set to spread around corners nothing stops the line, and the ground
  // under each pixel is all that cuts the solid.
  float horizon = uReaches > 0.5 ? horizonTo(vCell) : NO_HORIZON;
  // Drawn where the top stands above the ground and the line to creature
  // height here, the ground and half a cell up, is not stopped: the
  // caught cells' own test, so the solid is cut where they are.
  float ground = groundAt(vCell);
  float rise = above - ground;
  float reach = uOrigin.z + length(vCell - uOrigin.xy) * horizon;
  bool drawn = rise > 0.0 && ground + uCell * 0.5 >= reach;
  vec4 color = vec4(0.0);
  float shadow = shadowAt(vCell, horizon) * SHADOW_ALPHA * (drawn ? SHADOW_UNDER : 1.0);
  color = over(color, uShade.rgb, shadow * uShade.a);
  if (drawn) {
    float neutral = uLightDir.z;
    float lambert = clamp(
      (-slope.x * uLightDir.x - slope.y * uLightDir.y + uLightDir.z) / sqrt(dot(slope, slope) + 1.0),
      0.0,
      1.0
    );
    float hi = clamp((lambert - neutral) / (1.0 - neutral), 0.0, 1.0);
    float lo = clamp((neutral - lambert) / neutral, 0.0, 1.0);
    // The wash deepens with the top's height above the ground under it.
    float lift = clamp(rise / uLift, 0.0, 1.0);
    color = over(color, uBase.rgb, (0.07 + 0.05 * lift) * uBase.a);
    color = over(color, uLight.rgb, 0.34 * hi * uLight.a);
    color = over(color, uShade.rgb, 0.34 * lo * uShade.a);
    // Lines of equal height, brighter on the lit side, from half a step
    // above the ground, and left out where the top falls away too steeply
    // for them to mean anything or they come round faster than a pixel.
    float toLine = abs(level - floor(level + 0.5));
    bool isReadable = width > 1e-6 && width < 1.0 && length(slope) < STEEP;
    float isLevel = isReadable && rise > uStep * 0.5 ? 1.0 : 0.0;
    float line = isLevel * (1.0 - smoothstep(0.0, width * 1.2, toLine));
    float lineAlpha = clamp(0.14 + 0.42 * hi + 0.10 * (1.0 - lo), 0.0, 0.5);
    color = over(color, uLight.rgb, line * lineAlpha * uLight.a);
    // The solid's own edge: a neighbour a pixel or so away that is not drawn.
    float beside;
    bool whole = drawnAt(vCell + px, horizon, beside) && drawnAt(vCell - px, horizon, beside)
      && drawnAt(vCell + py, horizon, beside) && drawnAt(vCell - py, horizon, beside);
    if (!whole) {
      color = over(color, uBase.rgb, EDGE_ALPHA * uBase.a);
    }
  }
  finalColor = vec4(color.rgb * color.a, color.a) * vColor;
}
`;

/** The one program every solid draws with, compiled once and shared. */
export function solidProgram(): GlProgram {
  return GlProgram.from({
    vertex: VERTEX,
    fragment: FRAGMENT,
    name: "area-solid",
    preferredFragmentPrecision: "highp",
  });
}

function normalised(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

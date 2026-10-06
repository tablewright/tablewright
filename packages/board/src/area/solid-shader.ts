/**
 * ─ The solid's shader ─
 *
 * The program that lights a 3D form, run once per pixel on the GPU. The
 * vertex half places a quad over the footprint and hands each pixel its
 * place in cells; the fragment half works the top of the form out there,
 * exactly as `surface` does, reads the ground and the clearance from two
 * textures at the field's own samples, and lays the wash, the light, the
 * shade, the lines of equal height, the shadow and the edge over one
 * another as round two of the design did. WebGL 2 only, as the board is.
 * Design: docs/templates.md "How it looks" and "How it is worked out".
 */

import { GlProgram } from "pixi.js";

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

// Every number is in the rule's unit, as the area's sizes are; a point of
// the plan is taken from cells to that unit with the cell's size.
const FRAGMENT = /* glsl */ `#version 300 es
in vec2 vCell;
in vec4 vColor;
out vec4 finalColor;

uniform vec3 uOrigin;
uniform float uCell;
uniform float uForm;
uniform vec2 uAim;
uniform float uTan;
uniform float uLength;
uniform float uRoundEdge;
uniform float uRadius;
uniform float uInner;
uniform float uHeight;
uniform float uTallest;
uniform float uStep;
uniform float uLift;
uniform vec3 uLightDir;
uniform vec2 uFieldOrigin;
uniform vec2 uFieldSize;
uniform float uPer;
uniform vec4 uClearBox;
uniform vec4 uBase;
uniform vec4 uLight;
uniform vec4 uShade;
uniform vec2 uShadowCast;
uniform highp sampler2D uField;
uniform highp sampler2D uClear;

const float FORM_CONE = 0.0;
const float FORM_ROUND = 1.0;
const float SHADOW_ALPHA = 0.42;
const float SHADOW_UNDER = 0.35;
const int SHADOW_STEPS = 8;
const float EDGE_PIXELS = 1.5;
const float EDGE_ALPHA = 0.5;
const float STEEP = 2.6;

// The top of the form at a point taken from the origin, how far inside
// the form the point lies, and the top's slope across the plan.
float surfaceAt(vec2 plan, out float margin, out vec2 slope) {
  if (uForm == FORM_CONE) {
    float along = dot(plan, uAim);
    vec2 side = vec2(-uAim.y, uAim.x);
    float across = dot(plan, side);
    float wedge = uTan * along;
    float rise = wedge * wedge - across * across;
    float cap = uLength * uLength - along * along - across * across;
    bool isRound = uRoundEdge > 0.5;
    bool isCapped = isRound && cap < rise;
    margin = min(wedge - abs(across), isRound ? uLength - length(plan) : uLength - along);
    float top = sqrt(max(isCapped ? cap : rise, 0.0));
    float safe = max(top, 1e-3);
    vec2 g = isCapped ? vec2(-along, -across) / safe : vec2(uTan * uTan * along, -across) / safe;
    slope = g.x * uAim + g.y * side;
    return top;
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

// The ground at a point of the plan in cells, level at nought off the map.
float groundAt(vec2 cell) {
  vec2 s = (cell - uFieldOrigin) * uPer;
  if (s.x < 0.0 || s.y < 0.0 || s.x >= uFieldSize.x || s.y >= uFieldSize.y) {
    return 0.0;
  }
  return texture(uField, (floor(s) + 0.5) / uFieldSize).r;
}

// What a line from the origin must clear at a point of the plan in cells;
// nothing clears past the box.
float clearanceAt(vec2 cell) {
  vec2 s = (cell - uFieldOrigin) * uPer - uClearBox.xy;
  if (s.x < 0.0 || s.y < 0.0 || s.x >= uClearBox.z || s.y >= uClearBox.w) {
    return 1e30;
  }
  return texture(uClear, (floor(s) + 0.5) / uClearBox.zw).r;
}

// Whether the solid is drawn at a point in cells, and its top there.
bool drawnAt(vec2 cell, out float top) {
  float margin;
  vec2 slope;
  top = surfaceAt((cell - uOrigin.xy) * uCell, margin, slope);
  if (margin <= 0.0) {
    return false;
  }
  float above = uOrigin.z + top;
  return above > groundAt(cell) && above >= clearanceAt(cell);
}

// How deep the shadow falls at a point: every level of the solid cast a
// short way in the light's direction, soft where it ends.
float shadowAt(vec2 cell) {
  float best = -1e9;
  for (int k = 0; k <= SHADOW_STEPS; k += 1) {
    float z = uTallest * float(k) / float(SHADOW_STEPS);
    float top;
    if (drawnAt(cell - uShadowCast * z / uCell, top)) {
      best = max(best, top - z);
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
  bool drawn = margin > 0.0 && above > groundAt(vCell) && above >= clearanceAt(vCell);
  // Derivatives are taken where every fragment reaches them, before any
  // branch, as the spec asks: a pixel's step in cells, and how fast the
  // lines of equal height come round.
  vec2 px = dFdx(vCell) * EDGE_PIXELS;
  vec2 py = dFdy(vCell) * EDGE_PIXELS;
  float level = top / uStep;
  float width = fwidth(level);
  vec4 color = vec4(0.0);
  float shadow = shadowAt(vCell) * SHADOW_ALPHA * (drawn ? SHADOW_UNDER : 1.0);
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
    float lift = clamp(top / uLift, 0.0, 1.0);
    color = over(color, uBase.rgb, (0.07 + 0.05 * lift) * uBase.a);
    color = over(color, uLight.rgb, 0.34 * hi * uLight.a);
    color = over(color, uShade.rgb, 0.34 * lo * uShade.a);
    // Lines of equal height, brighter on the lit side, left out where the
    // top falls away too steeply for them to mean anything.
    float toLine = abs(level - floor(level + 0.5));
    float isLevel = width > 1e-6 && level > 0.5 && length(slope) < STEEP ? 1.0 : 0.0;
    float line = isLevel * (1.0 - smoothstep(0.0, width * 1.2, toLine));
    float lineAlpha = clamp(0.14 + 0.42 * hi + 0.10 * (1.0 - lo), 0.0, 0.5);
    color = over(color, uLight.rgb, line * lineAlpha * uLight.a);
    // The solid's own edge: a neighbour a pixel or so away that is not drawn.
    float beside;
    bool whole = drawnAt(vCell + px, beside) && drawnAt(vCell - px, beside)
      && drawnAt(vCell + py, beside) && drawnAt(vCell - py, beside);
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

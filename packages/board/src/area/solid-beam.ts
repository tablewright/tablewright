/**
 * ─ A beam's tube, in GLSL ─
 *
 * The part of the solid's shader that works out a beam over a pixel. A
 * beam catches as a box about its line but is drawn as the round tube
 * inside it, so it shades as a cone does: the stretch of height the
 * upright line there cuts from the tube, and the slope of its top for the
 * light. `tubeSpan` in volume.ts makes the same cuts in TypeScript, where
 * the tests reach them; the reuse check cannot see across the two
 * languages, so both files say so.
 * Design: docs/templates.md "Which shapes turn" and "How it is worked out".
 */

/** The GLSL of `tubeAt` and what it needs, for the fragment to take in after its uniforms and constants. */
export const TUBE_AT = /* glsl */ `
// One cut of the upright line over a point of the plan: between two
// planes square to a normal, one at from along it and the other at to.
// The stretch between them narrows lo and hi, and where it lowers the top
// it keeps the normal the light reads there. A cut whose normal lies level
// keeps all of the line or none of it.
void cutBetween(
  vec3 normal,
  float from,
  float to,
  vec3 lit,
  vec2 plan,
  inout float lo,
  inout float hi,
  inout vec3 topNormal,
  inout bool isEmpty
) {
  float onPlan = dot(plan, normal.xy);
  if (normal.z == 0.0) {
    isEmpty = isEmpty || onPlan < from || onPlan > to;
    return;
  }
  float one = (from - onPlan) / normal.z;
  float two = (to - onPlan) / normal.z;
  lo = max(lo, min(one, two));
  if (max(one, two) < hi) {
    hi = max(one, two);
    topNormal = lit;
  }
}

// A beam's tube over a point of the plan taken from the origin: the upper
// end of the stretch of height inside its end caps, its sides across and
// its round side, in tubeSpan's order and sums. Up is the line crossed
// with the way across, as beamFrame has it. Across is level, so how far
// across the line the point stands, s, holds at every height, and there
// the tube reaches up and down the line by the rim, (h/2)·√(1 − (2s/w)²).
// On the round side the top lies where t, the way up from the line, is
// the rim, and its normal is the gradient of (2s/w)² + (2t/h)², scaled by
// w²h²/8 so neither size divides; on an end cap it is the line. The margin
// is the stretch's length, nought or less outside the tube; the slope is
// the top's across the plan, kept off nought on the side it falls as a
// cone's plane is.
float tubeAt(vec2 plan, out float margin, out vec2 slope) {
  vec3 across = vec3(uAcross, 0.0);
  vec3 up = cross(uAxis, across);
  float side = dot(plan, uAcross);
  float share = uWidth > 0.0 ? 2.0 * side / uWidth : 1.0;
  float rim = 0.5 * uHeight * sqrt(max(0.0, 1.0 - share * share));
  vec3 roundNormal = side * uHeight * uHeight * across + uWidth * uWidth * rim * up;
  float lo = -UNBOUNDED;
  float hi = UNBOUNDED;
  vec3 topNormal = up;
  bool isEmpty = false;
  cutBetween(uAxis, 0.0, uLength, uAxis, plan, lo, hi, topNormal, isEmpty);
  cutBetween(across, -0.5 * uWidth, 0.5 * uWidth, across, plan, lo, hi, topNormal, isEmpty);
  cutBetween(up, -rim, rim, roundNormal, plan, lo, hi, topNormal, isEmpty);
  margin = isEmpty ? -1.0 : hi - lo;
  slope = -topNormal.xy / (topNormal.z >= 0.0 ? max(topNormal.z, 1e-3) : min(topNormal.z, -1e-3));
  return hi;
}
`;

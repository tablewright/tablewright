/**
 * ─ A cone's top, in GLSL ─
 *
 * The part of the solid's shader that works out a 3D cone over a pixel:
 * the stretch of height the upright line there cuts from the cone, and
 * the slope of its top for the light. `coneSpan` in volume.ts makes the
 * same cuts in TypeScript, where the tests reach them; the reuse check
 * cannot see across the two languages, so both files say so.
 * Design: docs/templates.md "Yaw and pitch" and "How it is worked out".
 */

/** The GLSL of `coneAt` and what it needs, for the fragment to take in after its uniforms and constants. */
export const CONE_AT = /* glsl */ `
// A cone whose side stands this near upright is solved as upright, as
// coneSpan does.
const float UPRIGHT = 1e-6;
// Which cut a cone's top lies on: its side, its round cap, or a plane
// square to its axis, the flat cap or the apex's own.
const int ON_SIDE = 0;
const int ON_BALL = 1;
const int ON_PLANE = 2;

// A 3D cone's top over a point of the plan taken from the origin: the
// upper end of the stretch of height the upright line there cuts from
// the cone, by its side, the side of the apex it opens to and its cap,
// in coneSpan's order and sums. The margin is the stretch's length,
// nought or less outside the cone; the slope is the top's across the
// plan, from the cut it lies on.
float coneAt(vec2 plan, out float margin, out vec2 slope) {
  vec3 a = uAxis;
  float c2 = 1.0 / (1.0 + uTan * uTan);
  float q = dot(plan, a.xy);
  float r2 = dot(plan, plan);
  float lo = -UNBOUNDED;
  float hi = UNBOUNDED;
  int bound = ON_SIDE;
  bool isEmpty = false;
  float A = a.z * a.z - c2;
  float B = q * a.z;
  float C = q * q - c2 * r2;
  if (abs(A) < UPRIGHT) {
    if (B > 0.0) {
      lo = -C / (2.0 * B);
    } else if (B < 0.0) {
      hi = -C / (2.0 * B);
    } else {
      isEmpty = C < 0.0;
    }
  } else {
    float disc = B * B - A * C;
    isEmpty = A < 0.0 && disc < 0.0;
    float root = sqrt(max(disc, 0.0));
    float k = -(B + (B >= 0.0 ? root : -root));
    float one = k == 0.0 ? 0.0 : k / A;
    float two = k == 0.0 ? 0.0 : C / k;
    if (A < 0.0) {
      lo = min(one, two);
      hi = max(one, two);
    } else if (a.z > 0.0) {
      lo = max(one, two);
    } else {
      hi = min(one, two);
    }
  }
  if (a.z > 0.0) {
    lo = max(lo, -q / a.z);
  } else if (a.z < 0.0) {
    if (-q / a.z < hi) {
      hi = -q / a.z;
      bound = ON_PLANE;
    }
  } else {
    isEmpty = isEmpty || q < 0.0;
  }
  if (uRoundEdge > 0.5) {
    float h2 = uLength * uLength - r2;
    isEmpty = isEmpty || h2 <= 0.0;
    float h = sqrt(max(h2, 0.0));
    lo = max(lo, -h);
    if (h < hi) {
      hi = h;
      bound = ON_BALL;
    }
  } else if (a.z > 0.0) {
    float capAt = (uLength - q) / a.z;
    if (capAt < hi) {
      hi = capAt;
      bound = ON_PLANE;
    }
  } else if (a.z < 0.0) {
    lo = max(lo, (uLength - q) / a.z);
  } else {
    isEmpty = isEmpty || q >= uLength;
  }
  margin = isEmpty ? -1.0 : hi - lo;
  // Each cut's slope is its sum's gradient across the plan over its
  // gradient up, the latter kept off nought on the side it falls at a top.
  if (bound == ON_BALL) {
    slope = -plan / max(hi, 1e-3);
  } else if (bound == ON_PLANE) {
    slope = -a.xy / (a.z >= 0.0 ? max(a.z, 1e-3) : min(a.z, -1e-3));
  } else {
    float along = q + a.z * hi;
    slope = -(along * a.xy - c2 * plan) / min(along * a.z - c2 * hi, -1e-3);
  }
  return hi;
}
`;

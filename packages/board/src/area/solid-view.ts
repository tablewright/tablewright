/**
 * ─ The solid ─
 *
 * A 3D form drawn as a lit solid: one mesh over the footprint's box, its
 * shader given the area's numbers, the field as a texture built once per
 * scene, and the clearance as a texture built per move. Nothing here
 * decides what is drawn; the shader does, from the same sums `surface`
 * and `risesTo` make on the CPU.
 * Design: docs/templates.md "How it looks".
 */

import { BufferImageSource, Mesh, MeshGeometry, Shader, UniformGroup } from "pixi.js";
import type { Point } from "../shared/geometry.js";
import { cellPointToWorld, type SquareGrid } from "../grid/square-grid.js";
import { channelsOf, type PackedColor } from "../theme/css-color.js";
import type { Topology } from "../topology/derive.js";
import { stepHeight } from "../topology/rules/cost.js";
import type { GridRule } from "../topology/rules/distance.js";
import { sampleHeight, sampleWidth } from "../topology/shapes.js";
import { aimVector, spotToCellPoint, type Area, type Spot } from "./area.js";
import type { Clearance } from "./cut.js";
import type { Outline } from "./outline.js";
import { LIGHT, SHADOW_CAST, solidProgram } from "./solid-shader.js";
import { tallest } from "./volume.js";

/** The colours a solid is lit in: its wash, its lit side and its shaded side. */
export interface SolidStyle {
  readonly base: PackedColor;
  readonly light: PackedColor;
  readonly shade: PackedColor;
}

// The wash is fullest at six cells of height, thirty feet on a five-foot
// grid, as round two drew it.
const LIFT_CELLS = 6;
// The quad reaches a cell past the footprint, so the shadow has room.
const QUAD_PAD = 1;

/** Draws one 3D form as a lit solid over the board. */
export class SolidView {
  readonly view: Mesh<MeshGeometry, Shader>;
  private readonly uniforms = new UniformGroup({
    uQuad: { value: new Float32Array(4), type: "vec4<f32>" },
    uOrigin: { value: new Float32Array(3), type: "vec3<f32>" },
    uCell: { value: 1, type: "f32" },
    uForm: { value: 0, type: "f32" },
    uAim: { value: new Float32Array(2), type: "vec2<f32>" },
    uTan: { value: 0, type: "f32" },
    uLength: { value: 0, type: "f32" },
    uRoundEdge: { value: 1, type: "f32" },
    uRadius: { value: 0, type: "f32" },
    uInner: { value: 0, type: "f32" },
    uHeight: { value: 0, type: "f32" },
    uTallest: { value: 0, type: "f32" },
    uStep: { value: 1, type: "f32" },
    uLift: { value: 1, type: "f32" },
    uLightDir: { value: new Float32Array(LIGHT), type: "vec3<f32>" },
    uFieldOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
    uFieldSize: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
    uPer: { value: 1, type: "f32" },
    uClearBox: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
    uBase: { value: new Float32Array(4), type: "vec4<f32>" },
    uLight: { value: new Float32Array(4), type: "vec4<f32>" },
    uShade: { value: new Float32Array(4), type: "vec4<f32>" },
    uShadowCast: { value: new Float32Array([SHADOW_CAST.x, SHADOW_CAST.y]), type: "vec2<f32>" },
  });
  private readonly field = floatTexture("area-field");
  private readonly clearance = floatTexture("area-clearance");
  private readonly shader: Shader;
  private fieldOf: Topology | undefined;
  private clearedBy: Clearance | undefined;

  constructor() {
    this.shader = new Shader({
      glProgram: solidProgram(),
      resources: { solid: this.uniforms, uField: this.field, uClear: this.clearance },
    });
    this.view = new Mesh({
      geometry: new MeshGeometry({}),
      shader: this.shader,
      label: "area-solid",
    });
    this.view.visible = false;
  }

  setStyle(style: SolidStyle): void {
    const { uBase, uLight, uShade } = this.uniforms.uniforms;
    setColor(uBase, style.base);
    setColor(uLight, style.light);
    setColor(uShade, style.shade);
  }

  /**
   * Light `area` laid down at `origin` over its whole `footprint`, cut by
   * `clearance`, in the scene `topology` holds. The field is uploaded
   * once per topology and the clearance once per build.
   */
  show(
    area: Area,
    origin: Spot,
    footprint: Outline,
    clearance: Clearance,
    topology: Topology,
    grid: SquareGrid,
    rule: GridRule
  ): void {
    const u = this.uniforms.uniforms;
    const quad = quadAround(footprint.ring);
    const corner = cellPointToWorld(grid, quad);
    this.view.position.set(corner.x, corner.y);
    this.view.scale.set(quad.width * grid.cellSize, quad.height * grid.cellSize);
    u.uQuad.set([quad.x, quad.y, quad.width, quad.height]);
    const at = spotToCellPoint(origin, rule);
    u.uOrigin.set([at.x, at.y, origin.z]);
    u.uCell = rule.cellSize;
    u.uStep = stepHeight(rule);
    u.uLift = LIFT_CELLS * rule.cellSize;
    u.uTallest = tallest(area);
    this.setForm(area);
    const { samples } = topology;
    const width = sampleWidth(samples);
    const height = sampleHeight(samples);
    if (this.fieldOf !== topology) {
      this.fieldOf = topology;
      upload(this.field, topology.field, width, height);
    }
    u.uFieldOrigin.set([samples.bounds.colMin, samples.bounds.rowMin]);
    u.uFieldSize.set([width, height]);
    u.uPer = samples.per;
    if (this.clearedBy !== clearance) {
      this.clearedBy = clearance;
      const { box, values } = clearance;
      upload(this.clearance, values, box.width, box.height);
      u.uClearBox.set([box.i0, box.j0, box.width, box.height]);
    }
    this.view.visible = true;
  }

  clear(): void {
    this.view.visible = false;
    this.clearedBy = undefined;
  }

  destroy(): void {
    this.view.destroy();
    this.shader.destroy();
    this.field.destroy();
    this.clearance.destroy();
  }

  // The form's own numbers: a cone's aim, spread and length and how its
  // far edge is cut; a round form's radii and a cylinder's height.
  private setForm(area: Area): void {
    const u = this.uniforms.uniforms;
    if (area.kind === "cone") {
      const aim = aimVector(area.aim);
      u.uForm = 0;
      u.uAim.set([aim.x, aim.y]);
      u.uTan = Math.tan(((area.spread / 2) * Math.PI) / 180);
      u.uLength = area.length;
      u.uRoundEdge = area.edge === "round" ? 1 : 0;
      return;
    }
    if (area.kind === "circle") {
      u.uForm = area.form === "cylinder" ? 2 : 1;
      u.uRadius = area.radius;
      u.uInner = area.inner;
      u.uHeight = area.height;
    }
  }
}

// One channel of floats per sample, read at the sample and never between
// two, so the shader sees the field's own numbers.
function floatTexture(label: string): BufferImageSource {
  return new BufferImageSource({
    resource: new Float32Array(1),
    width: 1,
    height: 1,
    format: "r32float",
    scaleMode: "nearest",
    addressMode: "clamp-to-edge",
    alphaMode: "no-premultiply-alpha",
    label,
  });
}

// A new size reallocates the texture on the GPU; the same size writes
// over it in place.
function upload(
  source: BufferImageSource,
  values: Float32Array,
  width: number,
  height: number
): void {
  source.resource = values;
  if (!source.resize(width, height)) {
    source.update();
  }
}

function setColor(target: Float32Array, color: PackedColor): void {
  const [r, g, b] = channelsOf(color.rgb);
  target.set([r / 255, g / 255, b / 255, color.alpha]);
}

// The cells the footprint spans, a cell wider every way for the shadow.
function quadAround(ring: readonly Point[]): Point & { width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const x = Math.floor(minX) - QUAD_PAD;
  const y = Math.floor(minY) - QUAD_PAD;
  return { x, y, width: Math.ceil(maxX) + QUAD_PAD - x, height: Math.ceil(maxY) + QUAD_PAD - y };
}

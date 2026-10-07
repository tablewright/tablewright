/**
 * ─ The solid ─
 *
 * A 3D form drawn as a lit solid: one mesh over the footprint's box, its
 * shader given the area's numbers, and the scene as two textures built
 * once per topology, the field and the tops of the solid edges. Nothing
 * here decides what is drawn; the shader does, marching the line from
 * the origin for every pixel as `risesTo` has `firstStop` do on the CPU.
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
import { edgeTops } from "./cut.js";
import type { Outline } from "./outline.js";
import { LIGHT, SHADOW_CAST, solidProgram } from "./solid-shader.js";
import { tallest } from "./volume.js";

/** The colours a solid is lit in: its wash, its lit side and its shaded side. */
export interface SolidStyle {
  readonly base: PackedColor;
  readonly light: PackedColor;
  readonly shade: PackedColor;
}

// The wash is fullest at six cells of height above the ground, thirty
// feet on a five-foot grid, as round two drew it.
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
    uAxis: { value: new Float32Array(3), type: "vec3<f32>" },
    uTan: { value: 0, type: "f32" },
    uLength: { value: 0, type: "f32" },
    uRoundEdge: { value: 1, type: "f32" },
    uRadius: { value: 0, type: "f32" },
    uInner: { value: 0, type: "f32" },
    uHeight: { value: 0, type: "f32" },
    uHighest: { value: 0, type: "f32" },
    uStep: { value: 1, type: "f32" },
    uLift: { value: 1, type: "f32" },
    uReaches: { value: 1, type: "f32" },
    uLightDir: { value: new Float32Array(LIGHT), type: "vec3<f32>" },
    uFieldOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
    uFieldSize: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
    uPer: { value: 1, type: "f32" },
    uEdgeSize: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
    uBase: { value: new Float32Array(4), type: "vec4<f32>" },
    uLight: { value: new Float32Array(4), type: "vec4<f32>" },
    uShade: { value: new Float32Array(4), type: "vec4<f32>" },
    uShadowCast: { value: new Float32Array([SHADOW_CAST.x, SHADOW_CAST.y]), type: "vec2<f32>" },
  });
  private readonly field = floatTexture("area-field", "r32float");
  private readonly edges = floatTexture("area-edges", "rg32float");
  private readonly shader: Shader;
  private sceneOf: Topology | undefined;
  // The lowest ground in the scene, the map's edge at nought included.
  private lowest = 0;

  constructor() {
    this.shader = new Shader({
      glProgram: solidProgram(),
      resources: { solid: this.uniforms, uField: this.field, uEdges: this.edges },
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
   * Light `area` laid down at `origin` over its whole `footprint`, in the
   * scene `topology` holds. The field and the edges are uploaded once per
   * topology; a move changes numbers alone.
   */
  show(
    area: Area,
    origin: Spot,
    footprint: Outline,
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
    u.uReaches = area.reaches === "line-of-sight" ? 1 : 0;
    this.setForm(area);
    const { samples } = topology;
    const width = sampleWidth(samples);
    const height = sampleHeight(samples);
    if (this.sceneOf !== topology) {
      this.sceneOf = topology;
      upload(this.field, topology.field, width, height);
      const tops = edgeTops(topology);
      upload(this.edges, tops.values, tops.cols, tops.rows);
      u.uEdgeSize.set([tops.cols, tops.rows]);
      this.lowest = lowestOf(topology.field);
    }
    // The shadow is cast from heights above the ground, so its levels run
    // up to the most the solid can stand over the lowest ground there is.
    u.uHighest = Math.max(0, origin.z + tallest(area) - this.lowest);
    u.uFieldOrigin.set([samples.bounds.colMin, samples.bounds.rowMin]);
    u.uFieldSize.set([width, height]);
    u.uPer = samples.per;
    this.view.visible = true;
  }

  clear(): void {
    this.view.visible = false;
  }

  destroy(): void {
    this.view.destroy();
    this.shader.destroy();
    this.field.destroy();
    this.edges.destroy();
  }

  // The form's own numbers: a cone's axis, tilted by its pitch, its spread
  // and length and how its far edge is cut; a round form's radii and a
  // cylinder's height.
  private setForm(area: Area): void {
    const u = this.uniforms.uniforms;
    if (area.kind === "cone") {
      const axis = aimVector(area.yaw, area.pitch);
      u.uForm = 0;
      u.uAxis.set([axis.x, axis.y, axis.z]);
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

// Floats per sample or per cell, read at the texel and never between two,
// so the shader sees the scene's own numbers.
function floatTexture(label: string, format: "r32float" | "rg32float"): BufferImageSource {
  return new BufferImageSource({
    resource: new Float32Array(format === "r32float" ? 1 : 2),
    width: 1,
    height: 1,
    format,
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

// The lowest of the field's samples, and nought, which the field reads as
// off the map.
function lowestOf(field: Float32Array): number {
  let lowest = 0;
  for (const height of field) {
    lowest = Math.min(lowest, height);
  }
  return lowest;
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

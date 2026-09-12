export {
  LEVEL_CHANGE_DATA,
  LEVEL_CHANGE_TEXTURED,
  SAMPLES_PER_CELL,
  cellIndex,
  derive,
  edgeAt,
  groundAt,
  heightAt,
  isLevelChangeAt,
  isTexturedAt,
  visibleTo,
  type EdgeData,
  type FreeStroke,
  type ThresholdEdge,
  type Topology,
} from "./derive.js";
export {
  DEFAULT_MOVER,
  isFlying,
  jumpsAt,
  jumpsFrom,
  speedOf,
  stepCost,
  stepCostAt,
  stepHeight,
  type Jump,
  type Mover,
  type Step,
  type StepKind,
  type StepOptions,
} from "./cost.js";
export {
  DEFAULT_RULE,
  diagonalCost,
  distance,
  distanceBetween,
  gridRuleOf,
  type GridRule,
  type Place,
} from "./distance.js";
export { edgeBetween, edgeCells, edgeKey, rectEdges } from "./edges.js";
export {
  AIR,
  DIFFICULT,
  GROUND,
  VOID,
  graphCell,
  graphIndex,
  movementGraph,
  type MovementGraph,
} from "./graph.js";
export {
  cellCentre,
  firstBlock,
  hasLineOfEffect,
  hasLineOfSight,
  passes,
  type Crossing,
  type Passage,
} from "./effect.js";
export {
  HEIGHT_MODES,
  HeightLayer,
  thresholdsOf,
  type HeightDrawing,
  type HeightStyle,
} from "./height-layer.js";
export { contourGroups, isoLines, type Segment } from "./iso.js";
export {
  NO_LIMIT,
  chooseRoute,
  findRoute,
  reach,
  routes,
  type Budget,
  type Choice,
  type Phase,
  type Route,
  type RouteOptions,
  type RouteStep,
  type Routes,
} from "./route.js";
export { mansionStrokes } from "./mansion.js";
export { REFERENCE_SCENES, type ReferenceScene } from "./reference.js";
export { terraceHillStrokes } from "./terrace-hill.js";
export {
  forCellsInShape,
  forCellsTouchedByBrush,
  forSamplesInCell,
  forSamplesInShape,
  placedPoints,
  pointInPolygon,
  radiusOf,
  sampleCentre,
  sampleHeight,
  sampleWidth,
  type SampleGrid,
} from "./shapes.js";
export { TopologyLayer, type TopologyStyle } from "./topology-layer.js";

export {
  SAMPLES_PER_CELL,
  cellIndex,
  derive,
  edgeAt,
  groundAt,
  heightAt,
  isLevelChangeAt,
  visibleTo,
  type EdgeData,
  type FreeStroke,
  type Topology,
} from "./derive.js";
export { edgeBetween, edgeCells, edgeKey, rectEdges } from "./edges.js";
export { mansionStrokes } from "./mansion.js";
export { REFERENCE_SCENES, type ReferenceScene } from "./reference.js";
export { terraceHillStrokes } from "./terrace-hill.js";
export {
  forCellsInShape,
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

export {
  PITCH_RANGE,
  REACHES,
  SPREAD_RANGE,
  aimVector,
  clamped,
  cubeCentre,
  defaultArea,
  describeArea,
  ORIGIN_SNAPS,
  floorSpot,
  reached,
  snapOrigin,
  snapSize,
  spotToCellSpot,
  type Anchor,
  type OriginSnap,
  type Area,
  type CircleArea,
  type ConeArea,
  type Reach,
  type RectArea,
  type Spot,
} from "./area.js";
export { catchesCell, catchesToken, caughtCells, placeOf } from "./cover.js";
export { AreaLayer, type AreaDrawing, type AreaStyle, type ShownArea } from "./area-layer.js";
export { AreaTool, type AreaListener, type OriginFor, type PlacedArea } from "./area-tool.js";
export { OPEN_EDGE, cutOf, edgeTops, risesTo, type AreaCut, type EdgeTops } from "./cut.js";
export { footprint, footprintCovers, outline, type Outline } from "./outline.js";
export { holds, isSolid, surface, tallest } from "./volume.js";

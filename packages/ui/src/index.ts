// Shared Lit components. Tauri-agnostic: anything that needs the core is
// handed in as a function or a document, so the browser player client can
// host the same elements over a different transport.
export { TwSpotlight } from "./spotlight/tw-spotlight.js";
export { TwShareCard } from "./share/tw-share-card.js";
export { TwShareTray } from "./share/tw-share-tray.js";
export type { Share } from "./share/tw-share-tray.js";
export { TwEntryView } from "./entry/tw-entry-view.js";
export { groups } from "./entry/sections.js";
export type { SectionGroup } from "./entry/sections.js";
export type { EntryDocument } from "./entry/tw-entry-view.js";
export { TwFilterTray } from "./filters/tw-filter-tray.js";
export {
  activeCount,
  besideIndex,
  cellKey,
  chipValues,
  filtersOf,
  selectionOf,
  valueText,
} from "./filters/state.js";
export type { ControlState, TrayState, Tri } from "./filters/state.js";
export { categoryOf, groupHits, previewOf } from "./spotlight/preview.js";
export type { HitGroup, Taxonomy, TilePreview } from "./spotlight/preview.js";
export type { SearchAnswer, Searcher, SpotlightHit } from "./spotlight/searcher.js";

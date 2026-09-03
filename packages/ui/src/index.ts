// Shared Lit components. Tauri-agnostic: anything that needs the core is
// handed in as a function or a document, so the browser player client can
// host the same elements over a different transport.
export { TwSpotlight } from "./spotlight/tw-spotlight.js";
export { TwShareCard } from "./share/tw-share-card.js";
export { TwShareTray } from "./share/tw-share-tray.js";
export type { Share } from "./share/tw-share-tray.js";
export { TwEntryView } from "./entry/tw-entry-view.js";
export type { EntryDocument } from "./entry/tw-entry-view.js";
export { paragraphs, runs } from "./entry/markdown-lite.js";
export type { Run } from "./entry/markdown-lite.js";
export { categoryOf, groupHits, previewOf } from "./spotlight/preview.js";
export type { HitGroup, Taxonomy, TilePreview } from "./spotlight/preview.js";
export type { SearchAnswer, Searcher, SpotlightHit } from "./spotlight/searcher.js";

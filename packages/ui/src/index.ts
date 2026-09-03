// Shared Lit components. Tauri-agnostic: anything that needs the core is
// handed in as a function, so the browser player client can host the same
// elements over a different transport.
export { TwSpotlight } from "./spotlight/tw-spotlight.js";
export { TwShareCard } from "./share/tw-share-card.js";
export { categoryOf, groupHits, previewOf } from "./spotlight/preview.js";
export type { HitGroup, TilePreview } from "./spotlight/preview.js";
export type { SearchAnswer, Searcher, SpotlightHit } from "./spotlight/searcher.js";

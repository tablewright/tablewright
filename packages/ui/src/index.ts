// Shared Lit components. Tauri-agnostic: anything that needs the core is
// handed in as a function, so the browser player client can host the same
// elements over a different transport.
export { TwSpotlight } from "./spotlight/tw-spotlight.js";
export type { SearchAnswer, Searcher, SpotlightHit } from "./spotlight/searcher.js";

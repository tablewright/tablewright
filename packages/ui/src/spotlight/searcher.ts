// What the search panel asks of its host. The shape is the envelope's
// summary, so the core's `Hit` satisfies it without conversion, and a test
// can satisfy it with a plain array.

import type { Filter, Understood } from "@tablewright/schema";

export interface SpotlightHit {
  id: string;
  type: string;
  name: string;
  source: string;
  tags: string[];
}

export interface SearchAnswer {
  hits: SpotlightHit[];
  /** Time the core spent, in microseconds. */
  elapsedUs: number;
  /** How many entries were searchable. */
  catalogueSize: number;
  /** What the parser made of the typed text, when the host has a parser. */
  understood?: Understood[];
}

/** Search `query`, with the tray's own filters applied as well. */
export type Searcher = (query: string, filters: Filter[]) => Promise<SearchAnswer>;

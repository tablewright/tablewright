// What the search panel asks of its host. The shape is the envelope's
// summary, so the core's `Hit` satisfies it without conversion, and a test
// can satisfy it with a plain array.

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
}

export type Searcher = (query: string) => Promise<SearchAnswer>;

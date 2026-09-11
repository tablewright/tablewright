// One entry as the page reads it, from what the core answered: the fields
// the envelope leaves optional are filled in, so the view never sees a hole.

import type { Entry } from "@tablewright/schema";
import type { EntryDocument } from "@tablewright/ui";

/** The entry as the page shows it. */
export function documentOf(entry: Entry): EntryDocument {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    source: entry.source,
    version: entry.version ?? "",
    versions: entry.versions ?? [],
    tags: entry.tags,
    body: entry.body,
    html: entry.html ?? "",
    sections: entry.sections ?? [],
  };
}

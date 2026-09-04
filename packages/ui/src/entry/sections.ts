// The page shows an entry's parts under headings: the sections arrive flat,
// in the order the system manifest gave them, and consecutive sections
// with one label share a heading (Traits, then Actions, then Legendary
// actions). Pure; the view renders what this returns.

import type { Section } from "@tablewright/schema";

export interface SectionGroup {
  label: string;
  items: Section[];
}

/** Group consecutive sections by label, keeping their order. */
export function groups(sections: Section[]): SectionGroup[] {
  const result: SectionGroup[] = [];
  for (const section of sections) {
    const last = result.at(-1);
    if (last !== undefined && last.label === section.label) {
      last.items.push(section);
    } else {
      result.push({ label: section.label, items: [section] });
    }
  }
  return result;
}

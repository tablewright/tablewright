// Words as the chrome shows them.

/** A value as a label: the first word capitalised, hyphens as spaces. */
export function titleCase(text: string): string {
  return text
    .split(/[-\s]+/)
    .map((word, at) =>
      at === 0 && word.length > 0 ? word[0]?.toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}

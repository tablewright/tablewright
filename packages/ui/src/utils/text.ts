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

/** A value as a heading: every hyphen-separated word capitalised, hyphens as spaces. */
export function wordsCase(text: string): string {
  return text
    .split("-")
    .map((word) => (word.length === 0 ? word : word[0]?.toUpperCase() + word.slice(1)))
    .join(" ");
}

/** The name a form was given, trimmed, or nothing when it is blank or `form` is not a form. */
export function nameFrom(form: EventTarget | null): string | undefined {
  if (!(form instanceof HTMLFormElement)) {
    return undefined;
  }
  const name = new FormData(form).get("name");
  return typeof name === "string" && name.trim() !== "" ? name.trim() : undefined;
}

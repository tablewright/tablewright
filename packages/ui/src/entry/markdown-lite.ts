// The little markdown an entry body uses: paragraphs separated by blank
// lines, and `**bold**` runs. Nothing is parsed as HTML; the view renders
// these pieces as text nodes, so a body can never inject markup.

export interface Run {
  text: string;
  bold: boolean;
}

/** Split a body into paragraphs, dropping empty ones. */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}

/** Split one paragraph into plain and bold runs on `**` markers. */
export function runs(paragraph: string): Run[] {
  const pieces = paragraph.split("**");
  const result: Run[] = [];
  pieces.forEach((text, index) => {
    if (text !== "") {
      result.push({ text, bold: index % 2 === 1 });
    }
  });
  return result;
}

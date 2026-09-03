import { describe, expect, test } from "bun:test";
import { paragraphs, runs } from "../src/entry/markdown-lite.js";

describe("paragraphs", () => {
  test("splits on blank lines and drops empty ones", () => {
    expect(paragraphs("One.\n\nTwo.\n\n\n  \nThree.")).toEqual(["One.", "Two.", "Three."]);
  });

  test("a single line is one paragraph", () => {
    expect(paragraphs("Only.")).toEqual(["Only."]);
    expect(paragraphs("")).toEqual([]);
  });
});

describe("runs", () => {
  test("marks the text between double asterisks bold", () => {
    expect(runs("**Cantrip Upgrade.** The damage grows.")).toEqual([
      { text: "Cantrip Upgrade.", bold: true },
      { text: " The damage grows.", bold: false },
    ]);
  });

  test("plain text is one plain run", () => {
    expect(runs("Nothing bold.")).toEqual([{ text: "Nothing bold.", bold: false }]);
  });
});

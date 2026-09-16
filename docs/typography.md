# Type

Five faces, and a rule for which one a thing is set in: where the
reader is.

## Two surfaces

Tablewright has two grounds. The **page** is paper and ink: a
compendium entry, a journal, a handout. The **app** is the dark chrome
around it: rails, panels, menus and the board.

A page is read at leisure, so it can afford a voice. The app is read
mid-turn at eleven or twelve pixels while the table waits, so it needs
clarity above everything else.

## The five

**Cinzel Decorative**: every heading, such as a document's title, a
scene's name and the subheadings inside an entry. It is a caps face
after the lettering of inscriptions, which is where the fantasy comes
from. Being caps, it shows hierarchy without weight, so a subheading
sits under a title in the same colour, one size down. It stops reading
below about sixteen pixels, and no heading is smaller than that.

**EB Garamond**: the body of a page. An old-style serif drawn for
reading at length, with a real semibold and a real italic for stat
blocks and quoted rules.

**Libertinus Sans**: labels, tooltips and the rest of the chrome. A
sans on a serif's skeleton, with a larger x-height than Garamond, so it
says as much in less height. It comes in 400 and 700, with an italic
at 400.

**Fira Code**: digits, and the tags beside them. It is a mono, so every
figure is the same width and a column of armour classes, hit points or
distances lines up. Its ligatures are on, and become a setting of each
person's own once there is a page for settings.

**Material Symbols**: icons, below.

## Slot by slot

The tokens in `DESIGN.md`, and what each becomes.

| Token | Face | Where it is read |
| --- | --- | --- |
| `document-title` | Cinzel Decorative 700 | An entry's name, a scene's name |
| `document-heading` | Cinzel Decorative 400 | Subheadings inside an entry |
| `document-body` | EB Garamond 400/600 | The paragraphs of a page |
| `document-label` | Libertinus Sans 700 | The kicker above a title |
| `headline-md` | Libertinus Sans 700 | A panel's heading |
| `headline-sm` | Libertinus Sans 700 | A section inside a panel |
| `body-md` | Libertinus Sans 400 | Running text in the chrome |
| `body-sm` | Libertinus Sans 400 | Dense lists, search results |
| `label-md` | Libertinus Sans 700 | Buttons, tooltips, strip cells |
| `numeric-md` | Fira Code 500 | Every figure, and the tags beside them |

**Cinzel names things.** A document's title and a scene's name are
names. A panel heading such as *Tools* or *Seen by* is furniture, and
furniture set in a caps display face shouts, so panel headings use
Libertinus.

**Labels are 700.** Libertinus has no 600, and asking for a weight a
family has no file for quietly gets the nearest file, smeared sideways
to fake the weight.

## Not used

- **Tangerine** and **Ruthie**: scripts drawn for large sizes, whose
  hairlines break up at body sizes.
- **Atkinson Hyperlegible**: its slashed zero makes figures busy at
  badge size, and it is wide enough to grow every pill it sits in.

## Icons

Material Symbols is the default. It has a glyph for nearly everything
an app does, it sits on a text baseline, and subset to the icons in use
it is under two kilobytes.

`icons.ts` keeps the glyphs that are tablewright's own ideas:
**threshold**, **level-change**, and the ink kinds **ground**,
**wall**, **height** and **free**. They are stroke glyphs on a 20 px
grid at 1.6, drawn to sit at Material's weight. Everything else comes
from Material.

Material turns the text `arrow_upward` into its glyph by ligature.
Board text uses each icon's private-use codepoint instead, so a
badge's text stays its own and a screen reader does not read the word
out. The subset holds only the icons asked for, so the font build
lists them.

## The board

Pixi measures text when it draws it, so a first draw before the faces
load would lay badges out at the fallback's widths for the rest of the
session. The board waits on `document.fonts.ready` before its first
frame.

## Where the files come from

Cinzel Decorative, EB Garamond, Libertinus Sans and Fira Code are
under the SIL Open Font License, and Material Symbols under Apache 2.0.
Both licences ship with the fonts.

Nothing is fetched at runtime: the app is local-first, and a table may
have no signal. The woff2 files are in the repo, subset to latin, and
served from the app.

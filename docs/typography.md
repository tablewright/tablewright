# Type

Five faces, and a rule for which one a thing is set in. The rule is
not "which looks nicer": it is **where the reader is**.

## Two surfaces

Tablewright already has two grounds, and the palette says so. There is
the **page** — paper, ink, the colours a compendium entry and a
journal and a handout are drawn on — and there is the **app**, the
dark chrome around it: rails, panels, menus, the board itself.

A page is read at leisure. Somebody sits back with it, or hands it
across the table. It can afford a voice.

The app is read mid-turn, at eleven and twelve pixels, while a token
is halfway across the board and four people are waiting. It can
afford nothing but clarity.

Every choice below follows from that.

## The five

**Cinzel Decorative** — every heading: a document's title, a scene's
name, the subheadings inside an entry. A caps face cut after Trajan's
column, which is where the fantasy comes from: it is the lettering of
inscriptions, not of paperbacks. Because it is caps it carries
hierarchy without weight, so a subheading sits under a title at the
same colour and one size down. It stops reading at about sixteen
pixels, which is fine, because nothing below sixteen is a heading.

**EB Garamond** — the body of a page. An old-style serif with a small
x-height and real contrast between thick and thin, drawn for reading
at length on paper. It is the face Cinzel has been set with for a
century. It has a drawn semibold and a drawn italic, which a stat
block and a rules quote both need.

**Libertinus Sans** — labels and tooltips. A glyphic sans: a serif's
skeleton with the serifs taken off and the stems flared where they
end. Modern enough not to read as costume, and with a larger
x-height than Garamond, so it says as much in less height. It is cut
at 400 and 700 with an italic at 400, and nothing in between.

**Fira Code** — digits, and the tags beside them. A mono, so every
figure is the same width and a column of them lines up without being
told to. That is the whole of the reason, and it is reason enough for
armour classes and hit points and distances. Its ligatures are left
on. They are drawn for `=>` and `!=`, which is not what a tabletop
writes, but they are liked and they do no harm at a table: the case
against is a DM who types `->` in a note and gets one glyph back.
That is a preference, so it belongs with the other preferences when
there is a page for them, on by default (user, 2026-09-13).

**Material Symbols** — icons. See below.

## Slot by slot

The tokens in `DESIGN.md`, and what each becomes.

| Token | Face | Where it is read |
| --- | --- | --- |
| `document-title` | Cinzel Decorative 700 | An entry's name, a scene's name |
| `document-heading` | Cinzel Decorative 400 | Subheadings inside an entry (new) |
| `document-body` | EB Garamond 400/600 | The paragraphs of a page (new) |
| `document-label` | Libertinus Sans 700 | The kicker above a title |
| `headline-md` | Libertinus Sans 700 | A panel's heading |
| `headline-sm` | Libertinus Sans 700 | A section inside a panel |
| `body-md` | Libertinus Sans 400 | Running text in the chrome |
| `body-sm` | Libertinus Sans 400 | Dense lists, search results |
| `label-md` | Libertinus Sans 700 | Buttons, tooltips, strip cells |
| `numeric-md` | Fira Code 500 | Every figure, and the tags beside them |

Two of these are new. There is no `document-body` today — a page's
paragraphs borrow `body-md`, the chrome's own — and once the two
surfaces are set in different faces, borrowing stops working.

**Cinzel names things.** That is the line between the first two rows
and `headline-md`. A document's title and a scene's name are names,
and a name can be inscribed. A panel heading is furniture: it says
*Tools*, or *Seen by*, and setting furniture in a caps display face
is shouting. The same rule answers the next case that comes up
without another argument.

**Libertinus is asked for 700, not 600.** Every label in the app is
600 today, and Libertinus is cut at 400 and 700. Asking for a weight
a family has no file for is not an error anywhere: Google answers
with the nearest cut it has, and the browser then smears that one
sideways to make the weight that was asked for. The token moves to
the weight that exists.

## What was tried and set aside

Kept here so it is not argued twice.

**Tangerine** and **Ruthie** are scripts drawn for large sizes.
Ruthie's hairlines fall under a pixel below about twenty-eight and
the word goes grey and broken. Tangerine holds to about twenty-two,
which is body text at half again the height, and it puts a second
display voice on a page that already has one. Neither is ruled out
for a title card, which is a page with one line on it.

**Atkinson Hyperlegible** is drawn for low vision and does that job
well, but its slashed zero makes `10` and `50` busy at badge size and
the face is wide enough to grow every pill it sits in.

**Inter** and **IBM Plex Sans** were looked at for the board's badges
and dropped with the question: no face ships `▲` or `▼`, so bundling
one would not have fixed what sent us looking.

## Icons

Material Symbols is the default. It has a glyph for nearly everything
an app does, it is drawn to sit on a text baseline, and subsetted to
the icons actually used it is under two kilobytes.

`icons.ts` keeps the glyphs Material has no idea about, because they
are tablewright's own ideas rather than an app's: **threshold**,
**level-change**, and the ink kinds — **ground**, **wall**,
**height**, **free**. These stay stroke glyphs on a twenty pixel grid
at 1.6, drawn to sit at Material's weight so the two hands do not
read as two.

Everything else — arrows, the eye and the struck eye, undo, history,
the ruler, move, the grid — comes from Material.

Two things to hold on to. Material works by ligature, so the text
`arrow_upward` becomes the glyph; every icon also has a private-use
codepoint, and it is the codepoint that goes into board text, or the
badge's string stops being the badge's string and a screen reader
reads the word. And the subset only holds what was asked for, so the
build has to know which icons the app uses.

## The board

Pixi measures text when it draws it. If the first draw happens before
the faces have loaded it measures the fallback, and the badges are
laid out to the wrong widths for the rest of the session. The board
waits on `document.fonts.ready` before its first frame.

## Where the files come from

All five are free to bundle: Cinzel Decorative, EB Garamond,
Libertinus and Fira Code under the SIL Open Font License, Material
Symbols under Apache 2.0. Both licences want their text shipped with
the thing, so it ships.

Nothing is fetched at runtime. The app is local-first, and a table in
a cellar with no signal is the case it is built for. The woff2 files
live in the repo, subset to latin, and are served from the app.

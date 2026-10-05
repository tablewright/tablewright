# Reuse — Tablewright

How code here stays in one place. The paths are this repo's; the rules
are the house's and travel to the other repos as they are. Code style
is in [STYLE.md](STYLE.md), tests in [TESTING.md](TESTING.md).

## Why this file exists

A person who has worked in a repo for a month reuses what is there,
because they know it is there. Someone new writes it again, because
finding out costs more than writing, and an agent is new every time.
Nothing fails when they do. So the repo does two things: it makes what
exists cheap to see, and it makes a second copy fail a check.

## Look before you write

- Before a new function, element, style or helper, look for the one
  that exists: the catalogue first, then a search of the package for
  the verb and the noun.
- Reuse it as it is. When it nearly fits, change it to fit both uses.
  Never copy it and change the copy.
- The second use is the moment to share. The first time, write it
  where it is used. The second time, move it to the shared layer and
  call it from both places. Never a third copy, and never a shared
  helper with one caller kept "for later".
- Every report on a piece of work ends with a reuse reading: what was
  looked for, what was reused, and what was looked for and not found.
  "Nothing to reuse" is an answer. Saying nothing is not.
- A refactor that shares a piece deletes the copies in the same
  change. A shared piece beside its old copies is a third copy.

## Where things live

A folder says what kind of thing is in it, so a glance shows the
vocabulary.

### A UI package: atomic design

`packages/ui/src` sorts by layer, not by feature.

- **`atoms/`**: one control or one look, knowing nothing of the
  domain. A strip of choices, a readout, the icons, the shared style
  fragments.
- **`molecules/`**: a few atoms with one purpose. It knows one thing
  of the domain, a hit or a stroke or a token, and owns no flow. A hit
  tile, a share card, a palette.
- **`components/`**: a piece of the screen that owns a flow and its
  state. The search box, the tool rail, the entry page.
- **`utils/`**: no elements. Events, text, keys, types.

- Imports go down that list, never up: an atom takes atoms and utils,
  a molecule takes atoms, utils and other molecules, a component takes
  anything below it.
- Each component has a folder of its own in `components/`, holding the
  element and what only it uses. Atoms and molecules are flat files;
  one that needs a helper of its own gets a folder the same way. Once
  a second element needs the helper, it moves to `utils/`, or to
  `atoms/` when it is a look.
- A panel that lives inside one component is a molecule: the rail's
  palette, the search box's filter tray.
- A repeated run of CSS is an atom: a fragment exported once and taken
  into each stylesheet that needs it.
- "Element" here is a custom element. In a React repo read
  "component"; the layers are the same.

### An engine or a core: by domain

`packages/board/src` and `crates/core/src` sort by domain: topology,
ruler, draw; store, shelf, search. A domain past about ten files sorts
again into subfolders named for what a reader looks for, with the
domain's face left at its root; STYLE.md says when. What a second
domain uses is shared wherever it sits, and the catalogue lists it
there. A new shared piece goes at the root of the package or the
crate, where a glance finds it.

### An app: glue

An app's source wires packages together, and folds by what a reader
looks for. In `apps/table/src`:

- **`shell/`**: what every part is handed, and the page itself. The
  table, the page's elements, the notices, the loader.
- **`core/`**: the way to the core, real or stand-in.
- **`parts/`**: one file for each part that wires the page. The scene,
  the seat, the campaign, the desk, the keys.
- **`host/`**: the board's host.
- **`dev/`**: what only a dev build has.

`main.ts` stays at the root as the folder's face. What a second app
could use belongs in a package, since Vault and the player client are
coming.

## The catalogue

[CATALOGUE.md](CATALOGUE.md) lists what exists, each name with the
sentence its doc comment opens on, grouped by feature, then file, then
name. A UI file sits under the one feature whose imports reach it, and
under `shared` once a second feature takes it, so the list shows what
is truly shared and what only looks it. The board lists its root files,
and under each domain the names another domain runs. `bun run
catalogue` writes it, `bun run check` refuses a stale one, and
CLAUDE.md imports it, so every session starts knowing what exists. A
listed function or class with no doc comment fails the run. This is why
an exported name's doc comment opens with one plain sentence saying
what it is for: that sentence is what the next person searches.

## The reuse check

`tools/check-reuse.ts` holds a table: what a copy looks like, the one
file that writes it, and what to use instead. When a shared piece
replaces copies, its row goes in with it, so the copies cannot come
back. A file with a reason of its own to write the pattern is named in
the row with that reason, and a row that names a file which no longer
writes the pattern fails, so the table stays true. It also refuses an
import that goes up a layer in the UI package. `bun run check` runs it.

## The builder

[BUILDER.md](BUILDER.md) is the brief every building agent starts
from: read the `.ai` files and the catalogue, build from the plan
step, run the checks, never run a story or commit, and end on the
reuse reading. An agent is new every time, so the brief is what makes
it look before it writes.

# Stories

What a person at the table does, and what they see, starting from the
base: the example campaign with the tavern open. *(later)* marks a
story not yet tested. How a story becomes a test is in
[.ai/TESTING.md](../.ai/TESTING.md). The stories run against a
stand-in for the core; the core's own types and files are proved by
the logic tests.

## Search

### A player searches the compendium

- Ctrl+Space opens the box with the cursor in it; empty, it is just
  the bar, and typing grows it.
- A spell's name finds the spell, grouped under Spells, with its level
  on the tile.
- A condition's name finds it under Rules.
- A school's name brings that school's spells together.
- The bestiary is not there: a monster's name finds nothing.
- The readout says how many hits there are, and how long the core and
  the paint took.

### A DM searches the compendium

- The same queries, with the bestiary among the answers.
- Small creatures below CR 4 come back as a list, each with its CR.
- Words that narrow the answer to one category light its tab and fold
  the tray.
- A hit from another rule version wears its year.
- The Search button opens the box too.

### A player with polymorph searches the bestiary *(later)*

- Beasts up to the CR the spell allows come back; the rest of the
  bestiary stays hidden.

### Opening a result

- Enter opens the chosen entry as a page, and the box stays open with
  the cursor in it.
- The arrows choose a tile; a second Enter turns the page to it.
- The page shows the body as the core rendered it: a table is a table,
  and bold is bold.
- An entry's parts sit under their headings.
- The page's rail turns the thing to its other rule version.
  - A thing one version lacks offers no turn there.
- A creature's page places it on the board as a token; a spell's page
  cannot.

### Sharing an entry

- A share from a tile, or a tile dragged out of the box, raises a card
  on the table.
- Cards queue one at a time; dismissing one lets the next up.
- Opening a card's entry dismisses the card: the reader has it now.
- Sharing the entry already open as a page raises no card.
- Everyone at the table sees the card *(later)*.

### Filtering the search

- A type filter typed into the query lists only that kind.
- A category tab narrows the tiles; an unmatched query says so.
- The tray shows the category's controls, and a control narrows the
  tiles.
- Typed filters light the tray, folded; the tray unfolded overrules
  them, and the words they came from are set aside.
- A folded slider reads as a range.
- Closing the box lets the tray's filters go.

### Leaving the search

- Escape peels the layers back one at a time: the card, then the box,
  then the page.
- A click outside the page closes it, once the box is shut.

## The board

### The board shows the scene

- The scene comes up with its picture, its grid, and its tokens.
- The wheel zooms about the cursor, and a drag on empty board pans.
- A token wears the height of the ground under it.

### A DM or a player moves a token

- A drag drops the token on the target cell, facing its travel.
- The arrow keys and WASD step the selected token one cell.
- A click on empty board deselects.
- A press on the selected token's corner turns it in place.
- A player moves only the tokens they own *(later)*.
- A token standing for no sheet has no limit, so a long drag lands it all
  the same.
- A drag past a sheet's movement asks for a dash: Use dash moves the
  token, Cancel or Escape leaves it where it stood *(later)*.
- A drag beyond even a dash leaves the token where it stood *(later)*.

### A DM or a player measures

- The ruler sits in the rail under Move and swaps moving for
  measuring, its modes in a column beside it.
- A line measure shows the distance as the crow flies, with the rise,
  and breaks where the line of effect does.
- A path measure shows the way this turn allows, and says when it takes
  a dash.
- A measure stays until Escape, and Alt makes it private.

### Working thresholds in play

- In Halloway House, a door under the pointer lights up.
- A tap on a shut door opens it, and on an open one shuts it.
- A locked door says so, an arch is always open, a large window is
  smashed through, and a small one is sight only.

### The heights show as the scene chooses

- In Halloway House the heights show Shaded, with a contour around
  every rise.
- Washed, Marked, or Data is chosen from the Height pen's palette, and
  the choice stays with the scene.
- Marked tags each rise once.
- The strength fades the whole overlay.

## Drawing

### A DM draws ground

- A rect, a free shape, or a brush; the brush converts every cell it
  touches.
- A state: ground, difficult, air, or void.
- As data alone, or as data and texture: a textured floor is painted,
  difficult ground hatched, air a hole.
- A stroke started anywhere on the board lands, the corner beneath
  the palette included.

### A DM draws walls

- A line along the grid, or a rect for four walls at once.
- As data, a hint over art that draws its own walls; as texture, a
  solid wall.

### A DM places thresholds

- A click on a cell edge places the kind, state and size chosen.
- The palette's tile shows what the click will leave *(later)*.
- A secret door is the DM's alone until it is found.

### A DM paints height and level changes

- An amount painted into the field, by rect or by brush, shows on the
  token standing there.
- A level change is walked, not climbed.
- The rules read what was drawn: a route through an open door, none
  through a locked one.

### A DM draws free ink

- Ink with no rules meaning, at the brush's width.

### The history

- Every stroke is in the history, newest first, with a line that says
  what it is.
- Undo takes the last stroke back, Ctrl+Z does the same while a pen is
  held, and a stroke can be removed from the middle.
- Reset clears everything before it and stays in the history, so Undo
  brings it all back.

## The campaign

### A DM sets up a campaign

- The first run makes the example campaign: the tavern, with the
  mansion and the hill as scenes.
- The intro lists every campaign the app knows, with its system and
  where it lives.
- A new campaign goes under the Tablewright home and opens on a
  tavern of its own.
- A campaign can live in a folder of the DM's own, and a folder from
  elsewhere opens from the intro *(later)*.
- Leaving a campaign returns to the intro, and the window's title
  says which campaign is open.
- The campaign open when the app closed comes back at the next start
  *(later)*.

### A DM sets up scenes

- A new scene is blank, or a reference drawing.
- The scene tab switches scenes.
- Each scene keeps its own picture, opened from a file *(later)*.
- A scene remembers its strokes, its display, and the state play left
  its thresholds in.

## The player

### The player's view

- The page served without Tauri is the player view: the party tier,
  no DM chrome, and it says so.
- A player sees the scene's name and nothing more.
- A player's entry page has no Place on board.
- A player measures with the R key.

## Budgets

Not stories. The perf project, `bun run e2e:perf`, drives the tavern,
a world map fitted to the window, and the same map zoomed in, with
fifty tokens, and reports frame times against a sixty hertz budget
with hitches counted. It also counts the frames drawn in one second
with nothing happening: the board draws only on request, so the count
should be none. That number is reported, not judged. It runs on
demand on a machine with a GPU.

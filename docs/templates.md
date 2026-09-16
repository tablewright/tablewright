# Templates

A template is the shape a spell or a breath covers: a cone, a line, a
circle, and the solids they stand for. This is the design for templates
that tilt as well as turn, stop at what is in their way, and read as
solids on a board seen from above, and for testing a spell aimed at one
creature. None of it is built yet.

## Why

The board is a plan seen from above. That works while a template lies
flat. Once a template stands up, a cone beside a dais lights the raised
cells it reaches, and nothing on the board says why those cells and not
their neighbours.

A template also needs a tilt: a dragon overhead breathes down, and a
caster on the floor aims up at a flier. And a cone should not pass
through the wall in front of it.

## How it looks

Lit from above, and gentle. The solid is shaded the way light falling
on it would shade it, so its top, its sides and the line where it meets
the ground read apart, and the map still shows through.

## What stops it

A template is stopped by what is in its way unless it is set to spread.
That is the rules' default: a place is caught only if an unblocked
straight line reaches it from the point of origin. Some spells spread
around corners instead, such as the 2014 Fireball.

So the palette has **Reaches: Line of sight** or **Around corners**.
The rules call the first one line of effect; the palette says line of
sight because people already know the phrase.

- A wall stops it up to the wall's height.
- A shut door stops it.
- Raised ground stops it as a solid.
- A window counts as a hole, shut or not. By the rules glass stops an
  effect, so a line under Reaches says windows count as holes and the
  DM can rule otherwise.

What is cut off is not part of the template and is not drawn.

The ruler's Line mode is not a template. It keeps measuring the way it
does, since a raw measure is still useful.

## Yaw and pitch

A template with a direction turns two ways. **Yaw** turns it about the
vertical; it is the palette's Aim, renamed. **Pitch** tilts it up or
down from level.

Yaw stays on the board: scrolling a template round while laying it
keeps working. Pitch is set in the palette.

The palette shows them as a pair of dials, yaw as a compass seen from
above and pitch as a half circle seen from the side, so each angle is
seen face on. One ball for both would hide every aim below level on
its far side.

The dials draw the template at its width. A cone's wedge opens and
closes with the Spread slider as it moves. A beam draws only the
needle, since 5 ft wide over 100 ft long is a line at that size.

There is no hint under the dials for now. If people find yaw and pitch
confusing, a plain word such as "turn" or "tilt" goes under each.

## Which shapes turn

- **Cone**: yaw and pitch.
- **Rectangle**: stands as a **Wall** or a **Beam**. A wall stands on
  the floor with its height rising from the origin, like a wall of
  fire, and turns by yaw only. A beam is a line in three dimensions
  with its height around that line, like Lightning Bolt's "100 feet
  long and 5 feet wide", and takes yaw and pitch.
- **Sphere, dome, cylinder**: the same every way round, so nothing to
  aim.

## The side view

A tilted template is hard to read from above, so there is a side view.

The DM gets a strip beneath the board: the slice along the template's
aim, with the ground, the raised parts and the tokens, and a line per
token saying caught or clear and why, such as "Caught: 34 ft out, on
the floor where it lands". It is there to read the board by, so it has
no controls.

Players get a card instead: a small side view of what matters and one
line about what happened. It pops up when the measuring happens and
stays until it is closed with the X in its corner or with Escape. A
card is for the player whose token is involved, but tokens have no
owners yet, so until they do every seat but the DM's gets a card for
each token involved.

## A spell aimed at one creature

Fire Bolt is "a ranged spell attack against the target", not an area,
so the question is whether the target can be targeted. The caster
picks the target, and the board tests the range and the cover and
draws the line for the whole table: "Fire Bolt: 70 ft, in range, half
cover". It never says hit. That is a roll against armour, which needs
sheets and dice.

Cover is how much of the target a straight line from the attacker
cannot reach: at least half is half cover, at least three quarters is
three-quarters cover, and all of it is total cover, when the target
cannot be targeted at all. The card shows what hides the target, such
as "From the floor, the edge of the dais hides the lower half of E."

Without sheets there is no spell and no range. Until then the line
runs between two things picked on the board and shows the distance and
the cover only: "70 ft, half cover".

## The Select tool

Picking uses a **Select** tool on the rail between Move and the Ruler,
like Photoshop's. It picks tokens and templates. Dragging draws a box
that picks everything inside it, and Shift adds more. While Select is
held, dragging on empty board does not pan; the middle button and two
fingers still do. It has no key for now.

## How it is worked out

Exactly, not sampled. A tilted cone is solved at each point of the plan
for the height of its top and its bottom, and a beam is where three
pairs of parallel faces overlap. Sampling in slices of height draws
contour lines that are not there.

One test serves templates and targeting: whether a straight line in
three dimensions is stopped by a wall to its height, a shut door or
raised ground, with windows as holes. A template runs it from the
origin to each place. Cover runs it from the attacker to points spread
over the target's space, and the share that is stopped is the cover.

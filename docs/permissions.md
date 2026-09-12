# Permissions

Who is at the table, what each may do, and who each thing is for.

This is the design. The rules themselves are a file the app reads,
`docs/permissions.toml`, so a DM can read them, change them for their
own campaign, and see what changed as a diff. Everything in the app
that asks "may they?" or "may they see it?" answers from here.

## Three words, and no more

- **Role** — a named set of permissions. The DM, a player, a
  spectator, a stand-in DM. A person holds one role at a time.
- **Permission** — a thing and what may be done with it:
  `tokens = "move"`, `scenes = "change"`. A thing and a verb, never a
  bare verb, so a reader is never left wondering whether `history`
  means seeing it or rewriting it.
- **Scope** — how far a permission reaches: over one's own things, the
  party's, the DM's, or anyone's.

That is the whole vocabulary. Anything a person may do is a
permission; anything about how far it reaches is a scope. There is no
third mechanism and no minus sign.

## One list for who a thing is for

A permission says what a hand may do. It cannot say that one
particular wall is a secret, so a thing carries its own marking, and
it uses the same four words a scope does:

- `world` — anyone, including someone who has never sat at this table
- `party` — everyone at the table
- `dm` — the DM alone
- `own` — the one who made it, and nobody else

The first three are a ladder: a viewer sees everything at or below
their own. The fourth is not on that ladder, since it is about whose
a thing is rather than how open it is, so it is the one value read
against the maker instead of the tier. That is the whole rule, and it
is one comparison in one place.

This list replaces two vocabularies that meant the same things in
different words: the tiers on a stroke, a token and an entry, and the
`SeenBy` a measure or an area carried. A measure marked `dm` and a
wall marked `dm` now mean the same thing and are judged the same way.

## The owner is not a role

Whoever made the campaign keeps every permission over it, whatever
the file says. The file may reshape a DM, a stand-in DM or a player,
but it cannot lock the owner out of their own table, and the ability
to change permissions is never itself governed by permissions. Every
other table-top that got this wrong ended with a game master editing
a database by hand to get back in.

## The file

```toml
# The app's own. A campaign may say otherwise; the owner always keeps
# everything.

[roles.dm]
name = "The DM"
permissions = { map = "draw", history = "read", scenes = "change",
                tokens = "move", doors = "open", ruler = "use",
                heights = "read", compendium = "read" }
scopes      = { content = "dm" }

[roles.player]
name = "Player"
permissions = { tokens = "move", doors = "open", ruler = "use",
                compendium = "read" }
scopes      = { content = "party", tokens = "own" }

[roles.spectator]
name = "Spectator"
permissions = { ruler = "use", compendium = "read" }
scopes      = { content = "party", ruler = "own" }
```

A spectator watches and looks things up. They may measure, because a
measure that reaches nobody costs the table nothing, and `ruler =
"own"` is what makes it theirs alone: they cannot offer it to the
table, and nobody else is shown it.

TOML rather than YAML for two reasons, neither of them taste. The
crate is already inside the build, so the file costs no new
dependency; and when a key is mistyped the error names the line and
lists the keys that would have worked, which YAML cannot do.

## Layers

Three files, each replacing what it names:

1. the app's own, shipped with it
2. the campaign's, written by its DM
3. an add-on's, later, when add-ons exist

A later layer that names a role replaces that role whole. To take a
permission away, write the role out without it. Nothing subtracts, so
a role means what it says where it is written, and a reader never has
to hold three files in their head to know the answer.

## When the file is wrong

A person writes this by hand, so it will be wrong sometimes.

- An unknown key, an unknown permission or a scope that is not one of
  the four words is an error. Nothing is ignored quietly: a rule that
  does nothing because of a typo is the worst failure this file has.
- A campaign's file that will not load is refused, the app's own is
  used, and the DM is told which line is wrong and why.
- The app's own file failing is a fault in the app, not in the table,
  and it says so.

Failing this way is deliberate: it never fails open, handing powers
to whoever asks, and it never fails so closed that a DM cannot open
their own campaign.

## How a person gets a role

One page is one person. The Tauri window is the owner's. Until the
table is networked there is nobody else to be, so a dev build offers
a way to sit as another role and see the table as they see it: the
board, the rail, the chrome and the compendium all follow from that
one choice rather than from a flag apiece.

Once a page is served to players rather than opened by the DM, a role
has to be proved rather than asked for. A query string is something a
player can type. Serve mode already plans a per-launch token in the
URL (design §6); that token is what names the seat, and the app's own
view is never reachable by asking.

## What this replaces

Six improvised flags, each of which decided some of this on its own:
`canManage` on the scene tab, `viewer === "dm"` in the rail and the
entry page, a bare `hidden` on the chrome, the board's own tier, and
`SeenBy`'s `own` with the page's side of the table standing in for a
person. One derivation replaces them, and a check fails the build
when a surface decides for itself again.

## Deliberately later

- **Named people.** Sharing with one player rather than the party
  needs people to name, which needs the network layer. The design has
  called this grants since the start; when it lands it sits beside
  the four words rather than inside them.
- **Sharing as an act.** Showing a thing to the table is something a
  person does, not a rule about what they may see, and every
  table-top that folded the two together had to pull them apart
  again. The permission says whether you may offer at all; the
  offering is its own gesture.
- **The core's own redaction.** The scene command hands out
  everything today and the frontend declines to look. That is the
  house rule honoured by good manners rather than by the core, and it
  is the third step of this pass.

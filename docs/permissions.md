# Permissions

Who is at the table, what each person may do, and who each thing is for.

The rules live in `docs/permissions.toml`, which the app reads. A DM can
read it, change it for their campaign, and see the change as a diff.
Everything in the app that asks "may they?" or "may they see it?"
answers from it.

## Roles, permissions and reach

- **Role**: a named set of permissions, such as the DM, a player or a
  spectator. A person holds one role at a time.
- **Permission**: one thing a person may do, written as the thing and
  then the verb: `token:move`, `ink:threshold:open`, `history:read`.
- **Reach**: how far a permission carries: over your own things, the
  party's, the DM's, or anyone's.

There is nothing else, and nothing takes a permission away.

## Who a thing is for

Everything on the table carries one of four words:

- `world`: anyone, including someone who has never sat at this table
- `party`: everyone at the table
- `dm`: the DM alone
- `own`: the person who made it, and nobody else

The first three are a ladder: a person sees everything at or below
their role's place on it. `own` is not on the ladder, because it is
about whose a thing is, so it is checked against the maker. Strokes,
tokens, entries, measures and areas all carry these words and go
through the same check.

## The owner

Whoever made the campaign keeps every permission over it, whatever the
file says. The file can reshape any role but cannot lock the owner out,
and changing permissions is not itself a permission.

## The file

A piece of `docs/permissions.toml`:

```toml
[features.ruler]
use = "Measure, and lay templates down."
show = "Let others see what was measured."

[roles.player]
name = "Player"
sees = "party"
permissions = [
  "ink:free:draw",
  "ink:threshold:open",
  "token:move",
  "ruler:use",
  "ruler:show",
  "compendium:read",
]

[roles.spectator]
name = "Spectator"
sees = "party"
permissions = ["ruler:use", "compendium:read"]
```

`[features]` lists every permission the app knows, grouped by the thing
it acts on. A role can name only what is listed there, and the app
checks only what is listed there.

A role has:

- `sees`: its place on the ladder.
- `permissions`: a flat list. A name the app does not know is an error.
- `reach`: written only where a permission carries past the role's own
  things, like the DM's `reach = { "token:move" = "world" }`.

A spectator may measure but has no `ruler:show`, so what they measure
stays theirs.

The file is TOML because its parser is already in the build, and a
mistyped key gets an error that names the line and the keys that would
have worked.

## Layers

Up to three files apply, each replacing what it names:

1. the app's own, built into the app
2. the campaign's, written by its DM
3. an add-on's, once there are add-ons

A role named in a later file replaces that role whole. To take a
permission away, write the role out without it.

## When the file is wrong

- An unknown key, permission or reach word is an error, never ignored.
- A campaign file that will not load is refused. The app's own file is
  used instead, and the DM is told which line is wrong and why.
- The app's own file failing is a bug in the app, and it says so.

It never fails open, and it never locks a DM out of their own campaign.

## How a person gets a role

One page is one person, and the Tauri window is the owner's. A dev
build can sit as another role to see the table the way that role does:
the board, the rail, the chrome and the compendium all follow from that
one choice, and a check fails the build if a surface decides for
itself.

Once the table is served to players, a role has to be proved, since a
player can type a query string. A player joins by picking a name and
giving the password the DM hands out. The name is their seat, and the
seat's role says what they may do.

## Not yet

- **The core does not check who is calling.** Until people can join
  there is one person per process, so the scene command sends
  everything and the page filters what it shows.
- **Sharing with one player** needs people to name, which needs the
  network layer.
- **Showing something to the table** will be a gesture of its own. The
  permission only says whether a person may offer at all.

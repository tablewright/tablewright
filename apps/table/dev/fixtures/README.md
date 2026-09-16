# Dev fixtures

- `araitael-world.jpg`: the Araitael world map, 9600 by 6248 pixels,
  the author's own campaign art. A JPEG at quality 86, re-encoded from
  a 65 MB PNG at the same pixel size, so it stresses the texture and
  the grid just the same while keeping the repo light. `bun run perf`
  uses it, and a dev build can load it with
  `?map=/dev/fixtures/araitael-world.jpg`.

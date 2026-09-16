# Table assets

- `icon.png`: a placeholder app icon, a generated image with its
  corners cut to transparency, until there is a designed one.

## Regenerating the icon set

From the repo root:

```bash
bun run icon:table
```

This runs `tauri icon` on the master, writes the desktop set into
`src-tauri/icons`, deletes the Android and iOS sets, and touches
`src-tauri/tauri.conf.json`. The touch matters: cargo tracks the config
but not the icons, so without it the next build keeps the old icons in
the executable. The new icon shows on the next `bun run dev:table`. If
Windows still shows the old icon for the built executable, that is its
icon cache, which signing out or running `ie4uinit.exe -show` clears.

The master is a square PNG with a transparent background, 1024 px or
larger.

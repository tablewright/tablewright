# Table assets

- `icon.png`: placeholder app icon, a generated image with its corners
  cut to transparency. It stands in until a designed icon exists; the
  letterforms and materials are not final.

## Regenerating the icon set

From the repo root:

```bash
bun run icon:table
```

That runs `tauri icon` on the master, writes the desktop set into
`src-tauri/icons`, deletes the Android and iOS sets it also produces,
and touches `src-tauri/tauri.conf.json`. The touch matters: cargo
tracks the config but not the icon files, so without it the next build
keeps the old icons embedded in the executable. The new icon shows on
the next `bun run dev:table`. If Explorer or the taskbar still shows a
stale icon for the built executable, that is the Windows icon cache,
not the build; signing out or running `ie4uinit.exe -show` clears it.

The master should be a square PNG with a transparent background; 1024
pixels or larger.

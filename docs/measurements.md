# Measurements

What the app costs on a real machine. Numbers from one machine are
still useful: a later reading answers whether something new cost us,
and that is a comparison against the same desk.

Each entry says what was measured, on what hardware (processor,
graphics card, driver path, display refresh) and what the numbers
mean. Nothing that names the machine goes here: no address, hostname
or home path.

Take them again with `bun run perf`, which runs the board scenarios in
the installed Chrome so the graphics card is real. The other e2e runs
are capped, so they are no use for timing.

## The board's frame times

**2026-09-13.** Windows 10, RTX 3060 Ti, ANGLE over Direct3D 11, 144 Hz
display. Budget: a 60 Hz frame, 16.9 ms.

| Scenario   | mean | p95 | max | over 16.9 | over 33 | idle |
| ---------- | ---- | --- | --- | --------- | ------- | ---- |
| tavern     | 6.94 | 7   | 7.1 | 0         | 0       | 0    |
| world-fit  | 6.94 | 7   | 7.1 | 0         | 0       | 0    |
| world-zoom | 6.94 | 7   | 7.1 | 0         | 0       | 0    |

All three read the same because 6.94 ms is one refresh at 144 Hz. The
probe times the gap between frames, and with room to spare each frame
arrives one refresh after the last. So nothing drops, not one frame
over budget with fifty tokens and a world map, but the numbers say
nothing about how much room is left. That needs the draw itself timed.

`idle 0` means the board draws nothing while nothing is happening, on
any machine.

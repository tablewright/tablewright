# Measurements

What the app costs on a real machine, and when. One machine's numbers
are still worth keeping: the question a later reading answers is
whether something new cost us, and that is a comparison against the
same desk rather than against anybody else's.

Each entry says what was measured, on what, and what the numbers mean.
What the machine is made of belongs here, since that is what the
numbers depend on: the processor, the graphics card, the driver path,
the display's refresh. What names the machine does not: no address, no
hostname, no path through somebody's home.
Take them again with `bun run perf`, which runs the three board
scenarios in the installed Chrome so the GPU is real; the other e2e
runs go through the capped runner and are no use for timing.

## The board's frame times

**2026-09-13, stage 3 close.** Windows 10, RTX 3060 Ti, ANGLE over
Direct3D 11, 144 Hz display. Budget: a 60 Hz frame, 16.9 ms.

| Scenario   | mean | p95 | max | over 16.9 | over 33 | idle |
| ---------- | ---- | --- | --- | --------- | ------- | ---- |
| tavern     | 6.94 | 7   | 7.1 | 0         | 0       | 0    |
| world-fit  | 6.94 | 7   | 7.1 | 0         | 0       | 0    |
| world-zoom | 6.94 | 7   | 7.1 | 0         | 0       | 0    |

All three read the same because 6.94 ms is 144 Hz: the probe times the
gap between frames, and with headroom to spare every frame arrives one
refresh after the last, whatever is on the board. So this says nothing
drops — not one frame over a 60 Hz budget in any scenario, with fifty
tokens and a world map — and it says nothing about how much room is
left. Stage 4 will want the room, which needs the draw itself timed
rather than the gap between draws.

`idle 0` is the other half, and it is machine-independent: the board
draws nothing at all when nothing is happening, which is what the
frame scheduler promised at 3.4c.

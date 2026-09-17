# STATUS — Not Even Fucking Close

A music-reactive C64-style cracktro built with Bun, TypeScript, Three.js, Playwright and FFmpeg.

The demo renders a 160×100 Three.js shader scene into a native 320×200 compositor. It uses a fixed 16-colour C64 palette, copper bars, a multilayer starfield, rotating raymarched demo objects, palette cycling and a sinus scroller. The final video is produced deterministically frame by frame, not by recording a real-time browser session.

## Requirements

- [Bun](https://bun.sh/)
- FFmpeg and FFprobe in `PATH`
- One `.mp3` file in the repository root

## Run interactively

```bash
bun install
bun run dev
```

Open the displayed URL and press **LOAD & RUN**.

## Render the complete MP4

Install Playwright's Chromium once:

```bash
bunx playwright install chromium
```

Then render:

```bash
bun run render:video
```

The renderer automatically finds the single root-level MP3 and creates:

```text
output/status-cracktro.mp4
```

The output is 1920×1080, 50 fps, H.264/AAC. Native 320×200 pixels are enlarged exactly 5× to 1600×1000 and padded, preserving sharp pixel boundaries.

For a short smoke test:

```bash
bun run render:video -- --seconds 2 --output output/test.mp4
```

No temporary frame directory is created: Playwright streams deterministic PNG frames directly into FFmpeg.

## Edit the scroller

The draft scroll text is the `SCROLLER` constant in `src/demo.ts`.

## Commands

```bash
bun run dev          # interactive browser preview
bun run check        # TypeScript validation
bun test             # deterministic unit tests
bun run build        # production web build
bun run render:video # headless full-song MP4 render
```

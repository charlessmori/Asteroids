# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-file HTML5 Canvas clone of Asteroids. No build tools, no bundler, no package manager, no dependencies — just `index.html` + `game.js`.

## Running

Open `index.html` directly in a browser, or serve it locally:

```bash
npx serve .
```

There is no build, lint, or test step — there is no package.json. Verify changes by reloading the page in a browser and playing the game.

## Architecture

Everything lives in `game.js` (`index.html` only sets up an 800×600 `<canvas>` and loads the script). It's structured as plain classes plus module-level mutable state, run through a single `requestAnimationFrame` loop:

- **Entities**: `Bullet`, `Asteroid`, `Ship`, `Particle` — each has its own `update(dt)` and `draw()`. All positions wrap toroidally via `wrap(v, max)` (space has no edges).
- **Asteroid sizing**: size is `1|2|3` (small/medium/large), indexing into parallel arrays `RADII`, `SPEEDS`, `POINTS`. `Asteroid.split()` produces two asteroids of `size - 1` (small asteroids don't split).
- **Global mutable state** (module scope, not passed around): `ship`, `bullets`, `asteroids`, `particles`, `score`, `lives`, `level`, `state` (`'playing' | 'dead' | 'gameover'`), `deadTimer`. Reset/advanced via `initGame()` and `nextLevel()`.
- **Game loop**: `loop(ts)` computes `dt` (clamped to 0.05s), calls `update(dt)` then `draw()`, and reschedules itself. `update()` branches early on `state` (`gameover` waits for Space to restart; `dead` just ticks a respawn timer).
- **Collision detection**: brute-force O(n·m) distance checks in `update()` — bullets vs. asteroids, then ship vs. asteroids (skipped while `ship.invincible > 0`).
- **Input**: raw `keys[code]` map for held keys, plus a `justPressed`/`pressed()` edge-detection pair for one-shot actions (shooting, restart on Game Over).

When adding new entity types or game states, follow the existing pattern: a class with `update(dt)`/`draw()`, pushed into one of the module-level arrays, filtered out via a `dead` flag each frame.

Note: the README describes power-ups and special asteroid types (e.g. a "shooting star") that are not present in the current `game.js` — don't assume they exist without checking the code.

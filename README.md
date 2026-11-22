# Ghost Shift

An original puzzle game about cooperating with your past selves. Each loop lasts 30 seconds. When it ends, that run is saved and plays back as a ghost next to you in the following loop. Use your ghosts to hold pressure plates, keep doors open and soak up laser beams, then get yourself to the green exit.

There is no build step and no outside assets. Open `index.html` by double-clicking, or host the folder as a static site.

## How to play

| Action | Phone | Keyboard |
| --- | --- | --- |
| Move | Drag the round pad (snaps to 8 directions) | Arrows / WASD |
| End this loop now (save the run as a ghost) | **Next loop** | Space or R |
| Remove the last ghost | **Undo ghost** | Z |
| Clear all ghosts in the level | **Reset** | Backspace |
| Level select | **☰ Levels** | L |
| Previous / next unlocked level | | `[` / `]` |

- The loop clock starts when you first move.
- A plate is pressed while anyone (you or a ghost) stands on it. A door opens only while **all** plates of its colour are pressed.
- A laser stops at the first body in its path. If that body is you, you're zapped, the loop ends, and your body stays there as a ghost.

## Levels

There are 25 handcrafted levels. New ideas arrive one at a time and the crew size grows slowly:

| Levels | What's new | Par (ghosts) |
| --- | --- | --- |
| 1–5 | Plates, doors, lasers, relays | 1, 2, 1, 2, 4 |
| 6–11 | Mixing colours, beams from both sides, doors that shield lasers, long walks | 2, 2, 2, 2, 3, 3 |
| 12–16 | **Gates**: doors in reverse that shut while their plate is held. A body in a doorway keeps it open | 1, 2, 2, 3, 3 |
| 17–22 | Bigger crews: double plates, three beams, gates plus relays | 4, 4, 4, 5, 5, 5 |
| 23–25 | Finale: everything together | 6, 6, 6 |

**Par** is the fewest ghosts that solve a level, worked out by the solver. Solve a level at par to earn a ★.

### Replaying and progress

- **☰ Levels** opens the level select. Every solved level stays open, so you can replay it any time, for example to get the ★.
- Each tile shows ★ (solved at par), ✓ (solved), "new" (unlocked) or 🔒.
- Progress (best ghost count per level, last level played) is saved in the browser's `localStorage`. Players of the first build keep their unlocked rooms.
- The level select is paged (30 per page), so it stays quick with hundreds of levels.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page layout and styles |
| `engine.js` | Rules and the 60 Hz simulation (no DOM, also runs in Node) |
| `levels.js` | The handcrafted levels, as plain data |
| `solver.js` | Finds par for a level and proves it's solvable by replaying a plan in the real engine |
| `generator.js` | Seeded level generator for levels 26–1000 |
| `game.js` | Input, drawing, level select, saved progress |
| `tests/verify.js` | Checks every level |

## Adding levels

1. Add an entry to `levels.js` with a new, unique `id` (progress is saved by id, so never reuse or rename ids), a `name`, a one-line `hint` and a `map`. The legend is at the top of the file.
2. Run `node tests/verify.js`. It prints each level's par and fails if any level can't be solved in the real engine within the loop timer.
3. `node tests/show.js 12` prints level 12 with the solver's ghost positions marked, which helps when tuning a layout.

## Generated levels (toward 500–1000)

`generator.js` builds levels 26 to 1000 from a seed, so level *n* is always the same level. Each candidate is kept only if the solver finds a plan and the engine accepts it with room to spare on the timer (the auto-walker's slowest loop uses under 60% of it). Difficulty is a straight line from level 26 to 1000: par goes from 5 to 7 ghosts, rooms from 4 to 7, beams and gates get more common, and the loop shrinks from 30 s to 24 s.

All 975 generated levels pass these checks (`node tests/verify.js --gen 975`, about a minute). They're hidden for now. To try them, open the game with `?preview=50` (adds 50 generated levels after the handcrafted ones), e.g. https://vvg15.github.io/Ghost-Shift/?preview=50.

## Design guesses (change any of these freely)

- **Ghosts linger.** When a ghost's recording ends (time ran out, you pressed Next loop, or you were zapped), it stays frozen where it finished until the loop ends. That lets you set up a "holder" in a few seconds instead of standing still for 30.
- **Ghosts replay positions and ignore walls.** They follow exactly the path you took, so a ghost never gets stuck.
- **Dying is a tool, not a fail state.** A zap just ends the loop early and leaves your body behind, which is how laser rooms are solved.
- **Doors won't close on anyone** standing in the doorway.
- **At most 8 ghosts** per room. The oldest one drops off after that.
- **Top-down view** rather than a side-on platformer, so it plays well with a thumb on a phone.
- Progress is saved in the browser (`localStorage`). If storage is blocked, the game still works but starts at level 1.

## Play online (GitHub Pages)

The game is hosted for free on GitHub Pages at **https://vvg15.github.io/Ghost-Shift/**.

Pages serves the files from the root of the `main` branch, so there is no build step:

1. Edit the files and push to `main`.
2. GitHub rebuilds the site in a minute or two. Check progress under the repo's **Actions** tab.

To set Pages up again (for example on a fork), go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.

On a phone, open the URL and use the browser's "Add to Home Screen" for a full-screen, app-like launch.

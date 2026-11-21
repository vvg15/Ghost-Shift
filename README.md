# Ghost Shift (first playable)

An original puzzle game about cooperating with your past selves. Each loop lasts 30 seconds. When it ends, that run is saved and plays back as a ghost next to you in the following loop. Use your ghosts to hold pressure plates, keep doors open and soak up laser beams, then get yourself to the green exit.

It's one file (`index.html`) with no build step and no outside assets. Open it by double-clicking, or host it as a static site.

## How to play

| Action | Phone | Keyboard |
| --- | --- | --- |
| Move | Drag the round pad (snaps to 8 directions) | Arrows / WASD |
| End this loop now (save the run as a ghost) | **Next loop** | Space or R |
| Remove the last ghost | **Undo ghost** | Z |
| Clear all ghosts in the room | **Reset room** | Backspace |
| Previous / next unlocked room | | `[` / `]` |

- The loop clock starts when you first move.
- A plate is pressed while anyone (you or a ghost) stands on it. A door opens only while **all** plates of its colour are pressed.
- A laser stops at the first body in its path. If that body is you, you're zapped, the loop ends, and your body stays there as a ghost.

## Rooms

1. **First Shift**: one plate, one door.
2. **Two Hands**: the door needs two plates held at once.
3. **Stand in the Light**: block a laser with a past self.
4. **Relay**: a ghost has to get through a door that an older ghost is holding.
5. **Everyone Clocks In**: four ghosts plus you, with plates, two doors and a laser.

All five rooms were checked with an automated playthrough.

## Design guesses (change any of these freely)

- **Ghosts linger.** When a ghost's recording ends (time ran out, you pressed Next loop, or you were zapped), it stays frozen where it finished until the loop ends. That lets you set up a "holder" in a few seconds instead of standing still for 30.
- **Ghosts replay positions and ignore walls.** They follow exactly the path you took, so a ghost never gets stuck.
- **Dying is a tool, not a fail state.** A zap just ends the loop early and leaves your body behind, which is how laser rooms are solved.
- **Doors won't close on anyone** standing in the doorway.
- **At most 8 ghosts** per room. The oldest one drops off after that.
- **Top-down view** rather than a side-on platformer, so it plays well with a thumb on a phone.
- Room progress is saved in the browser (`localStorage`). If storage is blocked, the game still works but starts at room 1.

## Play online (GitHub Pages)

The game is hosted for free on GitHub Pages at **https://vvg15.github.io/Ghost-Shift/**.

Pages serves `index.html` from the root of the `main` branch, so there is no build step:

1. Edit `index.html` and push to `main`.
2. GitHub rebuilds the site in a minute or two. Check progress under the repo's **Actions** tab.

To set Pages up again (for example on a fork), go to **Settings → Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.

On a phone, open the URL and use the browser's "Add to Home Screen" for a full-screen, app-like launch.

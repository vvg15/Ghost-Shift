// Ghost Shift solver.
// 1. solve(level): a tile-level search for the fewest ghosts that make the exit reachable ("par").
//    Each ghost walks to one tile and stays there (a plate, a doorway, or a spot in a beam).
// 2. verify(level): replays that plan in the real engine with an auto-walker, so a level only
//    counts as solvable if the actual game accepts the run within the loop timer.
(function (root) {
"use strict";
const E = root.GhostEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
const { T, DIRS, parseLevel, doorWants, Sim, MAX_GHOSTS } = E;
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The static world that results from a set of lingering bodies (tile indices).
function world(room, holds) {
  const { w, h } = room;
  const held = new Set(holds);
  const pressed = p => held.has(p.y * w + p.x);
  const open = new Map();
  for (const d of room.doors) {
    const k = d.y * w + d.x;
    open.set(k, doorWants(room, d, pressed) || held.has(k));
  }
  const solid = k => {
    const c = room.grid[Math.floor(k / w)][k % w];
    if (c === "#" || DIRS[c]) return true;
    return open.has(k) ? !open.get(k) : false;
  };
  // Tiles where a beam would hit you.
  const lethal = new Set();
  for (const e of room.emitters) {
    let x = e.x, y = e.y;
    for (;;) {
      x += e.d[0]; y += e.d[1];
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const k = y * w + x;
      if (solid(k) || held.has(k)) break;
      lethal.add(k);
    }
  }
  return { solid, lethal, open };
}

// BFS over tiles. Lethal tiles can be entered (that's where you get zapped) but not crossed.
function bfs(room, wd, from) {
  const { w, h } = room, n = w * h;
  const prev = new Int32Array(n).fill(-2);
  const s = from.y * w + from.x;
  prev[s] = -1;
  const q = [s];
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    if (wd.lethal.has(k)) continue;
    const x = k % w, y = (k - x) / w;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * w + nx;
      if (prev[nk] !== -2 || wd.solid(nk)) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  return prev;
}

function pathTo(prev, k) {
  if (prev[k] === -2) return null;
  const out = [];
  for (let c = k; c !== -1; c = prev[c]) out.push(c);
  return out.reverse();
}

// Tiles where a ghost can change something: plates, doorways and anywhere on a beam line.
function candidates(room) {
  const { w, h } = room, set = new Set();
  for (const p of room.plates) set.add(p.y * w + p.x);
  for (const d of room.doors) set.add(d.y * w + d.x);
  for (const e of room.emitters) {
    let x = e.x, y = e.y;
    for (;;) {
      x += e.d[0]; y += e.d[1];
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const c = room.grid[y][x];
      if (c === "#" || DIRS[c]) break;
      set.add(y * w + x);
    }
  }
  set.delete(room.exit.y * w + room.exit.x);
  set.delete(room.start.y * w + room.start.x);
  return [...set];
}

// What a set of holds does, used to merge equivalent states.
function signature(room, holds) {
  const { w } = room, held = new Set(holds), parts = [];
  for (const p of room.plates) if (held.has(p.y * w + p.x)) parts.push("p" + (p.y * w + p.x));
  for (const d of room.doors) if (held.has(d.y * w + d.x)) parts.push("d" + (d.y * w + d.x));
  room.emitters.forEach((e, i) => {
    let x = e.x, y = e.y, j = 0;
    for (;;) {
      x += e.d[0]; y += e.d[1]; j++;
      if (x < 0 || y < 0 || x >= w || y >= room.h) break;
      const c = room.grid[y][x];
      if (c === "#" || DIRS[c]) break;
      if (held.has(y * w + x)) { parts.push("e" + i + ":" + j); break; }
    }
  });
  return parts.sort().join(",");
}

// Fewest-ghost plan. Returns { par, holds } or null if unsolvable within maxGhosts.
function solve(levelOrRoom, maxGhosts = MAX_GHOSTS - 1, maxStates = 60000) {
  const room = levelOrRoom.grid ? levelOrRoom : parseLevel(levelOrRoom);
  const { w } = room, exitK = room.exit.y * w + room.exit.x;
  const cands = candidates(room);
  let layer = [[]];
  const seen = new Set([signature(room, [])]);
  let states = 0;
  for (let depth = 0; depth <= maxGhosts; depth++) {
    const next = [];
    for (const holds of layer) {
      const wd = world(room, holds);
      const prev = bfs(room, wd, room.start);
      if (prev[exitK] !== -2 && !wd.lethal.has(exitK)) return { par: depth, holds };
      if (depth === maxGhosts) continue;
      for (const c of cands) {
        if (prev[c] === -2 || holds.includes(c)) continue;
        const nh = holds.concat(c);
        const sig = signature(room, nh);
        if (seen.has(sig)) continue;
        seen.add(sig); next.push(nh);
        if (++states > maxStates) return null;
      }
    }
    if (!next.length) return null;
    layer = next;
  }
  return null;
}

// Is the tile centre (px, py) inside a live beam right now?
function inBeam(sim, px, py) {
  const H = E.HALF;
  for (const e of sim.room.emitters) {
    const ox = e.x * T + T / 2, oy = e.y * T + T / 2;
    let dist, inLine;
    if (e.d[0]) { inLine = Math.abs(py - oy) < H + 3; dist = e.d[0] > 0 ? (px - H) - ox : ox - (px + H); }
    else { inLine = Math.abs(px - ox) < H + 3; dist = e.d[1] > 0 ? (py - H) - oy : oy - (py + H); }
    if (inLine && dist > -H * 2 && dist < e.beam) return true;
  }
  return false;
}

// Drive the real engine through a plan with an auto-walker that follows tile paths,
// waits at closed doors and live beams, and (when patient) waits for every older ghost to
// settle before stepping onto its own spot. Returns { ok, loops, ticks, reason }.
function verifyWith(level, plan, patient, useSim) {
  const sim = useSim || new Sim(level);
  const room = sim.room, { w } = room;
  const ticks = [];
  for (let i = 0; i <= plan.holds.length; i++) {
    const last = i === plan.holds.length;
    const wd = world(room, plan.holds.slice(0, i));
    const target = last ? room.exit.y * w + room.exit.x : plan.holds[i];
    const path = pathTo(bfs(room, wd, room.start), target);
    if (!path) return { ok: false, reason: `loop ${i + 1}: no path` };
    const pts = path.map(k => ({ x: (k % w) * T + T / 2, y: Math.floor(k / w) * T + T / 2 }));
    const targetLethal = !last && world(room, plan.holds.slice(0, i)).lethal.has(target);
    let wp = 1, done = false;
    for (let t = 0; t < room.loopTicks + 5 && !done; t++) {
      while (wp < pts.length && Math.abs(pts[wp].x - sim.player.x) < 0.5 && Math.abs(pts[wp].y - sim.player.y) < 0.5) wp++;
      if (wp >= pts.length) {
        if (last) return { ok: false, reason: "on the exit tile but no win" };
        ticks.push(sim.tick); sim.endLoop(false); done = true; break;
      }
      const p = pts[wp];
      let ix = Math.max(-1, Math.min(1, (p.x - sim.player.x) / E.SPEED));
      let iy = Math.max(-1, Math.min(1, (p.y - sim.player.y) / E.SPEED));
      const m = Math.hypot(ix, iy);
      if (m < 0.2) { ix = ix / m * 0.2; iy = iy / m * 0.2; }
      const finalStep = wp === pts.length - 1;
      let wait = false;
      // Don't walk into a live beam unless that's the plan.
      if (!(finalStep && targetLethal) && inBeam(sim, p.x, p.y)) wait = true;
      if (patient && finalStep && !last && sim.ghosts.some(g => !sim.ghostPos(g, sim.tick).done)) wait = true;
      if (wait) {
        if (sim.phase === "ready") { ix = (p.x - sim.player.x) > 0 ? 0.2 : -0.2; iy = 0; } // start the clock with a tiny step
        else { ix = 0; iy = 0; }
      }
      const ev = sim.step(ix, iy);
      if (ev === "won") {
        ticks.push(sim.tick);
        return last ? { ok: true, loops: sim.loops, ghosts: sim.ghosts.length, ticks, patient } : { ok: false, reason: `loop ${i + 1}: won early` };
      }
      if (ev === "zapped") {
        if (!(finalStep && targetLethal)) return { ok: false, reason: `loop ${i + 1}: zapped on the way` };
        ticks.push(-1); done = true;
      }
      if (ev === "timeout") return { ok: false, reason: `loop ${i + 1}: ran out of time` };
    }
    if (!done) return { ok: false, reason: `loop ${i + 1}: stuck` };
  }
  return { ok: false, reason: "plan ended without a win" };
}

function verify(level, plan) {
  plan = plan || solve(level);
  if (!plan) return { ok: false, reason: "no plan" };
  const a = verifyWith(level, plan, false);
  if (a.ok) return a;
  const b = verifyWith(level, plan, true);
  return b.ok ? b : { ok: false, reason: a.reason + " / patient: " + b.reason };
}

const api = { solve, verify, verifyWith, world, bfs, pathTo, candidates };
root.GhostSolver = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

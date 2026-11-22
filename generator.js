// Ghost Shift procedural levels.
// generate(n) always returns the same level for the same n (seeded), and only returns levels that
// the solver can solve and the real engine accepts (see solver.js). Difficulty rises linearly with n.
(function (root) {
"use strict";
const E = root.GhostEngine || require("./engine.js");
const S = root.GhostSolver || require("./solver.js");

const W = 20, H = 12;
const FIRST = 26;   // first generated level number (after the handcrafted ones)
const LAST = 1000;  // difficulty reaches its maximum here

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Linear difficulty curve: 0 at level FIRST, 1 at level LAST.
function knobs(n) {
  const s = Math.max(0, Math.min(1, (n - FIRST) / (LAST - FIRST)));
  return {
    s,
    par: 5 + Math.round(2 * s),            // ghosts needed: 5 -> 7
    rooms: 4 + Math.round(3 * s),          // 4 -> 7 rooms
    lasers: 0.6 + 1.6 * s,                 // average beams per level
    gateChance: 0.15 + 0.25 * s,
    doubleChance: 0.15 + 0.25 * s,         // a door needing two plates
    time: Math.round(30 - 6 * s),          // loop length 30s -> 24s
  };
}

const ADJ = ["Quiet", "Cold", "Late", "Long", "Empty", "Hollow", "Dim", "Narrow", "Silent", "Last", "Grey", "Restless", "Echoing", "Lonely", "Locked"];
const NOUN = ["Hall", "Ward", "Vault", "Office", "Corridor", "Archive", "Lobby", "Stairwell", "Basement", "Wing", "Annex", "Gallery", "Depot", "Cellar", "Lab"];

function split(rooms, rand) {
  // Split the largest room along its longer side, leaving a one-tile wall.
  rooms.sort((a, b) => b.w * b.h - a.w * a.h);
  const r = rooms[0];
  const vertical = r.w > r.h ? true : r.h > r.w ? false : rand() < 0.5;
  const len = vertical ? r.w : r.h;
  if (len < 7) return false;
  const cut = 3 + Math.floor(rand() * (len - 6)); // both sides at least 3 wide
  rooms.shift();
  if (vertical) rooms.push({ x: r.x, y: r.y, w: cut, h: r.h }, { x: r.x + cut + 1, y: r.y, w: r.w - cut - 1, h: r.h });
  else rooms.push({ x: r.x, y: r.y, w: r.w, h: cut }, { x: r.x, y: r.y + cut + 1, w: r.w, h: r.h - cut - 1 });
  return true;
}

// Wall tiles shared by two rooms (candidate openings).
function shared(a, b) {
  const out = [];
  if (a.x + a.w + 1 === b.x || b.x + b.w + 1 === a.x) {
    const wx = a.x + a.w + 1 === b.x ? a.x + a.w : b.x + b.w;
    for (let y = Math.max(a.y, b.y); y < Math.min(a.y + a.h, b.y + b.h); y++) out.push([wx, y]);
  }
  if (a.y + a.h + 1 === b.y || b.y + b.h + 1 === a.y) {
    const wy = a.y + a.h + 1 === b.y ? a.y + a.h : b.y + b.h;
    for (let x = Math.max(a.x, b.x); x < Math.min(a.x + a.w, b.x + b.w); x++) out.push([x, wy]);
  }
  return out;
}

function attempt(n, k, rand) {
  const grid = Array.from({ length: H }, () => Array(W).fill("#"));
  const rooms = [{ x: 1, y: 1, w: W - 2, h: H - 2 }];
  while (rooms.length < k.rooms && split(rooms, rand)) {}
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = ".";

  // Spanning tree over neighbouring rooms, grown from a random start room.
  const startRoom = Math.floor(rand() * rooms.length);
  const inTree = new Set([startRoom]), edges = [], depth = { [startRoom]: 0 };
  while (inTree.size < rooms.length) {
    const opts = [];
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
      if (inTree.has(j)) continue;
      const s = shared(rooms[i], rooms[j]);
      if (s.length) opts.push([i, j, s]);
    }
    if (!opts.length) return null;
    const [i, j, s] = opts[Math.floor(rand() * opts.length)];
    inTree.add(j); depth[j] = depth[i] + 1;
    edges.push({ from: i, to: j, tile: s[Math.floor(rand() * s.length)] });
  }
  let exitRoom = startRoom;
  for (const i in depth) if (depth[i] > depth[exitRoom]) exitRoom = +i;
  if (exitRoom === startRoom) return null;

  // Openings: plain gap, door, or gate.
  const colours = [];
  let ci = 0;
  for (const e of edges) {
    const [x, y] = e.tile, roll = rand();
    if (roll < 0.25) { grid[y][x] = "."; continue; }
    if (ci < 4 && roll < 0.25 + k.gateChance && colours.length) {
      const c = colours[Math.floor(rand() * colours.length)];
      grid[y][x] = E.GATE_DIGITS[E.COLORS.indexOf(c.l)];
      c.gates++;
      continue;
    }
    if (ci >= 4) { grid[y][x] = "."; continue; }
    const l = E.COLORS[ci++];
    grid[y][x] = l.toUpperCase();
    colours.push({ l, room: e.from, plates: rand() < k.doubleChance ? 2 : 1, gates: 0 });
  }

  const free = (x, y) => grid[y][x] === "." &&
    ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => /[A-D1-4]/.test(grid[y + dy][x + dx]));
  const pick = (ri) => {
    const r = rooms[ri];
    for (let t = 0; t < 40; t++) {
      const x = r.x + Math.floor(rand() * r.w), y = r.y + Math.floor(rand() * r.h);
      if (free(x, y)) return [x, y];
    }
    return null;
  };

  const place = (ri, ch) => { const p = pick(ri); if (!p) return false; grid[p[1]][p[0]] = ch; return true; };
  if (!place(startRoom, "S") || !place(exitRoom, "E")) return null;
  // Plates go in rooms on the near side of their door (or anywhere already explored).
  const rooted = Object.keys(depth).map(Number);
  for (const c of colours) {
    for (let p = 0; p < c.plates; p++) {
      const opts = rooted.filter(i => depth[i] <= depth[c.room]);
      if (!place(opts[Math.floor(rand() * opts.length)], c.l)) return null;
    }
  }

  // Lasers: an emitter in a room's wall, firing across the room.
  let beams = Math.floor(k.lasers) + (rand() < k.lasers % 1 ? 1 : 0);
  for (let t = 0; t < 30 && beams > 0; t++) {
    const r = rooms[Math.floor(rand() * rooms.length)];
    const side = Math.floor(rand() * 4);
    let x, y, ch;
    if (side === 0) { x = r.x - 1; y = r.y + Math.floor(rand() * r.h); ch = ">"; }
    else if (side === 1) { x = r.x + r.w; y = r.y + Math.floor(rand() * r.h); ch = "<"; }
    else if (side === 2) { x = r.x + Math.floor(rand() * r.w); y = r.y - 1; ch = "v"; }
    else { x = r.x + Math.floor(rand() * r.w); y = r.y + r.h; ch = "^"; }
    if (grid[y][x] !== "#") continue;
    const [dx, dy] = E.DIRS[ch];
    if (grid[y + dy][x + dx] !== ".") continue;
    grid[y][x] = ch; beams--;
  }

  const map = grid.map(r => r.join(""));
  const rr = rand;
  return {
    id: "g" + n,
    name: `${ADJ[Math.floor(rr() * ADJ.length)]} ${NOUN[Math.floor(rr() * NOUN.length)]}`,
    hint: "",
    time: k.time,
    map,
  };
}

const cache = new Map();

// Returns a verified level for level number n (n >= FIRST).
function generate(n) {
  if (cache.has(n)) return cache.get(n);
  const k = knobs(n);
  let best = null, bestGap = Infinity;
  for (let a = 0; a < 400; a++) {
    const rand = rng(n * 7919 + a * 104729 + 1);
    const lv = attempt(n, k, rand);
    if (!lv) continue;
    let room;
    try { room = E.parseLevel(lv); } catch (e) { continue; }
    const plan = S.solve(room, E.MAX_GHOSTS - 1, 20000);
    if (!plan || plan.par < 2) continue;
    const gap = Math.abs(plan.par - k.par);
    if (gap >= bestGap) continue;
    const v = S.verify(lv, plan);
    // Leave slack for humans: the auto-walker's slowest loop must use under 60% of the timer.
    if (!v.ok || Math.max(...v.ticks) > 0.6 * room.loopTicks) continue;
    best = Object.assign(lv, { par: plan.par, hint: hintFor(room, plan.par) });
    bestGap = gap;
    if (gap === 0) break;
  }
  if (!best) throw new Error("generator failed for level " + n);
  cache.set(n, best);
  return best;
}

function hintFor(room, par) {
  const bits = [];
  if (room.emitters.length) bits.push(room.emitters.length === 1 ? "a laser" : `${room.emitters.length} lasers`);
  if (room.doors.some(d => d.inv)) bits.push("gates");
  return `Solvable with ${par} ghosts${bits.length ? ". Watch for " + bits.join(" and ") : ""}.`;
}

const api = { generate, knobs, FIRST, LAST };
root.GhostGenerator = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

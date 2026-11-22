// Ghost Shift engine: level parsing and the fixed-step simulation.
// No DOM access, so the same code runs in the browser and in Node (tests/verify.js).
(function (root) {
"use strict";

const T = 32;                 // tile size in world pixels
const FPS = 60;
const TICK_MS = 1000 / FPS;
const LOOP_SECONDS = 30;
const SPEED = 2.5;            // pixels per tick
const HALF = 10;              // half the body size
const MAX_GHOSTS = 8;
const DIRS = { ">": [1, 0], "<": [-1, 0], "^": [0, -1], "v": [0, 1] };
const COLORS = "abcd";        // plate colours
const GATE_DIGITS = "1234";   // gate for colour a, b, c, d

// Map legend
//   #  wall            .  floor          S  start         E  exit
//   a-d  pressure plate (colour)
//   A-D  door: open while ALL plates of its colour are pressed
//   1-4  gate: the reverse of a door. Open, but shut while all plates of colour a/b/c/d are pressed
//   > < ^ v  laser emitter. The beam stops at the first wall, closed door/gate, or body.
function parseLevel(def) {
  const map = def.map;
  const h = map.length, w = Math.max(...map.map(r => r.length));
  const r = {
    def, name: def.name, hint: def.hint || "", w, h, grid: [], plates: [], doors: [], emitters: [],
    start: null, exit: null, loopTicks: Math.round((def.time || LOOP_SECONDS) * FPS),
  };
  for (let y = 0; y < h; y++) {
    const row = map[y] || "";
    r.grid.push([]);
    for (let x = 0; x < w; x++) {
      const c = row[x] || "#";
      r.grid[y].push(c);
      if (c === "S") r.start = { x, y };
      else if (c === "E") r.exit = { x, y };
      else if (COLORS.includes(c)) r.plates.push({ x, y, l: c, on: false });
      else if (COLORS.toUpperCase().includes(c)) r.doors.push({ x, y, l: c.toLowerCase(), inv: false, open: false });
      else if (GATE_DIGITS.includes(c)) r.doors.push({ x, y, l: COLORS[GATE_DIGITS.indexOf(c)], inv: true, open: true });
      else if (DIRS[c]) r.emitters.push({ x, y, d: DIRS[c], beam: 0, blocker: null });
    }
  }
  if (!r.start || !r.exit) throw new Error(`Level "${def.name}" needs an S and an E`);
  r.doorAt = new Map();
  for (const d of r.doors) r.doorAt.set(d.y * w + d.x, d);
  return r;
}

// Whether a door "wants" to be open, given which plates are pressed.
function doorWants(room, d, pressed) {
  const all = room.plates.filter(p => p.l === d.l);
  const held = all.length > 0 && all.every(pressed);
  return d.inv ? !held : held;
}

class Sim {
  constructor(def) {
    this.room = parseLevel(def);
    this.ghosts = [];
    this.loops = 0;
    this.player = { x: 0, y: 0, fx: 1, fy: 0 };
    this.startLoop();
  }

  startLoop() {
    const r = this.room;
    this.tick = 0;
    this.rec = [];
    this.player.x = r.start.x * T + T / 2; this.player.y = r.start.y * T + T / 2;
    this.player.fx = 1; this.player.fy = 0;
    this.phase = "ready"; // ready | running | won
    this.loops++;
    // A fresh loop starts with every door in its resting state.
    for (const d of r.doors) d.open = d.inv;
    this.updateWorld();
  }

  endLoop(died) {
    if (this.phase === "won") return;
    if (this.rec.length > 0) {
      this.ghosts.push({ frames: this.rec, died: !!died });
      if (this.ghosts.length > MAX_GHOSTS) this.ghosts.shift();
    }
    this.startLoop();
  }

  undoGhost() { if (!this.ghosts.length) return false; this.ghosts.pop(); this.startLoop(); return true; }

  ghostPos(g, t) {
    const f = g.frames, i = Math.min(t, f.length / 2 - 1);
    return { x: f[i * 2], y: f[i * 2 + 1], done: t >= f.length / 2 - 1 };
  }

  bodies() {
    const out = [];
    this.ghosts.forEach((g, i) => { const p = this.ghostPos(g, this.tick); out.push({ x: p.x, y: p.y, ghost: i, done: p.done }); });
    if (this.phase !== "won") out.push({ x: this.player.x, y: this.player.y, ghost: -1 });
    return out;
  }

  overlapsTile(b, tx, ty) {
    return b.x + HALF > tx * T && b.x - HALF < tx * T + T && b.y + HALF > ty * T && b.y - HALF < ty * T + T;
  }

  // Updates plates, doors and beams. Returns true if a beam hits the live player.
  updateWorld() {
    const r = this.room, bs = this.bodies();
    for (const p of r.plates) p.on = bs.some(b => Math.floor(b.x / T) === p.x && Math.floor(b.y / T) === p.y);
    for (const d of r.doors) {
      const want = doorWants(r, d, p => p.on);
      // Doors and gates can't shut on anyone standing in the doorway.
      d.open = want || (d.open && bs.some(b => this.overlapsTile(b, d.x, d.y)));
    }
    let hitPlayer = false;
    for (const e of r.emitters) {
      let x = e.x, y = e.y, len = 0;
      for (;;) { x += e.d[0]; y += e.d[1]; if (this.solidTile(x, y)) break; len++; }
      const ox = e.x * T + T / 2, oy = e.y * T + T / 2;
      let best = (len + 0.5) * T, who = null;
      for (const b of bs) {
        let dist, inLine;
        if (e.d[0]) { inLine = Math.abs(b.y - oy) < HALF + 3; dist = e.d[0] > 0 ? (b.x - HALF) - ox : ox - (b.x + HALF); }
        else { inLine = Math.abs(b.x - ox) < HALF + 3; dist = e.d[1] > 0 ? (b.y - HALF) - oy : oy - (b.y + HALF); }
        if (inLine && dist < best && dist > -HALF * 2) { best = Math.max(0, dist); who = b; }
      }
      e.beam = best; e.blocker = who;
      if (who && who.ghost === -1) hitPlayer = true;
    }
    return hitPlayer;
  }

  solidTile(tx, ty) {
    const r = this.room;
    if (tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) return true;
    const c = r.grid[ty][tx];
    if (c === "#" || DIRS[c]) return true;
    const d = r.doorAt.get(ty * r.w + tx);
    return d ? !d.open : false;
  }

  collides(x, y) {
    const x0 = Math.floor((x - HALF) / T), x1 = Math.floor((x + HALF - 0.01) / T);
    const y0 = Math.floor((y - HALF) / T), y1 = Math.floor((y + HALF - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidTile(tx, ty)) return true;
    return false;
  }

  movePlayer(ix, iy) {
    const p = this.player;
    const len = Math.hypot(ix, iy);
    if (len < 0.15) return false;
    if (len > 1) { ix /= len; iy /= len; }
    p.fx = ix; p.fy = iy;
    const dx = ix * SPEED, dy = iy * SPEED;
    if (!this.collides(p.x + dx, p.y)) p.x += dx;
    else { const s = Math.sign(dx); while (!this.collides(p.x + s * 0.5, p.y) && Math.abs(dx) > 0) p.x += s * 0.5; }
    if (!this.collides(p.x, p.y + dy)) p.y += dy;
    else { const s = Math.sign(dy); while (!this.collides(p.x, p.y + s * 0.5) && Math.abs(dy) > 0) p.y += s * 0.5; }
    return true;
  }

  // One fixed 60 Hz step. Returns null, "won", "zapped" or "timeout".
  step(ix, iy) {
    if (this.phase === "ready") {
      if (Math.hypot(ix, iy) < 0.15) return null; // the loop clock starts on the first move
      this.phase = "running";
    }
    if (this.phase !== "running") return null;
    this.movePlayer(ix, iy);
    this.rec.push(Math.round(this.player.x * 10) / 10, Math.round(this.player.y * 10) / 10);
    this.tick++;
    if (this.updateWorld()) { this.endLoop(true); return "zapped"; }
    const e = this.room.exit;
    if (Math.floor(this.player.x / T) === e.x && Math.floor(this.player.y / T) === e.y) { this.phase = "won"; return "won"; }
    if (this.tick >= this.room.loopTicks) { this.endLoop(false); return "timeout"; }
    return null;
  }
}

const api = { T, FPS, TICK_MS, LOOP_SECONDS, SPEED, HALF, MAX_GHOSTS, DIRS, COLORS, GATE_DIGITS, parseLevel, doorWants, Sim };
root.GhostEngine = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

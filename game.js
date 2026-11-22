// Ghost Shift UI: input, rendering, progress, level select. Rules live in engine.js.
"use strict";
(function () {
const { T, TICK_MS, HALF, Sim } = GhostEngine;
const PLATE_COLORS = { a: "#f5b942", b: "#b98cff", c: "#4fd6b0", d: "#ff8a5c" };
const GHOST_COLORS = ["#7fd1ff", "#ff9ecf", "#a6f08a", "#ffd27f", "#c9a6ff", "#7fffe0", "#ff9f80", "#e0e0ff"];
const PAGE = 30;

// ---------- Level list ----------
// Handcrafted levels come first. Generated levels can be previewed with ?preview=N (adds N levels).
const HAND = window.GHOST_LEVELS;
const params = new URLSearchParams(location.search);
const PREVIEW = Math.max(0, Math.min(975, parseInt(params.get("preview") || "0", 10) || 0));
const COUNT = HAND.length + PREVIEW;
const parCache = new Map();
function levelDef(i) { return i < HAND.length ? HAND[i] : GhostGenerator.generate(i + 1); }
function levelPar(i) {
  const def = levelDef(i);
  if (def.par != null) return def.par;
  if (!parCache.has(def.id)) { const p = GhostSolver.solve(def); parCache.set(def.id, p ? p.par : null); }
  return parCache.get(def.id);
}

// ---------- Progress (localStorage, optional) ----------
const KEY = "ghostshift.progress.v2";
let progress = { unlocked: 1, best: {}, last: 0 };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) progress = Object.assign(progress, JSON.parse(raw));
  else {
    const old = parseInt(localStorage.getItem("ghostshift.unlocked") || "1", 10) || 1; // first build's key
    progress.unlocked = old;
    for (let i = 0; i < old - 1 && i < HAND.length; i++) progress.best[HAND[i].id] = { g: null, l: null };
  }
} catch (e) {}
progress.unlocked = Math.max(1, Math.min(COUNT, progress.unlocked | 0));
function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) {} }
const levelId = i => i < HAND.length ? HAND[i].id : "g" + (i + 1);
const bestOf = i => progress.best[levelId(i)];
const isDone = i => !!bestOf(i);
const isOpen = i => i < progress.unlocked || isDone(i) || (i > 0 && isDone(i - 1));
const hasStar = i => { const b = bestOf(i), p = levelPar(i); return !!(b && b.g != null && p != null && b.g <= p); };

// ---------- Game state ----------
const G = { idx: 0, sim: null, flash: 0, flashText: "", won: false };

function loadLevel(i) {
  i = Math.max(0, Math.min(COUNT - 1, i));
  if (!isOpen(i)) return;
  G.idx = i;
  G.sim = new Sim(levelDef(i));
  G.won = false;
  progress.last = i; save();
  hideOverlay(); closeLevels();
  resize();
}
function endLoop() { if (G.won) return; G.sim.endLoop(false); G.flash = 40; G.flashText = "Rewind"; }
function undoGhost() { if (!G.won && G.sim.undoGhost()) { G.flash = 30; G.flashText = "Ghost removed"; } }
function resetLevel() { loadLevel(G.idx); G.flash = 30; G.flashText = "Level reset"; }

function win() {
  G.won = true;
  const i = G.idx, def = levelDef(i), sim = G.sim;
  const ghosts = sim.ghosts.length, loops = sim.loops, par = levelPar(i);
  const prev = progress.best[def.id];
  const firstTime = !prev;
  const b = prev || { g: null, l: null };
  const newBest = b.g == null || ghosts < b.g;
  if (b.g == null || ghosts < b.g) b.g = ghosts;
  if (b.l == null || loops < b.l) b.l = loops;
  progress.best[def.id] = b;
  if (i + 2 > progress.unlocked) progress.unlocked = Math.min(COUNT, i + 2);
  save();
  const last = i + 1 >= COUNT;
  const star = par != null && ghosts <= par;
  const parLine = par != null
    ? (star ? `<p><span class="star">★</span> Par is ${par} ghost${par === 1 ? "" : "s"}. You matched it.</p>`
            : `<p>Par is ${par} ghost${par === 1 ? "" : "s"}. Replay it with fewer for a <span class="star">★</span>.</p>`)
    : "";
  showOverlay(
    `<h2>${last ? "All shifts covered" : "Shift complete"}</h2>
     <p>Level ${i + 1}, ${esc(def.name)}: solved on loop ${loops} with ${ghosts} ghost${ghosts === 1 ? "" : "s"}${!firstTime && newBest ? " (new best)" : ""}.</p>
     ${parLine}
     ${last ? "<p>That's every level so far. More are on the way.</p>" : ""}
     <div class="row">
       ${last ? "" : '<button class="btn primary" data-act="next">Next level</button>'}
       <button class="btn" data-act="replay">Replay</button>
       <button class="btn" data-act="levels">Levels</button>
     </div>`,
    { next: () => loadLevel(i + 1), replay: () => loadLevel(i), levels: openLevels });
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- Overlay ----------
const overlay = document.getElementById("overlay"), card = document.getElementById("card");
let overlayActs = null;
function showOverlay(html, acts) {
  card.innerHTML = html; overlay.classList.add("show"); overlayActs = acts || {};
  card.querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () => runOverlay(b.dataset.act)));
}
function hideOverlay() { overlay.classList.remove("show"); overlayActs = null; }
function runOverlay(act) {
  const acts = overlayActs || {};
  const fn = acts[act || Object.keys(acts)[0]];
  hideOverlay(); if (fn) fn();
}

// ---------- Level select (paged, so it stays fast with hundreds of levels) ----------
const lvEl = document.getElementById("levels"), lvGrid = document.getElementById("lvGrid");
const lvPage = document.getElementById("lvPage"), lvPrev = document.getElementById("lvPrev"), lvNext = document.getElementById("lvNext");
const lvSum = document.getElementById("lvSum");
let page = 0;
const pages = Math.ceil(COUNT / PAGE);
function openLevels() { page = Math.floor(G.idx / PAGE); renderLevels(); lvEl.classList.add("show"); }
function closeLevels() { lvEl.classList.remove("show"); }
function renderLevels() {
  const from = page * PAGE, to = Math.min(COUNT, from + PAGE);
  const done = HAND.reduce((n, _, i) => n + (isDone(i) ? 1 : 0), 0);
  let stars = 0;
  for (let i = 0; i < HAND.length; i++) if (hasStar(i)) stars++;
  lvSum.textContent = `${done} of ${HAND.length} solved · ${stars} ★ (solved at par)${PREVIEW ? ` · +${PREVIEW} generated preview levels` : ""}`;
  const frag = document.createDocumentFragment();
  for (let i = from; i < to; i++) {
    const b = document.createElement("button");
    const open = isOpen(i), done = isDone(i);
    // Only compute par for levels already played (generated levels are built on demand).
    const star = done && hasStar(i);
    b.className = "lv" + (done ? " done" : "") + (star ? " star" : "") + (!open ? " locked" : "") + (i === G.idx ? " current" : "");
    b.innerHTML = `${i + 1}<small>${!open ? "🔒" : star ? "★" : done ? "✓" : "new"}</small>`;
    b.setAttribute("aria-label", `Level ${i + 1}${!open ? ", locked" : done ? ", solved" : ""}`);
    if (open) b.addEventListener("click", () => loadLevel(i));
    frag.appendChild(b);
  }
  lvGrid.replaceChildren(frag);
  lvPage.textContent = `${from + 1}–${to} of ${COUNT}`;
  lvPrev.disabled = page === 0; lvNext.disabled = page >= pages - 1;
  document.getElementById("lvPager").style.display = pages > 1 ? "" : "none";
}
lvPrev.addEventListener("click", () => { if (page > 0) { page--; renderLevels(); } });
lvNext.addEventListener("click", () => { if (page < pages - 1) { page++; renderLevels(); } });
document.getElementById("lvClose").addEventListener("click", closeLevels);
document.getElementById("bLevels").addEventListener("click", e => { e.currentTarget.blur(); if (overlay.classList.contains("show") && !G.won) hideOverlay(); openLevels(); });

// ---------- Input ----------
const keys = new Set();
const pad = { x: 0, y: 0 };
const blocked = () => overlay.classList.contains("show") || lvEl.classList.contains("show");
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "backspace"].includes(k)) e.preventDefault();
  keys.add(k);
  if (e.repeat) return;
  if (lvEl.classList.contains("show")) { if (k === "escape" || k === "l") closeLevels(); return; }
  if (k === "l") { openLevels(); return; }
  if (overlay.classList.contains("show")) { if (k === "enter" || k === " ") runOverlay(); return; }
  if (k === " " || k === "r") endLoop();
  else if (k === "z") undoGhost();
  else if (k === "backspace") resetLevel();
  else if (k === "[") loadLevel(G.idx - 1);
  else if (k === "]") loadLevel(G.idx + 1);
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => { keys.clear(); pad.x = pad.y = 0; });

function keyInput() {
  let x = 0, y = 0;
  if (keys.has("arrowleft") || keys.has("a")) x -= 1;
  if (keys.has("arrowright") || keys.has("d")) x += 1;
  if (keys.has("arrowup") || keys.has("w")) y -= 1;
  if (keys.has("arrowdown") || keys.has("s")) y += 1;
  return [x, y];
}

// Touch / mouse joystick
const padEl = document.getElementById("pad"), knob = document.getElementById("knob");
let padPointer = null;
function padMove(e) {
  const r = padEl.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width * 0.32, d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  let nx = dx / max, ny = dy / max;
  // Snap to the 8 directions so walking straight through 1-tile gaps is easy on a thumb.
  const m = Math.hypot(nx, ny);
  if (m < 0.25) { nx = 0; ny = 0; }
  else { const a = Math.round(Math.atan2(ny, nx) / (Math.PI / 4)) * (Math.PI / 4); nx = Math.cos(a); ny = Math.sin(a); if (Math.abs(nx) < 1e-6) nx = 0; if (Math.abs(ny) < 1e-6) ny = 0; }
  pad.x = nx; pad.y = ny;
}
function padEnd() { padPointer = null; pad.x = pad.y = 0; knob.style.transform = ""; }
padEl.addEventListener("pointerdown", e => { e.preventDefault(); padPointer = e.pointerId; padEl.setPointerCapture(e.pointerId); padMove(e); });
padEl.addEventListener("pointermove", e => { if (e.pointerId === padPointer) padMove(e); });
padEl.addEventListener("pointerup", padEnd);
padEl.addEventListener("pointercancel", padEnd);
padEl.addEventListener("lostpointercapture", padEnd);

function bindBtn(id, fn) {
  const el = document.getElementById(id);
  el.addEventListener("click", e => { e.preventDefault(); if (!blocked()) fn(); el.blur(); });
}
bindBtn("bLoop", endLoop);
bindBtn("bUndo", undoGhost);
bindBtn("bReset", resetLevel);
document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("dblclick", e => e.preventDefault());

// ---------- Rendering ----------
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
const stage = document.getElementById("stage");
let scale = 1, dpr = 1;
function resize() {
  if (!G.sim) return;
  const r = G.sim.room;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const sw = stage.clientWidth - 16, sh = stage.clientHeight - 8;
  scale = Math.max(0.3, Math.min(sw / (r.w * T), sh / (r.h * T)));
  const w = Math.floor(r.w * T * scale), h = Math.floor(r.h * T * scale);
  cv.style.width = w + "px"; cv.style.height = h + "px";
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  bgCache = null;
}
addEventListener("resize", resize);
addEventListener("orientationchange", () => setTimeout(resize, 150));

function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Static tiles are drawn once per level/size into an offscreen canvas (cheap on low-end phones).
let bgCache = null, bgRoom = null;
function drawStatic() {
  const r = G.sim.room;
  if (bgCache && bgRoom === r) return bgCache;
  const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
  const g = c.getContext("2d"), k = scale * dpr;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = "#151c2b"; g.fillRect(0, 0, r.w * T, r.h * T);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const ch = r.grid[y][x];
    if (ch === "#") {
      g.fillStyle = "#2a3550"; g.fillRect(x * T, y * T, T, T);
      g.fillStyle = "#334164"; g.fillRect(x * T, y * T, T, 3);
    } else {
      g.fillStyle = (x + y) % 2 ? "#182032" : "#1a2335"; g.fillRect(x * T, y * T, T, T);
    }
  }
  const e = r.exit;
  g.fillStyle = "#1f5a46"; g.fillRect(e.x * T + 3, e.y * T + 3, T - 6, T - 6);
  g.strokeStyle = "#5ff0b0"; g.lineWidth = 2; g.strokeRect(e.x * T + 5, e.y * T + 5, T - 10, T - 10);
  for (const m of r.emitters) {
    const cx = m.x * T + T / 2, cy = m.y * T + T / 2;
    g.fillStyle = "#3a2430"; g.fillRect(m.x * T + 2, m.y * T + 2, T - 4, T - 4);
    g.fillStyle = "#ff5470"; g.beginPath();
    g.moveTo(cx + m.d[0] * 11, cy + m.d[1] * 11);
    g.lineTo(cx - m.d[0] * 6 - m.d[1] * 9, cy - m.d[1] * 6 - m.d[0] * 9);
    g.lineTo(cx - m.d[0] * 6 + m.d[1] * 9, cy - m.d[1] * 6 + m.d[0] * 9);
    g.closePath(); g.fill();
  }
  bgCache = c; bgRoom = r;
  return c;
}

function draw(now) {
  const sim = G.sim, r = sim.room, k = scale * dpr, W = r.w * T;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(drawStatic(), 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const pulse = 0.5 + 0.5 * Math.sin(now / 180);

  for (const p of r.plates) {
    ctx.globalAlpha = p.on ? 1 : 0.55;
    ctx.fillStyle = PLATE_COLORS[p.l]; roundRect(p.x * T + 6, p.y * T + 6, T - 12, T - 12, 5); ctx.fill();
    ctx.globalAlpha = 1;
    const o = p.on ? 11 : 9;
    ctx.fillStyle = "#151c2b"; roundRect(p.x * T + o, p.y * T + o, T - o * 2, T - o * 2, 3); ctx.fill();
  }
  for (const d of r.doors) {
    const col = PLATE_COLORS[d.l], x = d.x * T, y = d.y * T;
    if (d.open) {
      ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
      if (d.inv) ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 3, y + 3, T - 6, T - 6); ctx.setLineDash([]); ctx.globalAlpha = 1;
    } else if (!d.inv) {
      // Door: vertical bars
      ctx.fillStyle = "#222b40"; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = col;
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * 7, y + 2, 3, T - 4);
    } else {
      // Gate: solid block with a dark diamond, so it reads differently from a door
      ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
      ctx.fillStyle = "#222b40"; ctx.beginPath();
      ctx.moveTo(x + T / 2, y + 7); ctx.lineTo(x + T - 7, y + T / 2); ctx.lineTo(x + T / 2, y + T - 7); ctx.lineTo(x + 7, y + T / 2);
      ctx.closePath(); ctx.fill();
    }
    if (d.inv && d.open) { // small diamond marker on open gates
      ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.beginPath();
      ctx.moveTo(x + T / 2, y + 11); ctx.lineTo(x + T - 11, y + T / 2); ctx.lineTo(x + T / 2, y + T - 11); ctx.lineTo(x + 11, y + T / 2);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  for (const m of r.emitters) {
    const ox = m.x * T + T / 2 + m.d[0] * 12, oy = m.y * T + T / 2 + m.d[1] * 12;
    const L = Math.max(0, m.beam - 12);
    ctx.strokeStyle = "rgba(255,84,112," + (0.25 + 0.2 * pulse) + ")"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + m.d[0] * L, oy + m.d[1] * L); ctx.stroke();
    ctx.strokeStyle = "#ffd0d8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + m.d[0] * L, oy + m.d[1] * L); ctx.stroke();
  }
  sim.ghosts.forEach((g, i) => {
    const p = sim.ghostPos(g, sim.tick), col = GHOST_COLORS[i % GHOST_COLORS.length];
    ctx.globalAlpha = p.done ? 0.75 : 0.55;
    ctx.fillStyle = col; roundRect(p.x - HALF, p.y - HALF, HALF * 2, HALF * 2, 6); ctx.fill();
    ctx.globalAlpha = 1;
    if (p.done) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; roundRect(p.x - HALF - 3, p.y - HALF - 3, HALF * 2 + 6, HALF * 2 + 6, 8); ctx.stroke(); }
    ctx.fillStyle = "#0f1420"; ctx.font = "bold 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(g.died ? "×" : String(i + 1), p.x, p.y + 1);
  });
  if (!G.won) {
    const p = sim.player;
    ctx.fillStyle = "#f4f7ff"; roundRect(p.x - HALF, p.y - HALF, HALF * 2, HALF * 2, 6); ctx.fill();
    ctx.strokeStyle = "#6fe3ff"; ctx.lineWidth = 2; ctx.stroke();
    const ex = p.fx * 3, ey = p.fy * 3;
    ctx.fillStyle = "#0f1420";
    ctx.fillRect(p.x - 5 + ex, p.y - 3 + ey, 3, 4); ctx.fillRect(p.x + 2 + ex, p.y - 3 + ey, 3, 4);
  }
  const banner = (text, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(15,20,32,.8)"; roundRect(W / 2 - 150, 10, 300, 34, 10); ctx.fill();
    ctx.fillStyle = color; ctx.font = "600 15px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, 28); ctx.globalAlpha = 1;
  };
  if (G.flash > 0) banner(G.flashText, "#e8ecf5", Math.min(1, G.flash / 15));
  else if (sim.phase === "ready") banner(`Loop ${sim.loops}: move to start the clock`, "#9fb0d0", 1);
}

// HUD (DOM writes only when values change)
const elName = document.getElementById("roomName"), elNum = document.getElementById("roomNum"),
  elGhosts = document.getElementById("ghostCount"), elHint = document.getElementById("hint"),
  elFill = document.getElementById("timerFill"), elPar = document.getElementById("par");
let hudKey = "", lastFill = -1;
function hud() {
  const sim = G.sim, def = levelDef(G.idx);
  const key = G.idx + "|" + sim.ghosts.length + "|" + sim.loops + "|" + G.won;
  if (key !== hudKey) {
    hudKey = key;
    elName.textContent = def.name;
    elNum.textContent = `Level ${G.idx + 1}/${COUNT}`;
    elGhosts.textContent = `Loop ${sim.loops} · ${sim.ghosts.length} ghost${sim.ghosts.length === 1 ? "" : "s"}`;
    elHint.textContent = def.hint || "";
    const par = levelPar(G.idx), b = bestOf(G.idx);
    const time = def.time && def.time !== 30 ? ` · ${def.time}s loops` : "";
    elPar.textContent = (par != null ? `Par: ${par} ghost${par === 1 ? "" : "s"}` : "") +
      (b && b.g != null ? ` · Your best: ${b.g}${hasStar(G.idx) ? " ★" : ""}` : "") + time;
  }
  const f = Math.round((1 - sim.tick / sim.room.loopTicks) * 200) / 200;
  if (f !== lastFill) { lastFill = f; elFill.style.transform = `scaleX(${f})`; elFill.style.background = f < 0.2 ? "#ff7a8a" : "#6fe3ff"; }
}

// ---------- Main loop (fixed timestep) ----------
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(250, now - last); last = now;
  while (acc >= TICK_MS) {
    if (G.flash > 0) G.flash--;
    const [kx, ky] = keyInput();
    const ix = Math.max(-1, Math.min(1, kx + pad.x)), iy = Math.max(-1, Math.min(1, ky + pad.y));
    if (!blocked() && !G.won) {
      const ev = G.sim.step(ix, iy);
      if (ev === "zapped") { G.flash = 40; G.flashText = "Zapped. Your body stays behind."; }
      else if (ev === "timeout") { G.flash = 40; G.flashText = "Rewind"; }
      else if (ev === "won") win();
    }
    acc -= TICK_MS;
  }
  draw(now); hud();
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => { last = performance.now(); acc = 0; });

// Test hook for automated playthroughs (harmless in normal play).
window.GhostShift = { G, loadLevel, levelDef, levelPar, COUNT, progress, openLevels, win };

// ---------- Start ----------
const resume = Math.min(progress.last | 0, COUNT - 1);
G.idx = isOpen(resume) ? resume : 0;
G.sim = new Sim(levelDef(G.idx));
resize();
const returning = Object.keys(progress.best).length > 0;
if (returning) {
  showOverlay(`<h2>Ghost Shift</h2>
    <p>Welcome back. You've solved ${HAND.filter((_, i) => isDone(i)).length} of ${HAND.length} levels.</p>
    <p>Solved levels stay open, so you can replay any of them for a better score.</p>
    <div class="row"><button class="btn primary" data-act="go">Continue level ${G.idx + 1}</button><button class="btn" data-act="levels">Levels</button></div>`,
    { go: () => {}, levels: openLevels });
} else {
  showOverlay(`<h2>Ghost Shift</h2>
    <p>Every 30 seconds the loop rewinds, and your past runs play back as ghosts.</p>
    <p>Use them to hold plates, keep doors open and block lasers, then reach the green exit.</p>
    <div class="row"><button class="btn primary" data-act="go">Start</button></div>`, { go: () => {} });
}
requestAnimationFrame(frame);
})();

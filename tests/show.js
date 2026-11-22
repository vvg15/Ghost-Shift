// Debug helper: node tests/show.js <levelNumber>  prints the map with the solver's holds (1..n)
// and tiles reachable with no ghosts marked ':'.
"use strict";
const path = require("path");
const E = require(path.join(__dirname, "..", "engine.js"));
const S = require(path.join(__dirname, "..", "solver.js"));
const LEVELS = require(path.join(__dirname, "..", "levels.js"));
const n = parseInt(process.argv[2], 10);
const lv = n <= LEVELS.length ? LEVELS[n - 1] : require(path.join(__dirname, "..", "generator.js")).generate(n);
const room = E.parseLevel(lv);
const plan = S.solve(lv);
const prev = S.bfs(room, S.world(room, []), room.start);
const g = room.grid.map(r => r.slice());
for (let k = 0; k < prev.length; k++) if (prev[k] !== -2) { const x = k % room.w, y = (k - x) / room.w; if (g[y][x] === ".") g[y][x] = ":"; }
if (plan) plan.holds.forEach((k, i) => { const x = k % room.w, y = (k - x) / room.w; g[y][x] = "\x1b[31m" + (i + 1) + "\x1b[0m"; });
console.log(lv.name, plan ? "par " + plan.par : "UNSOLVABLE");
console.log(g.map((r, y) => String(y).padStart(2) + " " + r.join("")).join("\n"));

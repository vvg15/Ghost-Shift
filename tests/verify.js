// Checks that every level is solvable in the real engine.
// Usage: node tests/verify.js [--gen N]   (also checks the first N generated levels)
"use strict";
const path = require("path");
const E = require(path.join(__dirname, "..", "engine.js"));
const S = require(path.join(__dirname, "..", "solver.js"));
const LEVELS = require(path.join(__dirname, "..", "levels.js"));
let fail = 0;
function check(lv, n) {
  const t0 = Date.now();
  let room;
  try { room = E.parseLevel(lv); } catch (e) { console.log(`#${n} ${lv.name}: PARSE ${e.message}`); fail++; return; }
  const bad = lv.map.filter(r => r.length !== lv.map[0].length);
  const plan = S.solve(lv);
  if (!plan) { console.log(`#${n} ${lv.name}: UNSOLVABLE`); fail++; return; }
  const v = S.verify(lv, plan);
  const ms = Date.now() - t0;
  const secs = v.ticks ? v.ticks.map(t => t < 0 ? "zap" : (t / 60).toFixed(1)).join(" ") : "";
  console.log(`#${String(n).padStart(3)} ${lv.name.padEnd(22)} par ${plan.par}  ${v.ok ? "OK  " : "FAIL"} ${v.ok ? "" : v.reason}  [${secs}] ${ms}ms${bad.length ? " (ragged map)" : ""}`);
  if (!v.ok) fail++;
}
LEVELS.forEach((lv, i) => check(lv, i + 1));
const gi = process.argv.indexOf("--gen");
if (gi > 0) {
  const G = require(path.join(__dirname, "..", "generator.js"));
  const N = parseInt(process.argv[gi + 1] || "50", 10);
  for (let n = LEVELS.length + 1; n <= LEVELS.length + N; n++) check(G.generate(n), n);
}
console.log(fail ? `${fail} level(s) failed` : "All levels solvable");
process.exit(fail ? 1 : 0);

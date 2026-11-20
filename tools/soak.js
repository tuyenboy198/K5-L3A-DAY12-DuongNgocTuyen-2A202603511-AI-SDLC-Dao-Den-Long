#!/usr/bin/env node
// Ticket-04 §2 soak test: node --expose-gc tools/soak.js --seed 7 --nights 10 --out soak.json
// Nights 1 -> 2 -> 3 rotate in ONE process; night i (0-based) uses seed + i; random inputs from that seed:
// a new move direction every 30 ticks, per tick 5% jump, 3% dash, 2% pulse, 10% interact.
import { writeFileSync } from 'node:fs';
import { createGame, step, mulberry32, durationOf } from '../src/sim/game.js';
import { TPS } from '../src/sim/config.js';

const opts = { seed: 7, nights: 10, out: 'soak.json' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i]?.replace(/^--/, ''), v = argv[i + 1];
  if (!(k in opts) || v === undefined) { console.error(`usage: soak.js --seed <int> --nights <int> --out <file> (bad: ${argv[i]})`); process.exit(1); }
  opts[k] = k === 'out' ? v : Number(v);
  if (k !== 'out' && !Number.isInteger(opts[k])) { console.error(`--${k} must be an integer`); process.exit(1); }
}

export function randomInputs(seed) {
  const r = mulberry32((seed ^ 0x9e3779b9) >>> 0); // own stream, independent of the game's rng
  let move = [0, 0], t = 0;
  return () => {
    if (t++ % 30 === 0) { const a = r() * 2 * Math.PI; move = [Math.cos(a), Math.sin(a)]; }
    return { move, cam_yaw_deg: 0, jump: r() < 0.05, dash: r() < 0.03, pulse: r() < 0.02, interact: r() < 0.1, pause: false };
  };
}

const rssMb = () => { globalThis.gc?.(); return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10; };
const t0 = performance.now();
const results = [];
let crashes = 0, memStart = null;
for (let i = 0; i < opts.nights; i++) {
  const night = (i % 3) + 1, seed = opts.seed + i;
  try {
    const g = createGame({ seed, night });
    if (i === 0) memStart = rssMb();
    const next = randomInputs(seed), maxTicks = durationOf(night) * TPS + 1; // the night always ends at dawn; cap guards a hang
    for (let k = 0; g.state === 'playing' && k < maxTicks; k++) step(g, next());
    results.push(g.state === 'playing' ? 'timeout' : g.state);
  } catch (e) {
    crashes++;
    results.push('crash');
    console.error(`night ${i + 1} (Đêm ${night}, seed ${seed}) crashed: ${e.stack}`);
  }
} // each game goes out of scope here = reset
const memEnd = rssMb();
const report = { nights: opts.nights, crashes, results, mem_start_mb: memStart, mem_end_mb: memEnd, duration_s: Math.round((performance.now() - t0) / 100) / 10 };
writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');
const ok = crashes === 0 && memStart !== null && memEnd <= 1.2 * memStart;
console.log(`${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(report)}${globalThis.gc ? '' : ' (run with node --expose-gc for stable memory numbers)'}`);
process.exit(ok ? 0 : 1);

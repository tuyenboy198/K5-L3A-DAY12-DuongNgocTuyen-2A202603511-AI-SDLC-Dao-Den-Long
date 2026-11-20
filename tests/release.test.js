// Ticket-04 (v1.0.0): bench scene, frame statistics, soak, local leaderboard + export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBenchGame, BENCH } from '../src/sim/bench.js';
import { step, snapshot, DEFAULT_INPUT } from '../src/sim/game.js';
import { TUNING as T, RULES as R } from '../src/sim/config.js';
import { benchStats } from '../src/bench-stats.js';
import { validName, rank, addEntry, isoLocal } from '../src/leaderboard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'ddl-rel-'));
const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
const cmd = (line) => { const [c, ...a] = line.split(' '); return [c === 'node' ? process.execPath : c, a]; };

// ---------- §1 bench scene ----------
test('bench scene: 200 wandering shades + 100 motes on the island, L1-L3 lit with fuel 100, Mây at (0,0,0)', () => {
  const s = snapshot(createBenchGame(42));
  assert.equal(s.shades.length, 200);
  assert.deepEqual(s.shades.map((x) => x.id), Array.from({ length: 200 }, (_, i) => `S${i + 1}`));
  assert.ok(s.shades.every((x) => x.state === 'wander' && Math.hypot(x.pos[0], x.pos[2]) <= BENCH.islandR + 1e-9));
  assert.equal(s.motes.length, 100);
  assert.deepEqual(s.lanterns.map((L) => [L.id, L.lit, L.fuel]), [['L1', true, 100], ['L2', true, 100], ['L3', true, 100], ['L4', false, 0], ['L5', false, 0]]);
  assert.deepEqual(s.player.pos, [0, 0, 0]);
  for (const x of s.shades) for (const L of s.lanterns.filter((l) => l.lit)) assert.ok(Math.hypot(x.pos[0] - L.pos[0], x.pos[2] - L.pos[2]) >= T.safe_radius);
});

test('bench scene: no spawns, damage, pickups, fuel decay or end; shades keep wandering at 1.5 m/s; seeded', () => {
  const g = createBenchGame(42), start = g.shades.map((S) => [...S.pos]), events = [];
  for (let k = 0; k < 1800; k++) events.push(...step(g, DEFAULT_INPUT));
  const s = snapshot(g);
  assert.equal(g.state, 'playing');
  assert.deepEqual(events.map((e) => e.name), ['night_start']);
  assert.equal(s.shades.length, 200);
  assert.ok(s.shades.every((x) => x.state === 'wander'));
  assert.equal(s.motes.length, 100);
  assert.deepEqual(s.lanterns.slice(0, 3).map((L) => L.fuel), [100, 100, 100]);
  assert.equal(s.player.flames, T.flames);
  const moved = g.shades.map((S, i) => Math.hypot(S.pos[0] - start[i][0], S.pos[2] - start[i][2]));
  assert.ok(moved.filter((d) => d > 1).length > 150, 'most shades move');
  assert.ok(moved.every((d) => d <= R.shadeWanderSpeed * 30 + 1e-6), 'never faster than wander speed (1.5 m/s x 30 s)');
  assert.deepEqual(snapshot(createBenchGame(42)), snapshot(createBenchGame(42)));
  assert.notDeepEqual(snapshot(createBenchGame(42)).shades, snapshot(createBenchGame(43)).shades);
});

test('bench stats: avg = 1000N/sum, 1% low = 1000/mean of the k=max(1,ceil(0.01N)) slowest, p95 nearest-rank', () => {
  // 99 frames of 10 ms + one of 100 ms: sum 1090 -> avg 91.7; k = 1 -> 1000/100 = 10.0; p95 = 95th smallest = 10
  assert.deepEqual(benchStats([...Array(99).fill(10), 100]), { avg_fps: 91.7, p1_low_fps: 10, frame_ms_p95: 10, frames: 100 });
  // 1..250 ms: sum 31375 -> avg 7.968 -> 8.0; k = ceil(2.5) = 3 -> mean(250,249,248) = 249 -> 4.0; p95 = value #238 = 238
  assert.deepEqual(benchStats(Array.from({ length: 250 }, (_, i) => 250 - i)), { avg_fps: 8, p1_low_fps: 4, frame_ms_p95: 238, frames: 250 });
});

// ---------- §2 soak ----------
test('soak_cmd: nights rotate in one process, report fields, no crash, same seed -> same results', () => {
  const run = () => {
    const out = join(TMP, `soak${Math.random()}.json`), [c, a] = cmd(contract.soak_cmd);
    const r = spawnSync(c, [...a, '--seed', '7', '--nights', '4', '--out', out], { cwd: ROOT, encoding: 'utf8' });
    return { r, j: JSON.parse(readFileSync(out, 'utf8')) };
  };
  const { r, j } = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(Object.keys(j), ['nights', 'crashes', 'results', 'mem_start_mb', 'mem_end_mb', 'duration_s']);
  assert.equal(j.nights, 4);
  assert.equal(j.crashes, 0);
  assert.equal(j.results.length, 4);
  assert.ok(j.results.every((x) => x === 'won' || x === 'lost'));
  assert.ok(j.mem_end_mb <= 1.2 * j.mem_start_mb);
  assert.deepEqual(run().j.results, j.results);
});

// ---------- §3 leaderboard ----------
test('leaderboard names: 3-12 of [A-Za-z0-9_], Vietnamese letters accepted (bonus)', () => {
  for (const ok of ['abc', 'A_1', 'x'.repeat(12), 'Tuyên', 'Dương_99', 'ĐẢO_ĐÈN']) assert.ok(validName(ok), ok);
  for (const bad of ['', 'ab', 'x'.repeat(13), 'a b', 'abc!', 'abc-d', '日本語', null]) assert.ok(!validName(bad), String(bad));
});

test('leaderboard ranking: score desc, tie -> earlier achieved_at (time zones compared as instants), top 10', () => {
  const e = (name, score, at) => ({ name, score, nights_won: 1, achieved_at: at, seed: 1 });
  const list = rank([e('late', 500, '2026-11-20T04:00:00+00:00'), e('early', 500, '2026-11-20T10:00:00+07:00'), e('top', 900, '2026-11-21T00:00:00+07:00'),
    ...Array.from({ length: 9 }, (_, i) => e(`low${i}`, i, '2026-11-01T00:00:00+07:00'))]);
  assert.equal(list.length, 10);
  assert.deepEqual(list.slice(0, 3).map((x) => x.name), ['top', 'early', 'late']); // 10:00+07 = 03:00Z beats 04:00Z
  assert.ok(!list.some((x) => x.name === 'low0' || x.name === 'low1'));
  assert.match(isoLocal(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  assert.throws(() => addEntry([], { name: 'ok_name', score: -1, nights_won: 0, seed: 1 }));
  assert.throws(() => addEntry([], { name: 'ok_name', score: 10, nights_won: 4, seed: 1 }));
  assert.throws(() => addEntry([], { name: 'no', score: 10, nights_won: 1, seed: 1 }));
  const added = addEntry([], { name: 'Mây', score: 10, nights_won: 1, seed: 5 });
  assert.deepEqual(Object.keys(added[0]), ['name', 'score', 'nights_won', 'achieved_at', 'seed']);
});

test('leaderboard on disk via the game server, survives a restart, export command gives the ranked entries', async () => {
  const file = join(TMP, 'board.json'), env = { ...process.env, LEADERBOARD_FILE: file };
  const start = async () => {
    const port = 9100 + Math.floor(Math.random() * 800);
    const p = spawn(process.execPath, [join(ROOT, 'tools/serve.js'), String(port)], { env, stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise((r) => p.stdout.once('data', r));
    return { p, url: `http://localhost:${port}/__leaderboard` };
  };
  const post = (url, body) => fetch(url, { method: 'POST', body: JSON.stringify(body) });
  let s = await start();
  assert.equal((await post(s.url, { name: 'An_1', score: 300, nights_won: 1, seed: 7 })).status, 200);
  assert.equal((await post(s.url, { name: 'x', score: 300, nights_won: 1, seed: 7 })).status, 400);
  assert.equal((await post(s.url, { name: 'Bình', score: 900, nights_won: 3, seed: 8 })).status, 200);
  s.p.kill();
  s = await start(); // "close and reopen the game"
  const got = await (await fetch(s.url)).json();
  s.p.kill();
  assert.deepEqual(got.entries.map((x) => [x.name, x.score, x.nights_won, x.seed]), [['Bình', 900, 3, 8], ['An_1', 300, 1, 7]]);
  const out = join(TMP, 'export.json'), [c, a] = cmd(contract.run_cmd);
  const r = spawnSync(c, [...a, '--export-leaderboard', out], { cwd: ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), got);
});

test('export with no saved scores gives an empty list', () => {
  const out = join(TMP, 'empty.json'), [c, a] = cmd(contract.run_cmd);
  writeFileSync(join(TMP, 'none.json'), '{ broken');
  const r = spawnSync(c, [...a, '--export-leaderboard', out], { cwd: ROOT, env: { ...process.env, LEADERBOARD_FILE: join(TMP, 'none.json') }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), { entries: [] });
});

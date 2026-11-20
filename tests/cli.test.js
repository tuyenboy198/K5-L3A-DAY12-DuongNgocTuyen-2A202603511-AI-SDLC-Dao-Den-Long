// Black-box tests of the headless command exactly as the grader calls it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
const TMP = mkdtempSync(join(tmpdir(), 'ddl-'));
let n = 0;

function headless(args) {
  const out = join(TMP, `out${n++}.jsonl`);
  const [cmd, ...pre] = contract.headless_cmd.split(' ');
  const r = spawnSync(cmd === 'node' ? process.execPath : cmd, [...pre, ...args, '--out', out], { cwd: ROOT, encoding: 'utf8' });
  let lines = [], raw = '';
  try { raw = readFileSync(out, 'utf8'); lines = raw.trim().split('\n').map((l) => JSON.parse(l)); } catch {}
  return { code: r.status, stderr: r.stderr, lines, raw };
}
const tmpJson = (obj) => { const f = join(TMP, `in${n++}.json`); writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };

test('basic run: snapshot at tick 0, every 10 ticks, end line last, exit 0', () => {
  const r = headless(['--seed', '1', '--night', '1', '--ticks', '50']);
  assert.equal(r.code, 0, r.stderr);
  const snaps = r.lines.filter((l) => l.type === 'snapshot');
  assert.deepEqual(snaps.map((s) => s.tick), [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(r.lines.at(-1), { type: 'end', ticks: 50, state: 'playing', score: 0 });
  const s = snaps[0];
  for (const k of ['type', 'tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms']) assert.ok(k in s, k);
  assert.deepEqual(s.player, { pos: [0, 0, 0], vel: [0, 0, 0], grounded: true, flames: contract.tuning.flames, carried: 0, capacity: 10, invuln: false, dash_cd_s: 0, pulse_cd_s: 0, charm_s: 0 });
  assert.deepEqual(s.wind, { active: false, dir_deg: 0 });
  assert.equal(s.night, 1);
  assert.equal(s.lanterns.length, 5);
  assert.deepEqual(s.lanterns[0], { id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0, fuel: 0, ever_lit: false, relit_count: 0 });
  assert.equal(s.motes.length, 20);
  for (const m of s.motes) assert.deepEqual(Object.keys(m), ['id', 'pos', 'kind', 'ttl_s']);
});

test('--night 2 and 3 run with their own lanterns; --night 4 is rejected', () => {
  assert.equal(headless(['--seed', '1', '--night', '2', '--ticks', '5']).lines[0].lanterns.length, 6);
  const n3 = headless(['--seed', '1', '--night', '3', '--ticks', '5']).lines[0];
  assert.equal(n3.lanterns.length, 7);
  assert.deepEqual(n3.charms.map((c) => c.id), ['C1', 'C2']);
  const bad = headless(['--seed', '1', '--night', '4', '--ticks', '5']);
  assert.notEqual(bad.code, 0);
  assert.match(bad.stderr, /night/);
});

test('a full night 3 (21600 ticks) finishes well under 30 s', () => {
  const t0 = Date.now();
  const r = headless(['--seed', '9', '--night', '3', '--ticks', '21600']);
  assert.equal(r.code, 0);
  assert.ok(Date.now() - t0 < 30000);
});

test('--snapshot-every is honored', () => {
  const r = headless(['--seed', '1', '--night', '1', '--ticks', '9', '--snapshot-every', '3']);
  assert.deepEqual(r.lines.filter((l) => l.type === 'snapshot').map((s) => s.tick), [0, 3, 6, 9]);
});

test('determinism: same seed/scenario/inputs -> byte-identical output; other seed differs', () => {
  const inputs = tmpJson({ frames: [{ tick: 0, move: [0.3, 1] }, { tick: 400, move: [-1, 0], cam_yaw_deg: 45 }, { tick: 900, pulse: true }] });
  const a = headless(['--seed', '42', '--night', '1', '--inputs', inputs, '--ticks', '3000']);
  const b = headless(['--seed', '42', '--night', '1', '--inputs', inputs, '--ticks', '3000']);
  const c = headless(['--seed', '43', '--night', '1', '--inputs', inputs, '--ticks', '3000']);
  assert.equal(a.code, 0);
  assert.equal(a.raw, b.raw);
  assert.notEqual(a.raw, c.raw);
});

test('stops early when the game ends', () => {
  const sc = tmpJson({ random_motes: false, random_shades: false, time_left_s: 0.5 });
  const r = headless(['--seed', '1', '--night', '1', '--scenario', sc, '--ticks', '1000']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines.at(-1), { type: 'end', ticks: 30, state: 'lost', score: 0 });
});

test('coordinates are rounded to 3 decimals', () => {
  const inputs = tmpJson({ frames: [{ tick: 0, move: [0.123456, 0.654321], cam_yaw_deg: 33 }] });
  const r = headless(['--seed', '5', '--night', '1', '--inputs', inputs, '--ticks', '7', '--snapshot-every', '1']);
  for (const s of r.lines.filter((l) => l.type === 'snapshot')) for (const v of s.player.pos) assert.equal(v, Math.round(v * 1000) / 1000);
});

for (const [label, body] of [
  ['invalid JSON inputs', '{ frames: ['],
  ['non-increasing ticks', { frames: [{ tick: 5 }, { tick: 5 }] }],
  ['move with wrong shape', { frames: [{ tick: 0, move: [1] }] }],
  ['button not boolean', { frames: [{ tick: 0, pulse: 1 }] }],
]) {
  test(`malformed inputs (${label}) -> exit 2 + stderr`, () => {
    const r = headless(['--seed', '1', '--night', '1', '--inputs', tmpJson(body), '--ticks', '10']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /error/);
  });
}

for (const [label, body] of [
  ['invalid JSON scenario', 'nope'],
  ['unknown lantern id', { lanterns: [{ id: 'L9', lit: true }] }],
  ['player.pos wrong type', { player: { pos: 'origin' } }],
  ['unknown shade state', { shades: [{ pos: [1, 0, 1], state: 'angry' }] }],
  ['drifters not an array', { drifters: {} }],
]) {
  test(`malformed scenario (${label}) -> exit 2`, () => {
    assert.equal(headless(['--seed', '1', '--night', '1', '--scenario', tmpJson(body), '--ticks', '10']).code, 2);
  });
}

test('missing required args -> non-zero exit with message', () => {
  const r = headless(['--night', '1', '--ticks', '10']);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /seed/);
});

// Every scenario in scenarios/ ships with an `expect` block checked here.
const SC = join(ROOT, 'scenarios');
for (const f of readdirSync(SC).filter((f) => f.endsWith('.scenario.json'))) {
  test(`scenario ${f}`, () => {
    const spec = JSON.parse(readFileSync(join(SC, f), 'utf8'));
    const args = ['--seed', String(spec.seed ?? 1), '--night', String(spec.night ?? 1), '--scenario', join(SC, f), '--ticks', String(spec.ticks)];
    const inputs = join(SC, f.replace('.scenario.json', '.inputs.json'));
    try { readFileSync(inputs); args.push('--inputs', inputs); } catch {}
    const r = headless(args);
    assert.equal(r.code, 0, r.stderr);
    const events = r.lines.filter((l) => l.type === 'event').map(({ tick, name, data }) => ({ tick, name, data }));
    assert.deepEqual(events, spec.expect.events);
    assert.deepEqual(r.lines.at(-1), { type: 'end', ...spec.expect.end });
  });
}

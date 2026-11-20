// Gameplay rules (Ticket-02 standard numbers), run in-process against the same sim the CLI uses.
// Expected values are derived from the ticket text; the derivation is in each test name / comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, snapshot } from '../src/sim/game.js';
import { inputTimeline } from '../src/io.js';
import { TUNING as T, RULES as R } from '../src/sim/config.js';
import { MAPS } from '../src/sim/maps.js';

const QUIET = { random_motes: false, random_shades: false, random_drifters: false };

function run(scenario, frames, n, { night = 1, seed = 1 } = {}) {
  const g = createGame({ seed, night, scenario: { ...QUIET, ...scenario } });
  const input = inputTimeline(frames);
  const events = [];
  const snaps = [snapshot(g)];
  for (let k = 0; k < n && g.state === 'playing'; k++) { events.push(...step(g, input.at(k))); snaps.push(snapshot(g)); }
  return { g, events, snaps, snap: snapshot(g) };
}
const named = (events, name) => events.filter((e) => e.name === name);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// ---------- movement ----------
test('run speed 6 m/s, instant start/stop', () => {
  const { g } = run({}, [{ tick: 0, move: [0, 1] }, { tick: 60, move: [0, 0] }], 61);
  near(g.player.pos[2], 6);
  near(g.player.vel[2], 0);
});

test('camera yaw rotates input (yaw 90 + move [0,1] -> +X); diagonal normalized', () => {
  near(run({}, [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }], 60).g.player.pos[0], 6);
  const { g } = run({}, [{ tick: 0, move: [1, 1] }], 60);
  near(Math.hypot(g.player.pos[0], g.player.pos[2]), 6);
});

test('jump 7 m/s with gravity 20: apex ~1.225 m, only from the ground', () => {
  const { snaps } = run({}, [{ tick: 0, jump: true }, { tick: 1, jump: false }, { tick: 10, jump: true }], 60);
  const apex = Math.max(...snaps.map((s) => s.player.pos[1]));
  assert.ok(apex > 1.15 && apex < 1.25, `apex ${apex}`);
  assert.ok(snaps.at(-1).player.grounded); // the mid-air press at tick 10 did not double-jump
  assert.ok(snaps.every((s) => s.player.pos[1] <= 1.25));
});

test('dash: 14 m/s for 12 ticks (2.8 m) in the move direction, cooldown 90 ticks', () => {
  const { g } = run({}, [{ tick: 0, dash: true }], 12);
  near(g.player.pos[2], 2.8, 1e-9); // standing still -> dashes the way Mây faces (+Z at start)
  const moved = run({}, [{ tick: 0, move: [1, 0], dash: true }], 60).g;
  near(moved.player.pos[0], 2.8 + 48 * 0.1, 1e-9);
  assert.equal(run({}, [{ tick: 0, dash: true }], 1).snap.player.dash_cd_s, 1.5);
});

test('dash in the air keeps the height', () => {
  const { snaps } = run({}, [{ tick: 0, jump: true }, { tick: 1, jump: false }, { tick: 10, dash: true }], 25);
  const ys = snaps.slice(11, 23).map((s) => s.player.pos[1]);
  assert.ok(ys.every((y) => y === ys[0]), JSON.stringify(ys));
});

// ---------- motes / lanterns ----------
test('20 random motes at 20 different standard points; +1 at tick 240', () => {
  const g = createGame({ seed: 3, night: 1, scenario: { random_shades: false } });
  assert.equal(g.motes.length, 20);
  assert.equal(new Set(g.motes.map((m) => m.point)).size, 20);
  for (const m of g.motes) assert.ok(MAPS[1].motePoints.some((p) => Math.hypot(p[0] - m.pos[0], p[2] - m.pos[2]) < 1e-9));
  for (let k = 0; k < 240; k++) step(g, { move: [0, 0], cam_yaw_deg: 0 });
  assert.equal(g.motes.length, 21);
});

test('pickup: XZ <= 1.0 and height difference <= 1.5', () => {
  const { g } = run({ motes: [[1, 0, 0], [0, 0, -1.01]] }, [], 1);
  assert.equal(g.player.carried, 1);
  const high = run({ motes: [[0.5, 1.6, 0]] }, [], 1).g; // 1.6 m above the feet -> not picked
  assert.equal(high.player.carried, 0);
  assert.equal(run({ player: { carried: 10 }, motes: [[0, 0, 0.5]] }, [], 1).g.player.carried, 10);
});

test('lanterns: cost 10, partial deposits remembered, +10 per mote deposited, +100 lit', () => {
  const sc = { player: { pos: [0, 0, 23.5], carried: 4 } };
  const a = run(sc, [{ tick: 0, interact: true }], 1);
  assert.deepEqual(named(a.events, 'deposit')[0].data, { lantern_id: 'L1', amount: 4, deposited: 4 });
  assert.equal(a.g.score, 40);
  const b = run({ ...sc, player: { pos: [0, 0, 23.5], carried: 10 }, lanterns: [{ id: 'L1', deposited: 7 }] }, [{ tick: 0, interact: true }], 1);
  assert.deepEqual(named(b.events, 'deposit')[0].data, { lantern_id: 'L1', amount: 3, deposited: 10 });
  assert.equal(b.g.player.carried, 7);
  assert.equal(b.g.score, 30 + 100);
});

test('interact radius 2.0 m; nearest unlit lantern, tie -> lower id', () => {
  assert.equal(run({ player: { pos: [0, 0, 22.99], carried: 3 } }, [{ tick: 0, interact: true }], 1).events.filter((e) => e.name === 'deposit').length, 0);
  // equidistant from two lanterns placed by the scenario -> L1 wins
  const sc = { player: { carried: 3 }, lanterns: [{ id: 'L1', pos: [1.5, 0, 0] }, { id: 'L2', pos: [-1.5, 0, 0] }] };
  assert.equal(named(run(sc, [{ tick: 0, interact: true }], 1).events, 'deposit')[0].data.lantern_id, 'L1');
});

// ---------- shades ----------
test('shades: 2 spawn at tick 300 (S1,S2) in state spawning, then one every 480 ticks (night 1)', () => {
  const g = createGame({ seed: 4, night: 1, scenario: { random_motes: false } });
  const ev = [];
  for (let k = 0; k < 780; k++) ev.push(...step(g, { move: [0, 0], cam_yaw_deg: 0 }));
  assert.deepEqual(named(ev, 'shade_spawned').map((e) => [e.tick, e.data.id]), [[300, 'S1'], [300, 'S2'], [780, 'S3']]);
  assert.equal(snapshot(g).shades[2].state, 'spawning');
  const s3 = g.shades[2]; // just spawned: still on a standard point (r = 37)
  assert.ok(Math.abs(Math.hypot(s3.pos[0], s3.pos[2]) - 37) < 1e-9);
});

test('detection 12 m, lose interest beyond 18 m; chase speed 4 m/s (4.5 on night 3)', () => {
  assert.equal(run({ shades: [{ pos: [12.5, 1, 0] }] }, [], 1).snap.shades[0].state, 'wander');
  const c = run({ shades: [{ pos: [11, 1, 0] }] }, [], 60);
  assert.equal(c.snap.shades[0].state, 'chase');
  near(c.g.shades[0].pos[0], 11 - 4, 1e-9);
  near(run({ shades: [{ pos: [11, 1, 0] }] }, [], 60, { night: 3 }).g.shades[0].pos[0], 11 - 4.5, 1e-9);
  const lost = run({ player: { pos: [0, 0, 0] }, shades: [{ pos: [17, 1, 0], state: 'chase' }] }, [{ tick: 0, move: [-1, 0] }], 30);
  assert.equal(lost.snap.shades[0].state, 'wander'); // Mây runs faster, gap > 18 m
});

test('hit: -1 flame, drop floor(carried/2) into a 1.5-2.5 m ring (ttl 480), invuln 90, shade recoils', () => {
  const { events, snaps, g } = run({ player: { carried: 5 }, shades: [{ id: 'S1', pos: [0.5, 1, 0] }] }, [], 2);
  assert.deepEqual(named(events, 'player_hit')[0], { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: 2, dropped: 2 } });
  const drops = snaps[1].motes.filter((m) => m.kind === 'dropped');
  assert.equal(drops.length, 2);
  for (const m of drops) {
    const d = Math.hypot(m.pos[0], m.pos[2]);
    assert.ok(d >= 1.5 - 1e-3 && d <= 2.5 + 1e-3, `ring ${d}`);
    assert.equal(m.ttl_s, 8);
  }
  assert.equal(snaps[1].player.invuln, true);
  assert.equal(snaps[1].shades[0].state, 'recoil');
  assert.equal(g.player.carried, 3);
});

test('at most one flame per tick even with two shades touching', () => {
  const { events } = run({ shades: [{ id: 'S1', pos: [0.2, 1, 0] }, { id: 'S2', pos: [-0.2, 1, 0] }] }, [], 1);
  assert.equal(named(events, 'player_hit').length, 1);
});

test('dropped motes vanish after 480 ticks and can be picked up again', () => {
  const r = run({ player: { carried: 4, flames: 10 }, shades: [{ pos: [0, 1, 0.3] }] }, [], 481); // extra flames: the shade keeps coming back
  const first = r.snaps[1].motes.filter((m) => m.kind === 'dropped').map((m) => m.id);
  assert.equal(first.length, 2);
  assert.ok(r.snaps[480].motes.some((m) => m.id === first[0]));   // alive for 480 ticks
  assert.ok(!r.snaps[481].motes.some((m) => first.includes(m.id))); // gone after
});

test('safe zone 6 m: shades outside are stopped at the edge', () => {
  const sc = { player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ pos: [0, 1, 15] }, { pos: [4, 1, 33] }] };
  const g = createGame({ seed: 1, night: 1, scenario: { ...QUIET, ...sc } });
  for (let k = 0; k < 600; k++) {
    const ev = step(g, { move: [0, 0], cam_yaw_deg: 0 });
    assert.equal(named(ev, 'player_hit').length, 0);
    for (const s of g.shades) assert.ok(Math.hypot(s.pos[0], s.pos[2] - 25) >= 6 - 1e-9);
  }
});

test('lighting a lantern expels shades already inside to the edge within 30 ticks, harmlessly', () => {
  const sc = { player: { pos: [0, 0, 23.5], carried: 10 }, shades: [{ id: 'S1', pos: [0, 1, 22.5] }] };
  const { events, snaps } = run(sc, [{ tick: 0, interact: true }], 200);
  assert.equal(named(events, 'lantern_lit').length, 1);
  assert.equal(named(events, 'player_hit').length, 0);
  const dL = (s) => Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2] - 25);
  near(dL(snaps[15]), 2.5 + (3.5 * 15) / 30, 1e-6); // drifts out gradually (not snapped to the edge)
  near(dL(snaps[30]), 6, 1e-6);
});

// ---------- pulse ----------
test('pulse: cost 3, 3D radius 5 from feet+0.8, stun 120 ticks, push 4 m over 15 ticks, +5 per shade', () => {
  const sc = { player: { carried: 5 }, shades: [{ id: 'A', pos: [4.9, 1, 0] }, { id: 'B', pos: [4, 4, 0] }, { id: 'C', pos: [-6, 1, 0] }] };
  const { events, snaps, g } = run(sc, [{ tick: 0, pulse: true }], 121);
  assert.deepEqual(named(events, 'pulse')[0].data, { stunned_ids: ['A'] }); // B: XZ 4 m but 3D distance 5.12 > 5
  assert.equal(snaps[1].player.carried, 2);
  assert.equal(snaps[1].score, 5);
  near(snaps[15].shades[0].pos[0], 8.9, 1e-9);
  near(snaps[60].shades[0].pos[0], 8.9, 1e-9);
  assert.equal(snaps[120].shades[0].state, 'stunned');
  assert.notEqual(snaps[121].shades[0].state, 'stunned');
  assert.equal(snaps[1].player.pulse_cd_s, 3);
  assert.ok(g);
});

test('pulse: needs 3 motes; cooldown 180 ticks; re-pulse refreshes stun and scores again', () => {
  assert.equal(named(run({ player: { carried: 2 } }, [{ tick: 0, pulse: true }], 1).events, 'pulse').length, 0);
  const frames = [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 100, pulse: true }, { tick: 101, pulse: false }, { tick: 180, pulse: true }];
  const { events, g } = run({ player: { carried: 10 }, shades: [{ id: 'S1', pos: [2, 1, 0] }] }, frames, 200);
  assert.deepEqual(named(events, 'pulse').map((e) => [e.tick, e.data.stunned_ids]), [[1, ['S1']], [181, ['S1']]]);
  assert.equal(g.score, 10);
});

test('coincident shade is pushed along +X', () => {
  const { snaps } = run({ player: { carried: 3 }, shades: [{ pos: [0, 0.8, 0] }] }, [{ tick: 0, pulse: true }], 15);
  near(snaps[15].shades[0].pos[0], 4, 1e-9);
});

// ---------- fall ----------
test('fall (Y < -10): -1 flame, lose all motes, wait 60 ticks, respawn at start with invuln 90', () => {
  const { events, snaps } = run({ player: { pos: [39.45, 0, 0], carried: 4 } }, [{ tick: 0, move: [1, 0] }, { tick: 70, move: [0, 0] }], 130);
  assert.deepEqual(named(events, 'player_hit').map((e) => [e.tick, e.data]), [[66, { by: 'fall', flames: 2, dropped: 0, lost: 4 }]]);
  assert.ok(snaps[125].player.pos[1] < -10);
  assert.deepEqual(snaps[126].player.pos, [0, 0, 0]);
  assert.equal(snaps[126].player.invuln, true);
});

test('falling with the last flame loses immediately (no respawn)', () => {
  const { snap } = run({ player: { pos: [39.95, 0, 0], flames: 1 } }, [{ tick: 0, move: [1, 0] }], 300);
  assert.equal(snap.state, 'lost');
});

// ---------- maps ----------
test('night 2: bridge connects the islands; between them is the void', () => {
  const h = MAPS[2].heightAt;
  assert.equal(h(35, 0), 0);
  assert.equal(h(35, 2.5), null);
  assert.equal(h(70, 27), 0);
});

test('night 2 jump pad launches Mây (vy 14, 24 m/s) and lands on the other island', () => {
  const { snaps, events } = run({ player: { pos: [20, 0, 18] } }, [], 120, { night: 2 });
  assert.equal(named(events, 'player_hit').length, 0);
  const end = snaps.at(-1).player;
  assert.ok(end.grounded);
  assert.ok(Math.hypot(end.pos[0] - 70, end.pos[2]) <= 28, JSON.stringify(end.pos));
  const peak = Math.max(...snaps.map((s) => s.player.pos[1]));
  near(peak, (14 * 14) / (2 * 20), 0.2);
});

test('night 3 tiers: cliffs block walking up, ramps lead to tier 1, tower is solid', () => {
  const h = MAPS[3].heightAt;
  assert.equal(h(0, 5), 6); assert.equal(h(0, 18), 3); assert.equal(h(0, -18), 0); assert.equal(h(1, 0), 14);
  near(h(27 * Math.cos(Math.PI / 6), 27 * Math.sin(Math.PI / 6)), 1.5);
  // walk into the tier-1 cliff from below: blocked
  const blocked = run({ player: { pos: [0, 0, 26] } }, [{ tick: 0, move: [0, -1] }], 60, { night: 3 }).g.player.pos;
  assert.ok(blocked[2] > 24 - 1e-9 && blocked[1] === 0, JSON.stringify(blocked));
  // walk up the 30° ramp from its foot: ends on tier 1 at Y=3
  const a = Math.PI / 6, yaw = 90 - 30; // move [0,1] with yaw 60 -> world (sin60, cos60) = direction of 30° from +X
  const up = run({ player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }, [{ tick: 0, move: [0, -1], cam_yaw_deg: yaw }], 90, { night: 3 }).g.player.pos;
  assert.equal(up[1], 3, JSON.stringify(up));
});

test('night 3 jump pad (0,3,13) lands on tier 2', () => {
  const { g } = run({ player: { pos: [0, 3, 13] } }, [], 90, { night: 3 });
  assert.equal(g.player.pos[1], 6);
  assert.ok(Math.hypot(g.player.pos[0], g.player.pos[2]) <= 8);
});

test('night 3 wind: every 30 s a 5 s gust pushes Mây 2 m/s', () => {
  const g = createGame({ seed: 2, night: 3, scenario: { ...QUIET, player: { pos: [0, 0, -30] } } });
  for (let k = 0; k < 1799; k++) step(g, { move: [0, 0], cam_yaw_deg: 0 });
  assert.equal(snapshot(g).wind.active, false);
  step(g, { move: [0, 0], cam_yaw_deg: 0 });
  const s = snapshot(g);
  assert.equal(s.wind.active, true);
  near(Math.hypot(s.player.vel[0], s.player.vel[2]), 2, 2e-3); // snapshot rounds to 3 decimals
  for (let k = 0; k < 300; k++) step(g, { move: [0, 0], cam_yaw_deg: 0 });
  assert.equal(snapshot(g).wind.active, false);
  assert.equal(createGame({ night: 1 }).windEnabled, false);
});

// ---------- charm / drifters ----------
test('charm: speed 7.2 m/s for 600 ticks, respawns after 2700', () => {
  const sc = { player: { pos: [35, 0, 0] } };
  const { snaps, events } = run(sc, [{ tick: 1, move: [1, 0] }], 61, { night: 2 });
  assert.deepEqual(named(events, 'charm_picked')[0].data, { charm_id: 'C1', charm_ticks: 600 });
  near(snaps[61].player.pos[0] - snaps[1].player.pos[0], 7.2, 1e-9);
  assert.equal(snaps[1].player.charm_s, 10);
  assert.deepEqual(snaps[1].charms[0], { id: 'C1', available: false, respawn_s: 45 });
  const later = run(sc, [{ tick: 1, move: [1, 0] }, { tick: 60, move: [0, 0] }], 2701, { night: 2 }).snap.charms[0]; // walk away so it is not re-picked
  assert.equal(later.available, true);
});

test('drifter: idle unless Mây carries >= 5 within 15 m; steal ignores invuln; flee 240 ticks then removed', () => {
  const idle = run({ player: { carried: 4 }, drifters: [{ id: 'D1', pos: [3, 1.2, 0] }] }, [], 30, { night: 2 });
  assert.equal(named(idle.events, 'drifter_steal').length, 0);
  const r = run({ player: { carried: 6, invuln_ticks: 600 }, drifters: [{ id: 'D1', pos: [3, 1.2, 0] }] }, [], 16 + 240, { night: 2 });
  assert.deepEqual(named(r.events, 'drifter_steal')[0].data, { drifter_id: 'D1', amount: 3, carried: 3 });
  assert.equal(r.snaps[16].drifters[0].state, 'flee');
  assert.equal(r.snaps[16 + 239].drifters[0].state, 'flee');
  assert.equal(r.snap.drifters[0].state, 'removed');
  assert.equal(r.snap.drifters[0].stolen, 3);
});

test('pulse on a chasing drifter makes it flee without stealing', () => {
  // tick 0: still idle (state changes in step 8, after the pulse in step 7) -> pulse at tick 2 while it chases
  const r = run({ player: { carried: 8 }, drifters: [{ id: 'D1', pos: [4, 1.2, 0] }] }, [{ tick: 2, pulse: true }], 60, { night: 2 });
  assert.equal(r.snaps[2].drifters[0].state, 'chase');
  assert.equal(r.snaps[3].drifters[0].state, 'flee');
  assert.equal(named(r.events, 'drifter_steal').length, 0);
  assert.equal(r.g.player.carried, 5);
});

test('drifters spawn at tick 1200 on night 2 (D1), never on night 1', () => {
  const g = createGame({ seed: 5, night: 2, scenario: { random_motes: false, random_shades: false } });
  for (let k = 0; k < 1200; k++) step(g, { move: [0, 0], cam_yaw_deg: 0 });
  assert.deepEqual(snapshot(g).drifters.map((d) => [d.id, d.state]), [['D1', 'idle']]);
  assert.equal(createGame({ night: 1 }).randomDrifters, false);
});

// ---------- pause / end ----------
test('pause freezes sim_tick, time and cooldowns; snapshots say paused', () => {
  const frames = [{ tick: 0, dash: true }, { tick: 5, pause: true }, { tick: 6, pause: false }];
  const { snaps } = run({}, frames, 50);
  assert.equal(snaps[6].state, 'paused');
  assert.equal(snaps[50].sim_tick, 5);
  assert.equal(snaps[50].time_left_s, snaps[5].time_left_s);
  assert.equal(snaps[50].player.dash_cd_s, snaps[5].player.dash_cd_s);
});

test('win on the exact tick time runs out beats dawn', () => {
  const sc = { player: { pos: [0, 0, 24], carried: 10 }, lanterns: ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true })), time_left_s: 1 / 60 };
  const { events } = run(sc, [{ tick: 0, interact: true }], 5);
  assert.deepEqual(events.at(-1).data, { result: 'won', reason: 'all_lit' });
});

test('night_start event, flames refill per night, night durations 300/330/360', () => {
  assert.deepEqual(run({}, [], 1).events[0], { type: 'event', tick: 1, name: 'night_start', data: { night: 1 } });
  assert.deepEqual([1, 2, 3].map((n) => createGame({ night: n }).timeStart), [300, 330, 360]);
  assert.equal(createGame({ night: 3 }).player.flames, 3);
});

test('scenario setup emits nothing and pre-lit lanterns award no points', () => {
  const g = createGame({ seed: 1, scenario: { ...QUIET, lanterns: [{ id: 'L1', lit: true }] } });
  assert.equal(g.score, 0);
  assert.equal(snapshot(g).lanterns[0].lit, true);
});

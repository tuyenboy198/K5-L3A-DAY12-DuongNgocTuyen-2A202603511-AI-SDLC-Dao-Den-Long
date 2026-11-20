// Gameplay rules, run in-process against the same sim the CLI uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, snapshot } from '../src/sim/game.js';
import { inputTimeline } from '../src/io.js';
import { TUNING as T } from '../src/sim/config.js';

const QUIET = { random_motes: false, random_shades: false };

// Runs `n` steps; returns { g, events }.
function run(scenario, frames, n, seed = 1) {
  const g = createGame({ seed, scenario: { ...QUIET, ...scenario } });
  const input = inputTimeline(frames);
  const events = [];
  for (let k = 0; k < n && g.state === 'playing'; k++) events.push(...step(g, input.at(k)));
  return { g, events };
}
const named = (events, name) => events.filter((e) => e.name === name);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('moves player_speed m/s in +Z with move [0,1], yaw 0', () => {
  const { g } = run({}, [{ tick: 0, move: [0, 1] }], 60);
  near(g.player.pos[2], T.player_speed);
  near(g.player.pos[0], 0);
});

test('camera yaw rotates input: yaw 90 + move [0,1] goes +X', () => {
  const { g } = run({}, [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }], 60);
  near(g.player.pos[0], T.player_speed);
  near(g.player.pos[2], 0);
});

test('diagonal input is normalized to length 1', () => {
  const { g } = run({}, [{ tick: 0, move: [1, 1] }], 60);
  near(Math.hypot(g.player.pos[0], g.player.pos[2]), T.player_speed);
});

test('jump leaves the ground and lands back', () => {
  const { g } = run({}, [{ tick: 0, jump: true }], 10);
  assert.ok(g.player.pos[1] > 0);
  const r = run({}, [{ tick: 0, jump: true }], 120);
  assert.equal(r.g.player.pos[1], 0);
});

test('mote exactly at pickup_radius is picked at tick 1; just outside is not', () => {
  const { events, g } = run({ motes: [[T.pickup_radius, 0, 0], [0, 0, -(T.pickup_radius + 0.01)]] }, [], 1);
  assert.deepEqual(named(events, 'mote_picked'), [{ type: 'event', tick: 1, name: 'mote_picked', data: { carried: 1 } }]);
  assert.equal(g.motes.length, 1);
  assert.equal(g.score, T.score.per_mote);
});

test('carry_capacity caps pickups', () => {
  const { g } = run({ player: { carried: T.carry_capacity - 1 }, motes: [[0, 0, 0.5], [0, 0, -0.5]] }, [], 1);
  assert.equal(g.player.carried, T.carry_capacity);
  assert.equal(g.motes.length, 1);
});

test('interact deposits into lantern within interact_radius and lights it', () => {
  const sc = { player: { pos: [0, 0, 25 - T.interact_radius], carried: T.lantern_cost + 1 } };
  const { events, g } = run(sc, [{ tick: 0, interact: true }], 1);
  assert.deepEqual(named(events, 'deposit')[0].data, { lantern_id: 'L1', amount: T.lantern_cost, deposited: T.lantern_cost });
  assert.equal(named(events, 'lantern_lit')[0].data.lantern_id, 'L1');
  assert.equal(g.player.carried, 1);
  assert.equal(g.score, T.score.per_lantern);
});

test('partial deposit does not light; holding interact does not repeat', () => {
  const { events, g } = run({ player: { pos: [0, 0, 24], carried: 2 } }, [{ tick: 0, interact: true }], 30);
  assert.equal(named(events, 'deposit').length, 1);
  assert.equal(g.lanterns[0].deposited, 2);
  assert.equal(g.lanterns[0].lit, false);
});

test('interact out of range does nothing', () => {
  const { events } = run({ player: { pos: [0, 0, 25 - T.interact_radius - 0.01], carried: 5 } }, [{ tick: 0, interact: true }], 1);
  assert.equal(events.length, 0);
});

test('lighting the last lantern wins with time + flame bonus', () => {
  const sc = {
    player: { pos: [0, 0, 24], carried: T.lantern_cost },
    lanterns: ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true })),
    time_left_s: 100,
  };
  const { events, g } = run(sc, [{ tick: 0, interact: true }], 5);
  assert.deepEqual(events.at(-1), { type: 'event', tick: 1, name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
  assert.equal(g.state, 'won');
  // time left after 1 step = 99.983 -> floor 99
  assert.equal(g.score, T.score.per_lantern + 99 * T.score.per_second_left + T.flames * T.score.per_flame_left);
});

test('scenario setup emits nothing and pre-lit lanterns award no points', () => {
  const g = createGame({ seed: 1, scenario: { ...QUIET, lanterns: [{ id: 'L1', lit: true }] } });
  assert.equal(g.score, 0);
  assert.equal(snapshot(g).lanterns[0].lit, true);
});

test('pulse stuns + pushes shades in pulse_radius, costs light, scores per_stun', () => {
  const sc = { player: { carried: T.pulse_cost }, shades: [{ id: 'A', pos: [T.pulse_radius - 0.5, 1, 0] }, { id: 'B', pos: [-20, 1, 0] }] };
  const { events, g } = run(sc, [{ tick: 0, pulse: true }], 1);
  assert.deepEqual(named(events, 'pulse')[0].data, { stunned_ids: ['A'] });
  assert.equal(g.player.carried, 0);
  assert.equal(g.score, T.score.per_stun);
  const a = snapshot(g).shades[0];
  assert.equal(a.state, 'stunned');
  // moved toward the player by shade_speed/60 first, then pushed pulse_push_m away
  near(a.pos[0], T.pulse_radius - 0.5 - T.shade_speed / 60 + T.pulse_push_m, 1e-3);
});

test('pulse needs pulse_cost light and respects cooldown', () => {
  assert.equal(named(run({ player: { carried: T.pulse_cost - 1 } }, [{ tick: 0, pulse: true }], 1).events, 'pulse').length, 0);
  const cd = Math.round(T.pulse_cooldown_s * 60);
  const frames = [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 10, pulse: true }, { tick: 11, pulse: false }, { tick: cd, pulse: true }];
  const { events } = run({ player: { carried: 10 } }, frames, cd + 1);
  assert.deepEqual(named(events, 'pulse').map((e) => e.tick), [1, cd + 1]);
});

test('stunned shade does not move for pulse_stun_s, then chases again', () => {
  const sc = { player: { carried: 2 }, shades: [{ id: 'S1', pos: [3, 1, 0] }] };
  const stun = Math.round(T.pulse_stun_s * 60);
  const { g } = run(sc, [{ tick: 0, pulse: true }], stun);
  const x = g.shades[0].pos[0];
  near(x, 3 - T.shade_speed / 60 + T.pulse_push_m);
  const after = run(sc, [{ tick: 0, pulse: true }], stun + 30).g.shades[0].pos[0];
  assert.ok(after < x, 'shade resumed chasing');
});

test('shade chases at shade_speed', () => {
  const { g } = run({ shades: [{ pos: [20, 1, 0] }] }, [], 60);
  near(g.shades[0].pos[0], 20 - T.shade_speed);
});

test('shade contact costs a flame, drops hit_drop_ratio of carried, then invuln_s', () => {
  const sc = { player: { carried: 5 }, shades: [{ id: 'S1', pos: [0.5, 1, 0] }] };
  const inv = Math.round(T.invuln_s * 60);
  const { events, g } = run(sc, [], inv + 1);
  const hits = named(events, 'player_hit');
  assert.deepEqual(hits[0], { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: T.flames - 1, dropped: Math.floor(5 * T.hit_drop_ratio) } });
  assert.deepEqual(hits.map((e) => e.tick), [1, inv + 2].filter((t) => t <= inv + 1));
  assert.equal(g.player.flames, T.flames - 1);
  assert.equal(named(run(sc, [], inv + 2).events, 'player_hit').at(-1).tick, inv + 2);
});

test('losing the last flame ends the game: lost / no_flames', () => {
  const { events, g } = run({ player: { flames: 1 }, shades: [{ pos: [0, 1, 0] }] }, [], 10);
  assert.deepEqual(events.at(-1).data, { result: 'lost', reason: 'no_flames' });
  assert.equal(g.state, 'lost');
  assert.equal(g.tick, 1);
});

test('dawn: time runs out -> lost / dawn', () => {
  const { events, g } = run({ time_left_s: 1 }, [], 1000);
  assert.deepEqual(events.at(-1), { type: 'event', tick: 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
  assert.equal(snapshot(g).time_left_s, 0);
});

test('shades cannot enter safe_radius of a lit lantern', () => {
  const sc = { player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ pos: [0, 1, 10] }, { pos: [3, 1, 25] }] };
  const g = createGame({ seed: 1, scenario: { ...QUIET, ...sc } });
  const evs = [];
  for (let k = 0; k < 600; k++) {
    evs.push(...step(g, { move: [0, 0], cam_yaw_deg: 0 }));
    for (const s of g.shades) assert.ok(Math.hypot(s.pos[0], s.pos[2] - 25) >= T.safe_radius - 1e-9);
  }
  assert.equal(named(evs, 'player_hit').length, 0);
});

test('unlit lanterns do not repel shades', () => {
  const { g } = run({ player: { pos: [0, 0, 25] }, shades: [{ pos: [0, 1, 20] }] }, [], 60);
  assert.ok(Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2] - 25) < T.safe_radius);
});

test('default night: 30 motes, first shade spawns at tick 300 with an event', () => {
  const g = createGame({ seed: 7 });
  assert.equal(g.motes.length, 30);
  assert.equal(g.shades.length, 0);
  const evs = [];
  for (let k = 0; k < 300; k++) evs.push(...step(g, { move: [0, 0], cam_yaw_deg: 0 }));
  assert.deepEqual(named(evs, 'shade_spawned'), [{ type: 'event', tick: 300, name: 'shade_spawned', data: { id: 'S1' } }]);
});

test('time_left_s = duration - steps/60', () => {
  const { g } = run({}, [], 120);
  assert.equal(snapshot(g).time_left_s, T.night1_duration_s - 2);
});

test('player cannot walk off the island (fall_enabled=false)', () => {
  const { g } = run({}, [{ tick: 0, move: [0, 1] }], 60 * 20);
  assert.ok(Math.hypot(g.player.pos[0], g.player.pos[2]) <= 48 + 1e-9);
});

// game.contract.json must declare exactly the numbers the sim uses (wrong values fail the hidden tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TUNING } from '../src/sim/config.js';

const c = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));

test('contract header fields', () => {
  assert.equal(c.contract_version, '1.2');
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.equal(typeof c[k], 'string', k);
});

test('contract tuning == sim tuning', () => {
  assert.deepEqual(c.tuning, TUNING);
});

test('contract tuning has every field from Test Contract v1.2', () => {
  const keys = ['player_speed', 'carry_capacity', 'lantern_cost', 'lantern_count_night1', 'pickup_radius', 'interact_radius', 'pulse_cost', 'pulse_radius',
    'night1_duration_s', 'flames', 'invuln_s', 'hit_drop_ratio', 'pulse_stun_s', 'pulse_push_m', 'pulse_cooldown_s', 'safe_radius', 'shade_speed',
    'shade_hit_radius', 'fall_enabled', 'score', 'dash_speed', 'dash_duration_s', 'dash_cooldown_s', 'night2_duration_s', 'night3_duration_s',
    'fuel_max', 'fuel_decay_per_s', 'fuel_per_mote', 'relight_cost', 'win_ratio', 'drain_per_s', 'low_fuel_threshold', 'capacity_max'];
  assert.deepEqual(Object.keys(c.tuning).sort(), keys.sort());
  assert.deepEqual(Object.keys(c.tuning.score).sort(), ['per_flame_left', 'per_lantern', 'per_mote', 'per_second_left', 'per_stun']);
  assert.equal(c.tuning.lantern_count_night1, 5);
});

test('tuning matches the standard numbers (Ticket-02, changed by Ticket-03)', () => {
  assert.deepEqual(c.tuning, {
    player_speed: 6, carry_capacity: 10, lantern_cost: 10, lantern_count_night1: 5, pickup_radius: 1, interact_radius: 2,
    pulse_cost: 3, pulse_radius: 5, night1_duration_s: 240, night2_duration_s: 270, night3_duration_s: 300, flames: 3,
    invuln_s: 1.5, hit_drop_ratio: 0.5, pulse_stun_s: 2, pulse_push_m: 4, pulse_cooldown_s: 3, safe_radius: 6,
    shade_speed: 4, shade_hit_radius: 1, dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5, fall_enabled: true,
    fuel_max: 100, fuel_decay_per_s: 1, fuel_per_mote: 10, relight_cost: 5, win_ratio: 0.6, drain_per_s: 5, low_fuel_threshold: 30, capacity_max: 20,
    score: { per_mote: 5, per_lantern: 100, per_stun: 5, per_second_left: 0, per_flame_left: 50 }, // Ticket-03: time bonus removed
  });
});

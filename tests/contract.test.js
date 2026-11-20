// game.contract.json must declare exactly the numbers the sim uses (wrong values fail the hidden tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TUNING } from '../src/sim/config.js';

const c = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));

test('contract header fields', () => {
  assert.equal(c.contract_version, '1.0');
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.equal(typeof c[k], 'string', k);
});

test('contract tuning == sim tuning', () => {
  assert.deepEqual(c.tuning, TUNING);
});

test('contract tuning has every field from Test Contract v1.0', () => {
  const keys = ['player_speed', 'carry_capacity', 'lantern_cost', 'lantern_count_night1', 'pickup_radius', 'interact_radius', 'pulse_cost', 'pulse_radius',
    'night1_duration_s', 'flames', 'invuln_s', 'hit_drop_ratio', 'pulse_stun_s', 'pulse_push_m', 'pulse_cooldown_s', 'safe_radius', 'shade_speed',
    'shade_hit_radius', 'fall_enabled', 'score'];
  assert.deepEqual(Object.keys(c.tuning).sort(), keys.sort());
  assert.deepEqual(Object.keys(c.tuning.score).sort(), ['per_flame_left', 'per_lantern', 'per_mote', 'per_second_left', 'per_stun']);
  assert.equal(c.tuning.lantern_count_night1, 5);
});

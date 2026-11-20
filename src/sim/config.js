// Single source of truth for gameplay numbers. tests/contract.test.js checks that
// game.contract.json declares exactly these values.
export const TPS = 60;

export const TUNING = {
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 5,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2.5,
  pulse_cost: 2,
  pulse_radius: 6,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 2,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 3,
  pulse_push_m: 4,
  pulse_cooldown_s: 1.5,
  safe_radius: 5,
  shade_speed: 3.5,
  shade_hit_radius: 1,
  fall_enabled: false,
  score: { per_mote: 10, per_lantern: 100, per_stun: 25, per_second_left: 2, per_flame_left: 50 },
};

// Internal numbers the contract does not ask for (documented in docs/notes/phase-1.md).
export const WORLD = {
  islandRadius: 48,      // player cannot walk past this (fall_enabled = false)
  lanternRing: 25,       // L1..L5 evenly spaced on this circle, L1 at (0,0,25)
  jumpSpeed: 6,          // m/s
  gravity: 20,           // m/s^2
  shadeY: 1,             // spawned shade center height
  moteCount: 30,         // random motes at start, and the cap for respawns
  moteRespawnTicks: 180, // one new mote every 3 s while below the cap
  moteMinR: 3, moteMaxR: 44,
  firstShadeTick: 300,   // first random shade at 5 s
  shadeEveryTicks: 1200, // then one every 20 s
  maxShades: 6,
  shadeSpawnR: 40,
  shadeMinPlayerDist: 15,
};

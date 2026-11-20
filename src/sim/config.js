// Ticket-02 standard numbers, changed/extended by Ticket-03 (contract v1.2). TUNING is what game.contract.json declares (tests/contract.test.js
// checks they are identical); RULES are the other standard numbers the contract does not list.
export const TPS = 60;

export const TUNING = {
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2,
  pulse_cost: 3,
  pulse_radius: 5,
  night1_duration_s: 240,
  night2_duration_s: 270,
  night3_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 3,
  safe_radius: 6,
  shade_speed: 4,
  shade_hit_radius: 1,
  dash_speed: 14,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  fall_enabled: true,
  fuel_max: 100,
  fuel_decay_per_s: 1.0,
  fuel_per_mote: 10,
  relight_cost: 5,
  win_ratio: 0.6,
  drain_per_s: 5,
  low_fuel_threshold: 30,
  capacity_max: 20,
  // Ticket-03 replaced the whole score formula; time bonus removed (per_second_left 0). Relight/drain/dawn bonuses are in RULES.
  score: { per_mote: 5, per_lantern: 100, per_stun: 5, per_second_left: 0, per_flame_left: 50 },
};

export const RULES = {
  jumpSpeed: 7, gravity: 20,
  pickupDy: 1.5, hitDy: 1.5, interactDy: 1.5,
  pulseCenterY: 0.8, pushTicks: 15,
  shadeY: 1, shadeDetect: 12, shadeLose: 18, shadeWanderSpeed: 1.5,
  spawningTicks: 30, recoilTicks: 60, recoilDist: 2, expelTicks: 30,
  firstShadeTick: 300, firstShadeCount: 2,
  dropRingMin: 1.5, dropRingMax: 2.5, dropTtl: 480,
  fallY: -10, respawnWait: 60, respawnInvuln: 90,
  moteStart: 20, moteCap: 30, moteEvery: 240,
  charmTicks: 600, charmSpeed: 7.2, charmRespawn: 2700,
  drifterSpeed: 7, drifterIdleSpeed: 2, drifterMax: 2, drifterEvery: 1200, drifterY: 1.2,
  drifterChaseCarry: 5, drifterChaseDist: 15, drifterHit: 1.2, drifterSteal: 3, drifterFleeTicks: 240, drifterDropVanish: 120,
  windEvery: 1800, windTicks: 300, windWarn: 120, windSpeed: 2,
  stepUp: 0.35, padRadius: 1,
  // Ticket-03
  scoreRelight: 40, scoreStunDrain: 15, scoreDawnLantern: 50, capacityPerLight: 2, drainRange: 2, drainBreakDist: 6, fuelEventEvery: 60,
};

export const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain'];
// Fuel is kept in integer 1/60 units (1 tick of decay = 1 unit) to avoid float drift.
export const FUEL_UNIT = 60;
export const DRIFTER_STATES = ['idle', 'chase', 'flee', 'removed'];

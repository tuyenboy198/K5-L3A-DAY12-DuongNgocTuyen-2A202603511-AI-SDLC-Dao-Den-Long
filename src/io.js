// Parsing + validation of scenario / inputs files (trust boundary, Test Contract v1.1). Any problem
// throws FormatError, which the CLI maps to exit code 2.
import { DEFAULT_INPUT } from './sim/game.js';
import { SHADE_STATES, DRIFTER_STATES, RULES } from './sim/config.js';

export class FormatError extends Error {}

const fail = (msg) => { throw new FormatError(msg); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, where) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(`${where}: expected a number`));
const vec = (v, n, where) => (Array.isArray(v) && v.length === n ? v.map((x, i) => num(x, `${where}[${i}]`)) : fail(`${where}: expected an array of ${n} numbers`));
const bool = (v, where) => (typeof v === 'boolean' ? v : fail(`${where}: expected a boolean`));
const count = (v, where) => (Number.isInteger(v) && v >= 0 ? v : fail(`${where}: expected a non-negative integer`));
const oneOf = (v, list, where) => (list.includes(v) ? v : fail(`${where}: expected one of ${list.join(', ')}`));
const arr = (v, where) => (Array.isArray(v) ? v : fail(`${where}: expected an array`));
const opt = (o, k, fn, where) => (o[k] === undefined ? undefined : fn(o[k], `${where}.${k}`));
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
function uniqueIds(list, where) {
  const seen = new Set();
  for (const [i, e] of list.entries()) {
    if (e.id === undefined) continue;
    if (typeof e.id !== 'string' || seen.has(e.id)) fail(`${where}[${i}].id: expected a unique string`);
    seen.add(e.id);
  }
}

export function parseJson(text, what) {
  try { return JSON.parse(text); } catch (e) { return fail(`${what}: invalid JSON (${e.message})`); }
}

export function validateScenario(s, lanternIds) {
  if (!isObj(s)) fail('scenario: expected a JSON object');
  const out = {};
  if (s.player !== undefined) {
    if (!isObj(s.player)) fail('scenario.player: expected an object');
    const w = 'scenario.player';
    out.player = strip({
      pos: opt(s.player, 'pos', (v, x) => vec(v, 3, x), w),
      carried: opt(s.player, 'carried', count, w),
      flames: opt(s.player, 'flames', count, w),
      invuln_ticks: opt(s.player, 'invuln_ticks', count, w),
      dash_cd_ticks: opt(s.player, 'dash_cd_ticks', count, w),
      pulse_cd_ticks: opt(s.player, 'pulse_cd_ticks', count, w),
      charm_ticks: opt(s.player, 'charm_ticks', count, w),
      successful_lights: opt(s.player, 'successful_lights', count, w),
    });
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) if (s[k] !== undefined) out[k] = bool(s[k], `scenario.${k}`);
  if (s.motes !== undefined) {
    out.motes = arr(s.motes, 'scenario.motes').map((m, i) => {
      const w = `scenario.motes[${i}]`;
      if (!isObj(m)) return { pos: vec(m, 3, w), kind: 'random' };
      const kind = opt(m, 'kind', (v, x) => oneOf(v, ['random', 'dropped'], x), w) ?? 'random';
      const ttl = opt(m, 'ttl_ticks', count, w) ?? (m.ttl_s !== undefined ? Math.round(num(m.ttl_s, `${w}.ttl_s`) * 60) : RULES.dropTtl);
      return { pos: vec(m.pos, 3, `${w}.pos`), kind, ttl };
    });
  }
  if (s.shades !== undefined) {
    out.shades = arr(s.shades, 'scenario.shades').map((sh, i) => {
      const w = `scenario.shades[${i}]`;
      if (!isObj(sh)) fail(`${w}: expected an object`);
      return strip({ pos: vec(sh.pos, 3, `${w}.pos`), id: sh.id, state: opt(sh, 'state', (v, x) => oneOf(v, SHADE_STATES, x), w), state_ticks_left: opt(sh, 'state_ticks_left', count, w), target_lantern_id: opt(sh, 'target_lantern_id', (v, x) => oneOf(v, lanternIds, x), w) });
    });
    uniqueIds(out.shades, 'scenario.shades');
  }
  if (s.drifters !== undefined) {
    out.drifters = arr(s.drifters, 'scenario.drifters').map((d, i) => {
      const w = `scenario.drifters[${i}]`;
      if (!isObj(d)) fail(`${w}: expected an object`);
      return strip({ pos: vec(d.pos, 3, `${w}.pos`), id: d.id, state: opt(d, 'state', (v, x) => oneOf(v, DRIFTER_STATES, x), w), stolen: opt(d, 'stolen', count, w), state_ticks_left: opt(d, 'state_ticks_left', count, w) });
    });
    uniqueIds(out.drifters, 'scenario.drifters');
  }
  if (s.charms !== undefined) {
    out.charms = arr(s.charms, 'scenario.charms').map((c, i) => {
      const w = `scenario.charms[${i}]`;
      if (!isObj(c)) fail(`${w}: expected an object`);
      return strip({ pos: vec(c.pos, 3, `${w}.pos`), id: c.id, available: opt(c, 'available', bool, w), respawn_ticks: opt(c, 'respawn_ticks', count, w) });
    });
    uniqueIds(out.charms, 'scenario.charms');
  }
  if (s.lanterns !== undefined) {
    out.lanterns = arr(s.lanterns, 'scenario.lanterns').map((l, i) => {
      const w = `scenario.lanterns[${i}]`;
      if (!isObj(l) || !lanternIds.includes(l.id)) fail(`${w}.id: expected one of ${lanternIds.join(', ')}`);
      return strip({ id: l.id, pos: opt(l, 'pos', (v, x) => vec(v, 3, x), w), deposited: opt(l, 'deposited', count, w), lit: opt(l, 'lit', bool, w), ever_lit: opt(l, 'ever_lit', bool, w), fuel: opt(l, 'fuel', (v, x) => { const n = num(v, x); return n >= 0 && n <= 100 ? n : fail(`${x}: expected 0..100`); }, w) });
    });
  }
  if (s.time_left_s !== undefined) {
    out.time_left_s = num(s.time_left_s, 'scenario.time_left_s');
    if (out.time_left_s < 0) fail('scenario.time_left_s: must be >= 0');
  }
  return out;
}

/** Returns frames sorted by tick, each holding only the fields it changes. */
export function validateInputs(s) {
  if (!isObj(s) || !Array.isArray(s.frames)) fail('inputs: expected an object with a "frames" array');
  let last = -1;
  return s.frames.map((f, i) => {
    const w = `inputs.frames[${i}]`;
    if (!isObj(f)) fail(`${w}: expected an object`);
    const tick = count(f.tick, `${w}.tick`);
    if (tick <= last) fail(`${w}.tick: ticks must strictly increase`);
    last = tick;
    const o = { tick };
    if (f.move !== undefined) o.move = vec(f.move, 2, `${w}.move`).map((x) => Math.max(-1, Math.min(1, x)));
    if (f.cam_yaw_deg !== undefined) o.cam_yaw_deg = num(f.cam_yaw_deg, `${w}.cam_yaw_deg`);
    for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause']) if (f[b] !== undefined) o[b] = bool(f[b], `${w}.${b}`);
    return o;
  });
}

/** Holds the current input; call at(k) before step k. Absent fields keep their previous value. */
export function inputTimeline(frames) {
  let cur = { ...DEFAULT_INPUT }, i = 0;
  return {
    at(k) {
      while (i < frames.length && frames[i].tick <= k) {
        const { tick, ...fields } = frames[i++];
        cur = { ...cur, ...fields };
      }
      return cur;
    },
  };
}

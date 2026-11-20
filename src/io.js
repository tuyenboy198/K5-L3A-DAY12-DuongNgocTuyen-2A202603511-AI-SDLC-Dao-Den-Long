// Parsing + validation of scenario / inputs files (trust boundary). Any problem throws
// FormatError, which the CLI maps to exit code 2.
import { DEFAULT_INPUT } from './sim/game.js';

export class FormatError extends Error {}

const fail = (msg) => { throw new FormatError(msg); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, where) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(`${where}: expected a number`));
const vec = (v, n, where) => (Array.isArray(v) && v.length === n ? v.map((x, i) => num(x, `${where}[${i}]`)) : fail(`${where}: expected an array of ${n} numbers`));
const bool = (v, where) => (typeof v === 'boolean' ? v : fail(`${where}: expected a boolean`));
const count = (v, where) => (Number.isInteger(v) && v >= 0 ? v : fail(`${where}: expected a non-negative integer`));

export function parseJson(text, what) {
  try { return JSON.parse(text); } catch (e) { return fail(`${what}: invalid JSON (${e.message})`); }
}

export function validateScenario(s, lanternIds) {
  if (!isObj(s)) fail('scenario: expected a JSON object');
  const out = {};
  if (s.player !== undefined) {
    if (!isObj(s.player)) fail('scenario.player: expected an object');
    out.player = {};
    if (s.player.pos !== undefined) out.player.pos = vec(s.player.pos, 3, 'scenario.player.pos');
    if (s.player.carried !== undefined) out.player.carried = count(s.player.carried, 'scenario.player.carried');
    if (s.player.flames !== undefined) out.player.flames = count(s.player.flames, 'scenario.player.flames');
  }
  for (const k of ['random_motes', 'random_shades']) if (s[k] !== undefined) out[k] = bool(s[k], `scenario.${k}`);
  if (s.motes !== undefined) {
    if (!Array.isArray(s.motes)) fail('scenario.motes: expected an array');
    out.motes = s.motes.map((m, i) => vec(isObj(m) ? m.pos : m, 3, `scenario.motes[${i}]`));
  }
  if (s.shades !== undefined) {
    if (!Array.isArray(s.shades)) fail('scenario.shades: expected an array');
    const seen = new Set();
    out.shades = s.shades.map((sh, i) => {
      if (!isObj(sh)) fail(`scenario.shades[${i}]: expected an object`);
      const o = { pos: vec(sh.pos, 3, `scenario.shades[${i}].pos`) };
      if (sh.id !== undefined) {
        if (typeof sh.id !== 'string' || seen.has(sh.id)) fail(`scenario.shades[${i}].id: expected a unique string`);
        seen.add((o.id = sh.id));
      }
      return o;
    });
  }
  if (s.lanterns !== undefined) {
    if (!Array.isArray(s.lanterns)) fail('scenario.lanterns: expected an array');
    out.lanterns = s.lanterns.map((l, i) => {
      if (!isObj(l) || !lanternIds.includes(l.id)) fail(`scenario.lanterns[${i}].id: expected one of ${lanternIds.join(', ')}`);
      const o = { id: l.id };
      if (l.pos !== undefined) o.pos = vec(l.pos, 3, `scenario.lanterns[${i}].pos`);
      if (l.deposited !== undefined) o.deposited = count(l.deposited, `scenario.lanterns[${i}].deposited`);
      if (l.lit !== undefined) o.lit = bool(l.lit, `scenario.lanterns[${i}].lit`);
      return o;
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
    for (const b of ['jump', 'interact', 'pulse', 'dash']) if (f[b] !== undefined) o[b] = bool(f[b], `${w}.${b}`);
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

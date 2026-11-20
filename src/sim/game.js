// Pure game logic for Night 1. No DOM, no timers, no Math.random: same seed + scenario +
// inputs => same result. Used by both the headless CLI and the browser renderer.
import { TUNING as T, WORLD as W, TPS } from './config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ticks = (s) => Math.round(s * TPS);
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? 0 : r; }; // no -0 in output
const p3 = (p) => p.map(r3);

export const DEFAULT_INPUT = Object.freeze({ move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false });

function defaultLanterns() {
  const n = T.lantern_count_night1;
  return Array.from({ length: n }, (_, i) => {
    const a = (i * 2 * Math.PI) / n;
    return { id: `L${i + 1}`, pos: [r3(W.lanternRing * Math.sin(a)), 0, r3(W.lanternRing * Math.cos(a))], lit: false, deposited: 0 };
  });
}

function nextId(prefix, g, used) {
  const key = prefix === 'M' ? 'nextMote' : 'nextShade';
  while (used.has(`${prefix}${g[key]}`)) g[key]++;
  return `${prefix}${g[key]++}`;
}

function addMote(g, pos) {
  const id = nextId('M', g, new Set(g.motes.map((m) => m.id)));
  g.motes.push({ id, pos: [pos[0], 0, pos[2]] });
}

function addShade(g, pos, id) {
  const used = new Set(g.shades.map((s) => s.id));
  g.shades.push({ id: id ?? nextId('S', g, used), pos: [...pos], stun: 0 });
  return g.shades[g.shades.length - 1];
}

function randomDiscPoint(g, minR, maxR) {
  const r = Math.sqrt(minR * minR + g.rng() * (maxR * maxR - minR * minR));
  const a = g.rng() * 2 * Math.PI;
  return [r * Math.sin(a), 0, r * Math.cos(a)];
}

function spawnMote(g) {
  let p;
  for (let i = 0; i < 10; i++) {
    p = randomDiscPoint(g, W.moteMinR, W.moteMaxR);
    if (g.lanterns.every((L) => distXZ(p, L.pos) > T.interact_radius) && distXZ(p, g.player.pos) > 2 * T.pickup_radius) break;
  }
  addMote(g, p.map(r3));
}

function spawnShade(g) {
  let p;
  for (let i = 0; i < 10; i++) {
    const a = g.rng() * 2 * Math.PI;
    p = [W.shadeSpawnR * Math.sin(a), W.shadeY, W.shadeSpawnR * Math.cos(a)];
    if (distXZ(p, g.player.pos) >= W.shadeMinPlayerDist && g.lanterns.every((L) => !L.lit || distXZ(p, L.pos) > T.safe_radius)) break;
  }
  return addShade(g, p.map(r3));
}

// Shades cannot enter safe_radius around a lit lantern: project them back onto its edge.
function keepOutOfSafe(g, S) {
  for (const L of g.lanterns) {
    if (!L.lit) continue;
    const d = distXZ(S.pos, L.pos);
    if (d >= T.safe_radius) continue;
    let dx = S.pos[0] - L.pos[0], dz = S.pos[2] - L.pos[2];
    if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
    S.pos[0] = L.pos[0] + dx * T.safe_radius;
    S.pos[2] = L.pos[2] + dz * T.safe_radius;
  }
}

/** Build the state at tick 0. `scenario` must already be validated (see src/io.js). Emits no events, awards no points. */
export function createGame({ seed = 0, scenario = {} } = {}) {
  const g = {
    rng: mulberry32(seed),
    tick: 0,
    state: 'playing',
    result: null,
    score: 0,
    timeStart: scenario.time_left_s ?? T.night1_duration_s,
    player: { pos: [0, 0, 0], vy: 0, flames: T.flames, carried: 0, invuln: 0, pulseCd: 0 },
    lanterns: defaultLanterns(),
    motes: [], shades: [], nextMote: 1, nextShade: 1,
    randomMotes: scenario.random_motes ?? true,
    randomShades: scenario.random_shades ?? true,
    prev: { ...DEFAULT_INPUT },
  };
  const sp = scenario.player ?? {};
  if (sp.pos) g.player.pos = [...sp.pos];
  if (sp.carried != null) g.player.carried = sp.carried;
  if (sp.flames != null) g.player.flames = sp.flames;

  for (const l of scenario.lanterns ?? []) {
    const L = g.lanterns.find((x) => x.id === l.id);
    if (l.pos) L.pos = [...l.pos];
    if (l.deposited != null) L.deposited = l.deposited;
    if (l.lit != null) L.lit = l.lit;
    if (L.deposited >= T.lantern_cost) L.lit = true;
  }

  if (scenario.motes) for (const m of scenario.motes) addMote(g, m);
  else if (g.randomMotes) for (let i = 0; i < W.moteCount; i++) spawnMote(g);

  if (scenario.shades) for (const s of scenario.shades) addShade(g, s.pos, s.id);
  return g;
}

export const timeLeft = (g) => g.timeStart - g.tick / TPS;

/** Advance one tick (step k reads input k, produces state k+1). Returns the events of this step. */
export function step(g, input) {
  if (g.state !== 'playing') return [];
  const t = g.tick + 1;
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: t, name, data });
  const pressed = (k) => input[k] && !g.prev[k];
  const P = g.player;

  // 1. Player movement (instant velocity, camera-relative input).
  let [mx, mz] = input.move;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = (input.cam_yaw_deg * Math.PI) / 180;
  const v = T.player_speed / TPS;
  let nx = P.pos[0] + (mx * Math.cos(th) + mz * Math.sin(th)) * v;
  let nz = P.pos[2] + (-mx * Math.sin(th) + mz * Math.cos(th)) * v;
  const oldR = Math.hypot(P.pos[0], P.pos[2]), newR = Math.hypot(nx, nz);
  if (newR > W.islandRadius && newR > oldR) { const k = Math.max(W.islandRadius, oldR) / newR; nx *= k; nz *= k; }
  let ny = P.pos[1];
  if (pressed('jump') && ny <= 0 && P.vy <= 0) P.vy = W.jumpSpeed;
  if (ny > 0 || P.vy > 0) {
    P.vy -= W.gravity / TPS;
    ny += P.vy / TPS;
    if (ny <= 0) { ny = 0; P.vy = 0; }
  }
  P.pos = [nx, ny, nz];

  // 2. Pick up motes.
  for (const m of g.motes) {
    if (P.carried >= T.carry_capacity) break;
    if (distXZ(P.pos, m.pos) <= T.pickup_radius) {
      m.dead = true;
      P.carried++;
      g.score += T.score.per_mote;
      emit('mote_picked', { carried: P.carried });
    }
  }
  g.motes = g.motes.filter((m) => !m.dead);

  // 3. Interact: deposit into the nearest unlit lantern in range.
  if (pressed('interact') && P.carried > 0) {
    let best = null, bd = Infinity;
    for (const L of g.lanterns) {
      const d = distXZ(P.pos, L.pos);
      if (!L.lit && d <= T.interact_radius && d < bd) { best = L; bd = d; }
    }
    if (best) {
      const amount = Math.min(P.carried, T.lantern_cost - best.deposited);
      P.carried -= amount;
      best.deposited += amount;
      emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= T.lantern_cost) {
        best.lit = true;
        g.score += T.score.per_lantern;
        emit('lantern_lit', { lantern_id: best.id });
      }
    }
  }

  // 4. Shades chase the player (stunned ones stand still).
  for (const S of g.shades) {
    if (S.stun > 0) { S.stun--; continue; }
    const d = distXZ(S.pos, P.pos);
    if (d > 1e-9) {
      const k = Math.min(T.shade_speed / TPS, d) / d;
      S.pos[0] += (P.pos[0] - S.pos[0]) * k;
      S.pos[2] += (P.pos[2] - S.pos[2]) * k;
    }
    keepOutOfSafe(g, S);
  }

  // 5. Pulse: costs carried light, stuns + pushes shades in range.
  if (P.pulseCd > 0) P.pulseCd--;
  if (pressed('pulse') && P.pulseCd === 0 && P.carried >= T.pulse_cost) {
    P.carried -= T.pulse_cost;
    P.pulseCd = ticks(T.pulse_cooldown_s);
    const ids = [];
    for (const S of g.shades) {
      const d = distXZ(S.pos, P.pos);
      if (d > T.pulse_radius) continue;
      let dx = S.pos[0] - P.pos[0], dz = S.pos[2] - P.pos[2];
      if (d < 1e-9) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      S.pos[0] += dx * T.pulse_push_m;
      S.pos[2] += dz * T.pulse_push_m;
      S.stun = ticks(T.pulse_stun_s);
      keepOutOfSafe(g, S);
      ids.push(S.id);
    }
    g.score += ids.length * T.score.per_stun;
    emit('pulse', { stunned_ids: ids });
  }

  // 6. Shade contact.
  if (P.invuln > 0) P.invuln--;
  else {
    for (const S of g.shades) {
      if (S.stun > 0 || distXZ(S.pos, P.pos) > T.shade_hit_radius) continue;
      P.flames--;
      const dropped = Math.floor(P.carried * T.hit_drop_ratio);
      P.carried -= dropped;
      P.invuln = ticks(T.invuln_s);
      emit('player_hit', { by: 'shade', flames: P.flames, dropped });
      break;
    }
  }

  // 7. Random spawns.
  g.tick = t;
  if (P.flames > 0) {
    if (g.randomMotes && t % W.moteRespawnTicks === 0 && g.motes.length < W.moteCount) spawnMote(g);
    const shadeDue = t === W.firstShadeTick || (t > W.firstShadeTick && (t - W.firstShadeTick) % W.shadeEveryTicks === 0);
    if (g.randomShades && shadeDue && g.shades.length < W.maxShades) emit('shade_spawned', { id: spawnShade(g).id });
  }

  // 8. End conditions.
  const end = (result, reason) => { g.state = result; g.result = reason; emit('game_over', { result, reason }); };
  if (P.flames <= 0) end('lost', 'no_flames');
  else if (g.lanterns.every((L) => L.lit)) {
    g.score += T.score.per_second_left * Math.floor(Math.max(0, timeLeft(g)) + 1e-9) + T.score.per_flame_left * P.flames;
    end('won', 'all_lit');
  } else if (timeLeft(g) <= 1e-9) end('lost', 'dawn');

  g.prev = { ...input };
  return events;
}

export function snapshot(g) {
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.tick,
    state: g.state,
    time_left_s: r3(Math.max(0, timeLeft(g))),
    score: g.score,
    player: { pos: p3(g.player.pos), flames: g.player.flames, carried: g.player.carried },
    lanterns: g.lanterns.map((L) => ({ id: L.id, pos: p3(L.pos), lit: L.lit, deposited: L.deposited })),
    shades: g.shades.map((S) => ({ id: S.id, pos: p3(S.pos), state: S.stun > 0 ? 'stunned' : 'chase' })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: p3(m.pos) })),
  };
}

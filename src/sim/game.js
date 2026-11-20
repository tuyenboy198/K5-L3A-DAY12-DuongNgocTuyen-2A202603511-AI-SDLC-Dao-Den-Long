// Pure game logic (Test Contract v1.1). No DOM, no timers, no Math.random: same seed + night +
// scenario + inputs => same result. Used by the headless CLI and the browser renderer.
// step() follows the mandatory per-tick order of Ticket-02 (numbered comments below).
import { TUNING as T, RULES as R, TPS, FUEL_UNIT } from './config.js';
import { MAPS } from './maps.js';

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
const dXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? 0 : r; }; // no -0 in output
const p3 = (p) => p.map(r3);
const idNum = (id) => { const m = /^[A-Z](\d+)$/.exec(id); return m ? Number(m[1]) : Infinity; };
const byId = (a, b) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const dirXZ = (from, to) => { // unit vector from -> to on XZ; coincident points push along +X
  const dx = to[0] - from[0], dz = to[2] - from[2], d = Math.hypot(dx, dz);
  return d < 1e-9 ? [1, 0] : [dx / d, dz / d];
};

export const DEFAULT_INPUT = Object.freeze({ move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false });
export const durationOf = (night) => T[`night${night}_duration_s`];

function newId(g, prefix, list) {
  const used = new Set(list.map((e) => e.id));
  while (used.has(`${prefix}${g.next[prefix]}`)) g.next[prefix]++;
  return `${prefix}${g.next[prefix]++}`;
}

const groundY = (g, x, z, fallback = 0) => g.map.heightAt(x, z) ?? fallback;

function addMote(g, pos, kind = 'random', ttl = null) {
  const point = kind === 'random' ? g.map.motePoints.findIndex((p) => dXZ(p, pos) < 1e-6) : -1;
  g.motes.push({ id: newId(g, 'M', g.motes), pos: [...pos], kind, ttl, point }); // created after step 4 -> pickable from the next tick
}

function addShade(g, pos, { id, state = 'wander', stateTicks = 0, lanternId = null } = {}) {
  const S = { id: id ?? newId(g, 'S', g.shades), pos: [...pos], state, stateTicks, pushLeft: 0, pushDir: [1, 0], recoilDir: [1, 0], expel: 0, expelStep: [0, 0], target: null, lanternId, drainTicks: 0 };
  if (state === 'stunned') S.pushLeft = 0;
  g.shades.push(S);
  return S;
}

function addDrifter(g, pos, { id, state = 'idle', stolen = 0, stateTicks = 0 } = {}) {
  const D = { id: id ?? newId(g, 'D', g.drifters), pos: [...pos], state, stolen, fleeTicks: state === 'flee' ? stateTicks || R.drifterFleeTicks : 0, stole: stolen > 0, target: null };
  g.drifters.push(D);
  return D;
}

function wanderTarget(g, pos, radius) {
  const a = g.rng() * 2 * Math.PI, r = g.rng() * radius;
  return [pos[0] + r * Math.cos(a), pos[1], pos[2] + r * Math.sin(a)];
}

function moveToward(pos, target, maxStep) {
  const d = dXZ(pos, target);
  if (d < 1e-9) return;
  const k = Math.min(maxStep, d) / d;
  pos[0] += (target[0] - pos[0]) * k;
  pos[2] += (target[2] - pos[2]) * k;
}

// Ticket-03 fuel model: fuel in integer 1/60 units. A lit lantern has a safe zone only while fuel >= 30.
const FUEL_MAX = T.fuel_max * FUEL_UNIT, LOW_FUEL = T.low_fuel_threshold * FUEL_UNIT, FUEL_PER_MOTE = T.fuel_per_mote * FUEL_UNIT;
export const fuelOf = (L) => (L.lit ? L.fuel / FUEL_UNIT : 0);
const r1 = (v) => Math.round(v * 10) / 10;
const hasZone = (L) => L.lit && L.fuel >= LOW_FUEL;
const isWeak = (L) => L.lit && L.fuel < LOW_FUEL;
const refuelNeed = (L) => Math.ceil((FUEL_MAX - L.fuel) / FUEL_PER_MOTE); // motes to fill up
export const capacityOf = (P) => Math.min(T.capacity_max, T.carry_capacity + R.capacityPerLight * P.successfulLights);
const lightCost = (L) => (L.everLit ? T.relight_cost : T.lantern_cost);
const nearestLantern = (g, pos, pred) => {
  let best = null, bd = Infinity;
  for (const L of g.lanterns) { const d = dXZ(pos, L.pos); if (pred(L) && d < bd) { best = L; bd = d; } } // list order = id order -> ties go to the lower id
  return best;
};

const inSafe = (g, x, z) => g.lanterns.some((L) => hasZone(L) && Math.hypot(x - L.pos[0], z - L.pos[2]) < T.safe_radius);
const inTower = (g, x, z) => !!g.map.tower && Math.hypot(x, z) < g.map.tower.r;

// Shades outside a lit lantern's zone are stopped on its 6 m edge; the bell tower is solid.
function blockShade(g, S) {
  for (const L of g.lanterns) {
    if (!hasZone(L)) continue;
    const d = dXZ(S.pos, L.pos);
    if (d >= T.safe_radius) continue;
    const [ux, uz] = dirXZ(L.pos, S.pos);
    S.pos[0] = L.pos[0] + ux * T.safe_radius;
    S.pos[2] = L.pos[2] + uz * T.safe_radius;
  }
  if (g.map.tower) {
    const d = Math.hypot(S.pos[0], S.pos[2]), r = g.map.tower.r;
    if (d < r) { const [ux, uz] = dirXZ([0, 0, 0], S.pos); S.pos[0] = ux * r; S.pos[2] = uz * r; }
  }
}
const settleY = (g, E, h) => { E.pos[1] = groundY(g, E.pos[0], E.pos[2]) + h; };
const afterTimer = (g, S) => (dXZ(S.pos, g.player.pos) <= R.shadeDetect && g.player.respawn === 0 ? 'chase' : 'wander');

/** Build the state at tick 0. `scenario` must already be validated (src/io.js). Emits no events, awards no points. */
export function createGame({ seed = 0, night = 1, scenario = {} } = {}) {
  const map = MAPS[night];
  if (!map) throw new Error(`unknown night ${night}`);
  const g = {
    night, map, rng: mulberry32(seed),
    tick: 0, simTick: 0, state: 'playing', paused: false, result: null, score: 0,
    timeStart: scenario.time_left_s ?? durationOf(night),
    player: {
      pos: [...map.start], vel: [0, 0, 0], vy: 0, grounded: true, facing: [0, 1],
      flames: T.flames, carried: 0, invuln: 0, dashCd: 0, dashTicks: 0, dashDir: [0, 1], pulseCd: 0, charm: 0, launch: null, respawn: 0, successfulLights: 0,
    },
    lanterns: map.lanterns.map((L) => ({ id: L.id, pos: [...L.pos], lit: false, deposited: 0, fuel: 0, everLit: false, relitCount: 0 })),
    motes: [], shades: [], drifters: [], charms: [],
    next: { M: 1, S: 1, D: 1, C: 1 },
    randomMotes: scenario.random_motes ?? true,
    randomShades: scenario.random_shades ?? true,
    randomDrifters: (scenario.random_drifters ?? true) && map.drifters,
    windEnabled: (scenario.wind_enabled ?? true) && map.wind,
    wind: { ticks: 0, dir: 0 },
    prev: { ...DEFAULT_INPUT },
  };
  const P = g.player, sp = scenario.player ?? {};
  if (sp.pos) P.pos = [...sp.pos];
  if (sp.carried != null) P.carried = sp.carried;
  if (sp.flames != null) P.flames = sp.flames;
  if (sp.invuln_ticks != null) P.invuln = sp.invuln_ticks;
  if (sp.dash_cd_ticks != null) P.dashCd = sp.dash_cd_ticks;
  if (sp.pulse_cd_ticks != null) P.pulseCd = sp.pulse_cd_ticks;
  if (sp.charm_ticks != null) P.charm = sp.charm_ticks;
  if (sp.successful_lights != null) P.successfulLights = sp.successful_lights;
  const h0 = map.heightAt(P.pos[0], P.pos[2]);
  P.grounded = h0 !== null && Math.abs(P.pos[1] - h0) < 1e-6;

  for (const l of scenario.lanterns ?? []) {
    const L = g.lanterns.find((x) => x.id === l.id);
    if (l.pos) L.pos = [...l.pos];
    if (l.deposited != null) L.deposited = l.deposited;
    if (l.lit != null) L.lit = l.lit;
    L.everLit = l.ever_lit ?? L.lit; // a lantern set lit by the scenario has obviously been lit
    if (!L.lit && L.deposited >= lightCost(L)) L.lit = true;
    L.fuel = L.lit ? Math.round((l.fuel ?? T.fuel_max) * FUEL_UNIT) : 0; // lit without fuel -> 100
    if (L.lit) L.deposited = 0;
  }

  if (scenario.motes) for (const raw of scenario.motes) { const m = Array.isArray(raw) ? { pos: raw, kind: 'random' } : raw; addMote(g, m.pos, m.kind, m.kind === 'dropped' ? m.ttl ?? R.dropTtl : null); }
  else if (g.randomMotes) {
    const idx = map.motePoints.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (const i of idx.slice(0, R.moteStart)) addMote(g, map.motePoints[i]);
  }
  for (const s of scenario.shades ?? []) {
    const S = addShade(g, s.pos, { id: s.id, lanternId: s.target_lantern_id ?? null, state: s.state ?? 'wander', stateTicks: s.state_ticks_left ?? (s.state === 'stunned' ? ticks(T.pulse_stun_s) : s.state === 'recoil' ? R.recoilTicks : s.state === 'spawning' ? R.spawningTicks : 0) });
    if (S.state === 'recoil') S.recoilDir = dirXZ(P.pos, S.pos);
  }
  for (const d of scenario.drifters ?? []) addDrifter(g, d.pos, { id: d.id, state: d.state, stolen: d.stolen ?? 0, stateTicks: d.state_ticks_left ?? 0 });
  const charms = scenario.charms ?? map.charms.map((pos) => ({ pos }));
  charms.forEach((c, i) => g.charms.push({ id: c.id ?? `C${i + 1}`, pos: [...c.pos], available: c.available ?? true, respawn: c.respawn_ticks ?? (c.available === false ? R.charmRespawn : 0) }));
  return g;
}

export const timeLeft = (g) => g.timeStart - g.simTick / TPS;
export const winThreshold = (g) => Math.ceil(T.win_ratio * g.lanterns.length - 1e-9); // 3/5, 4/6, 5/7
export const windWarning = (g) => g.windEnabled && g.wind.ticks === 0 && g.simTick % R.windEvery >= R.windEvery - R.windWarn;

function hitDropMotes(g, n) {
  const P = g.player;
  for (let i = 0; i < n; i++) {
    const a = g.rng() * 2 * Math.PI, r = R.dropRingMin + g.rng() * (R.dropRingMax - R.dropRingMin);
    const x = P.pos[0] + r * Math.cos(a), z = P.pos[2] + r * Math.sin(a);
    addMote(g, [x, groundY(g, x, z, P.pos[1]), z], 'dropped', R.dropTtl);
  }
}

function movePlayer(g, input, pressed, emit) {
  const P = g.player, map = g.map;
  if (P.respawn > 0) { P.vel = [0, 0, 0]; return; } // waiting after a fall
  // camera-relative input -> world direction
  let [mx, mz] = input.move;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = (input.cam_yaw_deg * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th), wz = -mx * Math.sin(th) + mz * Math.cos(th);
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-9) P.facing = [wx / wl, wz / wl];

  if (pressed('dash') && P.dashTicks === 0 && (P.dashCd === 0 || P.charm > 0)) {
    P.dashTicks = ticks(T.dash_duration_s);
    P.dashCd = P.charm > 0 ? 0 : ticks(T.dash_cooldown_s);
    P.dashDir = [...P.facing]; // moving direction, else the way Mây faces
    emit('dash', {});
  }
  const dashing = P.dashTicks > 0;
  let vx, vz;
  if (dashing) { vx = P.dashDir[0] * T.dash_speed; vz = P.dashDir[1] * T.dash_speed; }
  else if (P.launch) [vx, vz] = P.launch; // jump-pad velocity is kept until landing
  else { const sp = P.charm > 0 ? R.charmSpeed : T.player_speed; vx = wx * sp; vz = wz * sp; }
  if (g.wind.ticks > 0) { const a = (g.wind.dir * Math.PI) / 180; vx += Math.cos(a) * R.windSpeed; vz += Math.sin(a) * R.windSpeed; }

  if (!dashing) {
    if (pressed('jump') && P.grounded) { P.vy = R.jumpSpeed; P.grounded = false; }
    if (!P.grounded) P.vy -= R.gravity / TPS;
  }
  const [x0, y0, z0] = P.pos;
  const canEnter = (x, z) => { const h = map.heightAt(x, z); return h === null || h <= y0 + (P.grounded ? R.stepUp : 1e-9); };
  let nx = x0 + vx / TPS, nz = z0 + vz / TPS;
  if (!canEnter(nx, nz)) { // walls (tier cliffs, bell tower): slide along one axis if possible
    if (canEnter(nx, z0)) nz = z0;
    else if (canEnter(x0, nz)) nx = x0;
    else { nx = x0; nz = z0; }
  }
  let ny = y0;
  const h = map.heightAt(nx, nz);
  if (P.grounded) {
    if (h === null || y0 - h > R.stepUp) { P.grounded = false; P.vy = 0; } // walked off an edge
    else ny = h;
  } else if (!dashing) {
    ny = y0 + P.vy / TPS;
    if (h !== null && ny <= h && P.vy <= 0) { ny = h; P.vy = 0; P.grounded = true; P.launch = null; }
  }
  P.vel = [(nx - x0) * TPS, (ny - y0) * TPS, (nz - z0) * TPS];
  P.pos = [nx, ny, nz];

  if (P.grounded && !dashing) for (const pad of map.pads) {
    if (dXZ(P.pos, pad.pos) <= R.padRadius && Math.abs(P.pos[1] - pad.pos[1]) < 1e-6) {
      const [ux, uz] = pad.dir ?? dirXZ(pad.pos, [pad.toward[0], 0, pad.toward[1]]);
      P.launch = [ux * pad.h, uz * pad.h];
      P.vy = pad.vy;
      P.grounded = false;
    }
  }
  if (P.pos[1] < R.fallY) { // fell off the island: once, ignores invulnerability
    P.flames--;
    const lost = P.carried;
    P.carried = 0;
    P.respawn = R.respawnWait;
    P.vel = [0, 0, 0]; P.vy = 0; P.launch = null; P.dashTicks = 0;
    emit('player_hit', { by: 'fall', flames: P.flames, dropped: 0, lost });
  }
}

/** Advance one tick (step k reads input k, produces state k+1). Returns this step's events. */
export function step(g, input) {
  if (g.state !== 'playing') return [];
  const t = g.tick + 1, events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: t, name, data });
  const pressed = (k) => !!input[k] && !g.prev[k];
  const P = g.player, map = g.map;
  const done = () => { g.prev = { ...input }; g.tick = t; return events; };

  if (g.tick === 0) emit('night_start', { night: g.night });
  // 1. Input; pause first. A tick that pauses (or stays paused) stops here.
  if (pressed('pause')) {
    if (!g.paused) { g.paused = true; emit('paused', {}); return done(); }
    g.paused = false;
    emit('resumed', {});
  } else if (g.paused) return done();

  // 2. Counters.
  g.simTick++;
  const dec = (o, k) => { if (o[k] > 0) o[k]--; };
  dec(P, 'dashCd'); dec(P, 'dashTicks'); dec(P, 'pulseCd'); dec(P, 'invuln'); dec(P, 'charm');
  if (P.respawn > 0 && --P.respawn === 0 && P.flames > 0) {
    P.pos = [...map.start]; P.vel = [0, 0, 0]; P.vy = 0; P.grounded = true; P.invuln = R.respawnInvuln;
  }
  for (const S of g.shades) {
    if (['spawning', 'recoil', 'stunned'].includes(S.state) && S.stateTicks > 0 && --S.stateTicks === 0) {
      S.state = S.state === 'stunned' ? 'wander' : afterTimer(g, S); // Ticket-03: stun always ends in wander
      S.pushLeft = 0;
    }
  }
  // 2b (Ticket-03). Fuel: lit lanterns burn 1/s, each draining shade sucks 5/s (integer 1/60 units).
  const lanternById = (id) => g.lanterns.find((L) => L.id === id);
  for (const L of g.lanterns) if (L.lit) L.fuel -= Math.round(T.fuel_decay_per_s * FUEL_UNIT / TPS);
  for (const S of [...g.shades].sort(byId)) {
    if (S.state !== 'drain') continue;
    const L = lanternById(S.lanternId);
    if (!L || !L.lit) continue;
    L.fuel -= Math.round(T.drain_per_s * FUEL_UNIT / TPS);
    if (++S.drainTicks % R.fuelEventEvery === 0) emit('fuel_drain', { lantern_id: L.id, shade_id: S.id, fuel: r1(Math.max(0, L.fuel) / FUEL_UNIT) });
  }
  // ...and right after step 2: empty lanterns go out (they remember ever_lit, deposited resets).
  for (const L of g.lanterns) {
    if (!L.lit || L.fuel > 0) continue;
    L.lit = false; L.fuel = 0; L.deposited = 0; L.everLit = true;
    emit('lantern_out', { lantern_id: L.id });
  }
  g.motes = g.motes.filter((m) => m.kind !== 'dropped' || --m.ttl > 0);
  for (const c of g.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
  for (const D of g.drifters) if (D.state === 'flee' && --D.fleeTicks <= 0) D.state = 'removed';
  if (g.windEnabled) {
    if (g.wind.ticks > 0) g.wind.ticks--;
    if (g.simTick % R.windEvery === 0) { g.wind.ticks = R.windTicks; g.wind.dir = Math.floor(g.rng() * 360); }
  }

  // 3. Move Mây (jump, dash, pads, wind), then the fall check.
  movePlayer(g, input, pressed, emit);

  // 4. Pick up motes and charms.
  if (P.respawn === 0) {
    for (const m of g.motes) {
      if (P.carried >= capacityOf(P)) break;
      if (dXZ(P.pos, m.pos) <= T.pickup_radius && Math.abs(P.pos[1] - m.pos[1]) <= R.pickupDy) {
        m.dead = true;
        P.carried++;
        emit('mote_picked', { carried: P.carried });
      }
    }
    g.motes = g.motes.filter((m) => !m.dead);
    for (const c of g.charms) {
      if (c.available && dXZ(P.pos, c.pos) <= T.pickup_radius && Math.abs(P.pos[1] - c.pos[1]) <= R.pickupDy) {
        c.available = false;
        c.respawn = R.charmRespawn;
        P.charm = R.charmTicks;
        emit('charm_picked', { charm_id: c.id, charm_ticks: R.charmTicks });
      }
    }
  }

  // 5. Interact: nearest lantern that can take light (unlit, or lit and not full); tie -> lower id.
  const newlyZoned = [];
  if (pressed('interact') && P.carried > 0 && P.respawn === 0) {
    const best = nearestLantern(g, P.pos, (L) => (!L.lit || refuelNeed(L) > 0)
      && dXZ(P.pos, L.pos) <= T.interact_radius && Math.abs(P.pos[1] - L.pos[1]) <= R.interactDy);
    if (best && !best.lit) { // light / relight (10 motes first time, 5 if it was ever lit)
      const cost = lightCost(best), amount = Math.min(P.carried, cost - best.deposited);
      P.carried -= amount;
      best.deposited += amount;
      g.score += amount * T.score.per_mote;
      emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= cost) {
        const relight = best.everLit;
        best.lit = true; best.fuel = FUEL_MAX; best.everLit = true;
        if (relight) best.relitCount++;
        P.successfulLights++;
        g.score += relight ? R.scoreRelight : T.score.per_lantern;
        emit('lantern_lit', { lantern_id: best.id, relight });
        newlyZoned.push(best);
      }
    } else if (best) { // refuel a lit lantern
      const used = Math.min(P.carried, refuelNeed(best)), before = best.fuel;
      best.fuel = Math.min(FUEL_MAX, best.fuel + FUEL_PER_MOTE * used);
      P.carried -= used;
      g.score += used * T.score.per_mote;
      emit('refuel', { lantern_id: best.id, amount: used, fuel: r1(best.fuel / FUEL_UNIT) });
      if (before < LOW_FUEL && best.fuel >= LOW_FUEL) newlyZoned.push(best);
    }
  }

  // 6. Safe zones: when a zone (re)appears (lit, or refuelled to >= 30), shades inside drift out to the edge
  //    over 30 ticks, harmless meanwhile; shades draining that lantern stop.
  for (const L of newlyZoned) for (const S of g.shades) {
    if (S.state === 'drain' && S.lanternId === L.id) { S.state = 'wander'; S.lanternId = null; }
    const d = dXZ(S.pos, L.pos);
    if (d >= T.safe_radius) continue;
    const [ux, uz] = dirXZ(L.pos, S.pos);
    S.expel = R.expelTicks;
    S.expelStep = [(ux * (T.safe_radius - d)) / R.expelTicks, (uz * (T.safe_radius - d)) / R.expelTicks];
  }

  // 7. Pulse: targets locked now (3D distance from feet + 0.8 m).
  if (pressed('pulse') && P.pulseCd === 0 && P.carried >= T.pulse_cost && P.respawn === 0) {
    P.carried -= T.pulse_cost;
    P.pulseCd = ticks(T.pulse_cooldown_s);
    const c = [P.pos[0], P.pos[1] + R.pulseCenterY, P.pos[2]];
    const ids = [];
    for (const S of [...g.shades].sort(byId)) {
      if (d3(c, S.pos) > T.pulse_radius) continue;
      g.score += S.state === 'drain' ? R.scoreStunDrain : T.score.per_stun; // 15 total if it was draining
      S.lanternId = null;
      S.state = 'stunned';
      S.stateTicks = ticks(T.pulse_stun_s);
      S.pushLeft = R.pushTicks;
      S.pushDir = dirXZ(c, S.pos);
      ids.push(S.id);
    }
    emit('pulse', { stunned_ids: ids });
    for (const D of [...g.drifters].sort(byId)) {
      if (d3(c, D.pos) > T.pulse_radius) continue;
      if (D.state === 'chase') { D.state = 'flee'; D.fleeTicks = R.drifterFleeTicks; D.stole = true; }
      else if (D.state === 'flee' && D.stolen > 0) {
        const amount = D.stolen;
        for (let i = 0; i < amount; i++) addMote(g, [D.pos[0], groundY(g, D.pos[0], D.pos[2], P.pos[1]), D.pos[2]], 'dropped', R.dropTtl);
        D.stolen = 0;
        D.fleeTicks = R.drifterDropVanish;
        emit('drifter_drop', { drifter_id: D.id, amount });
      }
    }
  }

  // 8. Move shades and drifters.
  const shadeSpeed = map.shadeSpeed / TPS;
  for (const S of g.shades) {
    if (S.expel > 0) {
      S.pos[0] += S.expelStep[0]; S.pos[2] += S.expelStep[1]; S.expel--;
      settleY(g, S, R.shadeY);
      continue;
    }
    if (S.state === 'stunned') {
      if (S.pushLeft > 0) {
        const k = T.pulse_push_m / R.pushTicks, nx = S.pos[0] + S.pushDir[0] * k, nz = S.pos[2] + S.pushDir[1] * k;
        if (inTower(g, nx, nz) || inSafe(g, nx, nz)) S.pushLeft = 0; // stop at obstacles
        else { S.pos[0] = nx; S.pos[2] = nz; S.pushLeft--; }
      }
    } else if (S.state === 'recoil') {
      const k = R.recoilDist / R.recoilTicks;
      S.pos[0] += S.recoilDir[0] * k; S.pos[2] += S.recoilDir[1] * k;
    } else if (S.state !== 'spawning') {
      const d = dXZ(S.pos, P.pos), targetable = P.respawn === 0;
      if (S.state === 'drain') { // Ticket-03: leave drain on Mây within 6 m / lantern out / fuel >= 30 / > 2 m away
        const L = lanternById(S.lanternId);
        if (targetable && d <= R.drainBreakDist) S.state = 'chase';
        else if (!L || !L.lit || L.fuel >= LOW_FUEL || dXZ(S.pos, L.pos) > R.drainRange) S.state = 'wander';
        if (S.state !== 'drain') S.lanternId = null;
      }
      if (S.state === 'wander' && targetable && d <= R.shadeDetect) S.state = 'chase';
      else if (S.state === 'chase' && (!targetable || d > R.shadeLose)) S.state = 'wander';
      if (S.state === 'chase') moveToward(S.pos, P.pos, shadeSpeed);
      else if (S.state === 'wander') {
        // Ticket-03: go to the nearest weak lit lantern (fuel < 30, tie -> lower id); else the nearest unlit one; else roam.
        const weak = nearestLantern(g, S.pos, isWeak);
        const goal = weak ?? nearestLantern(g, S.pos, (L) => !L.lit);
        S.lanternId = weak ? weak.id : null;
        if (goal) moveToward(S.pos, goal.pos, R.shadeWanderSpeed / TPS);
        else {
          if (!S.target || dXZ(S.pos, S.target) < 0.5) S.target = wanderTarget(g, S.pos, 6);
          moveToward(S.pos, S.target, R.shadeWanderSpeed / TPS);
        }
        if (weak && dXZ(S.pos, weak.pos) <= R.drainRange) { S.state = 'drain'; S.drainTicks = 0; }
      }
    }
    if (S.state !== 'spawning') { blockShade(g, S); settleY(g, S, R.shadeY); }
  }
  for (const D of g.drifters) {
    if (D.state === 'removed') continue;
    if (D.state === 'flee') {
      const [ux, uz] = dirXZ(P.pos, D.pos);
      D.pos[0] += (ux * R.drifterSpeed) / TPS; D.pos[2] += (uz * R.drifterSpeed) / TPS;
    } else {
      const wants = P.respawn === 0 && P.carried >= R.drifterChaseCarry && dXZ(D.pos, P.pos) <= R.drifterChaseDist;
      D.state = wants ? 'chase' : 'idle';
      if (wants) moveToward(D.pos, P.pos, R.drifterSpeed / TPS);
      else {
        if (!D.target || dXZ(D.pos, D.target) < 0.5) D.target = wanderTarget(g, D.pos, 8);
        moveToward(D.pos, D.target, R.drifterIdleSpeed / TPS);
      }
    }
    settleY(g, D, R.drifterY);
  }

  // 9. Contacts: drifters steal first, then at most one shade hit (ids ascending).
  if (P.respawn === 0) {
    for (const D of [...g.drifters].sort(byId)) {
      if ((D.state !== 'idle' && D.state !== 'chase') || D.stole || P.carried === 0 || dXZ(D.pos, P.pos) > R.drifterHit) continue;
      const amount = Math.min(R.drifterSteal, P.carried);
      P.carried -= amount;
      D.stolen = amount; D.stole = true; D.state = 'flee'; D.fleeTicks = R.drifterFleeTicks;
      emit('drifter_steal', { drifter_id: D.id, amount, carried: P.carried });
    }
    if (P.invuln === 0) {
      for (const S of [...g.shades].sort(byId)) {
        if ((S.state !== 'wander' && S.state !== 'chase') || S.expel > 0) continue;
        if (dXZ(S.pos, P.pos) > T.shade_hit_radius || Math.abs(S.pos[1] - P.pos[1]) > R.hitDy) continue;
        P.flames--;
        const dropped = Math.floor(P.carried * T.hit_drop_ratio);
        P.carried -= dropped;
        hitDropMotes(g, dropped);
        P.invuln = ticks(T.invuln_s);
        S.state = 'recoil'; S.stateTicks = R.recoilTicks; S.recoilDir = dirXZ(P.pos, S.pos);
        emit('player_hit', { by: 'shade', flames: P.flames, dropped });
        break;
      }
    }
  }

  // 10. Scheduled spawns (new entities interact from the next tick).
  if (g.randomMotes && g.simTick % R.moteEvery === 0 && g.motes.length < R.moteCap) {
    const taken = new Set(g.motes.map((m) => m.point));
    const free = map.motePoints.map((_, i) => i).filter((i) => !taken.has(i));
    if (free.length) addMote(g, map.motePoints[free[Math.floor(g.rng() * free.length)]]);
  }
  if (g.randomShades) {
    const n = g.simTick === R.firstShadeTick ? R.firstShadeCount
      : g.simTick > R.firstShadeTick && (g.simTick - R.firstShadeTick) % map.shadeEvery === 0 ? 1 : 0;
    for (let i = 0; i < n && g.shades.length < map.shadeMax; i++) {
      const valid = map.shadePoints.filter((p) => dXZ(p, P.pos) >= 15);
      if (!valid.length) break;
      const p = valid[Math.floor(g.rng() * valid.length)];
      const S = addShade(g, [p[0], groundY(g, p[0], p[2]) + R.shadeY, p[2]], { state: 'spawning', stateTicks: R.spawningTicks });
      emit('shade_spawned', { id: S.id });
    }
  }
  if (g.randomDrifters && g.simTick % R.drifterEvery === 0 && g.drifters.filter((D) => D.state !== 'removed').length < R.drifterMax) {
    const p = map.shadePoints[Math.floor(g.rng() * map.shadePoints.length)];
    addDrifter(g, [p[0], groundY(g, p[0], p[2]) + R.drifterY, p[2]]);
  }

  // 11. Win / lose.
  const end = (result, reason) => { g.state = result; g.result = reason; emit('game_over', { result, reason }); };
  // Ticket-03: no early win. At dawn Mây must be alive with >= ceil(0.6 x total) lanterns lit.
  if (P.flames <= 0) end('lost', 'no_flames');
  else if (timeLeft(g) <= 1e-9) {
    const lit = g.lanterns.filter((L) => L.lit);
    if (lit.length >= winThreshold(g)) {
      for (const L of lit) g.score += R.scoreDawnLantern + Math.floor(L.fuel / FUEL_UNIT);
      g.score += T.score.per_flame_left * P.flames;
      end('won', 'dawn_survived');
    } else end('lost', 'dawn');
  }

  return done();
}

export function snapshot(g) {
  const P = g.player;
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.simTick,
    night: g.night,
    state: g.state === 'playing' && g.paused ? 'paused' : g.state,
    time_left_s: r3(Math.max(0, timeLeft(g))),
    score: g.score,
    wind: { active: g.wind.ticks > 0, dir_deg: g.wind.dir },
    player: {
      pos: p3(P.pos), vel: p3(P.vel), grounded: P.grounded, flames: P.flames, carried: P.carried, capacity: capacityOf(P),
      invuln: P.invuln > 0, dash_cd_s: r3(P.dashCd / TPS), pulse_cd_s: r3(P.pulseCd / TPS), charm_s: r3(P.charm / TPS),
    },
    lanterns: g.lanterns.map((L) => ({ id: L.id, pos: p3(L.pos), lit: L.lit, deposited: L.deposited, fuel: r1(fuelOf(L)), ever_lit: L.everLit, relit_count: L.relitCount })),
    shades: g.shades.map((S) => ({ id: S.id, pos: p3(S.pos), state: S.state })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: p3(m.pos), kind: m.kind, ttl_s: m.kind === 'dropped' ? r3(m.ttl / TPS) : null })),
    drifters: g.drifters.map((D) => ({ id: D.id, pos: p3(D.pos), state: D.state, stolen: D.stolen })),
    charms: g.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: r3(c.respawn / TPS) })),
  };
}

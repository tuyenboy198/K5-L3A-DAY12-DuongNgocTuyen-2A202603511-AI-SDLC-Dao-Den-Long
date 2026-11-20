// Browser renderer. All gameplay comes from src/sim (the same code the headless CLI runs);
// this file only maps keyboard -> contract input, steps the sim at 60 Hz and draws the state.
import * as THREE from 'three';
import { createGame, step, timeLeft, mulberry32 } from '../src/sim/game.js';
import { TUNING as T, WORLD as W, TPS } from '../src/sim/config.js';
import { validateScenario } from '../src/io.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const NIGHT = new THREE.Color(0x0b0716), WARM = new THREE.Color(0x2a1a2e);
scene.background = NIGHT.clone();
scene.fog = new THREE.FogExp2(0x160b28, 0.022);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const hemi = new THREE.HemisphereLight(0x9a8cff, 0x2a1f3a, 1.1);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xaab4ff, 0.9);
moon.position.set(-30, 60, -20);
scene.add(moon);

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const island = new THREE.Mesh(new THREE.CylinderGeometry(W.islandRadius, W.islandRadius * 0.7, 8, 72), mat(0x2f4a3f));
island.position.y = -4;
scene.add(island);
const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 64), mat(0x3a2a63));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -7;
scene.add(sea);

// Decoration (render-only, own RNG so it never touches the sim).
const deco = mulberry32(2024);
for (let i = 0; i < 70; i++) {
  const r = 8 + deco() * 38, a = deco() * Math.PI * 2, x = r * Math.sin(a), z = r * Math.cos(a);
  if (Math.hypot(x, z - 25) < 4 || [...Array(5)].some((_, k) => Math.hypot(x - 25 * Math.sin(k * 1.2566), z - 25 * Math.cos(k * 1.2566)) < 4)) continue;
  const tree = deco() < 0.6;
  const m = tree
    ? new THREE.Mesh(new THREE.ConeGeometry(0.9 + deco(), 3 + deco() * 2, 7), mat(0x1f3a35))
    : new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + deco() * 0.8), mat(0x4a4458));
  m.position.set(x, tree ? 1.5 : 0.3, z);
  scene.add(m);
}

// ---------- entities ----------
function makeLantern() {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3, 10), mat(0x5b4636));
  pillar.position.y = 1.5;
  const lampMat = mat(0x8a8090, { emissive: 0xffa64d, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.9, 12), lampMat);
  lamp.position.y = 3.4;
  const light = new THREE.PointLight(0xffa64d, 0, 26, 1.2);
  light.position.y = 3.4;
  const ring = new THREE.Mesh(new THREE.RingGeometry(T.interact_radius - 0.25, T.interact_radius, 48), new THREE.MeshBasicMaterial({ color: 0xffb54d, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const safe = new THREE.Mesh(new THREE.CircleGeometry(T.safe_radius, 48), new THREE.MeshBasicMaterial({ color: 0xffb54d, transparent: true, opacity: 0, depthWrite: false }));
  safe.rotation.x = -Math.PI / 2;
  safe.position.y = 0.02;
  g.add(pillar, lamp, light, ring, safe);
  return { g, lampMat, light, ring, safe };
}

function makeMay() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.0, 12), mat(0x3d7bd9));
  body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(0xf2c9a0));
  head.position.y = 1.25;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.42, 20), mat(0xe8c770)); // nón lá
  hat.position.y = 1.62;
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffb54d });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), lanternMat);
  lantern.position.set(0.62, 1.3, 0.2);
  const light = new THREE.PointLight(0xffb54d, 2, 12, 1.2);
  light.position.copy(lantern.position);
  g.add(body, head, hat, lantern, light);
  return { g, light, lanternMat };
}

const moteGeo = new THREE.SphereGeometry(0.22, 8, 6), moteMat = new THREE.MeshBasicMaterial({ color: 0xfff08a });
const shadeGeo = new THREE.SphereGeometry(0.8, 18, 14), eyeGeo = new THREE.SphereGeometry(0.12, 8, 6), eyeMat = new THREE.MeshBasicMaterial({ color: 0xf3e8ff });
function makeShade() {
  const g = new THREE.Group();
  const m = mat(0x1a0629, { emissive: 0x3c0a5c, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
  const body = new THREE.Mesh(shadeGeo, m);
  body.scale.set(1, 1.25, 1);
  const e1 = new THREE.Mesh(eyeGeo, eyeMat), e2 = new THREE.Mesh(eyeGeo, eyeMat);
  e1.position.set(-0.25, 0.25, 0.7); e2.position.set(0.25, 0.25, 0.7);
  g.add(body, e1, e2);
  return { g, m, body };
}

const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);

// ---------- audio (creative extra, render-only) ----------
let actx = null, muted = false;
function tone(freq, dur = 0.15, type = 'sine', vol = 0.08, delay = 0) {
  if (muted) return;
  actx ??= new AudioContext();
  const t0 = actx.currentTime + delay, o = actx.createOscillator(), gn = actx.createGain();
  o.type = type; o.frequency.value = freq;
  gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(actx.destination); o.start(t0); o.stop(t0 + dur);
}

// ---------- game session ----------
let game, view, mode = 'start', acc = 0, pulseT = -1, flashT = 0;
let camYaw = 0;
const keys = new Set(), latch = new Set();

function newGame() {
  for (const L of view?.lanterns ?? []) scene.remove(L.g);
  if (view) { scene.remove(view.may.g); for (const m of view.motes.values()) scene.remove(m); for (const s of view.shades.values()) scene.remove(s.g); }
  game = createGame({ seed: Number(params.get('seed') ?? (Date.now() % 2147483647)), scenario: debugScenario });
  view = { may: makeMay(), lanterns: game.lanterns.map(() => makeLantern()), motes: new Map(), shades: new Map() };
  scene.add(view.may.g);
  game.lanterns.forEach((L, i) => { view.lanterns[i].g.position.set(L.pos[0], 0, L.pos[2]); scene.add(view.lanterns[i].g); });
  camYaw = 0; acc = 0;
  window.__game = game;
}

function startPlay() { newGame(); mode = 'play'; $('start').hidden = true; $('end').hidden = true; }

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (mode !== 'play' && (k === 'enter' || (mode === 'end' && k === 'r'))) return startPlay();
  if (k === 'm') muted = !muted;
  keys.add(k); latch.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let dragX = null;
addEventListener('pointerdown', (e) => { dragX = e.clientX; });
addEventListener('pointerup', () => { dragX = null; });
addEventListener('pointermove', (e) => { if (dragX !== null) { camYaw -= (e.clientX - dragX) * 0.3; dragX = e.clientX; } });

const btn = (k) => keys.has(k) || latch.has(k);
function currentInput() {
  // Looking along +Z (yaw 0) screen-right is world -X, so D maps to move.x = -1.
  const x = (btn('a') ? 1 : 0) - (btn('d') ? 1 : 0);
  const z = (btn('w') ? 1 : 0) - (btn('s') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: btn(' '), interact: btn('e'), pulse: btn('f'), dash: false };
}

function onEvent(e) {
  switch (e.name) {
    case 'mote_picked': tone(880 + e.data.carried * 40, 0.12); break;
    case 'deposit': tone(520, 0.2, 'triangle'); break;
    case 'lantern_lit': [523, 659, 784].forEach((f, i) => tone(f, 0.6, 'triangle', 0.07, i * 0.08)); break;
    case 'pulse': pulseT = 0; tone(300, 0.35, 'sine', 0.1); break;
    case 'player_hit': flashT = 0.35; tone(110, 0.3, 'sawtooth', 0.08); break;
    case 'game_over': endGame(e.data); break;
  }
}

function endGame({ result, reason }) {
  mode = 'end';
  const lit = game.lanterns.filter((L) => L.lit).length;
  $('end-title').textContent = result === 'won' ? 'Đảo đã sáng trở lại!' : 'Đêm vẫn còn tối…';
  const why = { all_lit: 'Bạn đã thắp cả 5 Đèn Lồng Lớn.', dawn: 'Bình minh tới trước khi thắp hết đèn.', no_flames: 'Mây đã hết ngọn lửa.' }[reason];
  $('end-detail').textContent = `${why} Đèn: ${lit}/5 · Điểm: ${game.score}`;
  $('end').hidden = false;
}

// ---------- frame ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), now = clock.elapsedTime;
  if (keys.has('arrowleft')) camYaw += 90 * dt;
  if (keys.has('arrowright')) camYaw -= 90 * dt;
  if (mode === 'play') {
    acc += dt;
    while (acc >= 1 / TPS && mode === 'play') {
      for (const e of step(game, currentInput())) onEvent(e);
      latch.clear();
      acc -= 1 / TPS;
    }
  }
  if (game) draw(now, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function draw(now, dt) {
  const P = game.player, lit = game.lanterns.filter((L) => L.lit).length;
  // Mây
  const may = view.may;
  may.g.position.set(P.pos[0], P.pos[1], P.pos[2]);
  const inp = currentInput();
  if (mode === 'play' && (inp.move[0] || inp.move[1])) {
    const th = (camYaw * Math.PI) / 180;
    const wx = inp.move[0] * Math.cos(th) + inp.move[1] * Math.sin(th), wz = -inp.move[0] * Math.sin(th) + inp.move[1] * Math.cos(th);
    may.g.rotation.y = Math.atan2(wx, wz);
  }
  // Creative: Mây's hat lantern glows brighter with every firefly carried; blinks while invulnerable.
  may.light.intensity = 1.5 + P.carried * 0.6;
  may.g.visible = P.invuln === 0 || Math.floor(now * 12) % 2 === 0;

  // Lanterns + island brightening with each lit lantern
  game.lanterns.forEach((L, i) => {
    const v = view.lanterns[i];
    v.lampMat.emissiveIntensity = L.lit ? 2.2 : 0.15 * (L.deposited / T.lantern_cost);
    v.light.intensity = L.lit ? 9 : 0;
    v.ring.visible = !L.lit;
    v.ring.material.opacity = 0.25 + 0.5 * (L.deposited / T.lantern_cost);
    v.safe.material.opacity = L.lit ? 0.12 : 0;
  });
  hemi.intensity = 1.1 + lit * 0.25;
  scene.fog.density = 0.022 - lit * 0.003;
  scene.background.copy(NIGHT).lerp(WARM, lit / 5);

  // Motes
  const alive = new Set();
  for (const m of game.motes) {
    alive.add(m.id);
    let mesh = view.motes.get(m.id);
    if (!mesh) { mesh = new THREE.Mesh(moteGeo, moteMat); scene.add(mesh); view.motes.set(m.id, mesh); }
    mesh.position.set(m.pos[0], 0.7 + Math.sin(now * 3 + m.pos[0]) * 0.2, m.pos[2]);
  }
  for (const [id, mesh] of view.motes) if (!alive.has(id)) { scene.remove(mesh); view.motes.delete(id); }

  // Shades
  for (const s of game.shades) {
    let v = view.shades.get(s.id);
    if (!v) { v = makeShade(); scene.add(v.g); view.shades.set(s.id, v); }
    v.g.position.set(s.pos[0], s.pos[1] + Math.sin(now * 2 + s.pos[2]) * 0.15, s.pos[2]);
    v.g.lookAt(tmp.set(P.pos[0], s.pos[1], P.pos[2]));
    const stunned = s.stun > 0;
    v.m.color.setHex(stunned ? 0x8f7bd6 : 0x1a0629);
    v.body.scale.y = stunned ? 0.85 : 1.25;
  }

  // Pulse ring
  if (pulseT >= 0) {
    pulseT += dt;
    const k = Math.min(pulseT / 0.4, 1);
    pulseRing.position.set(P.pos[0], 0.1, P.pos[2]);
    pulseRing.scale.setScalar(Math.max(0.01, k * T.pulse_radius));
    pulseRing.material.opacity = 0.8 * (1 - k);
    if (k >= 1) pulseT = -1;
  }
  flashT = Math.max(0, flashT - dt);
  $('flash').style.opacity = String(flashT);

  // Camera behind Mây
  const th = (camYaw * Math.PI) / 180;
  camera.position.set(P.pos[0] - Math.sin(th) * 9, P.pos[1] + 5.5, P.pos[2] - Math.cos(th) * 9);
  camera.lookAt(P.pos[0], P.pos[1] + 1.2, P.pos[2]);

  // HUD
  const tl = Math.max(0, timeLeft(game));
  $('h-flames').textContent = '🔥'.repeat(P.flames) || '0';
  $('h-carried').textContent = `${P.carried} / ${T.carry_capacity}`;
  $('h-lit').textContent = `${lit} / ${T.lantern_count_night1}`;
  $('h-time').textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  $('h-score').textContent = String(game.score);
  $('h-pulse').textContent = P.carried < T.pulse_cost ? `cần ${T.pulse_cost} đom đóm` : P.pulseCd > 0 ? 'đang hồi' : 'sẵn sàng (F)';
  let hint = '';
  if (mode === 'play') {
    const nearLantern = game.lanterns.find((L) => !L.lit && Math.hypot(L.pos[0] - P.pos[0], L.pos[2] - P.pos[2]) <= T.interact_radius);
    if (nearLantern && P.carried > 0) hint = `Nhấn E để nạp đèn ${nearLantern.id} (${nearLantern.deposited}/${T.lantern_cost})`;
    else if (game.shades.some((s) => s.stun === 0 && Math.hypot(s.pos[0] - P.pos[0], s.pos[2] - P.pos[2]) <= T.pulse_radius) && P.carried >= T.pulse_cost && P.pulseCd === 0) hint = 'Bóng Mực tới gần! Nhấn F để tỏa sáng';
    else if (P.carried >= T.lantern_cost) hint = 'Mang đom đóm tới Đèn Lồng Lớn (vòng sáng cam)';
  }
  $('hint').textContent = hint;
  $('hint').hidden = !hint;
}

// ?scenario=../scenarios/x.scenario.json loads the same setup a headless test uses (screenshots/debug).
let debugScenario = {};
if (params.get('scenario')) debugScenario = validateScenario(await (await fetch(params.get('scenario'))).json(), ['L1', 'L2', 'L3', 'L4', 'L5']);
newGame();
if (params.has('autostart')) startPlay();
frame();

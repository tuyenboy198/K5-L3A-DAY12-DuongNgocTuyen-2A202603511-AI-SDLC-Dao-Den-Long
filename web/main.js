// Browser renderer + game shell. All gameplay comes from src/sim (the same code the headless CLI runs);
// this file maps keyboard -> contract input, steps the sim at 60 Hz, draws it, and runs menus/HUD/audio.
// Everything here is cosmetic or UI and never feeds back into the sim.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGame, step, timeLeft, mulberry32, windWarning, winThreshold, capacityOf, DEFAULT_INPUT } from '../src/sim/game.js';
import { createBenchGame } from '../src/sim/bench.js';
import { benchStats } from '../src/bench-stats.js';
import { validName, normalizeName, addEntry, rank } from '../src/leaderboard.js';
import { TUNING as T, RULES as R, TPS } from '../src/sim/config.js';
import { MAPS } from '../src/sim/maps.js';
import { validateScenario, validateInputs, inputTimeline } from '../src/io.js';

// Ticket-02 standard palette (materials use these as base colours).
const C = {
  sky: 0x0e1430, mist: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lit: 0xffb347, core: 0xffe9b0, unlit: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shade: 0x120a1a, shadeRim: 0x7a3cff, stunned: 0x3a3450, robe: 0xe8e2d0, red: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8,
};
const STORY = {
  1: 'Ông Đăng: "Mây à, sương đen về rồi. Đèn bây giờ cạn dầu dần, Bóng Mực còn hút dầu nữa. Giữ ít nhất 3 ngọn đèn ở Bến sáng tới bình minh nhé."',
  2: 'Ông Đăng: "Đảo Cau có hai bờ, nối nhau bằng cầu tre. Bục nhảy sẽ đưa con qua lại. Coi chừng Gió Lạc, nó mê ánh sáng lắm."',
  3: 'Ông Đăng: "Đảo Chuông cao và lộng gió. Lên dốc, lên bục nhảy tới tháp chuông. Gió mạnh tới thì có lá bay báo trước."',
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const angleDamp = (a, b, rate, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt));
const rand = (a, b) => a + Math.random() * (b - a); // cosmetic only, never used by the sim

// ---------- settings (persisted per browser) ----------
// Ticket-04 §4: every action can be rebound (saved); Esc always pauses and cancels a rebind.
const DEFAULT_KEYS = { up: 'w', down: 's', left: 'a', right: 'd', jump: ' ', dash: 'shift', interact: 'e', pulse: 'f', pause: 'p' };
const ACTION_NAMES = { up: 'Chạy tới', down: 'Chạy lùi', left: 'Sang trái', right: 'Sang phải', jump: 'Nhảy', dash: 'Lướt', interact: 'Nạp ánh sáng / châm dầu', pulse: 'Tỏa Sáng', pause: 'Tạm dừng' };
const KEY_NAMES = { ' ': 'Space', shift: 'Shift', control: 'Ctrl', alt: 'Alt', enter: 'Enter', tab: 'Tab', backspace: 'Backspace', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' };
const keyLabel = (k) => KEY_NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const settings = { volume: 70, sens: 100, colorblind: false, captions: true, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, bigText: false, keys: { ...DEFAULT_KEYS } };
try { const saved = JSON.parse(localStorage.getItem('ddl-settings') ?? '{}'); Object.assign(settings, saved, { keys: { ...DEFAULT_KEYS, ...saved.keys } }); } catch { /* private mode: defaults */ }
if (params.has('cb')) settings.colorblind = true; // screenshots / review of the colour-blind palette
if (params.has('big')) settings.bigText = true;
const saveSettings = () => { try { localStorage.setItem('ddl-settings', JSON.stringify(settings)); } catch { /* ignore */ } };

// ---------- renderer ----------
const PR = Math.min(devicePixelRatio, 2);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping; // keep the standard palette faithful
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(C.mist, 0.0075);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
const composer = new EffectComposer(renderer);
composer.setPixelRatio(PR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const ambient = new THREE.AmbientLight(0xffffff, 0.15); // intensity = 0.15 + 0.55 × lit/total (Ticket-02)
const moonLight = new THREE.DirectionalLight(0xc8d0ff, 1.0);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
Object.assign(moonLight.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 160 });
moonLight.shadow.bias = -0.0005;
const fill = new THREE.HemisphereLight(0x5a6cb0, 0x1b2350, 0.35);
scene.add(ambient, moonLight, moonLight.target, fill);

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
const glowSprite = (color, scale, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale);
  return s;
};
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const shadowed = (m, cast = true, receive = false) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

// ---------- particles ----------
class Particles {
  constructor(max, blending) {
    this.list = [];
    this.max = max;
    const g = (this.geo = new THREE.BufferGeometry());
    this.a = { position: new Float32Array(max * 3), aColor: new Float32Array(max * 3), aSize: new Float32Array(max), aAlpha: new Float32Array(max) };
    for (const [k, arr] of Object.entries(this.a)) g.setAttribute(k, new THREE.BufferAttribute(arr, arr.length === max ? 1 : 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: GLOW }, uScale: { value: innerHeight * PR * 0.6 } },
      transparent: true, depthWrite: false, blending,
      vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;'
        + 'void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(-mv.z,0.1); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D uMap; varying vec3 vC; varying float vA; void main(){ float a=texture2D(uMap,gl_PointCoord).a*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }',
    });
    const pts = new THREE.Points(g, this.mat);
    g.userData.points = pts;
    pts.frustumCulled = false;
    scene.add(pts);
  }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    const life = o.life ?? 1;
    this.list.push({ p: o.pos.clone(), from: o.pos.clone(), v: o.vel?.clone() ?? new THREE.Vector3(), c: new THREE.Color(o.color ?? C.lit),
      life, max: life, size: o.size ?? 0.5, g: o.gravity ?? 0, drag: o.drag ?? 0, to: o.to, arc: o.arc ?? 1.2, delay: o.delay ?? 0, onArrive: o.onArrive });
  }
  clear() { this.list = []; }
  // direct mode (no simulation): begin(), put(...) per glow, end() — used for shade auras
  begin() { this.n = 0; }
  put(x, y, z, c, size, alpha) {
    if (this.n >= this.max) return;
    const n = this.n++;
    this.a.position[n * 3] = x; this.a.position[n * 3 + 1] = y; this.a.position[n * 3 + 2] = z;
    this.a.aColor[n * 3] = c.r; this.a.aColor[n * 3 + 1] = c.g; this.a.aColor[n * 3 + 2] = c.b;
    this.a.aSize[n] = size; this.a.aAlpha[n] = alpha;
  }
  end() { this.geo.setDrawRange(0, this.n); for (const k in this.a) this.geo.attributes[k].needsUpdate = true; }
  update(dt) {
    let n = 0;
    const keep = [];
    for (const q of this.list) {
      if (q.delay > 0) { q.delay -= dt; keep.push(q); continue; }
      q.life -= dt;
      if (q.life <= 0) { q.onArrive?.(); continue; }
      keep.push(q);
      const t = 1 - q.life / q.max;
      if (q.to) { const e = t * t * (3 - 2 * t); q.p.lerpVectors(q.from, q.to(), e); q.p.y += Math.sin(Math.PI * t) * q.arc; }
      else { q.v.y -= q.g * dt; q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt)); q.p.addScaledVector(q.v, dt); }
      this.a.position.set([q.p.x, q.p.y, q.p.z], n * 3);
      this.a.aColor.set([q.c.r, q.c.g, q.c.b], n * 3);
      this.a.aSize[n] = q.size * (q.to ? 1 - 0.4 * t : 1);
      this.a.aAlpha[n] = q.to ? 1 : Math.min(1, (1 - t) * 1.4);
      n++;
    }
    this.list = keep;
    this.geo.setDrawRange(0, n);
    for (const k in this.a) this.geo.attributes[k].needsUpdate = true;
  }
}
const sparks = new Particles(1500, THREE.AdditiveBlending);
const ink = new Particles(600, THREE.NormalBlending);
const burst = (pos, n, { color = C.lit, speed = 4, up = 2, life = 1, size = 0.45, gravity = 3, drag = 1.5 } = {}) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
    sparks.emit({ pos, vel: new THREE.Vector3(Math.cos(a) * s, rand(0.2, 1) * up, Math.sin(a) * s), color, life: life * rand(0.6, 1.2), size: size * rand(0.6, 1.3), gravity, drag });
  }
};
const inkBurst = (pos, n, speed = 2.5) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
    ink.emit({ pos, vel: new THREE.Vector3(Math.cos(a) * s, rand(-0.3, 1.2), Math.sin(a) * s), color: C.shade, life: rand(0.5, 1.1), size: rand(0.5, 1.1), drag: 2 });
  }
};

// ---------- sky (persistent) ----------
const skyGroup = new THREE.Group();
scene.add(skyGroup);
const skyU = { uTop: { value: new THREE.Color(C.sky) }, uHor: { value: scene.fog.color }, uTime: { value: 0 } };
skyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform float uTime; varying vec3 vP;
    void main(){ float h=vP.y; vec3 c=mix(uHor,uTop,smoothstep(0.0,0.35,h));
      c+=uHor*0.35*exp(-pow((h-0.08-0.02*sin(atan(vP.z,vP.x)*3.0+uTime*0.05))*10.0,2.0));
      gl_FragColor=vec4(c,1.0); }`,
})));
function starLayer(count, size, seed) {
  const r = mulberry32(seed), pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 * Math.PI, v = 0.06 + r() * 0.94, Rr = 850, cy = Math.sqrt(1 - v * v);
    pos.set([Math.cos(u) * cy * Rr, v * Rr, Math.sin(u) * cy * Rr], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, map: GLOW, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: 0xfff4e0 });
  skyGroup.add(new THREE.Points(g, m));
  return m;
}
const stars = [starLayer(1300, 2.2, 11), starLayer(400, 3.6, 12), starLayer(90, 6, 13)];
const moonDir = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
const moon = new THREE.Mesh(new THREE.SphereGeometry(24, 32, 16), new THREE.MeshBasicMaterial({ color: C.core, fog: false }));
moon.position.copy(moonDir).multiplyScalar(780);
const moonHalo = glowSprite(0x9fb0ff, 380, 0.45);
moonHalo.material.fog = false;
moonHalo.position.copy(moon.position);
skyGroup.add(moon, moonHalo);

const seaGeo = new THREE.PlaneGeometry(1600, 1600, 70, 70);
const sea = new THREE.Mesh(seaGeo, mat(C.sea, { flatShading: true, roughness: 1, emissive: C.sea, emissiveIntensity: 0.5 }));
sea.rotation.x = -Math.PI / 2;
sea.position.set(35, -16, 0);
scene.add(sea);
const seaBase = Float32Array.from(seaGeo.attributes.position.array);
function waveSea(t) {
  const p = seaGeo.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const x = seaBase[i], y = seaBase[i + 1];
    p[i + 2] = Math.sin(x * 0.02 + t * 0.35) * 2.2 + Math.cos(y * 0.025 - t * 0.25) * 1.8 + Math.sin((x + y) * 0.05 + t * 0.6) * 0.6;
  }
  seaGeo.attributes.position.needsUpdate = true;
  seaGeo.computeVertexNormals();
}
const puffs = new THREE.Group();
{
  const deco = mulberry32(77), puffMat = mat(0x2c5a70, { roughness: 1, emissive: 0x14304a, emissiveIntensity: 0.7, flatShading: true });
  for (let i = 0; i < 60; i++) {
    const a = deco() * Math.PI * 2, r = 80 + deco() * 260, cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + deco() * 5, 1), puffMat);
      s.position.set((deco() - 0.5) * 12, deco() * 3, (deco() - 0.5) * 8);
      cl.add(s);
    }
    cl.position.set(35 + Math.cos(a) * r, -13 + deco() * 4, Math.sin(a) * r);
    puffs.add(cl);
  }
}
scene.add(puffs);

// ---------- world per night ----------
let world = null;
function grassGeo(geo, seed) {
  const r = mulberry32(seed), c = new THREE.Color(), base = new THREE.Color(C.grass), cols = [];
  for (let i = 0; i < geo.attributes.position.count; i++) { c.copy(base).offsetHSL(0, 0, (r() - 0.5) * 0.04); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return geo;
}
function buildWorld(map) {
  if (world) { scene.remove(world.group); world.group.traverse((o) => { o.geometry?.dispose?.(); }); }
  const group = new THREE.Group(), occluders = [], swaying = [], deco = mulberry32(100 + map.night);
  const grassMat = mat(0xffffff, { vertexColors: true, roughness: 1 }), rockMat = mat(0x3d3f5a, { flatShading: true }), sandMat = mat(C.sand, { roughness: 1 });
  for (const [i, isl] of map.islands.entries()) {
    const top = shadowed(new THREE.Mesh(grassGeo(new THREE.CylinderGeometry(isl.r, isl.r, 1, 96, 1), i + map.night * 10), grassMat), false, true);
    top.position.set(isl.c[0], -0.5, isl.c[1]);
    const beach = shadowed(new THREE.Mesh(new THREE.RingGeometry(isl.r - 2.2, isl.r, 96), sandMat), false, true);
    beach.rotation.x = -Math.PI / 2; beach.position.set(isl.c[0], 0.01, isl.c[1]);
    const cliff = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 0.86, 6, 72, 2), rockMat), false, true);
    cliff.position.set(isl.c[0], -4, isl.c[1]);
    const under = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.86, isl.r * 0.7, 36, 3), rockMat);
    under.rotation.x = Math.PI; under.position.set(isl.c[0], -7 - isl.r * 0.35, isl.c[1]);
    group.add(top, beach, cliff, under);
    for (let k = 0; k < 14; k++) { // glowing crystals under the island
      const a = deco() * Math.PI * 2, rr = deco() * isl.r * 0.6;
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + deco()), new THREE.MeshBasicMaterial({ color: deco() < 0.5 ? 0x7a9cff : C.shadeRim }));
      cr.scale.y = 2.2;
      cr.position.set(isl.c[0] + Math.cos(a) * rr, -8 - deco() * isl.r * 0.3, isl.c[1] + Math.sin(a) * rr);
      group.add(cr);
    }
  }
  if (map.bridge) { // bamboo bridge, no railings
    const plankMat = mat(C.wood, { roughness: 0.9 });
    for (let x = map.bridge.x[0]; x <= map.bridge.x[1]; x += 0.55) {
      const p = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 4), plankMat), true, true);
      p.position.set(x, -0.07, 0); p.rotation.y = (deco() - 0.5) * 0.04;
      group.add(p);
    }
    for (const x of [map.bridge.x[0], map.bridge.x[1]]) for (const z of [-2, 2]) {
      const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 6), plankMat)); post.position.set(x, 0.4, z); group.add(post);
    }
  }
  if (map.night === 3) {
    const shape = new THREE.Shape(); // tier 1: half annulus r 12..24 on z > 0 (shape y = -z, see rotation)
    shape.absarc(0, 0, 24, 0, -Math.PI, true);
    shape.absarc(0, 0, 12, -Math.PI, 0, false);
    const tier1 = shadowed(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 48 }), [grassMat, rockMat]), true, true);
    tier1.rotation.x = -Math.PI / 2;
    grassGeo(tier1.geometry, 31);
    const tier2 = shadowed(new THREE.Mesh(grassGeo(new THREE.CylinderGeometry(8, 8, 6, 64), 32), [rockMat, grassMat, rockMat]), true, true);
    tier2.position.y = 3;
    const tower = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 24), mat(0x8a7f74, { flatShading: true })), true, true);
    tower.position.y = 10;
    const roof = shadowed(new THREE.Mesh(new THREE.ConeGeometry(3, 2.2, 8), mat(0x7a2a22, { flatShading: true })));
    roof.position.y = 15.1;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(C.gold, { metalness: 0.6, roughness: 0.3, emissive: C.gold, emissiveIntensity: 0.3 }));
    bell.position.y = 14.6;
    group.add(tier1, tier2, tower, roof, bell);
    for (const d of map.ramps) { // 6 m long, 3 m wide, r 30 (Y 0) -> r 24 (Y 3)
      const a = (d * Math.PI) / 180;
      const ramp = shadowed(new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.3, 3), sandMat), true, true);
      ramp.rotation.order = 'YZX';
      ramp.rotation.y = -a; ramp.rotation.z = -Math.atan2(3, 6);
      ramp.position.set(27 * Math.cos(a), 1.5 - 0.15, 27 * Math.sin(a));
      group.add(ramp);
    }
  }
  for (const pad of map.pads) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(R.padRadius, R.padRadius, 0.16, 24), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.9 }));
    p.position.set(pad.pos[0], pad.pos[1] + 0.08, pad.pos[2]);
    const g = glowSprite(C.gold, 3, 0.5); g.position.set(pad.pos[0], pad.pos[1] + 0.5, pad.pos[2]);
    group.add(p, g);
  }
  // decoration on flat ground away from gameplay spots
  const spots = [...map.lanterns.map((L) => L.pos), ...map.motePoints, ...map.pads.map((p) => p.pos), ...map.charms, map.start];
  const flat = (x, z) => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => map.heightAt(x + dx, z + dz) === 0);
  for (let i = 0; i < 120 && occluders.length < 28; i++) {
    const isl = map.islands[Math.floor(deco() * map.islands.length)];
    const a = deco() * Math.PI * 2, r = 4 + deco() * (isl.r - 7), x = isl.c[0] + r * Math.cos(a), z = isl.c[1] + r * Math.sin(a);
    if (!flat(x, z) || Math.hypot(x - map.start[0], z - map.start[2]) < 12 || spots.some((s) => Math.hypot(s[0] - x, s[2] - z) < 4.5) || (map.bridge && Math.abs(z) < 4 && x > 22 && x < 48)) continue;
    let o;
    if (deco() < 0.6) {
      o = new THREE.Group();
      const h = 2 + deco() * 1.8;
      const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, h * 0.4, 6), mat(C.wood)));
      trunk.position.y = h * 0.2; o.add(trunk);
      for (let k = 0; k < 3; k++) {
        const cone = shadowed(new THREE.Mesh(new THREE.ConeGeometry(h * (0.42 - k * 0.1), h * 0.45, 8), mat(k % 2 ? 0x244c42 : 0x1f443b, { flatShading: true })));
        cone.position.y = h * (0.42 + k * 0.22); o.add(cone);
      }
      o.userData.phase = deco() * 6;
      swaying.push(o);
    } else {
      o = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + deco() * 0.8), mat(0x4d4f66, { flatShading: true })), true, true);
      o.rotation.set(deco() * 3, deco() * 3, 0);
    }
    o.position.set(x, o.isMesh ? 0.15 : 0, z);
    occluders.push(o);
    group.add(o);
  }
  scene.add(group);
  world = { group, occluders, swaying };
}

// ---------- entities ----------
function makeLantern() {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.45, 8), mat(0x4d4f66, { flatShading: true })), true, true);
  base.position.y = 0.22;
  const pillar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.1, 10), mat(C.wood)));
  pillar.position.y = 1.9;
  const lamp = new THREE.Group();
  lamp.position.y = 3.45;
  const paperMat = mat(C.unlit, { emissive: C.lit, emissiveIntensity: 0, roughness: 0.6 });
  const paper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.9, 16), paperMat));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: C.core }));
  core.visible = false;
  const capMat = mat(0x6a2620);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.14, 16), capMat); top.position.y = 0.52;
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.3, 0.12, 16), capMat); bot.position.y = -0.5;
  const roof = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 6), mat(0x7a2a22, { flatShading: true }))); roof.position.y = 0.85;
  const halo = glowSprite(C.lit, 4.5, 0);
  const light = new THREE.PointLight(C.lit, 0, 30, 1.3);
  lamp.add(paper, core, top, bot, roof, halo, light);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: GLOW, color: C.lit, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06; pool.scale.setScalar(T.safe_radius * 3);
  const ringBase = new THREE.Mesh(new THREE.RingGeometry(T.interact_radius - 0.2, T.interact_radius, 64), new THREE.MeshBasicMaterial({ color: C.lit, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  ringBase.rotation.x = -Math.PI / 2; ringBase.position.y = 0.05;
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: C.core, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  const safe = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.07, T.safe_radius + 0.07, 128), new THREE.MeshBasicMaterial({ color: C.lit, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  safe.rotation.x = -Math.PI / 2; safe.position.y = 0.07;
  const orbit = new THREE.Group();
  for (let k = 0; k < 6; k++) orbit.add(glowSprite(C.moteHalo, 0.35, 0));
  orbit.position.y = 3.4;
  // Ticket-03: torn paper on unlit lanterns (shape cue, not colour) + a fuel bar above lit ones.
  const tear = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.12, 0.25, 0), new THREE.Vector3(0.02, -0.05, 0), new THREE.Vector3(0.14, 0.2, 0), new THREE.Vector3(0.04, -0.3, 0), new THREE.Vector3(-0.06, 0.02, 0)]).setIndex([0, 1, 4, 1, 2, 3]),
    new THREE.MeshBasicMaterial({ color: 0x0b0d18, side: THREE.DoubleSide }));
  tear.position.set(0, 0.05, 0.47);
  lamp.add(tear);
  const bar = new THREE.Group();
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.16), new THREE.MeshBasicMaterial({ color: 0x0e1430, transparent: true, opacity: 0.8, depthWrite: false }));
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.1), new THREE.MeshBasicMaterial({ color: C.lit, transparent: true, depthWrite: false }));
  barFill.position.z = 0.01;
  bar.add(barBg, barFill);
  bar.position.y = 4.75;
  g.add(base, pillar, lamp, pool, ringBase, ring, safe, orbit, bar);
  return { g, lamp, paperMat, core, halo, light, pool, ring, ringBase, safe, orbit, tear, bar, barFill, shown: -1, litT: -1, pulse: 0, barrier: 0, wasLit: false, drainT: 0 };
}
const lampWorld = (v) => v.lamp.getWorldPosition(new THREE.Vector3());

function makeMay() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const robe = shadowed(new THREE.Mesh(new THREE.LatheGeometry([[0.44, 0], [0.42, 0.12], [0.33, 0.55], [0.24, 0.9], [0, 0.98]].map(([x, y]) => new THREE.Vector2(x, y)), 20), mat(C.robe)));
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 6, 20), mat(C.red)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.95;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.04), mat(C.red)); tail.position.set(0.12, 0.72, -0.26);
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), mat(0xf6d2ad)));
  head.position.y = 1.22;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1d1424 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeM), e2 = e1.clone();
  e1.position.set(-0.1, 1.25, 0.27); e2.position.set(0.1, 1.25, 0.27);
  const hat = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.46, 32), mat(C.sand, { roughness: 0.7 })));
  hat.position.y = 1.64;
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, x] of [[armL, -0.3], [armR, 0.3]]) {
    const m = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.32, 4, 8), mat(C.robe)));
    m.position.y = -0.2;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), mat(0xf6d2ad)); hand.position.y = -0.42;
    arm.add(m, hand);
    arm.position.set(x, 0.85, 0);
    arm.rotation.z = x < 0 ? -0.18 : 0.18;
  }
  const footL = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0x2a2030))), footR = footL.clone();
  footL.scale.set(1, 0.6, 1.4); footR.scale.copy(footL.scale);
  footL.position.set(-0.15, 0.06, 0); footR.position.set(0.15, 0.06, 0);
  const pivot = new THREE.Group();
  pivot.position.set(0.62, 1.52, 0.3);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), mat(0x3a2a20)); string.position.y = -0.15;
  const lanternMat = mat(C.core, { emissive: C.lit, emissiveIntensity: 2.2 });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.2, 10), lanternMat); lantern.position.y = -0.38;
  const lanternGlow = glowSprite(C.lit, 1.4, 0.8); lanternGlow.position.y = -0.38;
  const light = new THREE.PointLight(C.lit, 3, 14, 1.3); light.position.y = -0.38;
  pivot.add(string, lantern, lanternGlow, light);
  const charmAura = glowSprite(C.red, 2.4, 0); charmAura.position.y = 0.8;
  body.add(robe, scarf, tail, head, e1, e2, hat, armL, armR, pivot, charmAura);
  g.add(footL, footR);
  return { g, body, armL, armR, footL, footR, pivot, lantern, lanternMat, lanternGlow, light, charmAura, phase: 0, swing: new THREE.Vector2(), swingV: new THREE.Vector2(), yaw: 0, prev: new THREE.Vector3(), squash: 0, hitT: 0, flash: 0, wasAir: false };
}
const mayLanternWorld = () => view.may.lantern.getWorldPosition(new THREE.Vector3());

function makeMote(kind) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: C.moteCore })));
  const halo = glowSprite(C.moteHalo, kind === 'dropped' ? 0.9 : 1.1, 0.9);
  g.add(halo);
  g.userData = { ph: Math.random() * 6, halo };
  return g;
}

// Shades are drawn instanced (one draw call per part for all shades) so 200 of them stay fast (Ticket-04 bench).
const SPRITE_TO_POINT = 1.6; // glow sprite world size -> Particles aSize (same on-screen size)
const shadeGfx = (() => {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: C.shadeRim, emissiveIntensity: 0.18, roughness: 0.3 });
  const mk = (geo, m, k, shadow = false) => {
    const im = new THREE.InstancedMesh(geo, m, k);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = shadow; im.count = 0;
    im.setColorAt(0, new THREE.Color());
    scene.add(im);
    return im;
  };
  const parts = (cap) => ({
    cap,
    body: mk(new THREE.SphereGeometry(0.85, 28, 20), bodyMat, cap, true),
    tails: mk(new THREE.ConeGeometry(0.28, 1.1, 10), bodyMat, cap * 4),
    rim: mk(new THREE.SphereGeometry(0.93, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), cap),
    eyes: mk(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), cap * 2),
  });
  const g = { ...parts(16), bodyMat, auras: new Particles(16 * 4, THREE.AdditiveBlending) };
  g.ensure = (n) => { // grow capacity when needed (bench: 200)
    if (n <= g.cap) return;
    for (const k of ['body', 'tails', 'rim', 'eyes']) { scene.remove(g[k]); g[k].dispose(); }
    Object.assign(g, parts(Math.max(n, g.cap * 2)));
    scene.remove(g.auras.geo.userData.points);
    g.auras = new Particles(g.cap * 4, THREE.AdditiveBlending);
  };
  return g;
})();
// dummy hierarchy used to compose each shade's part matrices
const sd = { outer: new THREE.Object3D(), inner: new THREE.Object3D(), body: new THREE.Object3D(), rim: new THREE.Object3D(), tails: [0, 1, 2, 3].map(() => new THREE.Object3D()), eyes: [0, 1].map(() => new THREE.Object3D()) };
sd.outer.add(sd.inner); sd.inner.add(sd.body, sd.rim, ...sd.tails, ...sd.eyes);
sd.eyes[0].position.set(-0.27, 0.18, 0.72); sd.eyes[1].position.set(0.27, 0.18, 0.72);
const makeShade = () => ({ pos: new THREE.Vector3(), yaw: 0, spin: 0, inkT: 0, prev: null, flinch: 0, ph: Math.random() * 6 });

function makeDrifter() { // grey-blue silk ribbon
  const geo = new THREE.PlaneGeometry(2.6, 0.38, 20, 1);
  const m = new THREE.Mesh(geo, mat(C.drifter, { side: THREE.DoubleSide, emissive: C.drifter, emissiveIntensity: 0.35, transparent: true, opacity: 0.95, roughness: 0.4 }));
  const loot = glowSprite(C.moteHalo, 1.2, 0);
  const g = new THREE.Group();
  g.add(m, loot);
  return { g, m, geo, base: Float32Array.from(geo.attributes.position.array), loot, ph: Math.random() * 6, prev: null };
}

function makeCharm() { // red paper charm with a gold border
  const g = new THREE.Group();
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.92, 0.03), mat(C.gold, { emissive: C.gold, emissiveIntensity: 0.4 }));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.05), mat(C.red, { emissive: C.red, emissiveIntensity: 0.5 }));
  const glow = glowSprite(C.red, 2, 0.6);
  g.add(border, paper, glow);
  return g;
}

const pulseRings = [0, 1].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 96), new THREE.MeshBasicMaterial({ color: C.core, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  r.rotation.x = -Math.PI / 2;
  scene.add(r);
  return r;
});

// ---------- audio: synthesised music + effects, master volume from settings ----------
let actx = null, master = null, gestured = false, musicOn = false;
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => { gestured = true; startMusic(); }, { capture: true });
function audio() {
  if (!gestured) return null;
  try {
    if (!actx) { actx = new AudioContext(); master = actx.createGain(); master.connect(actx.destination); }
    master.gain.value = settings.volume / 100;
    return actx;
  } catch { return null; }
}
function tone(freq, dur = 0.15, type = 'sine', vol = 0.08, delay = 0, slide = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay, o = a.createOscillator(), gn = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur = 0.6, vol = 0.05, freq = 600) { // wind / whoosh
  const a = audio();
  if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; gn.gain.value = vol;
  src.connect(f).connect(gn).connect(master); src.start();
}
function startMusic() { // night pad + sparse pentatonic bells
  const a = audio();
  if (!a || musicOn) return;
  musicOn = true;
  const pad = a.createGain(); pad.gain.value = 0.035; pad.connect(master);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.connect(pad);
  for (const f of [110, 164.8, 220, 261.6]) { const o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = rand(-6, 6); o.connect(lp); o.start(); }
  const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 300; lfo.connect(lg).connect(lp.frequency); lfo.start();
  const notes = [523, 587, 659, 784, 880, 1046];
  setInterval(() => { if (mode === 'play') tone(notes[Math.floor(Math.random() * notes.length)], 1.6, 'sine', 0.025); }, 2600);
}
const SFX = {
  pickup: (n) => tone(900 + n * 45, 0.12, 'sine', 0.06),
  lit: () => [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.9, 'triangle', 0.06, k * 0.09)),
  pulse: () => { tone(240, 0.5, 'sine', 0.1, 0, 2.5); tone(480, 0.35, 'triangle', 0.05, 0.02, 1.8); },
  hit: () => { tone(140, 0.35, 'sawtooth', 0.07, 0, 0.5); tone(90, 0.4, 'square', 0.04, 0.03, 0.6); },
  jump: () => tone(420, 0.14, 'triangle', 0.05, 0, 1.6),
  dash: () => noise(0.25, 0.08, 1400),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 1.2, 'triangle', 0.05, k * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, k) => tone(f, 0.7, 'sine', 0.05, k * 0.18)),
  spawn: () => tone(70, 0.8, 'sawtooth', 0.04, 0, 1.6),
  tick: (last) => tone(last ? 1320 : 990, 0.08, 'square', 0.04),
  wind: () => noise(2.2, 0.06, 500),
  steal: () => tone(700, 0.3, 'triangle', 0.05, 0, 0.5),
  charm: () => [880, 1175, 1568].forEach((f, k) => tone(f, 0.3, 'triangle', 0.05, k * 0.06)),
};

// ---------- game shell ----------
let game = null, view = null, mode = 'menu', night = 1, acc = 0, pulseT = -1, flashT = 0, shake = 0, toastT = 0, lastCount = -1, settingsBack = 's-menu';
let camYaw = 0;
const camPos = new THREE.Vector3(0, 30, -60), camLook = new THREE.Vector3();
const keys = new Set(), latch = new Set();
const stats = { stunned: 0, deposited: 0 };
const nightScores = {};
let debugScenario = {}, replayFrames = null, replay = null, pendingScore = null, rebinding = null;
const newSeed = () => (params.has('seed') ? Number(params.get('seed')) : Date.now() % 2147483647);
let runSeed = newSeed(); // one seed per 3-night run, saved with the leaderboard entry
if (params.get('scenario')) debugScenario = validateScenario(await (await fetch(params.get('scenario'))).json(), MAPS[Number(params.get('night') ?? 1)].lanterns.map((L) => L.id));
if (params.get('inputs')) replayFrames = validateInputs(await (await fetch(params.get('inputs'))).json());

const SCREENS = ['s-menu', 's-intro', 's-result', 's-dawn', 's-board', 's-pause', 's-settings'];
const HUD = ['flames', 'clock', 'topright', 'motebar', 'cooldowns'];
function show(screen) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== screen);
  const playing = mode === 'play' || mode === 'paused';
  for (const h of HUD) $(h).classList.toggle('hidden', !playing);
  if (!playing) { for (const h of ['prompt', 'arrow', 'shade-arrow', 'charm', 'toast']) $(h).classList.add('hidden'); $('captions').replaceChildren(); }
  $(screen ?? '')?.querySelector('input[type=text], input:not([type]), button')?.focus();
}

function clearView() {
  if (!view) return;
  for (const v of view.lanterns) scene.remove(v.g);
  scene.remove(view.may.g);
  for (const m of view.motes.values()) scene.remove(m);
  for (const k of ['body', 'tails', 'rim', 'eyes']) shadeGfx[k].count = 0;
  shadeGfx.auras.begin(); shadeGfx.auras.end();
  for (const d of view.drifters.values()) scene.remove(d.g);
  for (const c of view.charms.values()) scene.remove(c);
  sparks.clear(); ink.clear();
}

function loadNight(n, prebuilt = null) {
  night = n;
  clearView();
  buildWorld(MAPS[n]);
  const scenario = n === Number(params.get('night') ?? 1) ? debugScenario : {};
  game = prebuilt ?? createGame({ seed: runSeed, night: n, scenario });
  view = { may: makeMay(), lanterns: game.lanterns.map(() => makeLantern()), motes: new Map(), shades: new Map(), drifters: new Map(), charms: new Map() };
  scene.add(view.may.g);
  view.may.g.position.fromArray(game.player.pos);
  view.may.prev.fromArray(game.player.pos);
  game.lanterns.forEach((L, i) => { const v = view.lanterns[i]; v.g.position.set(L.pos[0], L.pos[1], L.pos[2]); v.wasLit = L.lit; scene.add(v.g); });
  for (const c of game.charms) { const m = makeCharm(); m.position.fromArray(c.pos); scene.add(m); view.charms.set(c.id, m); }
  camYaw = 0; acc = 0; stats.stunned = 0; stats.deposited = 0; lastCount = -1;
  replay = replayFrames ? inputTimeline(replayFrames) : null;
  window.__game = game;
  $('motebar').innerHTML = Array.from({ length: T.carry_capacity }, () => '<i class="cell"></i>').join('');
}

function introNight(n) {
  loadNight(n);
  mode = 'intro';
  $('intro-night').textContent = `Đêm ${n}`;
  $('intro-name').textContent = MAPS[n].name;
  $('intro-quote').textContent = STORY[n];
  show('s-intro');
}

function play() {
  mode = 'play';
  show(null);
  tone(392, 0.4, 'triangle', 0.06); tone(523, 0.5, 'triangle', 0.06, 0.12);
  for (let k = Number(params.get('ff') ?? 0); k > 0 && game.state === 'playing'; k--) step(game, replay ? replay.at(game.tick) : currentInput());
  const p = game.player.pos;
  view.may.prev.fromArray(p);
  camPos.set(p[0], p[1] + 5.2, p[2] - 9.5);
  camLook.set(p[0], p[1] + 1.3, p[2]);
}

function pause() { if (mode !== 'play') return; mode = 'paused'; show('s-pause'); }
function resume() { mode = 'play'; show(null); clock.getDelta(); }
function openSettings(from) {
  settingsBack = from;
  $('set-volume').value = settings.volume; $('set-sens').value = settings.sens; $('set-cb').checked = settings.colorblind;
  $('set-captions').checked = settings.captions; $('set-rm').checked = settings.reduceMotion; $('set-big').checked = settings.bigText;
  $('set-volume-v').textContent = settings.volume; $('set-sens-v').textContent = `${settings.sens}%`;
  rebinding = null;
  renderKeybinds();
  show('s-settings');
}
$('set-volume').addEventListener('input', (e) => { settings.volume = Number(e.target.value); $('set-volume-v').textContent = settings.volume; if (master) master.gain.value = settings.volume / 100; saveSettings(); });
const applyA11y = () => { document.body.classList.toggle('cb', settings.colorblind); document.body.classList.toggle('rm', settings.reduceMotion); document.body.classList.toggle('big', settings.bigText); };
applyA11y();
for (const [id, key] of [['set-cb', 'colorblind'], ['set-captions', 'captions'], ['set-rm', 'reduceMotion'], ['set-big', 'bigText']]) {
  $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; applyA11y(); saveSettings(); });
}
$('set-sens').addEventListener('input', (e) => { settings.sens = Number(e.target.value); $('set-sens-v').textContent = `${settings.sens}%`; saveSettings(); });

function renderKeyHelp() {
  const k = (a) => `<kbd>${esc(keyLabel(settings.keys[a]))}</kbd>`;
  $('keyhelp').innerHTML = [[k('up') + k('left') + k('down') + k('right'), 'Chạy'], [k('jump'), 'Nhảy'], [k('dash'), 'Lướt'], [k('interact'), 'Nạp ánh sáng / châm dầu'], [k('pulse'), 'Tỏa Sáng (3 đom đóm)'],
    ['<kbd>←</kbd><kbd>→</kbd> / kéo chuột', 'Xoay camera'], [`<kbd>Esc</kbd> / ${k('pause')}`, 'Tạm dừng']].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')
    + '<tr><td colspan="2" style="opacity:.85">Đèn cạn dầu dần: châm dầu, giữ đủ đèn sáng tới bình minh.</td></tr>';
  for (const el of document.querySelectorAll('b.k')) el.textContent = keyLabel(settings.keys[el.dataset.k]);
}
function renderKeybinds(msg = '', warn = false) {
  const K = settings.keys, count = {};
  for (const v of Object.values(K)) count[v] = (count[v] ?? 0) + 1;
  $('keybinds').innerHTML = Object.keys(DEFAULT_KEYS).map((a) => `<span>${ACTION_NAMES[a]}</span><button class="ghost${count[K[a]] > 1 ? ' dup' : ''}" data-bind="${a}">${rebinding === a ? 'Nhấn phím… (Esc: hủy)' : esc(keyLabel(K[a]))}</button>`).join('');
  const dups = Object.keys(count).filter((k) => count[k] > 1);
  if (!msg && dups.length) { msg = `⚠ Trùng phím: ${dups.map(keyLabel).join(', ')}`; warn = true; }
  $('bind-msg').textContent = msg;
  $('bind-msg').classList.toggle('warn', warn);
  renderKeyHelp();
}
function finishRebind(k) {
  const a = rebinding;
  rebinding = null;
  if (k === 'escape') return renderKeybinds('Đã hủy.');
  const other = Object.keys(settings.keys).find((b) => b !== a && settings.keys[b] === k);
  if (other) return renderKeybinds(`⚠ Phím ${keyLabel(k)} đang dùng cho "${ACTION_NAMES[other]}". Hãy chọn phím khác.`, true);
  settings.keys[a] = k;
  saveSettings();
  renderKeybinds(`Đã đổi: ${ACTION_NAMES[a]} = ${keyLabel(k)}`);
  $('keybinds').querySelector(`[data-bind="${a}"]`)?.focus();
}

// ---------- leaderboard (server file via tools/serve.js; browser storage if there is no server) ----------
const localBoard = () => { try { return rank(JSON.parse(localStorage.getItem('ddl-board') ?? '[]')); } catch { return []; } };
async function loadBoard() {
  try { const r = await fetch('/__leaderboard'); if (r.ok) return (await r.json()).entries; } catch { /* static hosting */ }
  return localBoard();
}
async function submitScore(sub) {
  try {
    const r = await fetch('/__leaderboard', { method: 'POST', body: JSON.stringify(sub) });
    if (r.ok) return (await r.json()).entries;
    if (r.status === 400) throw new Error((await r.json()).error);
  } catch (e) { if (!(e instanceof TypeError)) throw e; } // TypeError = no server
  const entries = addEntry(localBoard(), sub);
  try { localStorage.setItem('ddl-board', JSON.stringify(entries)); } catch { /* ignore */ }
  return entries;
}
function showBoard(entries, me = null) {
  const mine = me && entries.filter((x) => x.name === me).sort((a, b) => Date.parse(b.achieved_at) - Date.parse(a.achieved_at))[0];
  $('board-list').innerHTML = '<tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Ngày</th></tr>'
    + (entries.length ? entries.map((x, i) => `<tr${x === mine ? ' class="me"' : ''}><td>${i + 1}</td><td>${esc(x.name)}</td><td class="n">${x.score}</td><td class="n">${x.nights_won}</td><td>${esc(String(x.achieved_at).slice(0, 10))}</td></tr>`).join('')
      : '<tr><td colspan="5" style="opacity:.8">Chưa có điểm nào.</td></tr>');
  mode = 'board';
  show('s-board');
}
const saveForm = (id) => {
  $(id).innerHTML = `<form class="save" data-save><label for="${id}-name">Lưu vào Bảng xếp hạng: <b>${pendingScore.score}</b> điểm, thắng ${pendingScore.nights_won} Đêm</label>
    <input id="${id}-name" type="text" name="n" maxlength="12" autocomplete="off" placeholder="Tên (3–12 ký tự: chữ, số, _)"><button>Lưu điểm</button><p class="msg" aria-live="polite"></p></form>`;
};
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-save]');
  if (!form) return;
  e.preventDefault();
  const msg = form.querySelector('.msg'), name = normalizeName(form.n.value);
  if (!validName(name)) { msg.textContent = 'Tên cần 3–12 ký tự: chữ cái (có dấu được), số hoặc _'; msg.classList.add('warn'); return; }
  form.querySelector('button').disabled = true;
  try { showBoard(await submitScore({ name, ...pendingScore, seed: runSeed }), name); } catch (err) { msg.textContent = err.message; msg.classList.add('warn'); form.querySelector('button').disabled = false; }
});

function endNight({ result, reason }) {
  mode = 'result';
  const lit = game.lanterns.filter((L) => L.lit).length;
  const won = result === 'won';
  if (won) nightScores[night] = game.score;
  const total = Object.values(nightScores).reduce((a, b) => a + b, 0);
  pendingScore = { score: total, nights_won: Object.keys(nightScores).length };
  if (won && night === 3) {
    saveForm('dawn-save');
    $('dawn-stats').innerHTML = [1, 2, 3].map((n) => `<span>Đêm ${n} – ${MAPS[n].name}</span><b>${nightScores[n] ?? 0}</b>`).join('') + `<span>Tổng điểm</span><b>${total}</b>`;
    mode = 'dawn';
    show('s-dawn');
    SFX.win();
    return;
  }
  $('result-title').textContent = won ? `Đêm ${night} – ${MAPS[night].name}: Đảo đã sáng!` : `Đêm ${night} – ${MAPS[night].name}: Đêm vẫn còn tối…`;
  const need = winThreshold(game);
  $('result-detail').textContent = { dawn_survived: `Mây giữ ${lit} ngọn đèn sáng tới bình minh.`, dawn: `Bình minh tới mà chỉ còn ${lit} đèn sáng (cần ${need}).`, no_flames: 'Mây đã hết Ngọn Lửa.' }[reason];
  $('result-stats').innerHTML = [['Đèn sáng lúc kết thúc', `${lit} / ${game.lanterns.length} (cần ${need})`], ['Đom đóm đã nạp', stats.deposited], ['Bóng Mực trúng Tỏa Sáng', stats.stunned], ['Ngọn Lửa còn lại', game.player.flames], ['Điểm Đêm này', game.score], ['Tổng điểm các Đêm đã thắng', total]]
    .map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  if (won) $('result-save').innerHTML = ''; else saveForm('result-save'); // Ticket-04 §3: save after a loss or after dawn
  $('result-btns').innerHTML = (won ? `<button data-act="next">Đêm ${night + 1} →</button>` : '<button data-act="retry">Chơi lại Đêm</button>') + '<button class="ghost" data-act="menu">Về menu</button>';
  show('s-result');
  (won ? SFX.win : SFX.lose)();
}

const ACTIONS = {
  start: () => { for (const k of Object.keys(nightScores)) delete nightScores[k]; runSeed = newSeed(); introNight(Number(params.get('night') ?? 1)); },
  board: async () => showBoard(await loadBoard()),
  'board-back': () => ACTIONS.menu(),
  'keys-reset': () => { settings.keys = { ...DEFAULT_KEYS }; rebinding = null; saveSettings(); renderKeybinds('Đã khôi phục phím mặc định.'); },
  play, resume, next: () => introNight(night + 1), retry: () => introNight(night),
  menu: () => { mode = 'menu'; clearView(); loadNight(1); mode = 'menu'; show('s-menu'); },
  settings: () => openSettings(mode === 'paused' ? 's-pause' : 's-menu'),
  'settings-back': () => { rebinding = null; show(settingsBack); },
};
document.addEventListener('click', (e) => {
  const bind = e.target.closest('[data-bind]')?.dataset.bind;
  if (bind) { rebinding = bind; renderKeybinds(`Nhấn phím mới cho "${ACTION_NAMES[bind]}" (Esc: hủy)`); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) ACTIONS[act]?.();
});

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (rebinding) { e.preventDefault(); return finishRebind(k); }
  if (e.target.tagName === 'INPUT' && e.target.type === 'text') return; // typing a name for the leaderboard
  if (k === ' ' || k.startsWith('arrow') || k === 'shift') e.preventDefault();
  if ((k === 'escape' || k === settings.keys.pause) && !e.repeat) { if (mode === 'play') return pause(); if (mode === 'paused') return resume(); }
  if (k === 'enter' && !e.repeat && e.target.tagName !== 'BUTTON') {
    if (mode === 'menu') return ACTIONS.start();
    if (mode === 'intro') return play();
    if (mode === 'result') return game.state === 'won' ? ACTIONS.next() : ACTIONS.retry();
  }
  if (k === 'f3') { e.preventDefault(); $('fps').classList.toggle('hidden'); }
  keys.add(k); latch.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); if (mode === 'play' && gestured) pause(); });
let dragX = null;
renderer.domElement.addEventListener('pointerdown', (e) => { dragX = e.clientX; });
addEventListener('pointerup', () => { dragX = null; });
addEventListener('pointermove', (e) => { if (dragX !== null) { camYaw -= (e.clientX - dragX) * 0.3 * (settings.sens / 100); dragX = e.clientX; } });
addEventListener('resize', () => {
  if (bench4) return; // the bench renders at a fixed 1280x720
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight);
  for (const p of [sparks, ink]) p.mat.uniforms.uScale.value = innerHeight * PR * 0.6;
});

const btn = (k) => keys.has(k) || latch.has(k);
function currentInput() {
  // Looking along +Z (yaw 0) screen-right is world -X, so D maps to move.x = -1.
  const K = settings.keys;
  const x = (btn(K.left) ? 1 : 0) - (btn(K.right) ? 1 : 0);
  const z = (btn(K.up) ? 1 : 0) - (btn(K.down) ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: btn(K.jump), interact: btn(K.interact), pulse: btn(K.pulse), dash: btn(K.dash), pause: false };
}

// Ticket-04 §4 captions: short text cues for sounds/dangers (can be turned off in settings)
function caption(text, warn = false) {
  if (!settings.captions || bench4) return;
  const box = $('captions'), d = document.createElement('div');
  d.className = `panel${warn ? ' warn' : ''}`;
  d.textContent = text;
  box.append(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), 4000);
}
function toast(msg, secs = 2.5) { $('toast').textContent = msg; $('toast').classList.remove('hidden'); toastT = secs; }

function onEvent(e) {
  const P = game.player, mayPos = new THREE.Vector3().fromArray(P.pos);
  switch (e.name) {
    case 'mote_picked': SFX.pickup(e.data.carried); view.may.flash = Math.max(view.may.flash, 0.4); break;
    case 'deposit': {
      const i = game.lanterns.findIndex((L) => L.id === e.data.lantern_id), v = view.lanterns[i];
      stats.deposited += e.data.amount;
      for (let k = 0; k < e.data.amount; k++) {
        sparks.emit({ pos: mayLanternWorld(), to: () => lampWorld(v), life: 0.55, delay: k * 0.07, size: 0.7, arc: 1.4, color: C.moteHalo,
          onArrive: () => { v.pulse = 1; burst(lampWorld(v), 5, { speed: 1.5, up: 1.5, life: 0.5, size: 0.3 }); tone(520 + k * 40, 0.15, 'triangle', 0.04); } });
      }
      break;
    }
    case 'lantern_lit': {
      const v = view.lanterns[game.lanterns.findIndex((L) => L.id === e.data.lantern_id)];
      v.litT = 0; v.wasLit = false;
      if (e.data.relight) toast(`Thắp lại đèn ${e.data.lantern_id} (+40)`);
      setTimeout(() => { burst(lampWorld(v), 90, { speed: 7, up: 6, life: 1.6, size: 0.55, gravity: 2 }); SFX.lit(); }, 600);
      break;
    }
    case 'pulse': {
      pulseT = 0; view.may.flash = settings.reduceMotion ? 0.3 : 1;
      stats.stunned += e.data.stunned_ids.length;
      const c = mayPos.clone().setY(P.pos[1] + 0.8);
      for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; sparks.emit({ pos: c, vel: new THREE.Vector3(Math.cos(a) * 12, rand(0, 1.5), Math.sin(a) * 12), color: C.core, life: 0.45, size: 0.5, drag: 3 }); }
      for (const id of e.data.stunned_ids) { const s = view.shades.get(id); if (s) inkBurst(s.pos, 14, 3.5); }
      SFX.pulse();
      break;
    }
    case 'player_hit': {
      flashT = settings.reduceMotion ? 0 : 0.6; shake = settings.reduceMotion ? 0 : 0.5; view.may.hitT = 0.5; SFX.hit(); // reduced motion: no shake / flash
      caption(e.data.by === 'fall' ? 'Mây rơi khỏi đảo, mất 1 Ngọn Lửa' : 'Bóng Mực chạm Mây, mất 1 Ngọn Lửa', true);
      if (e.data.by === 'fall') toast(`Rơi khỏi đảo! Mất ${e.data.lost} đom đóm`, 2.5);
      else inkBurst(mayPos.clone().setY(P.pos[1] + 1), 22, 4);
      break;
    }
    case 'dash': SFX.dash(); burst(mayPos.clone().setY(P.pos[1] + 0.5), 14, { color: 0xdfe8ff, speed: 2, up: 0.5, life: 0.4, size: 0.35, gravity: 0 }); break;
    case 'shade_spawned': SFX.spawn(); caption('⚠ Bóng Mực xuất hiện', true); view.spawnCue = { id: e.data.id, t: 3 }; break;
    case 'charm_picked': SFX.charm(); toast('Bùa Gió: chạy nhanh hơn, Lướt không hồi chiêu (10 s)'); break;
    case 'drifter_steal': SFX.steal(); toast(`Gió Lạc cướp ${e.data.amount} đom đóm! Tỏa Sáng để giành lại`); break;
    case 'drifter_drop': toast('Gió Lạc đánh rơi đom đóm!'); break;
    case 'refuel': {
      const v = view.lanterns[game.lanterns.findIndex((L) => L.id === e.data.lantern_id)];
      stats.deposited += e.data.amount;
      for (let k = 0; k < e.data.amount; k++) sparks.emit({ pos: mayLanternWorld(), to: () => lampWorld(v), life: 0.45, delay: k * 0.05, size: 0.6, arc: 1, color: C.moteHalo, onArrive: () => { v.pulse = 0.8; } });
      tone(660, 0.25, 'triangle', 0.05, 0, 1.5);
      break;
    }
    case 'lantern_out': {
      const v = view.lanterns[game.lanterns.findIndex((L) => L.id === e.data.lantern_id)];
      inkBurst(lampWorld(v), 26, 2);
      v.litT = -1;
      tone(330, 0.6, 'sine', 0.06, 0, 0.4);
      toast(`Đèn ${e.data.lantern_id} đã tắt! Thắp lại chỉ cần ${T.relight_cost} đom đóm`);
      break;
    }
    case 'game_over': setTimeout(() => endNight(e.data), e.data.result === 'won' ? 1800 : 900); break;
  }
}

// ---------- frame ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const fps = { frames: 0, t: 0, value: 0, bench: null };
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), now = clock.elapsedTime;
  const bound = Object.values(settings.keys);
  if (keys.has('arrowleft') && !bound.includes('arrowleft')) camYaw += 100 * dt * (settings.sens / 100);
  if (keys.has('arrowright') && !bound.includes('arrowright')) camYaw -= 100 * dt * (settings.sens / 100);
  if (mode === 'play' && game.state === 'playing') {
    acc += dt;
    while (acc >= 1 / TPS && game.state === 'playing') {
      for (const e of step(game, bench4 ? DEFAULT_INPUT : replay ? replay.at(game.tick) : currentInput())) onEvent(e);
      latch.clear();
      acc -= 1 / TPS;
    }
  } else latch.clear();
  if (game) draw(now, dt);
  composer.render();
  if (bench4) benchTick();
  measureFps(dt);
  requestAnimationFrame(frame);
}

function measureFps(dt) {
  fps.frames++; fps.t += dt;
  if (fps.t >= 0.5) { fps.value = fps.frames / fps.t; fps.frames = 0; fps.t = 0; $('fps').textContent = `${fps.value.toFixed(0)} FPS · ${innerWidth}×${innerHeight}`; }
  const b = fps.bench;
  if (!b) return;
  b.elapsed += dt;
  if (b.elapsed > 2) { b.frames++; b.time += dt; b.min = Math.min(b.min, 1 / Math.max(dt, 1e-4)); }
  if (b.time >= b.secs && !b.done) {
    b.done = true;
    const result = { avg_fps: +(b.frames / b.time).toFixed(1), seconds: +b.time.toFixed(1), frames: b.frames, width: innerWidth, height: innerHeight, pixel_ratio: PR, night, ua: navigator.userAgent, gpu: gpuName() };
    $('fps').textContent = `BENCH ${result.avg_fps} FPS avg over ${result.seconds}s at ${innerWidth}×${innerHeight}`;
    fetch('/__bench', { method: 'POST', body: JSON.stringify(result) }).catch(() => {});
    window.__bench = result;
  }
}
function gpuName() {
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; } catch { return 'unknown'; }
}

function drawMay(now, dt) {
  const P = game.player, may = view.may;
  const pos = tmp.fromArray(P.pos);
  const vel = new THREE.Vector3().copy(pos).sub(may.prev).divideScalar(Math.max(dt, 1e-4));
  may.prev.copy(pos);
  may.g.position.copy(pos);
  may.g.visible = P.respawn === 0 && (P.invuln === 0 || Math.floor(now * 14) % 2 === 0);
  const speed = Math.hypot(vel.x, vel.z);
  may.yaw = angleDamp(may.yaw, Math.atan2(P.facing[0], P.facing[1]), 12, dt);
  may.g.rotation.y = may.yaw;
  const walking = speed > 0.5 && P.grounded;
  may.phase += dt * (walking ? speed * 2.2 : 0);
  const s = Math.sin(may.phase), w = walking ? 1 : 0;
  may.footL.position.z = s * 0.2 * w; may.footR.position.z = -s * 0.2 * w;
  may.footL.position.y = 0.06 + Math.max(0, -s) * 0.08 * w; may.footR.position.y = 0.06 + Math.max(0, s) * 0.08 * w;
  may.armL.rotation.x = s * 0.7 * w; may.armR.rotation.x = -s * 0.7 * w;
  may.body.position.y = Math.abs(Math.cos(may.phase)) * 0.07 * w + Math.sin(now * 2.2) * 0.015;
  const dashing = P.dashTicks > 0;
  may.body.rotation.x = damp(may.body.rotation.x, w * 0.12 + (dashing ? 0.35 : 0) + (may.hitT > 0 ? -0.5 * may.hitT : 0), 10, dt);
  const air = !P.grounded;
  if (!may.wasAir && air && P.vy > 5) (P.vy > 10 ? SFX.dash : SFX.jump)();
  if (may.wasAir && !air) { may.squash = 1; burst(pos.clone().setY(P.pos[1] + 0.1), 8, { color: C.sand, speed: 2, up: 0.6, life: 0.4, size: 0.35, gravity: 0 }); }
  may.wasAir = air;
  may.squash = Math.max(0, may.squash - dt * 6);
  const stretch = air ? 1 + Math.min(0.15, Math.abs(P.vy) * 0.02) : 1 - may.squash * 0.2;
  may.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  may.swingV.x += (-may.swing.x * 40 - may.swingV.x * 3 - (speed > 0.5 ? speed * 0.18 : 0)) * dt;
  may.swingV.y += (-may.swing.y * 40 - may.swingV.y * 3 + (walking ? s * 0.4 : 0)) * dt;
  may.swing.addScaledVector(may.swingV, dt);
  may.pivot.rotation.x = may.swing.x; may.pivot.rotation.z = may.swing.y;
  may.flash = Math.max(0, may.flash - dt * 2.5);
  const flicker = 1 + Math.sin(now * 17) * 0.04 + Math.sin(now * 29) * 0.03;
  may.light.intensity = (2.5 + P.carried * 0.8 + may.flash * 25) * flicker;
  may.lanternMat.emissiveIntensity = 1.5 + P.carried * 0.3 + may.flash * 4;
  may.lanternGlow.scale.setScalar(1.1 + P.carried * 0.1 + may.flash * 2);
  may.charmAura.material.opacity = P.charm > 0 ? 0.35 + Math.sin(now * 8) * 0.15 : 0;
  may.hitT = Math.max(0, may.hitT - dt);
  if (dashing && Math.random() < 0.8) sparks.emit({ pos: pos.clone().setY(P.pos[1] + 0.6), vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0, 0.5), rand(-0.5, 0.5)), color: 0xdfe8ff, life: 0.35, size: 0.4 });
}

function drawLanterns(now, dt) {
  const P = game.player;
  game.lanterns.forEach((L, i) => {
    const v = view.lanterns[i];
    if (v.shown !== L.deposited) {
      v.shown = L.deposited;
      v.ring.geometry.dispose();
      v.ring.geometry = new THREE.RingGeometry(T.interact_radius - 0.2, T.interact_radius, 64, 1, Math.PI / 2, Math.max(0.001, Math.min(1, L.deposited / T.lantern_cost) * Math.PI * 2));
    }
    if (L.lit && v.litT < 0) v.litT = v.wasLit ? 99 : 0;
    v.wasLit = v.wasLit || L.lit;
    if (v.litT >= 0) v.litT += dt;
    const glowK = L.lit ? Math.min(1, Math.max(0, (v.litT - 0.5) / 0.6)) : 0;
    const spike = L.lit && v.litT < 1.6 ? Math.max(0, 1 - Math.abs(v.litT - 0.6) * 1.5) : 0;
    const flicker = 1 + Math.sin(now * 11 + i) * 0.05 + Math.sin(now * 23 + i * 2) * 0.04;
    v.pulse = Math.max(0, v.pulse - dt * 3);
    const cost = L.everLit ? T.relight_cost : T.lantern_cost, partial = L.deposited / cost;
    // Ticket-03: low fuel (< 30) -> lantern and its fuel bar blink slowly (1 Hz); fuel also dims the light.
    const fuel = L.lit ? L.fuel / 60 : 0, low = L.lit && fuel < T.low_fuel_threshold, blink = low && Math.sin(now * Math.PI * 2) < 0 ? 0.25 : 1;
    const fuelK = L.lit ? (0.45 + 0.55 * Math.min(1, fuel / 50)) * blink : 1;
    v.paperMat.color.setHex(L.lit && glowK > 0.3 ? C.lit : C.unlit);
    v.paperMat.emissiveIntensity = ((L.lit ? 0.9 * glowK : partial * 0.5) * flicker + v.pulse + spike * 2) * fuelK;
    v.core.visible = L.lit && glowK > 0.2 && blink === 1;
    v.light.intensity = ((L.lit ? 10 * glowK : partial * 2) * flicker + spike * 30 + v.pulse * 4) * fuelK;
    v.halo.material.opacity = ((L.lit ? 0.55 * glowK : partial * 0.25) + spike * 0.5) * fuelK;
    v.halo.scale.setScalar(4.5 + spike * 4 + v.pulse);
    const squash = L.lit ? 1 : 0.8; // unlit lanterns are squashed 20% (readable without colour)
    v.lamp.scale.set(1 + v.pulse * 0.08 + spike * 0.15, (1 + v.pulse * 0.08 + spike * 0.15) * squash, 1 + v.pulse * 0.08 + spike * 0.15);
    v.tear.visible = !L.lit;
    v.bar.visible = L.lit;
    if (L.lit) {
      v.bar.quaternion.copy(camera.quaternion);
      v.barFill.scale.x = Math.max(0.001, fuel / T.fuel_max);
      v.barFill.position.x = -0.6 * (1 - fuel / T.fuel_max);
      v.barFill.material.color.setHex(low ? (settings.colorblind ? 0xffffff : 0xff5a5f) : C.lit);
      v.barFill.material.opacity = blink;
    }
    // drain visual: ink motes sucked from the lamp toward each draining shade
    for (const s of game.shades) if (s.state === 'drain' && s.lanternId === L.id && Math.random() < dt * 12) {
      ink.emit({ pos: lampWorld(v), to: () => new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]), life: 0.6, size: 0.4, arc: 0.4, color: C.lit });
    }
    v.lamp.rotation.z = Math.sin(now * 1.3 + i) * 0.04;
    v.pool.material.opacity = 0.5 * glowK;
    v.ring.visible = v.ringBase.visible = !L.lit;
    const near = Math.hypot(L.pos[0] - P.pos[0], L.pos[2] - P.pos[2]) <= T.interact_radius && Math.abs(L.pos[1] - P.pos[1]) <= R.interactDy;
    v.ringBase.material.opacity = near ? 0.4 + Math.sin(now * 6) * 0.15 : 0.2;
    v.barrier = Math.max(0, v.barrier - dt * 2);
    v.safe.material.opacity = L.lit ? (0.25 + Math.sin(now * 2 + i) * 0.08) * glowK + v.barrier * 0.7 : 0;
    v.orbit.children.forEach((s, k) => {
      const a = now * 0.9 + (k / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.3, Math.sin(now * 2 + k) * 0.4, Math.sin(a) * 1.3);
      s.material.opacity = 0.9 * glowK;
    });
    if (L.lit && glowK > 0.5 && Math.random() < dt * 3) {
      sparks.emit({ pos: lampWorld(v).add(tmp2.set(rand(-0.3, 0.3), 0.4, rand(-0.3, 0.3))), vel: new THREE.Vector3(rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2)), color: C.lit, life: 1.6, size: 0.25 });
    }
  });
}

function drawMotes(now) {
  const P = game.player, alive = new Set();
  for (const m of game.motes) {
    alive.add(m.id);
    let g = view.motes.get(m.id);
    if (!g) { g = makeMote(m.kind); g.scale.setScalar(0.01); scene.add(g); view.motes.set(m.id, g); }
    const ph = g.userData.ph;
    g.position.set(m.pos[0] + Math.sin(now * 0.8 + ph) * 0.15, m.pos[1] + 0.75 + Math.sin(now * 2.6 + ph) * 0.22, m.pos[2] + Math.cos(now * 0.7 + ph) * 0.15);
    g.scale.setScalar(Math.min(1, g.scale.x + 0.03));
    g.visible = m.kind !== 'dropped' || m.ttl > 120 || Math.floor(now * 8) % 2 === 0; // dropped motes blink before vanishing
    g.userData.halo.material.opacity = 0.65 + Math.sin(now * 5 + ph * 3) * 0.3;
  }
  for (const [id, g] of view.motes) {
    if (alive.has(id)) continue;
    if (Math.hypot(g.position.x - P.pos[0], g.position.z - P.pos[2]) < T.pickup_radius + 1.5) sparks.emit({ pos: g.position, to: mayLanternWorld, life: 0.35, size: 0.8, arc: 0.6, color: C.moteHalo });
    scene.remove(g);
    view.motes.delete(id);
  }
}

const colA = new THREE.Color(), colB = new THREE.Color(), rimCol = new THREE.Color(), GOLD = new THREE.Color(C.gold);
function drawShades(now, dt) {
  const P = game.player, G = shadeGfx, cb = settings.colorblind;
  G.ensure(game.shades.length);
  rimCol.setHex(cb ? 0x00b3ff : C.shadeRim); // Ticket-03 colour-blind palette: rim + eyes #00B3FF
  G.bodyMat.emissive.copy(rimCol);
  G.auras.begin();
  let i = 0;
  const alive = new Set();
  for (const s of game.shades) {
    alive.add(s.id);
    let v = view.shades.get(s.id);
    if (!v) {
      v = makeShade();
      v.pos.fromArray(s.pos);
      if (game.tick > 0) inkBurst(v.pos, 30, 3);
      view.shades.set(s.id, v);
    }
    const target = tmp.set(s.pos[0], s.pos[1] + Math.sin(now * 2 + v.ph) * 0.18, s.pos[2]);
    const moved = v.prev ? Math.hypot(target.x - v.prev.x, target.z - v.prev.z) : 0;
    v.prev = (v.prev ?? new THREE.Vector3()).copy(target);
    v.pos.copy(target);
    const stunned = s.state === 'stunned', spawning = s.state === 'spawning';
    const dP = Math.hypot(s.pos[0] - P.pos[0], s.pos[2] - P.pos[2]);
    if (!stunned) v.yaw = angleDamp(v.yaw, Math.atan2(P.pos[0] - s.pos[0], P.pos[2] - s.pos[2]), 8, dt);
    for (let k = 0; k < game.lanterns.length; k++) {
      const L = game.lanterns[k];
      if (!L.lit) continue;
      const d = Math.hypot(s.pos[0] - L.pos[0], s.pos[2] - L.pos[2]);
      if (d < T.safe_radius + 0.3) {
        v.flinch = 1;
        view.lanterns[k].barrier = Math.max(view.lanterns[k].barrier, 0.6);
        if (Math.random() < dt * 10) {
          const kk = T.safe_radius / Math.max(d, 1e-3);
          sparks.emit({ pos: tmp2.set(L.pos[0] + (s.pos[0] - L.pos[0]) * kk, L.pos[1] + rand(0.2, 1.5), L.pos[2] + (s.pos[2] - L.pos[2]) * kk), vel: new THREE.Vector3(rand(-1, 1), rand(0.5, 2), rand(-1, 1)), color: C.lit, life: 0.5, size: 0.35 });
        }
      }
    }
    v.flinch = Math.max(0, v.flinch - dt * 3);
    const sp = spawning ? 1 - s.stateTicks / R.spawningTicks : 1;
    const sx = (1 + Math.sin(now * 3.1 + v.ph) * 0.07) * (1 - v.flinch * 0.15), sy = (1.15 + Math.sin(now * 2.3 + v.ph) * 0.09) * (stunned ? 0.75 : 1);
    v.spin = stunned ? v.spin + dt * 6 : damp(v.spin, 0, 6, dt);
    const angry = s.state === 'chase' || s.state === 'drain' ? Math.max(0.3, 1 - dP / 12) : 0;
    const squint = stunned ? 0.25 : 1 - v.flinch * 0.6;
    // compose: outer (position, yaw) -> inner (spawn scale, spin) -> parts
    sd.outer.position.copy(target); sd.outer.rotation.y = v.yaw;
    sd.inner.scale.setScalar(Math.max(0.05, sp)); sd.inner.position.y = (sp - 1) * 1.2; sd.inner.rotation.y = v.spin;
    sd.body.scale.set(sx, sy, 1 + Math.cos(now * 2.7 + v.ph) * 0.07);
    sd.tails.forEach((t, k) => { const a = (k / 4) * Math.PI * 2; t.position.set(Math.cos(a) * 0.4, -0.85 * sy, Math.sin(a) * 0.4); t.rotation.set(Math.PI, 0, Math.sin(now * 4 + k * 1.7 + v.ph) * 0.35); });
    for (const e of sd.eyes) e.scale.set(1, 1.3 * squint, 0.6);
    sd.outer.updateMatrixWorld(true);
    G.body.setMatrixAt(i, sd.body.matrixWorld); G.rim.setMatrixAt(i, sd.rim.matrixWorld);
    sd.tails.forEach((t, k) => G.tails.setMatrixAt(i * 4 + k, t.matrixWorld));
    sd.eyes.forEach((e, k) => G.eyes.setMatrixAt(i * 2 + k, e.matrixWorld));
    colA.setHex(stunned ? C.stunned : C.shade);
    G.body.setColorAt(i, colA);
    for (let k = 0; k < 4; k++) G.tails.setColorAt(i * 4 + k, colA);
    if (cb) colB.setHex(0x00b3ff); else colB.setRGB(lerp(0.93, 1, angry), lerp(0.89, 0.35, angry), lerp(1, 0.37, angry));
    G.eyes.setColorAt(i * 2, colB); G.eyes.setColorAt(i * 2 + 1, colB);
    G.rim.setColorAt(i, colA.copy(rimCol).multiplyScalar(stunned ? 0.1 : 0.3 + angry * 0.3)); // additive blending: colour x opacity
    G.auras.put(target.x, target.y, target.z, rimCol, 3.2 * SPRITE_TO_POINT * Math.max(0.05, sp), (stunned ? 0.08 : 0.25 + angry * 0.3) * sp);
    if (stunned) for (let k = 0; k < 3; k++) { const a = now * 5 + (k / 3) * Math.PI * 2; G.auras.put(target.x + Math.cos(a) * 0.6, target.y + 1.3 + Math.sin(now * 8 + k) * 0.08, target.z + Math.sin(a) * 0.6, GOLD, 0.45 * SPRITE_TO_POINT, 0.95); }
    v.inkT -= dt;
    if (moved > 0.001 && v.inkT <= 0) {
      v.inkT = 0.07 * Math.max(1, game.shades.length / 20); // ink trail LOD: unchanged for <= 20 shades
      ink.emit({ pos: tmp2.set(target.x + rand(-0.3, 0.3), target.y - 0.9, target.z + rand(-0.3, 0.3)), vel: new THREE.Vector3(0, rand(0.1, 0.5), 0), color: C.shade, life: 0.9, size: rand(0.5, 0.9), drag: 1 });
    }
    i++;
  }
  for (const k of ['body', 'tails', 'rim', 'eyes']) {
    const im = G[k];
    im.count = i * (k === 'tails' ? 4 : k === 'eyes' ? 2 : 1);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  G.auras.end();
  for (const id of view.shades.keys()) if (!alive.has(id)) view.shades.delete(id);
}

function drawDrifters(now, dt) {
  for (const d of game.drifters) {
    let v = view.drifters.get(d.id);
    if (!v) { v = makeDrifter(); v.g.position.fromArray(d.pos); scene.add(v.g); view.drifters.set(d.id, v); }
    v.g.visible = d.state !== 'removed';
    if (!v.g.visible) continue;
    const p = tmp.fromArray(d.pos);
    if (v.prev) { const dx = p.x - v.prev.x, dz = p.z - v.prev.z; if (Math.hypot(dx, dz) > 1e-4) v.g.rotation.y = angleDamp(v.g.rotation.y, Math.atan2(dx, dz) - Math.PI / 2, 8, dt); }
    v.prev = p.clone();
    v.g.position.set(p.x, p.y + Math.sin(now * 2 + v.ph) * 0.3, p.z);
    const pos = v.geo.attributes.position.array, speed = d.state === 'idle' ? 3 : 9;
    for (let i = 0; i < pos.length; i += 3) {
      const x = v.base[i];
      pos[i + 1] = v.base[i + 1] + Math.sin(x * 2.4 - now * speed + v.ph) * 0.18;
      pos[i + 2] = Math.cos(x * 1.8 - now * speed * 0.8 + v.ph) * 0.25;
    }
    v.geo.attributes.position.needsUpdate = true;
    v.geo.computeVertexNormals();
    v.m.material.opacity = d.state === 'flee' ? 0.6 : 0.95;
    v.loot.material.opacity = d.stolen > 0 ? 0.7 + Math.sin(now * 6) * 0.2 : 0;
  }
}

function drawCharms(now) {
  for (const c of game.charms) {
    const m = view.charms.get(c.id);
    m.visible = c.available;
    m.position.set(c.pos[0], c.pos[1] + 1.1 + Math.sin(now * 2) * 0.15, c.pos[2]);
    m.rotation.y = now * 1.5;
  }
}

// Fade trees/rocks that sit between the camera and Mây.
const seg = new THREE.Vector2(), toObj = new THREE.Vector2();
function fadeOccluders(dt) {
  const P = game.player, cx = camera.position.x, cz = camera.position.z;
  seg.set(P.pos[0] - cx, P.pos[2] - cz);
  const len2 = Math.max(seg.lengthSq(), 1e-6);
  for (const o of world.occluders) {
    toObj.set(o.position.x - cx, o.position.z - cz);
    const t = Math.min(1, Math.max(0, toObj.dot(seg) / len2));
    const d = Math.hypot(toObj.x - seg.x * t, toObj.y - seg.y * t);
    const op = damp(o.userData.op ?? 1, t > 0.02 && t < 0.98 && d < 2.6 ? 0.18 : 1, 8, dt);
    if (Math.abs(op - (o.userData.op ?? 1)) < 1e-3 && op > 0.99) continue;
    o.userData.op = op;
    o.traverse((m) => { if (m.material) { m.material.transparent = op < 0.99; m.material.opacity = op; m.material.depthWrite = op > 0.5; } });
  }
}

function draw(now, dt) {
  const P = game.player, lit = game.lanterns.filter((L) => L.lit).length, total = game.lanterns.length;
  skyU.uTime.value = now;
  ambient.intensity = 0.15 + 0.55 * (lit / total);
  stars.forEach((m, k) => { m.opacity = 0.75 + Math.sin(now * (0.8 + k * 0.7) + k) * 0.25; });
  waveSea(now);
  puffs.rotation.y += dt * 0.004;
  world.swaying.forEach((t) => { t.rotation.z = Math.sin(now * 0.9 + t.userData.phase) * 0.025; });

  drawMay(now, dt);
  drawLanterns(now, dt);
  drawMotes(now);
  drawShades(now, dt);
  drawDrifters(now, dt);
  drawCharms(now);
  // wind: leaves fly during the 2 s warning and the gust
  const warn = windWarning(game), gust = game.wind.ticks > 0;
  if (warn && !view.windWarned) { view.windWarned = true; SFX.wind(); caption('🍃 Gió mạnh sắp tới!', true); }
  if (!warn) view.windWarned = false;
  if ((warn || gust) && mode === 'play') {
    const a = (game.wind.dir * Math.PI) / 180, dir = gust ? new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) : new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
    for (let k = 0; k < (gust ? 4 : 1); k++) {
      const o = tmp2.set(P.pos[0] + rand(-12, 12) - dir.x * 10, P.pos[1] + rand(0.3, 4), P.pos[2] + rand(-12, 12) - dir.z * 10);
      sparks.emit({ pos: o, vel: dir.clone().multiplyScalar(gust ? 9 : 4).add(new THREE.Vector3(0, rand(-0.5, 0.5), 0)), color: k % 2 ? C.grass : C.sand, life: 2, size: 0.3 });
    }
  }
  sparks.update(dt);
  ink.update(dt);

  if (pulseT >= 0) {
    pulseT += dt;
    pulseRings.forEach((r, k) => {
      const kk = Math.min(Math.max((pulseT - k * 0.08) / 0.45, 0), 1);
      r.position.set(P.pos[0], P.pos[1] + 0.12 + k * 0.05, P.pos[2]);
      r.scale.setScalar(Math.max(0.01, kk * T.pulse_radius));
      r.material.opacity = kk > 0 ? 0.9 * (1 - kk) : 0;
    });
    if (pulseT > 0.6) pulseT = -1;
  }
  flashT = Math.max(0, flashT - dt);
  $('flash').style.opacity = String(Math.min(1, flashT * 1.6));

  moonLight.target.position.set(P.pos[0], P.pos[1], P.pos[2]);
  moonLight.position.copy(moonLight.target.position).addScaledVector(moonDir, 80);

  const th = (camYaw * Math.PI) / 180;
  shake = Math.max(0, shake - dt);
  if (mode === 'play' || mode === 'paused') {
    const fy = P.respawn > 0 ? MAPS[night].start[1] : P.pos[1];
    const focus = P.respawn > 0 ? MAPS[night].start : P.pos;
    tmp.set(focus[0] - Math.sin(th) * 9.5, fy * 0.6 + 5.2, focus[2] - Math.cos(th) * 9.5);
    camPos.set(damp(camPos.x, tmp.x, 6, dt), damp(camPos.y, tmp.y, 6, dt), damp(camPos.z, tmp.z, 6, dt));
    tmp.set(focus[0], fy + 1.3, focus[2]);
  } else {
    const a = now * 0.07, c = MAPS[night].islands.length > 1 ? [35, 0] : [0, 0];
    tmp.set(c[0] + Math.sin(a) * 62, 26, c[1] + Math.cos(a) * 62);
    camPos.set(damp(camPos.x, tmp.x, 1.5, dt), damp(camPos.y, tmp.y, 1.5, dt), damp(camPos.z, tmp.z, 1.5, dt));
    tmp.set(c[0], 2, c[1]);
  }
  camLook.set(damp(camLook.x, tmp.x, 8, dt), damp(camLook.y, tmp.y, 8, dt), damp(camLook.z, tmp.z, 8, dt));
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmp2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.5));
  camera.lookAt(camLook);
  if (bench4) { // Ticket-04 bench camera: circle r 30 m at Y 15 around (0,0,0), from angle 0, one turn per 15 s
    const a = bench4.first === null ? 0 : ((performance.now() - bench4.first) / 15000) * Math.PI * 2;
    camera.position.set(30 * Math.cos(a), 15, 30 * Math.sin(a)); // map angle convention: x = r cos, z = r sin
    camera.lookAt(0, 0, 0);
  }
  skyGroup.position.copy(camera.position);
  fadeOccluders(dt);
  if (mode === 'play' || mode === 'paused') drawHud(lit, total, now, dt);
}

const setHTML = (id, html) => { const el = $(id); if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } };
function drawHud(lit, total, now, dt) {
  const P = game.player;
  setHTML('flames', Array.from({ length: Math.max(T.flames, P.flames) }, (_, k) => `<i class="flame${k < P.flames ? '' : ' off'}"></i>`).join(''));
  const tl = Math.max(0, timeLeft(game)), secs = Math.ceil(tl - 1e-9);
  $('clock').textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  $('clock').classList.toggle('danger', tl <= 30);
  if (tl <= 10 && secs !== lastCount && game.state === 'playing' && mode === 'play') { lastCount = secs; if (secs > 0) SFX.tick(secs <= 3); if (secs === 10) caption('⏳ 10 giây cuối trước bình minh!', true); }
  setHTML('lanterns', `Đèn sáng ${lit}/${total} · cần ${winThreshold(game)}`);
  const cap = capacityOf(P);
  if ($('motebar').querySelectorAll('.cell').length !== cap || !$('carry-num')) $('motebar').innerHTML = Array.from({ length: cap }, () => '<i class="cell"></i>').join('') + '<span id="carry-num"></span>';
  $('carry-num').textContent = `${P.carried}/${cap}`;
  $('score').textContent = String(game.score);
  [...$('motebar').querySelectorAll('.cell')].forEach((c, k) => c.classList.toggle('on', k < P.carried));
  const dashP = P.charm > 0 ? 1 : 1 - P.dashCd / Math.round(T.dash_cooldown_s * TPS), pulseP = 1 - P.pulseCd / Math.round(T.pulse_cooldown_s * TPS);
  $('cd-dash').style.setProperty('--p', String(dashP)); $('cd-dash').classList.toggle('ready', dashP >= 1);
  $('cd-pulse').style.setProperty('--p', String(pulseP)); $('cd-pulse').classList.toggle('ready', pulseP >= 1 && P.carried >= T.pulse_cost);
  $('charm').classList.toggle('hidden', P.charm === 0);
  $('charm').textContent = `Bùa Gió ${(P.charm / TPS).toFixed(1)}s`;
  toastT = Math.max(0, toastT - dt);
  if (toastT === 0) $('toast').classList.add('hidden');
  // "E — Nạp ánh sáng (x/10)" near an unlit lantern
  const near = game.lanterns.find((L) => (!L.lit || L.fuel < T.fuel_max * 60) && Math.hypot(L.pos[0] - P.pos[0], L.pos[2] - P.pos[2]) <= T.interact_radius && Math.abs(L.pos[1] - P.pos[1]) <= R.interactDy);
  $('prompt').classList.toggle('hidden', !near);
  const ik = keyLabel(settings.keys.interact);
  game.lanterns.forEach((L, i) => { const low = L.lit && L.fuel < T.low_fuel_threshold * 60, v = view.lanterns[i]; if (low && !v.lowCap) caption(`Đèn ${L.id} sắp cạn dầu (dưới ${T.low_fuel_threshold})`, true); v.lowCap = low; });
  if (near) setHTML('prompt', near.lit ? `${ik} — Châm dầu (${Math.floor(near.fuel / 60)}/100)` : `${ik} — Nạp ánh sáng (${near.deposited}/${near.everLit ? T.relight_cost : T.lantern_cost})`);
  // arrow towards the nearest unlit lantern when it is off-screen
  let best = null, bd = Infinity;
  for (const L of game.lanterns) { const d = Math.hypot(L.pos[0] - P.pos[0], L.pos[2] - P.pos[2]); if (!L.lit && d < bd) { bd = d; best = L; } }
  if (!best) for (const L of game.lanterns) { const d = Math.hypot(L.pos[0] - P.pos[0], L.pos[2] - P.pos[2]); if (L.fuel < T.low_fuel_threshold * 60 && d < bd) { bd = d; best = L; } } // all lit: point at a low-fuel one
  if (best) placeArrow($('arrow'), best.pos[0], best.pos[1] + 3.4, best.pos[2]); else $('arrow').classList.add('hidden');
  const cue = view.spawnCue, S = cue && cue.t > 0 && game.shades.find((x) => x.id === cue.id);
  if (cue) cue.t -= dt;
  if (S) placeArrow($('shade-arrow'), S.pos[0], S.pos[1], S.pos[2]); else $('shade-arrow').classList.add('hidden');
}

// Arrow at the screen edge pointing at a world position; hidden while that position is on screen.
function placeArrow(el, x0, y0, z0) {
  const p = tmp.set(x0, y0, z0).project(camera);
  const behind = tmp2.set(x0, y0, z0).sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) < 0;
  const onScreen = !behind && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.92;
  el.classList.toggle('hidden', onScreen);
  if (onScreen) return;
  let x = p.x, y = p.y;
  if (behind) { x = -x; y = -y; }
  const ang = Math.atan2(y, x), m = 46, cxs = innerWidth / 2, cys = innerHeight / 2;
  const k = Math.min((cxs - m) / Math.max(Math.abs(Math.cos(ang)) * cxs, 1e-3), (cys - m) / Math.max(Math.abs(Math.sin(ang)) * cys, 1e-3));
  el.style.left = `${cxs + Math.cos(ang) * cxs * k - 14}px`;
  el.style.top = `${cys - Math.sin(ang) * cys * k - 15}px`;
  el.style.transform = `rotate(${Math.PI / 2 - ang}rad)`;
}

// ---------- Ticket-04 benchmark scene (?scene=bench&seed=42&duration=30), driven by tools/bench.js ----------
let bench4 = null;
function startBench() {
  bench4 = { secs: Number(params.get('duration') ?? 30), first: null, last: null, dts: [], sum: 0, done: false };
  renderer.setPixelRatio(1); composer.setPixelRatio(1);
  renderer.setSize(1280, 720); composer.setSize(1280, 720); bloom.setSize(1280, 720);
  camera.aspect = 1280 / 720; camera.updateProjectionMatrix();
  for (const p of [sparks, ink]) p.mat.uniforms.uScale.value = 720 * 0.6;
  loadNight(1, createBenchGame(Number(params.get('seed') ?? 42)));
  mode = 'play';
  show(null);
  $('fps').classList.remove('hidden');
}
function benchTick() {
  const b = bench4, t = performance.now();
  if (b.first === null) { b.first = t; b.firstEpoch = performance.timeOrigin + t; } // first frame of the bench scene (load_ms end)
  else if (t - b.first >= 3000 && !b.done) { b.dts.push(t - b.last); b.sum += t - b.last; } // 3 s warm-up, then frame times
  b.last = t;
  if (b.done || b.sum < b.secs * 1000) return;
  b.done = true;
  const gl = renderer.getContext();
  const result = { ...benchStats(b.dts), first_frame_epoch: b.firstEpoch, three: THREE.REVISION, webgl: gl instanceof WebGL2RenderingContext ? 2 : 1, gpu: gpuName(),
    browser: (navigator.userAgent.match(/(Edg|Chrome|Firefox)\/[\d.]+/) ?? [navigator.userAgent])[0], width: renderer.domElement.width, height: renderer.domElement.height, pixel_ratio: renderer.getPixelRatio() };
  $('fps').textContent = `BENCH ${result.avg_fps} FPS avg · 1% low ${result.p1_low_fps} · p95 ${result.frame_ms_p95} ms`;
  fetch('/__bench', { method: 'POST', body: JSON.stringify(result) }).catch(() => {});
  window.__bench = result;
}

// ---------- boot ----------
renderKeyHelp();
loadNight(Number(params.get('night') ?? 1));
show('s-menu');
if (params.has('fps') || params.has('bench')) $('fps').classList.remove('hidden');
if (params.has('bench')) fps.bench = { secs: Number(params.get('bench')) || 15, elapsed: 0, frames: 0, time: 0, min: Infinity, done: false };
if (params.get('scene') === 'bench') startBench();
else if (params.has('autostart')) play();
else if (params.get('screen')) ACTIONS[params.get('screen')]?.(); // screenshots of menu screens
frame();

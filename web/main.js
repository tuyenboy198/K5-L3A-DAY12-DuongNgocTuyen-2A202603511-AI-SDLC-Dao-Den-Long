// Browser renderer. All gameplay comes from src/sim (the same code the headless CLI runs);
// this file only maps keyboard -> contract input, steps the sim at 60 Hz and draws the state.
// Everything here (animation, particles, sound, camera) is cosmetic and never feeds back into the sim.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGame, step, timeLeft, mulberry32 } from '../src/sim/game.js';
import { TUNING as T, WORLD as W, TPS } from '../src/sim/config.js';
import { validateScenario, validateInputs, inputTimeline } from '../src/io.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const angleDamp = (a, b, rate, dt) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt));
const rand = (a, b) => a + Math.random() * (b - a); // cosmetic only, never used by the sim

// ---------- renderer: supersampled on 1x screens, ACES tone mapping, soft shadows, bloom ----------
const PR = Math.min(Math.max(devicePixelRatio, 1.5), 2.5);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG_NIGHT = new THREE.Color(0x3a2160), FOG_WARM = new THREE.Color(0x6a3a50);
scene.fog = new THREE.FogExp2(FOG_NIGHT.getHex(), 0.009);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(PR);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const hemi = new THREE.HemisphereLight(0x9c8cff, 0x2a1d3d, 0.9);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0xc4ccff, 1.1);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
Object.assign(moonLight.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 140 });
moonLight.shadow.bias = -0.0005;
scene.add(moonLight, moonLight.target);

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

// ---------- particles (per-particle size/alpha, additive glow or normal "ink") ----------
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
    pts.frustumCulled = false;
    scene.add(pts);
  }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    const life = o.life ?? 1;
    this.list.push({ p: o.pos.clone(), from: o.pos.clone(), v: o.vel?.clone() ?? new THREE.Vector3(), c: new THREE.Color(o.color ?? 0xffc46b),
      life, max: life, size: o.size ?? 0.5, g: o.gravity ?? 0, drag: o.drag ?? 0, to: o.to, arc: o.arc ?? 1.2, delay: o.delay ?? 0, onArrive: o.onArrive });
  }
  update(dt) {
    let n = 0;
    const keep = [];
    for (const q of this.list) {
      if (q.delay > 0) { q.delay -= dt; keep.push(q); if (q.delay <= 0) q.from.copy(q.p); continue; }
      q.life -= dt;
      if (q.life <= 0) { q.onArrive?.(); continue; }
      keep.push(q);
      const t = 1 - q.life / q.max;
      if (q.to) {
        const e = t * t * (3 - 2 * t);
        q.p.lerpVectors(q.from, q.to(), e);
        q.p.y += Math.sin(Math.PI * t) * q.arc;
      } else {
        q.v.y -= q.g * dt;
        q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
      }
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
const burst = (pos, n, { color = 0xffc46b, speed = 4, up = 2, life = 1, size = 0.45, gravity = 3, drag = 1.5 } = {}) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
    sparks.emit({ pos, vel: new THREE.Vector3(Math.cos(a) * s, rand(0.2, 1) * up, Math.sin(a) * s), color, life: life * rand(0.6, 1.2), size: size * rand(0.6, 1.3), gravity, drag });
  }
};
const inkBurst = (pos, n, speed = 2.5) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
    ink.emit({ pos, vel: new THREE.Vector3(Math.cos(a) * s, rand(-0.3, 1.2), Math.sin(a) * s), color: 0x1a0630, life: rand(0.5, 1.1), size: rand(0.5, 1.1), drag: 2 });
  }
};

// ---------- sky: gradient dome, stars, moon, aurora-ish glow at the horizon ----------
const skyGroup = new THREE.Group();
scene.add(skyGroup);
const skyU = { uWarm: { value: 0 }, uTime: { value: 0 }, uHor: { value: scene.fog.color } }; // horizon == fog colour, so fogged terrain melts into the sky
skyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform float uWarm; uniform float uTime; uniform vec3 uHor; varying vec3 vP;
    void main(){
      float h=vP.y;
      vec3 top=mix(vec3(0.003,0.002,0.012),vec3(0.012,0.006,0.03),uWarm);
      vec3 mid=mix(vec3(0.016,0.008,0.05),vec3(0.05,0.02,0.06),uWarm);
      vec3 c=mix(uHor,mid,smoothstep(0.0,0.2,h)); c=mix(c,top,smoothstep(0.18,0.7,h));
      float band=exp(-pow((h-0.12-0.03*sin(atan(vP.z,vP.x)*3.0+uTime*0.05))*9.0,2.0));
      c+=vec3(0.10,0.05,0.22)*band*(0.6+0.4*sin(atan(vP.z,vP.x)*5.0-uTime*0.08));
      gl_FragColor=vec4(c,1.0);
    }`,
})));
function starLayer(count, size, seed) {
  const r = mulberry32(seed), pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 * Math.PI, v = 0.04 + r() * 0.96, R = 850, cy = Math.sqrt(1 - v * v);
    pos.set([Math.cos(u) * cy * R, v * R, Math.sin(u) * cy * R], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, map: GLOW, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: 0xfff4e0 });
  const p = new THREE.Points(g, m);
  skyGroup.add(p);
  return m;
}
const stars = [starLayer(1400, 2.2, 11), starLayer(500, 3.6, 12), starLayer(120, 6, 13)];
const moonDir = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff1d0, fog: false }));
moon.position.copy(moonDir).multiplyScalar(780);
const moonHalo = glowSprite(0xbfb4ff, 420, 0.55);
moonHalo.material.fog = false;
moonHalo.position.copy(moon.position);
skyGroup.add(moon, moonHalo);

// ---------- cloud sea + drifting puffs + distant floating islands ----------
const seaGeo = new THREE.PlaneGeometry(1800, 1800, 90, 90);
const sea = new THREE.Mesh(seaGeo, mat(0x5a46a0, { flatShading: true, roughness: 1, emissive: 0x1a0f3a, emissiveIntensity: 0.6 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -14;
sea.receiveShadow = true;
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
const deco = mulberry32(2024);
const puffs = new THREE.Group();
const puffMat = mat(0x8f7ad6, { roughness: 1, emissive: 0x2a1858, emissiveIntensity: 0.5, flatShading: true });
for (let i = 0; i < 70; i++) {
  const a = deco() * Math.PI * 2, r = 62 + deco() * 260, cl = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + deco() * 5, 1), puffMat);
    s.position.set((deco() - 0.5) * 12, deco() * 3, (deco() - 0.5) * 8);
    cl.add(s);
  }
  cl.position.set(Math.cos(a) * r, -11 + deco() * 4, Math.sin(a) * r);
  puffs.add(cl);
}
scene.add(puffs);
const farIslands = [];
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + deco(), r = 170 + deco() * 140, s = 6 + deco() * 12, g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.9, 1.5, 12), mat(0x2b4a45)));
  const under = new THREE.Mesh(new THREE.ConeGeometry(s * 0.9, s * 2.2, 10), mat(0x3a3050, { flatShading: true }));
  under.rotation.x = Math.PI; under.position.y = -s * 1.1 - 0.75;
  g.add(under);
  for (let k = 0; k < 3; k++) {
    const tr = new THREE.Mesh(new THREE.ConeGeometry(s * 0.18, s * 0.6, 7), mat(0x1d3a36));
    tr.position.set((deco() - 0.5) * s, s * 0.3, (deco() - 0.5) * s);
    g.add(tr);
  }
  if (deco() < 0.6) { const gl = glowSprite(0xffb070, s * 1.2, 0.5); gl.position.y = s * 0.4; g.add(gl); }
  g.position.set(Math.cos(a) * r, 4 + deco() * 30, Math.sin(a) * r);
  g.userData.phase = deco() * 6;
  farIslands.push(g);
  scene.add(g);
}

// ---------- the island ----------
const R = W.islandRadius;
const islandTopGeo = new THREE.CylinderGeometry(R, R, 1.2, 128, 1);
{ // subtle colour variation on the grass
  const c = new THREE.Color(), cols = [];
  const p = islandTopGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const n = Math.sin(p.getX(i) * 0.3) * Math.cos(p.getZ(i) * 0.27) * 0.5 + 0.5;
    c.setHSL(0.44 - n * 0.05, 0.28, 0.2 + n * 0.06); cols.push(c.r, c.g, c.b);
  }
  islandTopGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}
const islandTop = shadowed(new THREE.Mesh(islandTopGeo, mat(0xffffff, { vertexColors: true, roughness: 1 })), false, true);
islandTop.position.y = -0.6;
const cliff = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.86, 7, 96, 3), mat(0x4e4266, { flatShading: true })), false, true);
cliff.position.y = -4.7;
const underGeo = new THREE.ConeGeometry(R * 0.86, 30, 40, 6);
{ const p = underGeo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 14.9) { p.setX(i, p.getX(i) * (0.85 + deco() * 0.3)); p.setZ(i, p.getZ(i) * (0.85 + deco() * 0.3)); } underGeo.computeVertexNormals(); }
const under = new THREE.Mesh(underGeo, mat(0x3a2f52, { flatShading: true }));
under.rotation.x = Math.PI;
under.position.y = -8.2 - 15;
scene.add(islandTop, cliff, under);
for (let i = 0; i < 26; i++) { // glowing crystals hanging under the island
  const a = deco() * Math.PI * 2, r = deco() * R * 0.7;
  const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.6 + deco() * 1.2), new THREE.MeshBasicMaterial({ color: deco() < 0.5 ? 0x9a7bff : 0xff9ad5 }));
  cr.scale.y = 2.2;
  cr.position.set(Math.cos(a) * r, -9 - (1 - r / R) * 18 * deco(), Math.sin(a) * r);
  scene.add(cr);
}

const lanternSpots = Array.from({ length: 5 }, (_, k) => [W.lanternRing * Math.sin(k * 1.2566), W.lanternRing * Math.cos(k * 1.2566)]);
const nearSpot = (x, z, d) => Math.hypot(x, z) < 13 || lanternSpots.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < d);
const swaying = [], occluders = []; // occluders fade out when they sit between the camera and Mây
for (let i = 0; i < 90; i++) {
  const r = 7 + deco() * (R - 9), a = deco() * Math.PI * 2, x = r * Math.sin(a), z = r * Math.cos(a);
  if (nearSpot(x, z, 6.5)) continue;
  const kind = deco();
  if (kind < 0.5) { // layered pine
    const tree = new THREE.Group(), h = 2.5 + deco() * 2.5;
    tree.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, h * 0.4, 6), mat(0x4a3428))));
    tree.children[0].position.y = h * 0.2;
    for (let k = 0; k < 3; k++) {
      const c = shadowed(new THREE.Mesh(new THREE.ConeGeometry(h * (0.42 - k * 0.1), h * 0.45, 8), mat(k % 2 ? 0x24463f : 0x1d3b36, { flatShading: true })));
      c.position.y = h * (0.42 + k * 0.22);
      tree.add(c);
    }
    tree.position.set(x, 0, z);
    tree.rotation.y = deco() * 6;
    tree.userData.phase = deco() * 6;
    swaying.push(tree);
    occluders.push(tree);
    scene.add(tree);
  } else if (kind < 0.75) {
    const rock = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + deco() * 0.9), mat(0x5a5270, { flatShading: true })), true, true);
    rock.position.set(x, 0.15, z);
    rock.rotation.set(deco() * 3, deco() * 3, 0);
    occluders.push(rock);
    scene.add(rock);
  } else { // glowing mushrooms
    const m = new THREE.Group(), hue = deco() < 0.5 ? 0x7fe3ff : 0xff8fd8;
    for (let k = 0; k < 3; k++) {
      const s = 0.5 + deco() * 0.6, stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.4 * s, 6), mat(0xe8dcc8));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: hue }));
      stem.position.set((deco() - 0.5) * 0.6, 0.2 * s, (deco() - 0.5) * 0.6);
      cap.position.set(stem.position.x, 0.4 * s, stem.position.z);
      m.add(stem, cap);
    }
    m.position.set(x, 0, z);
    scene.add(m);
  }
}
// stone path from the centre to each lantern
const stoneMat = mat(0x6a6080, { flatShading: true });
for (const [lx, lz] of lanternSpots) for (let d = 6; d < W.lanternRing - 3; d += 1.9) {
  const s = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3 + deco() * 0.12, 0.34, 0.1, 7), stoneMat), false, true);
  const k = d / W.lanternRing;
  s.position.set(lx * k + (deco() - 0.5) * 0.5, 0.04, lz * k + (deco() - 0.5) * 0.5);
  scene.add(s);
}
// ambient fireflies (cosmetic only, not collectable)
const ambient = new THREE.Group();
for (let i = 0; i < 60; i++) {
  const s = glowSprite(0xd7ff8a, 0.35, 0.8);
  s.userData = { a: deco() * 6, r: 6 + deco() * (R - 8), h: 0.6 + deco() * 3, sp: 0.03 + deco() * 0.06, ph: deco() * 6 };
  ambient.add(s);
}
scene.add(ambient);

// ---------- entities ----------
function makeLantern() {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.45, 8), mat(0x6b6080, { flatShading: true })), true, true);
  base.position.y = 0.22;
  const pillar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.1, 10), mat(0x5b4030)));
  pillar.position.y = 1.9;
  const lamp = new THREE.Group();
  lamp.position.y = 3.45;
  const paperMat = mat(0xd9cbb8, { emissive: 0xff8f3a, emissiveIntensity: 0, roughness: 0.6 });
  const paper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.9, 16), paperMat));
  const capMat = mat(0x6a2620);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.14, 16), capMat); top.position.y = 0.52;
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.3, 0.12, 16), capMat); bot.position.y = -0.5;
  const roof = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 6), mat(0x7a2a22, { flatShading: true }))); roof.position.y = 0.85;
  const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0xd33a2c)); tassel.position.y = -0.7;
  const halo = glowSprite(0xffa04a, 4.5, 0);
  const light = new THREE.PointLight(0xffa04a, 0, 34, 1.3);
  lamp.add(paper, top, bot, roof, tassel, halo, light);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: GLOW, color: 0xffa04a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06; pool.scale.setScalar(T.safe_radius * 3);
  const ringBase = new THREE.Mesh(new THREE.RingGeometry(T.interact_radius - 0.22, T.interact_radius, 64), new THREE.MeshBasicMaterial({ color: 0xffb54d, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  ringBase.rotation.x = -Math.PI / 2; ringBase.position.y = 0.05;
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  const safe = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.07, T.safe_radius + 0.07, 128), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  safe.rotation.x = -Math.PI / 2; safe.position.y = 0.07;
  const orbit = new THREE.Group(); // little fireflies circling a lit lantern
  for (let k = 0; k < 6; k++) orbit.add(glowSprite(0xffe08a, 0.35, 0));
  orbit.position.y = 3.4;
  g.add(base, pillar, lamp, pool, ringBase, ring, safe, orbit);
  return { g, lamp, paperMat, halo, light, pool, ring, ringBase, safe, orbit, shown: -1, litT: -1, pulse: 0, barrier: 0, wasLit: false };
}
const lampWorld = (v) => v.lamp.getWorldPosition(new THREE.Vector3());

function makeMay() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const robe = shadowed(new THREE.Mesh(new THREE.LatheGeometry([[0.44, 0], [0.42, 0.12], [0.33, 0.55], [0.24, 0.9], [0, 0.98]].map(([x, y]) => new THREE.Vector2(x, y)), 20), mat(0x3d7bd9)));
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 6, 20), mat(0xe2543a)); sash.rotation.x = Math.PI / 2; sash.position.y = 0.55;
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), mat(0xf6d2ad)));
  head.position.y = 1.22;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1d1424 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeM), e2 = e1.clone();
  e1.position.set(-0.1, 1.25, 0.27); e2.position.set(0.1, 1.25, 0.27);
  const blushM = new THREE.MeshBasicMaterial({ color: 0xff9a9a, transparent: true, opacity: 0.6 });
  const b1 = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), blushM), b2 = b1.clone();
  b1.position.set(-0.17, 1.17, 0.255); b2.position.set(0.17, 1.17, 0.255);
  const hat = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.46, 32), mat(0xe8c770, { roughness: 0.7 })));
  hat.position.y = 1.64;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 24), mat(0xb4472f)); band.rotation.x = Math.PI / 2; band.position.y = 1.5;
  const armM = mat(0x3d7bd9);
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, x] of [[armL, -0.3], [armR, 0.3]]) {
    const m = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.32, 4, 8), armM));
    m.position.y = -0.2;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), mat(0xf6d2ad)); hand.position.y = -0.42;
    arm.add(m, hand);
    arm.position.set(x, 0.85, 0);
    arm.rotation.z = x < 0 ? -0.18 : 0.18;
  }
  const footM = mat(0x2a2030);
  const footL = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), footM)), footR = footL.clone();
  footL.scale.set(1, 0.6, 1.4); footR.scale.copy(footL.scale);
  footL.position.set(-0.15, 0.06, 0); footR.position.set(0.15, 0.06, 0);
  // hat lantern on a pendulum
  const pivot = new THREE.Group();
  pivot.position.set(0.62, 1.52, 0.3);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), mat(0x3a2a20)); string.position.y = -0.15;
  const lanternMat = mat(0xffe2b0, { emissive: 0xffa040, emissiveIntensity: 2.5 });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.2, 10), lanternMat); lantern.position.y = -0.38;
  const lanternGlow = glowSprite(0xffb050, 1.4, 0.8); lanternGlow.position.y = -0.38;
  const light = new THREE.PointLight(0xffb050, 3, 14, 1.3); light.position.y = -0.38;
  pivot.add(string, lantern, lanternGlow, light);
  body.add(robe, sash, head, e1, e2, b1, b2, hat, band, armL, armR, pivot);
  g.add(footL, footR);
  return { g, body, armL, armR, footL, footR, pivot, lantern, lanternMat, lanternGlow, light, phase: 0, swing: new THREE.Vector2(), swingV: new THREE.Vector2(), yaw: 0, prev: new THREE.Vector3(), vel: new THREE.Vector3(), squash: 0, hitT: 0, flash: 0, wasAir: false };
}
const mayLanternWorld = () => view.may.lantern.getWorldPosition(new THREE.Vector3());

function makeMote() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  const halo = glowSprite(0xffd86a, 1.1, 0.9);
  g.add(core, halo);
  g.userData = { ph: Math.random() * 6, halo };
  return g;
}

const shadeBodyGeo = new THREE.SphereGeometry(0.85, 32, 24);
function makeShade() {
  const g = new THREE.Group(), inner = new THREE.Group();
  g.add(inner);
  const m = mat(0x14051f, { emissive: 0x4a0f72, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.96 });
  const body = shadowed(new THREE.Mesh(shadeBodyGeo, m));
  const tails = [];
  for (let k = 0; k < 4; k++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 10), m);
    const a = (k / 4) * Math.PI * 2;
    t.rotation.x = Math.PI;
    t.position.set(Math.cos(a) * 0.4, -0.85, Math.sin(a) * 0.4);
    t.userData.a = a;
    tails.push(t);
    inner.add(t);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe9dcff });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), eyeMat), e2 = e1.clone();
  e1.position.set(-0.27, 0.18, 0.72); e2.position.set(0.27, 0.18, 0.72);
  e1.scale.set(1, 1.3, 0.6); e2.scale.copy(e1.scale);
  const aura = glowSprite(0x7a2cff, 3.2, 0.25);
  aura.material.blending = THREE.AdditiveBlending;
  const stars = new THREE.Group();
  for (let k = 0; k < 3; k++) stars.add(glowSprite(0xfff08a, 0.45, 0.95));
  stars.position.y = 1.3;
  stars.visible = false;
  inner.add(body, e1, e2, aura, stars);
  return { g, inner, m, body, tails, eyes: [e1, e2], eyeMat, aura, stars, spawnT: 0, inkT: 0, prev: null, flinch: 0, ph: Math.random() * 6 };
}

const pulseRings = [0, 1].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 96), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  r.rotation.x = -Math.PI / 2;
  scene.add(r);
  return r;
});

// ---------- audio (synthesised, no asset files) ----------
let actx = null, muted = false, gestured = false;
for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => { gestured = true; }, { capture: true });
function tone(freq, dur = 0.15, type = 'sine', vol = 0.08, delay = 0, slide = 0) {
  if (muted) return;
  if (!gestured) return; // browsers only allow audio after a key/click
  try { actx ??= new AudioContext(); } catch { return; }
  const t0 = actx.currentTime + delay, o = actx.createOscillator(), gn = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}

// ---------- game session ----------
let game, view, mode = 'start', acc = 0, pulseT = -1, flashT = 0, shake = 0;
let camYaw = 0, camPos = new THREE.Vector3(0, 8, -12), camLook = new THREE.Vector3();
const keys = new Set(), latch = new Set();
const stats = { stunned: 0, deposited: 0 };

function newGame() {
  if (view) {
    for (const v of view.lanterns) scene.remove(v.g);
    scene.remove(view.may.g);
    for (const m of view.motes.values()) scene.remove(m);
    for (const s of view.shades.values()) scene.remove(s.g);
  }
  game = createGame({ seed: Number(params.get('seed') ?? (Date.now() % 2147483647)), scenario: debugScenario });
  view = { may: makeMay(), lanterns: game.lanterns.map(() => makeLantern()), motes: new Map(), shades: new Map() };
  scene.add(view.may.g);
  view.may.g.position.fromArray(game.player.pos);
  view.may.prev.fromArray(game.player.pos);
  game.lanterns.forEach((L, i) => { view.lanterns[i].g.position.set(L.pos[0], 0, L.pos[2]); view.lanterns[i].wasLit = L.lit; scene.add(view.lanterns[i].g); });
  camYaw = 0; acc = 0; stats.stunned = 0; stats.deposited = 0;
  replay = replayFrames ? inputTimeline(replayFrames) : null;
  window.__game = game;
}

function startPlay() {
  newGame();
  mode = 'play';
  $('start').hidden = true; $('end').hidden = true;
  tone(392, 0.4, 'triangle', 0.06); tone(523, 0.5, 'triangle', 0.06, 0.12);
  // ?ff=N fast-forwards N sim ticks (replay/debug) so screenshots can land on a specific moment.
  for (let k = Number(params.get('ff') ?? 0); k > 0 && game.state === 'playing'; k--) step(game, replay ? replay.at(game.tick) : currentInput());
  view.may.prev.fromArray(game.player.pos);
  const p = game.player.pos;
  camPos.set(p[0], 5.2, p[2] - 9.5);
  camLook.set(p[0], 1.3, p[2]);
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (mode !== 'play' && (k === 'enter' || (mode === 'end' && k === 'r'))) return startPlay();
  if (k === 'm') muted = !muted;
  keys.add(k); latch.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let dragX = null;
addEventListener('pointerdown', (e) => { dragX = e.clientX; });
addEventListener('pointerup', () => { dragX = null; });
addEventListener('pointermove', (e) => { if (dragX !== null) { camYaw -= (e.clientX - dragX) * 0.3; dragX = e.clientX; } });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight);
  for (const p of [sparks, ink]) p.mat.uniforms.uScale.value = innerHeight * PR * 0.6;
});

const btn = (k) => keys.has(k) || latch.has(k);
function currentInput() {
  // Looking along +Z (yaw 0) screen-right is world -X, so D maps to move.x = -1.
  const x = (btn('a') ? 1 : 0) - (btn('d') ? 1 : 0);
  const z = (btn('w') ? 1 : 0) - (btn('s') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: btn(' '), interact: btn('e'), pulse: btn('f'), dash: false };
}

function onEvent(e) {
  const P = game.player, mayPos = new THREE.Vector3().fromArray(P.pos);
  switch (e.name) {
    case 'mote_picked': tone(900 + e.data.carried * 45, 0.12, 'sine', 0.06); view.may.flash = Math.max(view.may.flash, 0.4); break;
    case 'deposit': {
      const i = game.lanterns.findIndex((L) => L.id === e.data.lantern_id), v = view.lanterns[i];
      stats.deposited += e.data.amount;
      for (let k = 0; k < e.data.amount; k++) {
        sparks.emit({ pos: mayLanternWorld(), to: () => lampWorld(v), life: 0.55, delay: k * 0.09, size: 0.7, arc: 1.4, color: 0xffd86a,
          onArrive: () => { v.pulse = 1; burst(lampWorld(v), 6, { speed: 1.5, up: 1.5, life: 0.5, size: 0.3 }); tone(520 + k * 60, 0.18, 'triangle', 0.05); } });
      }
      break;
    }
    case 'lantern_lit': {
      const i = game.lanterns.findIndex((L) => L.id === e.data.lantern_id), v = view.lanterns[i];
      v.litT = 0;
      setTimeout(() => { burst(lampWorld(v), 90, { speed: 7, up: 6, life: 1.6, size: 0.55, gravity: 2 }); [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.9, 'triangle', 0.06, k * 0.09)); }, 550); // after the deposit sparks arrive
      break;
    }
    case 'pulse': {
      pulseT = 0; view.may.flash = 1;
      stats.stunned += e.data.stunned_ids.length;
      const c = mayPos.clone().setY(0.8);
      for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2; sparks.emit({ pos: c, vel: new THREE.Vector3(Math.cos(a) * 14, rand(0, 1.5), Math.sin(a) * 14), color: 0xffe6a8, life: 0.45, size: 0.5, drag: 3 }); }
      for (const id of e.data.stunned_ids) { const s = view.shades.get(id); if (s) inkBurst(s.g.position, 14, 3.5); }
      tone(240, 0.5, 'sine', 0.1, 0, 2.5); tone(480, 0.35, 'triangle', 0.05, 0.02, 1.8);
      break;
    }
    case 'player_hit': {
      flashT = 0.6; shake = 0.5; view.may.hitT = 0.5;
      for (let k = 0; k < e.data.dropped; k++) {
        const a = rand(0, Math.PI * 2);
        sparks.emit({ pos: mayLanternWorld(), vel: new THREE.Vector3(Math.cos(a) * 4, rand(3, 6), Math.sin(a) * 4), color: 0xffd86a, life: 1.1, size: 0.6, gravity: 9, drag: 0.5 });
      }
      inkBurst(mayPos.clone().setY(1), 22, 4);
      tone(140, 0.35, 'sawtooth', 0.07, 0, 0.5); tone(90, 0.4, 'square', 0.04, 0.03, 0.6);
      break;
    }
    case 'shade_spawned': tone(70, 0.8, 'sawtooth', 0.04, 0, 1.6); break;
    case 'game_over': setTimeout(() => endGame(e.data), e.data.result === 'won' ? 1600 : 700); break;
  }
}

function endGame({ result, reason }) {
  mode = 'end'; // camera keeps following Mây until now, so the final burst is visible
  const lit = game.lanterns.filter((L) => L.lit).length;
  $('end-title').textContent = result === 'won' ? 'Đảo đã sáng trở lại!' : 'Đêm vẫn còn tối…';
  $('end-detail').textContent = { all_lit: 'Mây đã thắp cả 5 Đèn Lồng Lớn.', dawn: 'Bình minh tới trước khi thắp hết đèn.', no_flames: 'Mây đã hết ngọn lửa.' }[reason];
  const rows = [['Đèn đã thắp', `${lit} / 5`], ['Đom đóm đã nạp', stats.deposited], ['Bóng Mực bị xua', stats.stunned], ['Ngọn lửa còn lại', game.player.flames], ['Tổng điểm', game.score]];
  $('end-stats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  $('end').hidden = false;
  if (result === 'won') [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 1.2, 'triangle', 0.05, k * 0.12));
}

// ---------- frame ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), now = clock.elapsedTime;
  if (keys.has('arrowleft')) camYaw += 100 * dt;
  if (keys.has('arrowright')) camYaw -= 100 * dt;
  if (mode === 'play' && game.state === 'playing') {
    acc += dt;
    while (acc >= 1 / TPS && game.state === 'playing') {
      for (const e of step(game, replay ? replay.at(game.tick) : currentInput())) onEvent(e);
      latch.clear();
      acc -= 1 / TPS;
    }
  }
  draw(now, dt);
  composer.render();
  requestAnimationFrame(frame);
}

function drawMay(now, dt) {
  const P = game.player, may = view.may;
  const pos = tmp.fromArray(P.pos);
  may.vel.copy(pos).sub(may.prev).divideScalar(Math.max(dt, 1e-4));
  may.prev.copy(pos);
  may.g.position.copy(pos);
  const speed = Math.hypot(may.vel.x, may.vel.z);
  if (speed > 0.5) may.yaw = angleDamp(may.yaw, Math.atan2(may.vel.x, may.vel.z), 12, dt);
  may.g.rotation.y = may.yaw;
  // walk cycle
  const walking = speed > 0.5 && P.pos[1] === 0;
  may.phase += dt * (walking ? speed * 2.2 : 0);
  const s = Math.sin(may.phase), w = walking ? 1 : 0;
  may.footL.position.z = s * 0.2 * w; may.footR.position.z = -s * 0.2 * w;
  may.footL.position.y = 0.06 + Math.max(0, -s) * 0.08 * w; may.footR.position.y = 0.06 + Math.max(0, s) * 0.08 * w;
  may.armL.rotation.x = s * 0.7 * w; may.armR.rotation.x = -s * 0.7 * w;
  const breathe = Math.sin(now * 2.2) * 0.015;
  may.body.position.y = Math.abs(Math.cos(may.phase)) * 0.07 * w + breathe;
  may.body.rotation.x = damp(may.body.rotation.x, w * 0.12 + (may.hitT > 0 ? -0.5 * may.hitT : 0), 10, dt);
  // jump stretch, landing squash
  const air = P.pos[1] > 0;
  if (may.wasAir && !air) { may.squash = 1; burst(pos.clone().setY(0.1), 8, { color: 0xbfaee8, speed: 2, up: 0.6, life: 0.4, size: 0.35, gravity: 0 }); }
  may.wasAir = air;
  may.squash = Math.max(0, may.squash - dt * 6);
  const stretch = air ? 1 + Math.min(0.15, Math.abs(P.vy) * 0.02) : 1 - may.squash * 0.2;
  may.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  // hat lantern pendulum, driven by Mây's acceleration in local space
  may.swingV.x += (-may.swing.x * 40 - may.swingV.x * 3 - (speed > 0.5 ? speed * 0.18 : 0)) * dt;
  may.swingV.y += (-may.swing.y * 40 - may.swingV.y * 3 + (walking ? s * 0.4 : 0)) * dt;
  may.swing.addScaledVector(may.swingV, dt);
  may.pivot.rotation.x = may.swing.x; may.pivot.rotation.z = may.swing.y;
  // Creative: lantern glows brighter with every firefly carried; flashes on pickup/pulse.
  may.flash = Math.max(0, may.flash - dt * 2.5);
  const flicker = 1 + Math.sin(now * 17) * 0.04 + Math.sin(now * 29) * 0.03;
  may.light.intensity = (2.5 + P.carried * 0.9 + may.flash * 25) * flicker;
  may.lanternMat.emissiveIntensity = 1.5 + P.carried * 0.35 + may.flash * 4;
  may.lanternGlow.scale.setScalar(1.1 + P.carried * 0.12 + may.flash * 2);
  may.hitT = Math.max(0, may.hitT - dt);
  may.g.visible = P.invuln === 0 || Math.floor(now * 14) % 2 === 0;
  if (P.carried > 0 && Math.random() < dt * P.carried * 1.5) { // tiny sparks trailing from the lantern when carrying light
    sparks.emit({ pos: mayLanternWorld(), vel: new THREE.Vector3(rand(-0.3, 0.3), rand(0.3, 0.9), rand(-0.3, 0.3)), color: 0xffcf70, life: 0.8, size: 0.22 });
  }
}

function drawLanterns(now, dt, lit) {
  const P = game.player;
  game.lanterns.forEach((L, i) => {
    const v = view.lanterns[i];
    if (v.shown !== L.deposited) { // progress arc
      v.shown = L.deposited;
      v.ring.geometry.dispose();
      const f = Math.min(1, L.deposited / T.lantern_cost);
      v.ring.geometry = new THREE.RingGeometry(T.interact_radius - 0.22, T.interact_radius, 64, 1, Math.PI / 2, Math.max(0.001, f * Math.PI * 2));
    }
    if (L.lit && v.litT < 0 && !v.wasLit) v.litT = 0;
    if (L.lit && v.wasLit && v.litT < 0) v.litT = 99; // pre-lit by a scenario: no burst
    v.wasLit = v.wasLit || L.lit;
    if (v.litT >= 0) v.litT += dt;
    const glowK = L.lit ? Math.min(1, Math.max(0, (v.litT - 0.5) / 0.6)) : 0;
    const spike = L.lit && v.litT < 1.6 ? Math.max(0, 1 - Math.abs(v.litT - 0.6) * 1.5) : 0;
    const flicker = 1 + Math.sin(now * 11 + i) * 0.05 + Math.sin(now * 23 + i * 2) * 0.04;
    v.pulse = Math.max(0, v.pulse - dt * 3);
    const partial = L.deposited / T.lantern_cost;
    v.paperMat.emissiveIntensity = (L.lit ? 1.3 * glowK : partial * 0.7) * flicker + v.pulse * 1.2 + spike * 2.5;
    v.light.intensity = (L.lit ? 11 * glowK : partial * 2) * flicker + spike * 35 + v.pulse * 4;
    v.halo.material.opacity = (L.lit ? 0.55 * glowK : partial * 0.25) + spike * 0.5;
    v.halo.scale.setScalar(4.5 + spike * 4 + v.pulse);
    v.lamp.scale.setScalar(1 + v.pulse * 0.08 + spike * 0.15);
    v.lamp.rotation.z = Math.sin(now * 1.3 + i) * 0.04;
    v.pool.material.opacity = 0.55 * glowK;
    v.ring.visible = v.ringBase.visible = !L.lit;
    const near = Math.hypot(L.pos[0] - P.pos[0], L.pos[2] - P.pos[2]) <= T.interact_radius;
    v.ringBase.material.opacity = near && P.carried > 0 ? 0.35 + Math.sin(now * 6) * 0.15 : 0.18;
    v.barrier = Math.max(0, v.barrier - dt * 2);
    v.safe.material.opacity = L.lit ? (0.25 + Math.sin(now * 2 + i) * 0.08) * glowK + v.barrier * 0.7 : 0;
    v.safe.scale.setScalar(1 + v.barrier * 0.02);
    v.orbit.children.forEach((s, k) => {
      const a = now * 0.9 + (k / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.3, Math.sin(now * 2 + k) * 0.4, Math.sin(a) * 1.3);
      s.material.opacity = 0.9 * glowK;
    });
    if (L.lit && glowK > 0.5 && Math.random() < dt * 3) { // embers
      sparks.emit({ pos: lampWorld(v).add(tmp2.set(rand(-0.3, 0.3), 0.4, rand(-0.3, 0.3))), vel: new THREE.Vector3(rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2)), color: 0xffa040, life: 1.6, size: 0.25 });
    }
  });
}

function drawMotes(now) {
  const P = game.player, alive = new Set();
  for (const m of game.motes) {
    alive.add(m.id);
    let g = view.motes.get(m.id);
    if (!g) { g = makeMote(); g.scale.setScalar(0.01); scene.add(g); view.motes.set(m.id, g); }
    const ph = g.userData.ph;
    g.position.set(m.pos[0] + Math.sin(now * 0.8 + ph) * 0.15, 0.75 + Math.sin(now * 2.6 + ph) * 0.22, m.pos[2] + Math.cos(now * 0.7 + ph) * 0.15);
    g.scale.setScalar(Math.min(1, g.scale.x + 0.03));
    g.userData.halo.material.opacity = 0.65 + Math.sin(now * 5 + ph * 3) * 0.3;
  }
  for (const [id, g] of view.motes) {
    if (alive.has(id)) continue;
    // picked up: fly into Mây's lantern
    const near = Math.hypot(g.position.x - P.pos[0], g.position.z - P.pos[2]) < T.pickup_radius + 1.5;
    if (near) sparks.emit({ pos: g.position, to: mayLanternWorld, life: 0.35, size: 0.8, arc: 0.6, color: 0xffe08a });
    scene.remove(g);
    view.motes.delete(id);
  }
}

function drawShades(now, dt) {
  const P = game.player;
  for (const s of game.shades) {
    let v = view.shades.get(s.id);
    if (!v) {
      v = makeShade();
      v.spawnT = game.tick === 0 ? 1 : 0;
      v.g.position.fromArray(s.pos);
      if (v.spawnT === 0) inkBurst(v.g.position, 30, 3);
      scene.add(v.g);
      view.shades.set(s.id, v);
    }
    v.spawnT = Math.min(1, v.spawnT + dt * 1.2);
    const target = tmp.set(s.pos[0], s.pos[1] + Math.sin(now * 2 + v.ph) * 0.18, s.pos[2]);
    const moved = v.prev ? Math.hypot(target.x - v.prev.x, target.z - v.prev.z) : 0;
    v.prev = target.clone();
    v.g.position.copy(target);
    const stunned = s.stun > 0;
    const dP = Math.hypot(s.pos[0] - P.pos[0], s.pos[2] - P.pos[2]);
    if (!stunned) { const look = Math.atan2(P.pos[0] - s.pos[0], P.pos[2] - s.pos[2]); v.g.rotation.y = angleDamp(v.g.rotation.y, look, 8, dt); }
    // flinch at a lit lantern's barrier
    for (let i = 0; i < game.lanterns.length; i++) {
      const L = game.lanterns[i];
      if (!L.lit) continue;
      const d = Math.hypot(s.pos[0] - L.pos[0], s.pos[2] - L.pos[2]);
      if (d < T.safe_radius + 0.3) {
        v.flinch = 1;
        view.lanterns[i].barrier = Math.max(view.lanterns[i].barrier, 0.6);
        if (Math.random() < dt * 10) {
          const k = T.safe_radius / Math.max(d, 1e-3);
          const c = tmp2.set(L.pos[0] + (s.pos[0] - L.pos[0]) * k, rand(0.2, 1.5), L.pos[2] + (s.pos[2] - L.pos[2]) * k);
          sparks.emit({ pos: c, vel: new THREE.Vector3(rand(-1, 1), rand(0.5, 2), rand(-1, 1)), color: 0xffc46b, life: 0.5, size: 0.35 });
        }
      }
    }
    v.flinch = Math.max(0, v.flinch - dt * 3);
    // body wobble + spawn grow + stun squish
    const ph = v.ph, sp = v.spawnT * v.spawnT * (3 - 2 * v.spawnT);
    const sx = (1 + Math.sin(now * 3.1 + ph) * 0.07) * (1 - v.flinch * 0.15), sy = (1.15 + Math.sin(now * 2.3 + ph) * 0.09) * (stunned ? 0.75 : 1);
    v.body.scale.set(sx, sy, 1 + Math.cos(now * 2.7 + ph) * 0.07);
    v.inner.scale.setScalar(sp);
    v.inner.position.y = (sp - 1) * 1.5;
    v.tails.forEach((t, k) => { t.rotation.z = Math.sin(now * 4 + k * 1.7 + ph) * 0.35; t.position.y = -0.85 * sy; });
    v.inner.rotation.y = stunned ? v.inner.rotation.y + dt * 6 : damp(v.inner.rotation.y, 0, 6, dt);
    // eyes: lavender -> hot magenta when close; squint when flinching or stunned
    const angry = !stunned && dP < 8 ? 1 - dP / 8 : 0;
    v.eyeMat.color.setRGB(lerp(0.91, 1, angry), lerp(0.86, 0.2, angry), lerp(1, 0.55, angry));
    const squint = stunned ? 0.25 : 1 - v.flinch * 0.6;
    for (const e of v.eyes) e.scale.set(1, 1.3 * squint, 0.6);
    v.m.color.setHex(stunned ? 0x6f5aa8 : 0x14051f);
    v.m.emissive.setHex(stunned ? 0x5a4a9a : 0x4a0f72);
    v.aura.material.opacity = (stunned ? 0.12 : 0.4 + angry * 0.35) * sp;
    v.stars.visible = stunned;
    if (stunned) v.stars.children.forEach((st, k) => { const a = now * 5 + (k / 3) * Math.PI * 2; st.position.set(Math.cos(a) * 0.6, Math.sin(now * 8 + k) * 0.08, Math.sin(a) * 0.6); });
    // ink trail while moving
    v.inkT -= dt;
    if (moved > 0.001 && v.inkT <= 0) {
      v.inkT = 0.06;
      ink.emit({ pos: tmp2.set(target.x + rand(-0.3, 0.3), target.y - 0.9, target.z + rand(-0.3, 0.3)), vel: new THREE.Vector3(0, rand(0.1, 0.5), 0), color: 0x24083c, life: 0.9, size: rand(0.5, 0.9), drag: 1 });
    }
  }
  for (const [id, v] of view.shades) if (!game.shades.some((s) => s.id === id)) { scene.remove(v.g); view.shades.delete(id); }
}

function draw(now, dt) {
  const P = game.player, lit = game.lanterns.filter((L) => L.lit).length;
  skyU.uTime.value = now;
  const warm = damp(skyU.uWarm.value, lit / 5, 1.5, dt);
  skyU.uWarm.value = warm;
  stars.forEach((m, k) => { m.opacity = (0.75 + Math.sin(now * (0.8 + k * 0.7) + k) * 0.25) * (1 - warm * 0.35); });
  scene.fog.color.copy(FOG_NIGHT).lerp(FOG_WARM, warm);
  scene.fog.density = 0.009 - warm * 0.003;
  hemi.intensity = 0.9 + warm * 0.9;
  renderer.toneMappingExposure = 1.2 + warm * 0.25;
  waveSea(now);
  puffs.rotation.y += dt * 0.004;
  farIslands.forEach((g) => { g.position.y += Math.sin(now * 0.4 + g.userData.phase) * 0.01; });
  swaying.forEach((t) => { t.rotation.z = Math.sin(now * 0.9 + t.userData.phase) * 0.025; });
  fadeOccluders(dt);
  ambient.children.forEach((s) => {
    const u = s.userData;
    u.a += u.sp * 0.02;
    s.position.set(Math.cos(u.a) * u.r, u.h + Math.sin(now * 1.5 + u.ph) * 0.5, Math.sin(u.a) * u.r);
    s.material.opacity = 0.35 + Math.sin(now * 3 + u.ph) * 0.35;
  });

  drawMay(now, dt);
  drawLanterns(now, dt, lit);
  drawMotes(now);
  drawShades(now, dt);
  sparks.update(dt);
  ink.update(dt);

  if (pulseT >= 0) {
    pulseT += dt;
    pulseRings.forEach((r, k) => {
      const kk = Math.min(Math.max((pulseT - k * 0.08) / 0.45, 0), 1);
      r.position.set(P.pos[0], 0.12 + k * 0.05, P.pos[2]);
      r.scale.setScalar(Math.max(0.01, kk * T.pulse_radius));
      r.material.opacity = kk > 0 ? 0.9 * (1 - kk) : 0;
    });
    if (pulseT > 0.6) pulseT = -1;
  }
  flashT = Math.max(0, flashT - dt);
  $('flash').style.opacity = String(Math.min(1, flashT * 1.6));

  // light follows the player so the shadow map stays sharp around the action
  moonLight.target.position.set(P.pos[0], 0, P.pos[2]);
  moonLight.position.copy(moonLight.target.position).addScaledVector(moonDir, 70);

  // camera: smoothed chase cam in play, slow orbit on title / end screens
  const th = (camYaw * Math.PI) / 180;
  shake = Math.max(0, shake - dt);
  if (mode === 'play') {
    tmp.set(P.pos[0] - Math.sin(th) * 9.5, P.pos[1] * 0.5 + 5.2, P.pos[2] - Math.cos(th) * 9.5);
    camPos.set(damp(camPos.x, tmp.x, 6, dt), damp(camPos.y, tmp.y, 6, dt), damp(camPos.z, tmp.z, 6, dt));
    tmp.set(P.pos[0], P.pos[1] * 0.5 + 1.3, P.pos[2]);
  } else {
    const a = now * 0.07 + (mode === 'end' ? 1 : 0);
    tmp.set(Math.sin(a) * 44, 18, Math.cos(a) * 44);
    camPos.set(damp(camPos.x, tmp.x, 1.5, dt), damp(camPos.y, tmp.y, 1.5, dt), damp(camPos.z, tmp.z, 1.5, dt));
    tmp.set(0, 0, 0);
  }
  camLook.set(damp(camLook.x, tmp.x, 8, dt), damp(camLook.y, tmp.y, 8, dt), damp(camLook.z, tmp.z, 8, dt));
  camera.position.copy(camPos);
  if (shake > 0) camera.position.add(tmp2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.5));
  camera.lookAt(camLook);
  skyGroup.position.copy(camera.position);

  drawHud(lit);
}

// Fade trees/rocks that are near the camera->Mây line segment (XZ), so the player is never hidden.
const seg = new THREE.Vector2(), toObj = new THREE.Vector2();
function fadeOccluders(dt) {
  const P = game.player, cx = camera.position.x, cz = camera.position.z;
  seg.set(P.pos[0] - cx, P.pos[2] - cz);
  const len2 = Math.max(seg.lengthSq(), 1e-6);
  for (const o of occluders) {
    toObj.set(o.position.x - cx, o.position.z - cz);
    const t = Math.min(1, Math.max(0, toObj.dot(seg) / len2));
    const d = Math.hypot(toObj.x - seg.x * t, toObj.y - seg.y * t);
    const target = t > 0.02 && t < 0.98 && d < 2.6 ? 0.18 : 1;
    const op = damp(o.userData.op ?? 1, target, 8, dt);
    o.userData.op = op;
    o.traverse((m) => { if (m.material) { m.material.transparent = op < 0.99; m.material.opacity = op; m.material.depthWrite = op > 0.5; m.castShadow = true; } });
  }
}

const setHTML = (id, html) => { const el = $(id); if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } }; // only touch the DOM on change

function drawHud(lit) {
  const P = game.player;
  setHTML('flames', Array.from({ length: Math.max(T.flames, P.flames) }, (_, k) => `<i class="flame${k < P.flames ? '' : ' off'}"></i>`).join(''));
  $('carried').textContent = `${P.carried}/${T.carry_capacity}`;
  $('carried-bar').style.width = `${(100 * P.carried) / T.carry_capacity}%`;
  setHTML('pips', game.lanterns.map((L) => `<i class="pip${L.lit ? ' on' : ''}" title="${L.id}"></i>`).join(''));
  const tl = Math.max(0, timeLeft(game));
  $('time').textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  $('time-bar').style.width = `${(100 * tl) / game.timeStart}%`;
  $('score').textContent = String(game.score);
  const ready = P.carried >= T.pulse_cost && P.pulseCd === 0;
  $('pulse').textContent = P.carried < T.pulse_cost ? `cần ${T.pulse_cost} đom đóm` : P.pulseCd > 0 ? 'đang hồi…' : 'sẵn sàng · F';
  $('pulse').className = ready ? 'ready' : '';
  let hint = '';
  if (mode === 'play') {
    const nearLantern = game.lanterns.find((L) => !L.lit && Math.hypot(L.pos[0] - P.pos[0], L.pos[2] - P.pos[2]) <= T.interact_radius);
    if (nearLantern && P.carried > 0) hint = `Nhấn E để nạp đèn ${nearLantern.id} (${nearLantern.deposited}/${T.lantern_cost})`;
    else if (ready && game.shades.some((s) => s.stun === 0 && Math.hypot(s.pos[0] - P.pos[0], s.pos[2] - P.pos[2]) <= T.pulse_radius)) hint = 'Bóng Mực tới gần! Nhấn F để tỏa sáng';
    else if (P.carried >= T.lantern_cost) hint = 'Mang đom đóm tới Đèn Lồng Lớn (vòng sáng cam)';
  }
  if (hint) $('hint').textContent = hint;
  $('hint').classList.toggle('hide', !hint);
}

// ?scenario=../scenarios/x.scenario.json loads the same setup a headless test uses (screenshots/debug).
// ?inputs=../scenarios/x.inputs.json replays a headless inputs file instead of the keyboard (reproducible demos).
let debugScenario = {}, replayFrames = null, replay = null;
if (params.get('scenario')) debugScenario = validateScenario(await (await fetch(params.get('scenario'))).json(), ['L1', 'L2', 'L3', 'L4', 'L5']);
if (params.get('inputs')) replayFrames = validateInputs(await (await fetch(params.get('inputs'))).json());
newGame();
if (params.has('autostart')) startPlay();
frame();

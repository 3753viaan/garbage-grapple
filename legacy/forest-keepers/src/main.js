// ============================================================
// FOREST KEEPERS — Humara Desh Wildlife Reserve
// A 3D conservation game: collect trash, recycle it, upgrade
// your bag, and protect the wildlife from poachers.
// ============================================================
import * as THREE from 'three';
import * as M from './models.js';
import { sfx } from './audio.js';

/* ================= CONFIG ================= */
const WORLD_HALF = 245;
const LEVELS = [
  { trash: 5,  time: 240, poachers: 0, rMin: 45, rMax: 90  },
  { trash: 7,  time: 190, poachers: 1, rMin: 50, rMax: 110 },
  { trash: 9,  time: 165, poachers: 1, rMin: 55, rMax: 130 },
  { trash: 11, time: 140, poachers: 2, rMin: 60, rMax: 150 },
  { trash: 13, time: 120, poachers: 2, rMin: 65, rMax: 170 },
  { trash: 15, time: 100, poachers: 3, rMin: 70, rMax: 190 },
  { trash: 18, time: 85,  poachers: 4, rMin: 75, rMax: 210 },
];
const BAGS = [
  { id: 'jute',    name: 'Jute Sack',       cap: 5,  price: 0,   emoji: '🛍️', desc: 'Standard-issue ranger sack.' },
  { id: 'canvas',  name: 'Canvas Duffel',   cap: 8,  price: 60,  emoji: '👝', desc: 'Sturdy stitched canvas.' },
  { id: 'ruck',    name: 'Ranger Rucksack', cap: 12, price: 140, emoji: '🎒', desc: 'Pro patrol capacity.' },
  { id: 'compact', name: 'Compactor Pack',  cap: 18, price: 280, emoji: '🧳', desc: 'Hydraulic waste compression.' },
  { id: 'titan',   name: 'Titan Eco-Vault', cap: 25, price: 520, emoji: '🛡️', desc: 'The legendary bottomless bag.' },
];
const GEAR = [
  { id: 'boots', name: 'Trail Runners', price: 120, emoji: '👟', desc: '+30% movement speed.' },
  { id: 'radar', name: 'Poacher Radar', price: 200, emoji: '📡', desc: 'Poachers marked through the forest.' },
];
const ZONES = [
  { name: 'Elephant Savanna', species: 'elephant', cx: 140,  cz: -130, radius: 45, count: 3 },
  { name: 'Rhino Mudflats',   species: 'rhino',    cx: -170, cz: -50,  radius: 40, count: 3 },
  { name: 'Tiger Jungle',     species: 'tiger',    cx: 115,  cz: 155,  radius: 45, count: 2 },
  { name: 'Deer Meadow',      species: 'deer',     cx: -120, cz: 140,  radius: 45, count: 4 },
];
const TOKENS_PER_TRASH = 6, TOKENS_PER_ARREST = 30, POACH_PENALTY = 40;
const POACH_SECONDS = 12;

/* ================= STATE / SAVE ================= */
const state = {
  mode: 'menu',           // menu | idle | starting | level | fail | won
  levelIndex: 0, tokens: 0, bag: 0, deposited: 0, timeLeft: 0,
  ownedBags: ['jute'], equippedBag: 'jute', gear: [],
  jailed: 0, totalRecycled: 0, shopOpen: false, hints: {},
};
const SAVE_KEY = 'forest-keepers-save';
function saveGame() {
  const { tokens, levelIndex, ownedBags, equippedBag, gear, jailed, totalRecycled, hints } = state;
  localStorage.setItem(SAVE_KEY, JSON.stringify({ tokens, levelIndex, ownedBags, equippedBag, gear, jailed, totalRecycled, hints }));
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) Object.assign(state, s);
  } catch (e) { /* fresh start */ }
}
loadGame();

const bagDef = () => BAGS.find(b => b.id === state.equippedBag) || BAGS[0];
const hasGear = id => state.gear.includes(id);

/* ================= RENDERER / SCENE ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9ec);
scene.fog = new THREE.Fog(0xcfe3d2, 80, 340);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a5d3a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.7);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ================= TERRAIN ================= */
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function heightAt(x, z) {
  let h = 2.4 * Math.sin(x * 0.02) * Math.cos(z * 0.017)
        + 1.5 * Math.sin(x * 0.045 + 1.3) * Math.sin(z * 0.038 + 0.7)
        + 0.7 * Math.sin(x * 0.09 + 2.1) * Math.cos(z * 0.083);
  return h * smoothstep(26, 68, Math.hypot(x, z));
}
{
  const geo = new THREE.PlaneGeometry(2 * WORLD_HALF + 60, 2 * WORLD_HALF + 60, 130, 130);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), grassA = new THREE.Color(0x4c7f3a), grassB = new THREE.Color(0x3c6b2e),
        dirt = new THREE.Color(0x9c8256), mud = new THREE.Color(0x7a6248);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const n = Math.sin(x * 0.13 + z * 0.07) * Math.sin(z * 0.11 - x * 0.05) * 0.5 + 0.5;
    c.copy(grassA).lerp(grassB, n);
    const dCamp = Math.hypot(x, z);
    if (dCamp < 34) c.lerp(dirt, 1 - smoothstep(20, 34, dCamp));
    const dMud = Math.hypot(x + 170, z + 50);
    if (dMud < 34) c.lerp(mud, 1 - smoothstep(18, 34, dMud));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

/* ================= VEGETATION (instanced) ================= */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
function scatter(count, opts) {
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < count * 30) {
    const x = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
    const z = (Math.random() * 2 - 1) * (WORLD_HALF - 6);
    const d0 = Math.hypot(x, z);
    if (d0 < (opts.minCamp ?? 40)) continue;
    if (opts.avoidZones) {
      let bad = false;
      for (const zn of ZONES) if (Math.hypot(x - zn.cx, z - zn.cz) < (opts.zoneClear ?? 16)) { bad = true; break; }
      if (bad) continue;
    }
    spots.push({ x, z });
  }
  return spots;
}
function instancedFrom(spots, geo, matOpts, scaleRange, colorFn, shadow = true) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, ...matOpts });
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const col = new THREE.Color();
  spots.forEach((p, i) => {
    const s = scaleRange[0] + Math.random() * (scaleRange[1] - scaleRange[0]);
    _q.setFromAxisAngle(_up, Math.random() * Math.PI * 2);
    _s.set(s, s * (0.85 + Math.random() * 0.3), s);
    _v.set(p.x, heightAt(p.x, p.z) - 0.05, p.z);
    _m4.compose(_v, _q, _s);
    im.setMatrixAt(i, _m4);
    if (colorFn) { colorFn(col, i); im.setColorAt(i, col); }
  });
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = shadow; im.receiveShadow = true;
  scene.add(im);
  return im;
}
{
  // extra-dense jungle around the tiger zone for atmosphere
  const pineSpots = scatter(160, { avoidZones: true });
  const oakSpots = scatter(150, { avoidZones: true });
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 34;
    oakSpots.push({ x: 115 + Math.cos(a) * r, z: 155 + Math.sin(a) * r });
  }
  instancedFrom(pineSpots, M.pineTrunkGeo(), { color: 0x6e4a2c }, [0.8, 1.5]);
  instancedFrom(pineSpots, M.pineCrownGeo(), { color: 0xffffff }, [0.8, 1.5],
    (c) => c.setHSL(0.34 + Math.random() * 0.05, 0.55, 0.2 + Math.random() * 0.1));
  instancedFrom(oakSpots, M.oakTrunkGeo(), { color: 0x7a5230 }, [0.8, 1.4]);
  instancedFrom(oakSpots, M.oakCrownGeo(), { color: 0xffffff }, [0.8, 1.4],
    (c) => c.setHSL(0.28 + Math.random() * 0.07, 0.5, 0.26 + Math.random() * 0.12));
  instancedFrom(scatter(90, { minCamp: 24 }), M.bushGeo(), { color: 0xffffff }, [0.7, 1.6],
    (c) => c.setHSL(0.3 + Math.random() * 0.06, 0.45, 0.24 + Math.random() * 0.1));
  instancedFrom(scatter(55, { minCamp: 20 }), M.rockGeo(), { color: 0xffffff }, [0.5, 1.8],
    (c) => c.setHSL(0, 0, 0.42 + Math.random() * 0.2));
  instancedFrom(scatter(1500, { minCamp: 18 }), M.grassGeo(), { color: 0xffffff }, [0.8, 1.8],
    (c) => c.setHSL(0.29 + Math.random() * 0.07, 0.5, 0.3 + Math.random() * 0.12), false);
  instancedFrom(scatter(240, { minCamp: 22 }), M.flowerGeo(), { color: 0xffffff }, [0.7, 1.3],
    (c) => c.setHSL(Math.random(), 0.75, 0.65), false);
}

/* ================= CAMP (starter area) ================= */
const truck = M.makeTruck();
truck.position.set(9, 0, -7); truck.rotation.y = 0.5;
scene.add(truck);
const hopperWorld = () => truck.localToWorld(truck.userData.hopperLocal.clone());

const hut = M.makeShopHut();
hut.position.set(-13, 0, -3); hut.rotation.y = 0.9;
scene.add(hut);

const jail = M.makeJail();
jail.position.set(-9, 0, 13); jail.rotation.y = -0.5;
scene.add(jail);

const arch = M.makeBannerArch('HUMARA DESH WILDLIFE RESERVE');
arch.position.set(0, 0, 26);
scene.add(arch);

const podium = M.makePodium();
podium.position.set(4, 0, 7); podium.rotation.y = -2.4;
scene.add(podium);

const campfire = M.makeCampfire();
campfire.position.set(-3, 0, -14);
scene.add(campfire);

const ranger = M.makeRanger();
ranger.position.set(-10.5, 0, 2.5); ranger.rotation.y = 1.2;
scene.add(ranger);

for (const zn of ZONES) {
  const dir = Math.atan2(-zn.cx, -zn.cz);
  const sx = zn.cx + Math.sin(dir) * (zn.radius + 8), sz = zn.cz + Math.cos(dir) * (zn.radius + 8);
  const sign = M.makeSign(zn.name);
  sign.position.set(sx, heightAt(sx, sz), sz);
  sign.rotation.y = dir;
  scene.add(sign);
}

let winSign = null;

/* clouds + birds */
const clouds = [];
for (let i = 0; i < 10; i++) {
  const c = M.makeCloud();
  c.position.set((Math.random() * 2 - 1) * 300, 85 + Math.random() * 25, (Math.random() * 2 - 1) * 300);
  c.userData.speed = 1.2 + Math.random() * 1.6;
  scene.add(c); clouds.push(c);
}
const birds = [];
for (let i = 0; i < 8; i++) {
  const b = M.makeBird();
  birds.push({ g: b, cx: (Math.random() * 2 - 1) * 160, cz: (Math.random() * 2 - 1) * 160,
    r: 18 + Math.random() * 30, h: 22 + Math.random() * 16, sp: 0.25 + Math.random() * 0.3,
    a: Math.random() * Math.PI * 2, ph: Math.random() * 6 });
  scene.add(b);
}

/* ================= PLAYER ================= */
const player = M.makeHuman({ shirt: 0x2e6b3f, pants: 0x5a4632, hat: 'ranger', skin: 0xc98e5a });
player.position.set(0, 0, 14);
player.rotation.y = Math.PI;
scene.add(player);
let backpack = null;
function equipBackpackVisual() {
  if (backpack) player.remove(backpack);
  backpack = M.makeBackpack(BAGS.findIndex(b => b.id === state.equippedBag));
  player.add(backpack);
}
equipBackpackVisual();

// guide arrow — floats above the player, points at the current objective
const guideArrow = (() => {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10),
    new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xc9a227, emissiveIntensity: 0.9 }));
  c.rotation.x = Math.PI / 2; // point along +Z of group
  g.add(c);
  scene.add(g);
  return g;
})();

/* ================= INPUT ================= */
const keys = {};
let yaw = 0, pitch = 0.34, camDist = 7.5; // yaw 0 → camera looks toward the camp at spawn
const canvas = renderer.domElement;
const KEYMAP = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };
addEventListener('keydown', e => {
  const code = KEYMAP[e.code] || e.code;
  keys[code] = true;
  if (code === 'KeyE') onInteract();
  if (code === 'Escape' && state.shopOpen) closeShop();
});
addEventListener('keyup', e => { keys[KEYMAP[e.code] || e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('click', () => {
  if (state.shopOpen || state.mode === 'menu' || state.mode === 'fail') return;
  if (!document.pointerLockElement) {
    // pointer lock can be unavailable/denied in embedded browsers — drag-look still works
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* fall back to drag-look */ }
  }
});
document.addEventListener('pointerlockchange', updateClickHint);
let dragging = false, lastMX = 0, lastMY = 0;
canvas.addEventListener('mousedown', e => {
  if (!document.pointerLockElement) { dragging = true; lastMX = e.clientX; lastMY = e.clientY; }
});
addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('mousemove', e => {
  let mx = 0, my = 0;
  if (document.pointerLockElement === canvas) { mx = e.movementX; my = e.movementY; }
  else if (dragging && !state.shopOpen && state.mode !== 'menu') {
    mx = e.clientX - lastMX; my = e.clientY - lastMY;
    lastMX = e.clientX; lastMY = e.clientY;
  } else return;
  yaw -= mx * 0.0024;
  pitch = Math.min(1.15, Math.max(-0.2, pitch + my * 0.0022));
});
addEventListener('wheel', e => { camDist = Math.min(13, Math.max(4.5, camDist + Math.sign(e.deltaY) * 0.8)); });

function updateClickHint() {
  const show = !document.pointerLockElement && !state.shopOpen &&
    (state.mode === 'idle' || state.mode === 'level' || state.mode === 'won');
  document.getElementById('clickHint').classList.toggle('hidden', !show || !hudVisible);
}

/* ================= DOM refs ================= */
const $ = id => document.getElementById(id);
const dom = {
  hud: $('hud'), start: $('startScreen'), startBtn: $('startBtn'), resetSave: $('resetSave'),
  levelLabel: $('levelLabel'), objective: $('objectiveLabel'),
  timerWrap: $('timerWrap'), timerText: $('timerText'), timerBar: $('timerBar'),
  tokenCard: $('tokenCard'), tokenText: $('tokenText'), tokenDelta: $('tokenDelta'),
  bagCard: $('bagCard'), bagText: $('bagText'), bagBar: $('bagBar'),
  prompt: $('prompt'), msgArea: $('msgArea'),
  intro: $('levelIntro'), introBig: $('introBig'), introSub: $('introSub'),
  shop: $('shopOverlay'), shopTokens: $('shopTokens'), bagGrid: $('bagGrid'), gearGrid: $('gearGrid'),
  fail: $('failOverlay'), failText: $('failText'),
  win: $('winOverlay'), winStats: $('winStats'), confettiBox: $('confettiBox'),
};
let hudVisible = false;

/* ================= MESSAGES & HINTS ================= */
function showMsg(html, cls = '', dur = 2.8) {
  const div = document.createElement('div');
  div.className = `msg card ${cls}`;
  div.innerHTML = html;
  dom.msgArea.appendChild(div);
  while (dom.msgArea.children.length > 3) dom.msgArea.firstChild.remove();
  setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 420); }, dur * 1000);
}
function hint(key, html, dur = 5) {
  if (state.hints[key]) return;
  state.hints[key] = true; saveGame();
  showMsg(html, 'hint', dur);
}
function tokenFx(delta) {
  state.tokens = Math.max(0, state.tokens + delta);
  dom.tokenText.textContent = state.tokens;
  dom.tokenCard.classList.remove('bump'); void dom.tokenCard.offsetWidth;
  dom.tokenCard.classList.add('bump');
  dom.tokenDelta.textContent = (delta >= 0 ? '+' : '') + delta + ' 🪙';
  dom.tokenDelta.classList.toggle('neg', delta < 0);
  dom.tokenDelta.classList.remove('show'); void dom.tokenDelta.offsetWidth;
  dom.tokenDelta.classList.add('show');
  saveGame();
}

/* ================= TWEENS / SCHEDULER ================= */
const tweens = [], pending = [];
function tween(dur, fn, done, ease = k => k * (2 - k)) { tweens.push({ t: 0, dur, fn, done, ease }); }
function after(delay, fn) { pending.push({ delay, fn }); }
function tickTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(k));
    if (k >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    pending[i].delay -= dt;
    if (pending[i].delay <= 0) { const f = pending[i].fn; pending.splice(i, 1); f(); }
  }
}
let shakeT = 0;
function shake(amount = 0.3) { shakeT = Math.max(shakeT, amount); }
function sparkle(pos, color = 0xffd76a) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const dirs = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), mat);
    g.add(s);
    dirs.push(new THREE.Vector3((Math.random() - .5), Math.random() * 0.9 + 0.2, (Math.random() - .5)).normalize());
  }
  g.position.copy(pos);
  scene.add(g);
  tween(0.6, k => {
    g.children.forEach((s, i) => s.position.copy(dirs[i]).multiplyScalar(k * 1.4));
    mat.opacity = 1 - k;
  }, () => scene.remove(g));
}

/* ================= ANIMALS ================= */
const animals = [];
function spawnAnimal(zone) {
  const maker = { elephant: M.makeElephant, rhino: M.makeRhino, tiger: M.makeTiger, deer: M.makeDeer }[zone.species];
  const g = maker();
  const a = Math.random() * Math.PI * 2, r = Math.random() * zone.radius * 0.7;
  const x = zone.cx + Math.cos(a) * r, z = zone.cz + Math.sin(a) * r;
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  const rec = {
    g, zone, species: zone.species, alive: true,
    st: 'idle', stT: Math.random() * 3 + 1, tgt: new THREE.Vector3(),
    speed: { elephant: 1.3, rhino: 1.5, tiger: 2.2, deer: 2.4 }[zone.species],
    phase: Math.random() * 6,
  };
  animals.push(rec);
  return rec;
}
function ensureAnimals() {
  for (const zn of ZONES) {
    const aliveCount = animals.filter(a => a.zone === zn && a.alive).length;
    for (let i = aliveCount; i < zn.count; i++) {
      const rec = spawnAnimal(zn);
      rec.g.scale.setScalar(0.01);
      tween(0.8, k => rec.g.scale.setScalar(k));
    }
  }
}
ensureAnimals();

function tickAnimals(dt, t) {
  for (const a of animals) {
    if (!a.alive) continue;
    const ud = a.g.userData;
    let moving = false;
    if (a.species === 'deer') {
      const dp = a.g.position.distanceTo(player.position);
      if (dp < 9 && a.st !== 'flee') {
        a.st = 'flee'; a.stT = 2.2;
        const away = a.g.position.clone().sub(player.position).setY(0).normalize().multiplyScalar(22);
        a.tgt.copy(a.g.position).add(away);
      }
    }
    if (a.st === 'idle') {
      a.stT -= dt;
      if (a.stT <= 0) {
        a.st = 'walk';
        const ang = Math.random() * Math.PI * 2, r = Math.random() * a.zone.radius;
        a.tgt.set(a.zone.cx + Math.cos(ang) * r, 0, a.zone.cz + Math.sin(ang) * r);
      }
    } else {
      const dx = a.tgt.x - a.g.position.x, dz = a.tgt.z - a.g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) { a.st = 'idle'; a.stT = 1.5 + Math.random() * 4; }
      else {
        moving = true;
        const sp = a.st === 'flee' ? a.speed * 3 : a.speed;
        const want = Math.atan2(dx, dz);
        let dy = want - a.g.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        a.g.rotation.y += dy * Math.min(1, dt * 4);
        a.g.position.x += Math.sin(a.g.rotation.y) * sp * dt;
        a.g.position.z += Math.cos(a.g.rotation.y) * sp * dt;
        if (a.st === 'flee') { a.stT -= dt; if (a.stT <= 0) { a.st = 'idle'; a.stT = 2; } }
      }
    }
    a.g.position.y = heightAt(a.g.position.x, a.g.position.z);
    a.phase += dt * (moving ? (a.st === 'flee' ? 11 : 5.5) : 1.2);
    const amp = moving ? 0.45 : 0.02;
    ud.legs?.forEach((leg, i) => { leg.rotation.x = Math.sin(a.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.5 : 0)) * amp; });
    if (ud.head) ud.head.rotation.x = Math.sin(t * 0.7 + a.phase) * 0.06;
    if (ud.trunkSegs) ud.trunkSegs.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.3 + i) * 0.12; });
    if (ud.tail) ud.tail.rotation.z = Math.sin(t * 2.2 + a.phase) * 0.25;
  }
}
function poachAnimal(a) {
  a.alive = false;
  const name = { elephant: 'elephant 🐘', rhino: 'rhino 🦏', tiger: 'tiger 🐅', deer: 'deer 🦌' }[a.species];
  showMsg(`🚨 A ${name} was taken by poachers! −${POACH_PENALTY} 🪙`, 'warn', 4);
  tokenFx(-POACH_PENALTY);
  sfx.fail();
  shake(0.4);
  const g = a.g;
  tween(1.4, k => g.scale.setScalar(Math.max(0.01, 1 - k)), () => {
    scene.remove(g);
    animals.splice(animals.indexOf(a), 1);
  });
}
let dt60 = 0.016;

/* ================= TRASH ================= */
const trashItems = [], flying = [];
function spawnTrash(count, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
    const x = Math.max(-WORLD_HALF + 8, Math.min(WORLD_HALF - 8, Math.cos(a) * r));
    const z = Math.max(-WORLD_HALF + 8, Math.min(WORLD_HALF - 8, Math.sin(a) * r));
    const kind = M.TRASH_KINDS[Math.floor(Math.random() * M.TRASH_KINDS.length)];
    const g = M.makeTrash(kind);
    const y = heightAt(x, z);
    g.position.set(x, y + 0.06, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 22),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    g.add(ring);
    // sky beam so targets are visible from anywhere in the forest
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.2, fog: false,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 15;
    g.add(beam);
    scene.add(g);
    trashItems.push({ g, ring, beam, baseY: y + 0.06, ph: Math.random() * 6, picked: false });
  }
}

/* bonus pickups — tokens & extra time */
const pickups = [];
function spawnPickups() {
  const L = LEVELS[state.levelIndex];
  const nCoins = 8, nClocks = state.levelIndex >= 2 ? 2 : 0;
  for (let i = 0; i < nCoins + nClocks; i++) {
    const isClock = i >= nCoins;
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * (L.rMax - 30);
    const x = Math.max(-WORLD_HALF + 8, Math.min(WORLD_HALF - 8, Math.cos(a) * r));
    const z = Math.max(-WORLD_HALF + 8, Math.min(WORLD_HALF - 8, Math.sin(a) * r));
    const g = new THREE.Group();
    if (isClock) {
      const body = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0x2ee6c8, emissive: 0x14a08a, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 }));
      g.add(body);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hand.position.y = 0.1; g.add(hand);
    } else {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 18),
        new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xc9a227, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.25 }));
      coin.rotation.x = Math.PI / 2;
      g.add(coin);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 18, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: isClock ? 0x2ee6c8 : 0xfff2b8, transparent: true, opacity: 0.14, fog: false,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 9;
    g.add(beam);
    const y = heightAt(x, z);
    g.position.set(x, y + 0.9, z);
    scene.add(g);
    pickups.push({ g, kind: isClock ? 'clock' : 'coin', baseY: y + 0.9, ph: Math.random() * 6 });
  }
}
function clearPickups() {
  for (const p of pickups) {
    const g = p.g;
    tween(0.4, k => g.scale.setScalar(Math.max(0.01, 1 - k)), () => scene.remove(g));
  }
  pickups.length = 0;
}
function tickPickups(dt, t) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.g.position.y = p.baseY + Math.sin(t * 2.4 + p.ph) * 0.15;
    p.g.rotation.y += dt * 2.4;
    if (state.mode !== 'level') continue;
    const d = Math.hypot(p.g.position.x - player.position.x, p.g.position.z - player.position.z);
    if (d < 2.3) {
      pickups.splice(i, 1);
      sparkle(p.g.position.clone(), p.kind === 'clock' ? 0x2ee6c8 : 0xffd76a);
      scene.remove(p.g);
      if (p.kind === 'clock') {
        state.timeLeft = Math.min(LEVELS[state.levelIndex].time, state.timeLeft + 12);
        showMsg('⏱ +12 seconds!', 'good', 2);
        sfx.clockUp();
      } else {
        tokenFx(5);
        showMsg('🪙 Bonus tokens +5!', 'good', 1.6);
        sfx.powerup();
      }
    }
  }
}

/* combo streaks for fast collecting */
let streak = 0, lastPickupAt = -99;
const comboEl = document.getElementById('combo');
function comboPop(text) {
  comboEl.textContent = text;
  comboEl.classList.remove('pop'); void comboEl.offsetWidth;
  comboEl.classList.add('pop');
}
function clearTrash() {
  for (const t of trashItems) {
    const g = t.g;
    tween(0.5, k => g.scale.setScalar(1 - k), () => scene.remove(g));
  }
  trashItems.length = 0;
}
let fullToastCd = 0;
function tickTrash(dt, t) {
  const cap = bagDef().cap;
  fullToastCd -= dt;
  for (let i = trashItems.length - 1; i >= 0; i--) {
    const it = trashItems[i];
    it.g.position.y = it.baseY + Math.sin(t * 2 + it.ph) * 0.09 + 0.09;
    it.g.rotation.y += dt * 0.8;
    it.ring.material.opacity = 0.4 + Math.sin(t * 3 + it.ph) * 0.2;
    if (state.mode !== 'level' || it.picked) continue;
    const d = Math.hypot(it.g.position.x - player.position.x, it.g.position.z - player.position.z);
    if (d < 2.4) {
      if (state.bag >= cap) {
        if (fullToastCd <= 0) { fullToastCd = 3; showMsg('🎒 Bag full! Take it to the recycling truck ♻', 'warn', 2.2); sfx.bagFull(); }
        continue;
      }
      it.picked = true;
      trashItems.splice(i, 1);
      it.ring.visible = false;
      it.g.remove(it.beam);
      flying.push({ g: it.g, t: 0, from: it.g.position.clone() });
      sfx.pickup();
    }
  }
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt / 0.38;
    const k = Math.min(1, f.t);
    const dst = player.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    f.g.position.lerpVectors(f.from, dst, k);
    f.g.position.y += Math.sin(k * Math.PI) * 0.8;
    f.g.scale.setScalar(1 - k * 0.85);
    if (k >= 1) {
      scene.remove(f.g); flying.splice(i, 1);
      state.bag++;
      updateBagHUD();
      // combo streak — chain pickups within 4.5s for bonus tokens
      if (t - lastPickupAt < 4.5) streak++; else streak = 1;
      lastPickupAt = t;
      if (streak >= 3) {
        const bonus = Math.min(streak, 8);
        tokenFx(bonus);
        comboPop(`🔥 x${streak} STREAK! +${bonus} 🪙`);
        sfx.streak(streak);
      }
      hint('firstPickup', '♻ Picked up! Watch your bag meter at the bottom — unload at the truck when it fills.', 6);
      if (state.bag >= bagDef().cap) {
        showMsg('🎒 Bag full! Follow the arrow to the truck', 'warn', 2.5);
        hint('bagFull', '➤ The golden arrow now points home. Press <b>E</b> at the truck to recycle!', 6);
      }
      sparkle(player.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
    }
  }
}

/* ================= POACHERS ================= */
const poachers = [];
let poacherQueue = [];
function spawnPoacher() {
  const alive = animals.filter(a => a.alive);
  if (!alive.length) return;
  const target = alive[Math.floor(Math.random() * alive.length)];
  const dir = target.g.position.clone().setY(0).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() - 0.5) * 120);
  const pos = dir.multiplyScalar(WORLD_HALF - 8).add(perp);
  pos.x = Math.max(-WORLD_HALF + 5, Math.min(WORLD_HALF - 5, pos.x));
  pos.z = Math.max(-WORLD_HALF + 5, Math.min(WORLD_HALF - 5, pos.z));
  const g = M.makePoacher();
  g.position.set(pos.x, heightAt(pos.x, pos.z), pos.z);
  scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 22),
    new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
  ring.visible = false; ring.renderOrder = 5;
  scene.add(ring);
  let marker = null;
  if (hasGear('radar')) {
    marker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4433 }));
    marker.rotation.x = Math.PI;
    scene.add(marker);
  }
  poachers.push({ g, ring, marker, target, st: 'hunt', poachT: POACH_SECONDS, phase: 0 });
  const zoneName = target.zone.name;
  showMsg(`⚠️ Poacher spotted heading for the <b>${zoneName}</b>!`, 'warn', 4);
  sfx.alert();
}
function removePoacherVisuals(p) {
  if (p.ring) scene.remove(p.ring);
  if (p.marker) scene.remove(p.marker);
}
function clearPoachers() {
  for (const p of poachers) { removePoacherVisuals(p); scene.remove(p.g); }
  poachers.length = 0;
  poacherQueue = [];
}
function tickPoachers(dt, t) {
  if (state.mode === 'level') {
    for (let i = poacherQueue.length - 1; i >= 0; i--) {
      poacherQueue[i] -= dt;
      if (poacherQueue[i] <= 0) { poacherQueue.splice(i, 1); spawnPoacher(); }
    }
  }
  for (let i = poachers.length - 1; i >= 0; i--) {
    const p = poachers[i];
    const parts = p.g.userData.parts;
    if (p.st === 'hunt' || p.st === 'flee') {
      let tx, tz, sp = 3.6;
      if (p.st === 'hunt') {
        if (!p.target || !p.target.alive) {
          const alive = animals.filter(a => a.alive);
          if (!alive.length) { p.st = 'flee'; continue; }
          p.target = alive[Math.floor(Math.random() * alive.length)];
        }
        tx = p.target.g.position.x; tz = p.target.g.position.z;
        // poachers dodge the ranger — sprint (Shift) to run them down!
        const dp = distToPlayer(p.g);
        if (dp < 9) {
          const ax = p.g.position.x - player.position.x, az = p.g.position.z - player.position.z;
          const al = Math.hypot(ax, az) || 1;
          tx = p.g.position.x + (ax / al) * 20;
          tz = p.g.position.z + (az / al) * 20;
          sp = 5.4;
        }
      } else {
        const out = p.g.position.clone().setY(0).normalize().multiplyScalar(WORLD_HALF + 20);
        tx = out.x; tz = out.z;
      }
      const dx = tx - p.g.position.x, dz = tz - p.g.position.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dy = want - p.g.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.g.rotation.y += dy * Math.min(1, dt * 5);
      p.g.position.x += Math.sin(p.g.rotation.y) * sp * dt;
      p.g.position.z += Math.cos(p.g.rotation.y) * sp * dt;
      p.g.position.y = heightAt(p.g.position.x, p.g.position.z);
      p.phase += dt * 7;
      const amp = 0.5;
      parts.lLeg.rotation.x = Math.sin(p.phase) * amp;
      parts.rLeg.rotation.x = Math.sin(p.phase + Math.PI) * amp;
      parts.lArm.rotation.x = Math.sin(p.phase + Math.PI) * amp * 0.7;
      parts.rArm.rotation.x = Math.sin(p.phase) * amp * 0.7;
      if (p.st === 'hunt' && dist < 6.5) {
        p.st = 'poach'; p.poachT = POACH_SECONDS;
        parts.rArm.rotation.x = -Math.PI / 2; parts.lArm.rotation.x = -Math.PI / 2.4;
        p.ring.visible = true;
      }
      if (p.st === 'flee' && Math.max(Math.abs(p.g.position.x), Math.abs(p.g.position.z)) > WORLD_HALF - 4) {
        removePoacherVisuals(p); scene.remove(p.g); poachers.splice(i, 1);
      }
    } else if (p.st === 'poach') {
      if (!p.target || !p.target.alive) { p.st = 'hunt'; p.ring.visible = false; continue; }
      p.poachT -= dt;
      const frac = Math.max(0.05, p.poachT / POACH_SECONDS);
      p.ring.position.copy(p.g.position).add(new THREE.Vector3(0, 2.5, 0));
      p.ring.scale.setScalar(0.6 + frac * 1.4);
      p.ring.lookAt(camera.position);
      p.ring.material.opacity = 0.55 + Math.sin(t * 6) * 0.35;
      if (p.poachT <= 0) {
        poachAnimal(p.target);
        p.st = 'flee'; p.ring.visible = false;
      }
    }
    if (p.marker) {
      p.marker.position.copy(p.g.position).add(new THREE.Vector3(0, 3.2 + Math.sin(t * 3) * 0.25, 0));
      p.marker.rotation.y = t * 2;
    }
  }
}
function arrestPoacher(p) {
  const closeCall = p.st === 'poach';
  const reward = closeCall ? TOKENS_PER_ARREST + 20 : TOKENS_PER_ARREST;
  p.st = 'arrested';
  p.ring.visible = false;
  if (p.marker) { scene.remove(p.marker); p.marker = null; }
  sfx.whistle();
  shake(0.25);
  const parts = p.g.userData.parts;
  tween(0.5, k => { parts.lArm.rotation.x = -k * Math.PI; parts.rArm.rotation.x = -k * Math.PI; });
  showMsg(closeCall ? `⚡ CLOSE CALL! Animal saved — +${reward} 🪙` : `👮 Poacher arrested! +${reward} 🪙`, 'good', 3);
  sparkle(p.g.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 0x6ab7ff);
  after(0.7, () => {
    const slot = jail.userData.slots[state.jailed % jail.userData.slots.length];
    const dest = jail.localToWorld(slot.clone());
    const from = p.g.position.clone();
    tween(1.1, k => {
      p.g.position.lerpVectors(from, dest, k);
      p.g.position.y += Math.sin(k * Math.PI) * 9;
      p.g.rotation.y += dt60 * 9;
    }, () => {
      p.g.position.copy(dest);
      p.g.rotation.y = Math.random() * Math.PI * 2;
      parts.lArm.rotation.x = -0.3; parts.rArm.rotation.x = -0.3;
      parts.lLeg.rotation.x = -Math.PI / 2.2; parts.rLeg.rotation.x = -Math.PI / 2.2;
      p.g.position.y += 0.25;
      sfx.jail();
    });
    state.jailed++;
    tokenFx(reward);
    poachers.splice(poachers.indexOf(p), 1); // out of gameplay; mesh remains in jail
  });
}

/* ================= LEVEL FLOW ================= */
let completing = false;
function startLevel() {
  if (state.mode !== 'idle' || state.levelIndex >= LEVELS.length) return;
  clearTrash(); clearPoachers(); clearPickups(); // safety: never stack spawns from a stale patrol
  const L = LEVELS[state.levelIndex];
  state.mode = 'starting';
  state.deposited = 0;
  completing = false;
  dom.intro.classList.remove('hidden');
  dom.introBig.textContent = `LEVEL ${state.levelIndex + 1}`;
  dom.introSub.textContent = `Recycle ${L.trash} pieces of trash · ${formatTime(L.time)} on the clock` +
    (L.poachers ? ` · ${L.poachers} poacher${L.poachers > 1 ? 's' : ''} incoming` : '');
  sfx.click();
  ensureAnimals();
  after(1.9, () => {
    dom.introBig.textContent = 'GO!';
    dom.introSub.textContent = '';
    sfx.go();
    after(0.7, () => {
      dom.intro.classList.add('hidden');
      state.mode = 'level';
      state.timeLeft = L.time;
      dom.timerWrap.classList.remove('hidden');
      spawnTrash(L.trash + 5, L.rMin, L.rMax);
      spawnPickups();
      streak = 0; lastPickupAt = -99;
      poacherQueue = [];
      for (let i = 0; i < L.poachers; i++) {
        poacherQueue.push(L.time * (0.12 + 0.55 * (i / Math.max(1, L.poachers))) + Math.random() * 10);
      }
      if (state.levelIndex === 0) {
        hint('firstLevel', '➤ Follow the <b>golden arrow</b> above your head to find glowing trash!', 6);
      }
      if (state.levelIndex === 1) {
        showMsg('⚠️ <b>POACHERS</b> are entering the reserve!<br>Run up to them and press <b>E</b> to arrest before their red ring runs out!', 'warn', 7);
      }
      updateHUD();
    });
  });
}
function levelComplete() {
  const bonus = 25 + Math.ceil(state.timeLeft / 2);
  state.mode = 'idle';
  dom.timerWrap.classList.add('hidden');
  clearTrash(); clearPoachers(); clearPickups();
  flying.length = 0;
  state.bag = 0;
  tokenFx(bonus);
  sfx.levelDone();
  dom.intro.classList.remove('hidden');
  dom.introBig.textContent = '✅ PATROL COMPLETE!';
  dom.introSub.textContent = `Time bonus +${bonus} 🪙 — return to the podium for the next patrol`;
  state.levelIndex++;
  saveGame();
  after(2.6, () => {
    dom.intro.classList.add('hidden');
    if (state.levelIndex >= LEVELS.length) winGame();
    else if (state.levelIndex === 1) {
      hint('shopHint', '🏪 You have tokens now! Visit the <b>Ranger Shop</b> hut for a bigger bag.', 7);
    }
    updateHUD();
  });
  updateHUD();
}
function failLevel() {
  state.mode = 'fail';
  dom.timerWrap.classList.add('hidden');
  const L = LEVELS[state.levelIndex];
  dom.failText.innerHTML = `You recycled <b>${state.deposited} / ${L.trash}</b> pieces.<br>The forest still needs you, Ranger — tokens and upgrades are safe!`;
  dom.fail.classList.remove('hidden');
  document.exitPointerLock && document.exitPointerLock();
  clearTrash(); clearPoachers(); clearPickups();
  flying.length = 0;
  state.bag = 0;
  sfx.fail();
  updateHUD();
}
function winGame() {
  state.mode = 'won';
  if (!winSign) {
    winSign = M.makeWinSign();
    winSign.position.set(0, 0, -20);
    winSign.scale.setScalar(0.01);
    scene.add(winSign);
    // pop in with a little overshoot
    tween(1.0, k => winSign.scale.setScalar(0.01 + 0.99 * k), null,
      k => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2));
  }
  dom.winStats.innerHTML = `
    <div class="stat"><div class="num">${state.totalRecycled}</div><div class="lbl">TRASH RECYCLED</div></div>
    <div class="stat"><div class="num">${state.jailed}</div><div class="lbl">POACHERS JAILED</div></div>
    <div class="stat"><div class="num">🪙 ${state.tokens}</div><div class="lbl">WILDLIFE TOKENS</div></div>`;
  dom.confettiBox.innerHTML = '';
  const cols = ['#ffd76a', '#35c04a', '#6ab7ff', '#ff8a7a', '#f2ead6', '#e8a33d'];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = (2.4 + Math.random() * 2.6) + 's';
    c.style.animationDelay = (Math.random() * 2.5) + 's';
    if (Math.random() < 0.5) c.style.borderRadius = '50%';
    dom.confettiBox.appendChild(c);
  }
  after(1.2, () => {
    dom.win.classList.remove('hidden');
    document.exitPointerLock && document.exitPointerLock();
    sfx.win();
  });
  saveGame();
  updateHUD();
}

/* ================= DEPOSIT ================= */
function depositBag() {
  if (state.bag <= 0) return;
  const n = state.bag;
  state.bag = 0;
  updateBagHUD();
  sfx.deposit();
  const hopper = hopperWorld();
  for (let i = 0; i < n; i++) {
    after(i * 0.13, () => {
      const kind = M.TRASH_KINDS[Math.floor(Math.random() * M.TRASH_KINDS.length)];
      const g = M.makeTrash(kind);
      g.scale.setScalar(0.8);
      const from = player.position.clone().add(new THREE.Vector3(0, 1.4, 0));
      g.position.copy(from);
      scene.add(g);
      tween(0.5, k => {
        g.position.lerpVectors(from, hopper, k);
        g.position.y += Math.sin(k * Math.PI) * 1.8;
        g.rotation.x += 0.12; g.rotation.y += 0.19;
        g.scale.setScalar(0.8 * (1 - k * 0.6));
      }, () => {
        scene.remove(g);
        // compactor crunch
        const comp = truck.userData.compactor;
        const z0 = comp.position.z;
        tween(0.18, k => comp.position.z = z0 - k * 0.35, () =>
          tween(0.2, k => comp.position.z = z0 - 0.35 + k * 0.35));
        sfx.compact();
        shake(0.22);
        state.totalRecycled++;
        tokenFx(TOKENS_PER_TRASH);
        if (state.mode === 'level') {
          state.deposited++;
          updateHUD();
          const L = LEVELS[state.levelIndex];
          if (state.deposited >= L.trash && !completing) {
            completing = true;
            after(0.6, levelComplete);
          }
        }
        hint('firstDeposit', '🪙 Recycling pays <b>Wildlife Tokens</b>! Spend them at the Ranger Shop for bigger bags.', 6);
      });
    });
  }
}

/* ================= INTERACT (E) ================= */
function distToPlayer(obj) {
  return Math.hypot(obj.position.x - player.position.x, obj.position.z - player.position.z);
}
function currentInteraction() {
  if (state.shopOpen || state.mode === 'menu' || state.mode === 'starting' || state.mode === 'fail') return null;
  for (const p of poachers) {
    if ((p.st === 'hunt' || p.st === 'poach') && distToPlayer(p.g) < 5) {
      return { kind: 'arrest', p, label: '👮 Press <kbd>E</kbd> — ARREST THE POACHER!' };
    }
  }
  if (distToPlayer(truck) < 7.5 && state.bag > 0) {
    return { kind: 'deposit', label: `♻ Press <kbd>E</kbd> — recycle ${state.bag} piece${state.bag > 1 ? 's' : ''}` };
  }
  if (state.mode === 'idle' && state.levelIndex < LEVELS.length && distToPlayer(podium) < 4.5) {
    const L = LEVELS[state.levelIndex];
    return { kind: 'start', label: `▶ Press <kbd>E</kbd> — Start Level ${state.levelIndex + 1} (${L.trash} trash · ${formatTime(L.time)})` };
  }
  if ((state.mode === 'idle' || state.mode === 'won') && distToPlayer(hut) < 6.5) {
    return { kind: 'shop', label: '🏪 Press <kbd>E</kbd> — open the Ranger Shop' };
  }
  if (state.mode === 'level' && distToPlayer(hut) < 6.5) {
    return { kind: 'none', label: '🏪 Shop closed during a patrol!' };
  }
  return null;
}
function onInteract() {
  const act = currentInteraction();
  if (!act) return;
  if (act.kind === 'arrest') arrestPoacher(act.p);
  else if (act.kind === 'deposit') depositBag();
  else if (act.kind === 'start') startLevel();
  else if (act.kind === 'shop') openShop();
}

/* ================= SHOP ================= */
function openShop() {
  state.shopOpen = true;
  renderShop();
  dom.shop.classList.remove('hidden');
  document.exitPointerLock && document.exitPointerLock();
  sfx.click();
  updateClickHint();
}
function closeShop() {
  state.shopOpen = false;
  dom.shop.classList.add('hidden');
  sfx.click();
  updateClickHint();
}
$('shopClose').addEventListener('click', closeShop);
dom.shop.addEventListener('click', e => { if (e.target === dom.shop) closeShop(); });

function renderShop() {
  dom.shopTokens.textContent = `🪙 ${state.tokens}`;
  dom.bagGrid.innerHTML = '';
  for (const b of BAGS) {
    const owned = state.ownedBags.includes(b.id);
    const equipped = state.equippedBag === b.id;
    const el = document.createElement('div');
    el.className = 'item' + (equipped ? ' equipped' : '');
    let btn;
    if (equipped) btn = `<button class="equipped">✓ EQUIPPED</button>`;
    else if (owned) btn = `<button class="equip" data-bag="${b.id}">EQUIP</button>`;
    else if (state.tokens >= b.price) btn = `<button class="buy" data-bag="${b.id}">BUY — 🪙 ${b.price}</button>`;
    else btn = `<button class="poor">🪙 ${b.price}</button>`;
    el.innerHTML = `<div class="emoji">${b.emoji}</div><h3>${b.name}</h3>
      <div class="cap">holds ${b.cap} pieces</div><div class="desc">${b.desc}</div>${btn}`;
    dom.bagGrid.appendChild(el);
  }
  dom.gearGrid.innerHTML = '';
  for (const g of GEAR) {
    const owned = hasGear(g.id);
    const el = document.createElement('div');
    el.className = 'item' + (owned ? ' equipped' : '');
    let btn;
    if (owned) btn = `<button class="equipped">✓ OWNED</button>`;
    else if (state.tokens >= g.price) btn = `<button class="buy" data-gear="${g.id}">BUY — 🪙 ${g.price}</button>`;
    else btn = `<button class="poor">🪙 ${g.price}</button>`;
    el.innerHTML = `<div class="emoji">${g.emoji}</div><h3>${g.name}</h3>
      <div class="cap">&nbsp;</div><div class="desc">${g.desc}</div>${btn}`;
    dom.gearGrid.appendChild(el);
  }
  dom.shop.querySelectorAll('button[data-bag]').forEach(btn => btn.addEventListener('click', () => {
    const b = BAGS.find(x => x.id === btn.dataset.bag);
    if (!state.ownedBags.includes(b.id)) {
      if (state.tokens < b.price) { sfx.denied(); return; }
      tokenFx(-b.price);
      state.ownedBags.push(b.id);
      showMsg(`${b.emoji} Bought the <b>${b.name}</b>! Capacity: ${b.cap}`, 'good', 3.5);
      sfx.buy();
    } else sfx.click();
    state.equippedBag = b.id;
    equipBackpackVisual();
    saveGame();
    renderShop();
    updateBagHUD();
  }));
  dom.shop.querySelectorAll('button[data-gear]').forEach(btn => btn.addEventListener('click', () => {
    const g = GEAR.find(x => x.id === btn.dataset.gear);
    if (state.tokens < g.price) { sfx.denied(); return; }
    tokenFx(-g.price);
    state.gear.push(g.id);
    showMsg(`${g.emoji} Bought <b>${g.name}</b>!`, 'good', 3.5);
    sfx.buy();
    saveGame();
    renderShop();
  }));
}

/* ================= HUD ================= */
function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function updateBagHUD() {
  const cap = bagDef().cap;
  dom.bagText.textContent = `🎒 ${state.bag} / ${cap}`;
  dom.bagBar.style.width = (state.bag / cap * 100) + '%';
  dom.bagCard.classList.toggle('full', state.bag >= cap);
}
function updateHUD() {
  dom.tokenText.textContent = state.tokens;
  updateBagHUD();
  if (state.mode === 'level' || state.mode === 'starting') {
    const L = LEVELS[state.levelIndex];
    dom.levelLabel.textContent = `LEVEL ${state.levelIndex + 1} / ${LEVELS.length}`;
    dom.objective.innerHTML = `Recycled ♻ <b>${state.deposited} / ${L.trash}</b>`;
  } else if (state.mode === 'won') {
    dom.levelLabel.textContent = '🏆 RESERVE GUARDIAN';
    dom.objective.textContent = 'All 7 patrols complete!';
  } else {
    dom.levelLabel.textContent = state.levelIndex >= LEVELS.length ? '🏆 RESERVE GUARDIAN' : 'BASE CAMP';
    dom.objective.textContent = state.levelIndex >= LEVELS.length
      ? 'All patrols complete!' : `Go to the podium to start Level ${state.levelIndex + 1}`;
  }
}
let lastTickSec = -1;

/* ================= GUIDE ARROW ================= */
const distEl = document.getElementById('distText');
function tickArrow(t) {
  let target = null, targetName = '';
  if (state.mode === 'idle' && state.levelIndex < LEVELS.length) { target = podium.position; targetName = 'start podium'; }
  else if (state.mode === 'level') {
    const L = LEVELS[state.levelIndex];
    const cap = bagDef().cap;
    const needMore = state.deposited + state.bag < L.trash;
    if (state.bag >= cap || !needMore || (!trashItems.length && state.bag > 0)) {
      target = truck.position; targetName = 'recycling truck ♻';
    } else {
      let best = null, bd = 1e9;
      for (const it of trashItems) {
        const d = it.g.position.distanceToSquared(player.position);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) { target = best.g.position; targetName = 'nearest trash 🗑'; }
      else { target = truck.position; targetName = 'recycling truck ♻'; }
    }
  }
  if (!target || state.shopOpen) { guideArrow.visible = false; distEl.textContent = ''; return; }
  const d = Math.hypot(target.x - player.position.x, target.z - player.position.z);
  distEl.textContent = `➤ ${targetName} — ${Math.round(d)}m`;
  if (d < 6) { guideArrow.visible = false; return; }
  guideArrow.visible = true;
  guideArrow.position.set(player.position.x, player.position.y + 2.75 + Math.sin(t * 2.5) * 0.12, player.position.z);
  guideArrow.lookAt(target.x, player.position.y + 2.75, target.z);
}

/* ================= PLAYER MOVEMENT / CAMERA ================= */
function tickPlayer(dt, t) {
  const canMove = (state.mode === 'idle' || state.mode === 'level' || state.mode === 'won') && !state.shopOpen;
  let ix = 0, iz = 0;
  if (canMove) {
    if (keys.KeyW) iz += 1;
    if (keys.KeyS) iz -= 1;
    if (keys.KeyA) ix -= 1;
    if (keys.KeyD) ix += 1;
  }
  const moving = ix !== 0 || iz !== 0;
  const run = keys.ShiftLeft || keys.ShiftRight;
  const parts = player.userData.parts;
  if (moving) {
    let speed = (run ? 9.5 : 6) * (hasGear('boots') ? 1.3 : 1);
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3().crossVectors(fwd, _up);
    const dir = fwd.multiplyScalar(iz).add(right.multiplyScalar(ix)).normalize();
    player.position.x += dir.x * speed * dt;
    player.position.z += dir.z * speed * dt;
    player.position.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, player.position.x));
    player.position.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, player.position.z));
    const want = Math.atan2(dir.x, dir.z);
    let dy = want - player.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    player.rotation.y += dy * Math.min(1, dt * 10);
    player.userData.walkPhase = (player.userData.walkPhase || 0) + dt * (run ? 13 : 9);
    const ph = player.userData.walkPhase, amp = run ? 0.75 : 0.55;
    parts.lLeg.rotation.x = Math.sin(ph) * amp;
    parts.rLeg.rotation.x = Math.sin(ph + Math.PI) * amp;
    parts.lArm.rotation.x = Math.sin(ph + Math.PI) * amp * 0.8;
    parts.rArm.rotation.x = Math.sin(ph) * amp * 0.8;
  } else {
    for (const k of ['lLeg', 'rLeg', 'lArm', 'rArm']) parts[k].rotation.x *= 1 - Math.min(1, dt * 8);
    parts.lArm.rotation.z = Math.sin(t * 1.8) * 0.04 + 0.06;
    parts.rArm.rotation.z = -Math.sin(t * 1.8) * 0.04 - 0.06;
  }
  player.position.y = heightAt(player.position.x, player.position.z);

  // camera
  if (state.mode === 'menu') {
    const a = t * 0.09;
    camera.position.set(Math.sin(a) * 30, 11 + Math.sin(t * 0.21) * 2.5, Math.cos(a) * 30);
    camera.lookAt(0, 2.5, 0);
  } else {
    const cp = Math.cos(pitch), spd = Math.sin(pitch);
    const off = new THREE.Vector3(Math.sin(yaw) * cp * camDist, spd * camDist + 1.9, Math.cos(yaw) * cp * camDist);
    const cpos = player.position.clone().add(off);
    const minY = heightAt(cpos.x, cpos.z) + 0.5;
    if (cpos.y < minY) cpos.y = minY;
    camera.position.lerp(cpos, Math.min(1, dt * 9));
    camera.lookAt(player.position.x, player.position.y + 1.7, player.position.z);
    // impact shake + sprint FOV kick
    if (shakeT > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeT;
      camera.position.y += (Math.random() - 0.5) * shakeT * 0.6;
      shakeT = Math.max(0, shakeT - dt * 1.4);
    }
    const targetFov = (moving && run) ? 70 : 62;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
    }
  }
  // sun shadow frustum follows the player
  sun.position.set(player.position.x + 70, 110, player.position.z + 35);
  sun.target.position.copy(player.position);
  sun.target.updateMatrixWorld();
}

/* ================= AMBIENT ================= */
function tickAmbient(dt, t) {
  arch.userData.banner.rotation.x = Math.sin(t * 0.9) * 0.05;
  arch.userData.banner.position.z = Math.sin(t * 0.7) * 0.08;
  podium.userData.button.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.4;
  campfire.userData.flames.forEach((f, i) => {
    f.scale.y = 1 + Math.sin(t * 9 + i * 2) * 0.25;
    f.scale.x = f.scale.z = 1 + Math.sin(t * 7 + i) * 0.12;
  });
  campfire.userData.light.intensity = 10 + Math.sin(t * 11) * 2.5 + Math.sin(t * 23) * 1.5;
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 320) c.position.x = -320;
  }
  for (const b of birds) {
    b.a += b.sp * dt;
    const nx = b.cx + Math.cos(b.a) * b.r, nz = b.cz + Math.sin(b.a) * b.r;
    b.g.rotation.y = Math.atan2(nx - b.g.position.x, nz - b.g.position.z);
    b.g.position.set(nx, b.h + Math.sin(t * 1.5 + b.ph) * 1.5, nz);
    b.g.userData.wings[0].rotation.z = Math.sin(t * 9 + b.ph) * 0.65;
    b.g.userData.wings[1].rotation.z = -Math.sin(t * 9 + b.ph) * 0.65;
  }
  // ranger idle wave
  const rparts = ranger.userData.parts;
  const nearR = distToPlayer(ranger) < 8;
  rparts.rArm.rotation.x = nearR ? (-2.6 + Math.sin(t * 6) * 0.35) : Math.sin(t * 1.4) * 0.06;
  if (nearR) {
    const dx = player.position.x - ranger.position.x, dz = player.position.z - ranger.position.z;
    const want = Math.atan2(dx, dz);
    let dy = want - ranger.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    ranger.rotation.y += dy * Math.min(1, dt * 3);
  }
  if (winSign) winSign.rotation.y = Math.sin(t * 0.8) * 0.04;
}

/* ambient soundscape */
let chirpT = 4, tensionT = 0;
function tickSound(dt) {
  if (state.mode === 'menu') return;
  chirpT -= dt;
  if (chirpT <= 0) { chirpT = 3 + Math.random() * 6; sfx.chirp(); }
  if (poachers.some(p => p.st === 'hunt' || p.st === 'poach')) {
    tensionT -= dt;
    if (tensionT <= 0) { tensionT = 1.5; sfx.tension(); }
  }
}

/* ================= TIMER ================= */
const vignetteEl = document.getElementById('vignette');
function tickTimer(dt) {
  if (state.mode !== 'level') { vignetteEl.classList.remove('on'); return; }
  state.timeLeft -= dt;
  const L = LEVELS[state.levelIndex];
  dom.timerText.textContent = formatTime(state.timeLeft);
  dom.timerBar.style.width = Math.max(0, state.timeLeft / L.time * 100) + '%';
  const low = state.timeLeft <= 15;
  dom.timerWrap.classList.toggle('low', low);
  vignetteEl.classList.toggle('on', low);
  if (low) {
    const sec = Math.ceil(state.timeLeft);
    if (sec !== lastTickSec) { lastTickSec = sec; sfx.tick(); }
  }
  if (state.timeLeft <= 0) failLevel();
}

/* ================= UI BUTTONS ================= */
function buildLeaves() {
  const box = $('leaves');
  const glyphs = ['🍃', '🍂', '🌿'];
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.className = 'leaf';
    s.textContent = glyphs[i % glyphs.length];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDuration = (6 + Math.random() * 8) + 's';
    s.style.animationDelay = (-Math.random() * 10) + 's';
    s.style.fontSize = (18 + Math.random() * 18) + 'px';
    box.appendChild(s);
  }
}
buildLeaves();
if (state.levelIndex > 0 || state.tokens > 0) {
  dom.startBtn.textContent = state.levelIndex >= LEVELS.length
    ? '▶ ENTER THE RESERVE' : `▶ CONTINUE — LEVEL ${state.levelIndex + 1}`;
  dom.resetSave.classList.remove('hidden');
}
dom.resetSave.addEventListener('click', () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});
dom.startBtn.addEventListener('click', () => {
  sfx.unlock(); sfx.click();
  dom.start.classList.add('fading');
  setTimeout(() => dom.start.classList.add('hidden'), 850);
  state.mode = state.levelIndex >= LEVELS.length ? 'won' : 'idle';
  hudVisible = true;
  dom.hud.classList.remove('hidden');
  updateHUD();
  updateClickHint();
  hint('move', '🚶 Use <b>WASD</b> or <b>arrow keys</b> to walk. Click the screen to look around with the mouse!', 7);
  after(4, () => {
    if (state.mode === 'idle') hint('podium', '▶ Walk to the <b>green-button podium</b> and press <b>E</b> to start your first patrol.', 7);
  });
});
$('retryBtn').addEventListener('click', () => {
  dom.fail.classList.add('hidden');
  state.mode = 'idle';
  player.position.set(0, 0, 14);
  sfx.click();
  updateHUD();
});
$('freeRoamBtn').addEventListener('click', () => {
  dom.win.classList.add('hidden');
  updateClickHint();
  sfx.click();
});
$('againBtn').addEventListener('click', () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});

/* ================= PROMPT LOOP ================= */
function tickPrompt() {
  const act = currentInteraction();
  if (act) {
    dom.prompt.innerHTML = act.label;
    dom.prompt.classList.remove('hidden');
  } else dom.prompt.classList.add('hidden');
}

/* ================= MAIN LOOP ================= */
updateHUD();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  dt60 = dt;
  const t = clock.elapsedTime;
  tickTweens(dt);
  tickPlayer(dt, t);
  tickAnimals(dt, t);
  tickPoachers(dt, t);
  tickTrash(dt, t);
  tickPickups(dt, t);
  tickTimer(dt);
  tickAmbient(dt, t);
  tickSound(dt);
  tickArrow(t);
  tickPrompt();
  renderer.render(scene, camera);
});

// dev/testing handle
window.__FK = { state, player, trashItems, poachers, animals, truck, podium, hut, LEVELS, bagDef, spawnPoacher };

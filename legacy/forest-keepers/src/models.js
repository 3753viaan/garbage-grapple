// Forest Keepers — procedural 3D model factories
import * as THREE from 'three';

/* ---------- helpers ---------- */
function S(m) { m.castShadow = true; m.receiveShadow = true; return m; }
export function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0.02,
    transparent: o.opacity !== undefined,
    opacity: o.opacity ?? 1,
    map: o.map || null,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
}
export function box(w, h, d, c, o) {
  return S(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), c && c.isMaterial ? c : std(c, o)));
}
export function cyl(rt, rb, h, c, seg = 12, o) {
  return S(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c && c.isMaterial ? c : std(c, o)));
}
export function sph(r, c, o, ws = 12, hs = 10) {
  return S(new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), c && c.isMaterial ? c : std(c, o)));
}
export function cone(r, h, c, seg = 12, o) {
  return S(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), c && c.isMaterial ? c : std(c, o)));
}
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- humans ---------- */
export function makeHuman(opts = {}) {
  const { skin = 0xd9a066, shirt = 0x3b6e3b, pants = 0x4a3b2a, hat = null, hair = 0x2a1c10, mask = false } = opts;
  const g = new THREE.Group();
  const parts = {};

  const hips = box(0.44, 0.2, 0.26, pants); hips.position.y = 0.82; g.add(hips);
  const torso = box(0.52, 0.62, 0.3, shirt); torso.position.y = 1.22; g.add(torso);
  parts.torso = torso;

  // head
  const headG = new THREE.Group(); headG.position.y = 1.68; g.add(headG);
  const head = sph(0.21, skin); head.position.y = 0.06; headG.add(head);
  const hairCap = sph(0.215, hair); hairCap.scale.set(1, 0.72, 1); hairCap.position.y = 0.13; headG.add(hairCap);
  for (const sx of [-1, 1]) {
    const eye = sph(0.028, 0x14100c); eye.position.set(sx * 0.075, 0.09, 0.185); headG.add(eye);
  }
  if (mask) {
    const m = box(0.3, 0.12, 0.06, 0x1c1c1c); m.position.set(0, 0.02, 0.17); headG.add(m);
  }
  if (hat === 'ranger') {
    const brim = cyl(0.32, 0.32, 0.03, 0xb08d57); brim.position.y = 0.22; headG.add(brim);
    const top = cyl(0.17, 0.2, 0.16, 0xb08d57); top.position.y = 0.3; headG.add(top);
  } else if (hat === 'poacher') {
    const cap = sph(0.22, 0x23281e); cap.scale.set(1, 0.55, 1); cap.position.y = 0.16; headG.add(cap);
    const peak = box(0.2, 0.03, 0.16, 0x23281e); peak.position.set(0, 0.12, 0.24); headG.add(peak);
  }
  parts.head = headG;

  // limbs — pivot groups at shoulder / hip
  function limb(x, y, len, r0, r1, color, footColor) {
    const p = new THREE.Group(); p.position.set(x, y, 0);
    const m = cyl(r0, r1, len, color); m.position.y = -len / 2; p.add(m);
    if (footColor !== undefined) {
      const f = box(0.14, 0.09, 0.24, footColor); f.position.set(0, -len - 0.03, 0.04); p.add(f);
    } else {
      const hd = sph(0.065, skin); hd.position.y = -len - 0.02; p.add(hd);
    }
    g.add(p);
    return p;
  }
  parts.lArm = limb(-0.33, 1.48, 0.58, 0.07, 0.055, shirt);
  parts.rArm = limb(0.33, 1.48, 0.58, 0.07, 0.055, shirt);
  parts.lLeg = limb(-0.13, 0.74, 0.72, 0.085, 0.07, pants, 0x2b241c);
  parts.rLeg = limb(0.13, 0.74, 0.72, 0.085, 0.07, pants, 0x2b241c);

  g.userData.parts = parts;
  return g;
}

export function makePoacher() {
  const g = makeHuman({ skin: 0xc89264, shirt: 0x2c3326, pants: 0x1f241c, hat: 'poacher', hair: 0x191410, mask: true });
  const rifle = new THREE.Group();
  const stock = box(0.05, 0.09, 0.42, 0x4a3220); stock.position.z = -0.1; rifle.add(stock);
  const barrel = cyl(0.02, 0.02, 0.55, 0x33373b); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.35; rifle.add(barrel);
  rifle.position.set(0, -0.55, 0.12);
  g.userData.parts.rArm.add(rifle);
  g.userData.rifle = rifle;
  return g;
}

export function makeRanger() {
  return makeHuman({ skin: 0xb97f4f, shirt: 0x556b2f, pants: 0x6b5a3e, hat: 'ranger', hair: 0x171310 });
}

export function makeBackpack(tier) {
  const colors = [0x8a6f4d, 0x4a7d4a, 0x2e6b8a, 0x7a4a8a, 0xc9a227];
  const s = 1 + tier * 0.18;
  const g = new THREE.Group();
  const body = box(0.36 * s, 0.44 * s, 0.2 * s, colors[tier] ?? colors[0], { rough: 0.9 });
  body.position.set(0, 1.25, -0.28 - 0.06 * tier); g.add(body);
  const flap = box(0.36 * s, 0.12 * s, 0.22 * s, 0x2f271c);
  flap.position.set(0, 1.25 + 0.22 * s, -0.28 - 0.06 * tier); g.add(flap);
  if (tier >= 4) {
    const glow = sph(0.06, std(0xffe08a, { emissive: 0xffc832, emissiveIntensity: 1.4 }));
    glow.position.set(0, 1.25, -0.4 - 0.06 * tier); g.add(glow);
  }
  return g;
}

/* ---------- animals (all face +Z) ---------- */
export function makeElephant() {
  const g = new THREE.Group();
  const grey = 0x9a9aa0, dark = 0x84848a;
  const body = sph(1.35, grey); body.scale.set(1.05, 1.0, 1.5); body.position.y = 2.0; g.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 2.5, 1.75); g.add(headG);
  const head = sph(0.78, grey); headG.add(head);
  for (const sx of [-1, 1]) {
    const ear = sph(0.55, dark); ear.scale.set(0.16, 1, 0.8);
    ear.position.set(sx * 0.75, 0.1, -0.1); ear.rotation.z = sx * 0.25; headG.add(ear);
    const eye = sph(0.06, 0x1a1a1a); eye.position.set(sx * 0.34, 0.18, 0.66); headG.add(eye);
    const tusk = cone(0.07, 0.5, 0xf2ead8); tusk.position.set(sx * 0.3, -0.5, 0.55);
    tusk.rotation.x = 2.6; headG.add(tusk);
  }
  // trunk — chained segments for sway animation
  const trunkSegs = [];
  let parent = headG, py = -0.28, pz = 0.62;
  const dims = [[0.17, 0.14, 0.55], [0.13, 0.1, 0.5], [0.09, 0.06, 0.45]];
  for (const [r0, r1, len] of dims) {
    const seg = new THREE.Group(); seg.position.set(0, py, pz);
    const m = cyl(r1, r0, len, grey); m.position.y = -len / 2; seg.add(m);
    parent.add(seg); trunkSegs.push(seg);
    parent = seg; py = -len; pz = 0;
  }
  trunkSegs[0].rotation.x = 0.35;
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Group(); p.position.set(sx * 0.75, 1.55, sz * 0.85);
    const m = cyl(0.3, 0.34, 1.55, grey); m.position.y = -0.78; p.add(m);
    const nail = cyl(0.36, 0.38, 0.18, 0xd8d0c0); nail.position.y = -1.5; p.add(nail);
    g.add(p); legs.push(p);
  }
  const tail = cyl(0.05, 0.02, 1.0, dark); tail.position.set(0, 2.3, -1.95); tail.rotation.x = 0.35; g.add(tail);
  g.userData = { legs, head: headG, trunkSegs, tail, bodyH: 2.0 };
  return g;
}

export function makeRhino() {
  const g = new THREE.Group();
  const hide = 0x8d8375, hideD = 0x7a7060;
  const body = sph(1.0, hide); body.scale.set(1.0, 0.9, 1.55); body.position.y = 1.15; g.add(body);
  const shoulder = sph(0.75, hideD); shoulder.scale.set(0.95, 0.85, 0.9); shoulder.position.set(0, 1.5, 0.55); g.add(shoulder);
  const headG = new THREE.Group(); headG.position.set(0, 1.15, 1.6); g.add(headG);
  const head = sph(0.55, hide); head.scale.set(0.75, 0.75, 1.25); headG.add(head);
  const horn1 = cone(0.16, 0.62, 0xd9cfba); horn1.position.set(0, 0.42, 0.5); horn1.rotation.x = -0.15; headG.add(horn1);
  const horn2 = cone(0.09, 0.28, 0xd9cfba); horn2.position.set(0, 0.5, 0.12); headG.add(horn2);
  for (const sx of [-1, 1]) {
    const ear = cone(0.09, 0.22, hideD); ear.position.set(sx * 0.28, 0.5, -0.35); headG.add(ear);
    const eye = sph(0.05, 0x171512); eye.position.set(sx * 0.3, 0.16, 0.32); headG.add(eye);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Group(); p.position.set(sx * 0.5, 0.85, sz * 0.75);
    const m = cyl(0.19, 0.22, 0.85, hide); m.position.y = -0.42; p.add(m);
    g.add(p); legs.push(p);
  }
  const tail = cyl(0.04, 0.015, 0.6, hideD); tail.position.set(0, 1.35, -1.55); tail.rotation.x = 0.4; g.add(tail);
  g.userData = { legs, head: headG, tail, bodyH: 1.15 };
  return g;
}

export function makeTiger() {
  const g = new THREE.Group();
  const stripeTex = canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d97f26'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1c1712'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = 12 + i * 18 + rnd(-4, 4);
      ctx.beginPath(); ctx.moveTo(x, rnd(0, 14));
      ctx.quadraticCurveTo(x + rnd(-10, 10), h / 2, x + rnd(-6, 6), h - rnd(0, 14));
      ctx.stroke();
    }
  });
  const bodyMat = std(0xffffff, { map: stripeTex, rough: 0.8 });
  const body = sph(0.62, bodyMat); body.scale.set(0.85, 0.8, 1.9); body.position.y = 0.92; g.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 1.12, 1.28); g.add(headG);
  const head = sph(0.34, 0xd97f26); headG.add(head);
  const muzzle = sph(0.16, 0xf5ead2); muzzle.position.set(0, -0.07, 0.28); headG.add(muzzle);
  const nose = sph(0.05, 0x33221a); nose.position.set(0, 0, 0.42); headG.add(nose);
  for (const sx of [-1, 1]) {
    const ear = cone(0.09, 0.16, 0xb5651d); ear.position.set(sx * 0.2, 0.3, -0.05); headG.add(ear);
    const eye = sph(0.045, 0x1e3d1a); eye.position.set(sx * 0.13, 0.1, 0.28); headG.add(eye);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Group(); p.position.set(sx * 0.3, 0.72, sz * 0.72);
    const m = cyl(0.09, 0.1, 0.72, 0xd97f26); m.position.y = -0.36; p.add(m);
    const paw = sph(0.11, 0xf5ead2); paw.scale.y = 0.6; paw.position.y = -0.7; p.add(paw);
    g.add(p); legs.push(p);
  }
  const tailG = new THREE.Group(); tailG.position.set(0, 1.1, -1.35); g.add(tailG);
  const t1 = cyl(0.05, 0.04, 0.7, 0xd97f26); t1.rotation.x = -1.1; t1.position.set(0, 0.2, -0.28); tailG.add(t1);
  const tip = sph(0.06, 0x1c1712); tip.position.set(0, 0.5, -0.58); tailG.add(tip);
  g.userData = { legs, head: headG, tail: tailG, bodyH: 0.92 };
  return g;
}

export function makeDeer() {
  const g = new THREE.Group();
  const coat = 0xa9805a;
  const body = sph(0.42, coat); body.scale.set(0.8, 0.8, 1.5); body.position.y = 0.78; g.add(body);
  const neck = cyl(0.1, 0.14, 0.5, coat); neck.position.set(0, 1.1, 0.5); neck.rotation.x = -0.5; g.add(neck);
  const headG = new THREE.Group(); headG.position.set(0, 1.35, 0.68); g.add(headG);
  const head = sph(0.16, coat); head.scale.set(0.85, 0.85, 1.3); headG.add(head);
  for (const sx of [-1, 1]) {
    const ear = cone(0.05, 0.14, 0x8d6a48); ear.position.set(sx * 0.12, 0.14, -0.05); ear.rotation.z = sx * 0.5; headG.add(ear);
    const eye = sph(0.03, 0x1a140f); eye.position.set(sx * 0.09, 0.04, 0.14); headG.add(eye);
    const a1 = cyl(0.02, 0.025, 0.3, 0x6e5136); a1.position.set(sx * 0.08, 0.3, -0.02); a1.rotation.z = sx * 0.45; headG.add(a1);
    const a2 = cyl(0.015, 0.02, 0.18, 0x6e5136); a2.position.set(sx * 0.17, 0.38, -0.02); a2.rotation.z = sx * 1.1; headG.add(a2);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const p = new THREE.Group(); p.position.set(sx * 0.2, 0.62, sz * 0.45);
    const m = cyl(0.035, 0.045, 0.62, 0x8d6a48); m.position.y = -0.31; p.add(m);
    g.add(p); legs.push(p);
  }
  const tail = sph(0.08, 0xf2e8d8); tail.position.set(0, 0.95, -0.65); g.add(tail);
  g.userData = { legs, head: headG, bodyH: 0.78 };
  return g;
}

export function makeBird() {
  const g = new THREE.Group();
  const c = [0x3a5f8a, 0x8a3a3a, 0x3a8a5f][Math.floor(Math.random() * 3)];
  const body = sph(0.14, c); body.scale.set(0.8, 0.8, 1.4); g.add(body);
  const beak = cone(0.035, 0.12, 0xe8a33d); beak.rotation.x = Math.PI / 2; beak.position.z = 0.22; g.add(beak);
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sx * 0.08, 0.04, 0);
    const m = box(0.42, 0.02, 0.16, c); m.position.x = sx * 0.21; w.add(m);
    g.add(w); wings.push(w);
  }
  g.userData = { wings };
  return g;
}

/* ---------- vegetation / scenery geometry (for instancing) ---------- */
export function pineTrunkGeo() { const g = new THREE.CylinderGeometry(0.22, 0.38, 2.2, 7); g.translate(0, 1.1, 0); return g; }
export function pineCrownGeo() { const g = new THREE.ConeGeometry(1.7, 4.8, 8); g.translate(0, 4.2, 0); return g; }
export function oakTrunkGeo() { const g = new THREE.CylinderGeometry(0.28, 0.5, 2.4, 7); g.translate(0, 1.2, 0); return g; }
export function oakCrownGeo() { const g = new THREE.SphereGeometry(2.1, 8, 7); g.scale(1, 0.85, 1); g.translate(0, 3.6, 0); return g; }
export function bushGeo() { const g = new THREE.SphereGeometry(0.8, 7, 6); g.scale(1.2, 0.75, 1.2); g.translate(0, 0.5, 0); return g; }
export function rockGeo() { const g = new THREE.DodecahedronGeometry(0.7, 0); g.scale(1.2, 0.75, 1); g.translate(0, 0.4, 0); return g; }
export function grassGeo() { const g = new THREE.ConeGeometry(0.06, 0.42, 4); g.translate(0, 0.21, 0); return g; }
export function flowerGeo() { const g = new THREE.SphereGeometry(0.09, 6, 5); g.translate(0, 0.32, 0); return g; }

export function makeCloud() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.85 });
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(3, 6), 8, 6), m);
    s.position.set(i * rnd(3, 5) - n * 2, rnd(-1, 1), rnd(-2, 2));
    s.scale.y = 0.55;
    g.add(s);
  }
  return g;
}

/* ---------- camp structures ---------- */
export function makeTruck() {
  const g = new THREE.Group();
  const bodyGreen = 0x2e8b57;
  const logoTex = canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2e8b57'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#eaf5ea';
    ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('♻', w / 2, 56);
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('RECYCLE', w / 2, 100);
  });
  // bed / container
  const bed = box(2.3, 1.9, 4.4, bodyGreen); bed.position.set(0, 2.0, -0.9); g.add(bed);
  for (const sx of [-1, 1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.6), new THREE.MeshStandardMaterial({ map: logoTex }));
    logo.position.set(sx * 1.16, 2.0, -0.9); logo.rotation.y = sx * Math.PI / 2; g.add(logo);
  }
  // cab
  const cab = box(2.1, 1.5, 1.5, 0x3aa06a); cab.position.set(0, 1.6, 2.15); g.add(cab);
  const glass = box(1.9, 0.6, 0.1, std(0xaad9e8, { rough: 0.2, metal: 0.3 })); glass.position.set(0, 1.95, 2.92); g.add(glass);
  const bumper = box(2.2, 0.3, 0.25, 0x555b60); bumper.position.set(0, 0.65, 2.95); g.add(bumper);
  for (const sx of [-1, 1]) {
    const light = box(0.25, 0.18, 0.08, std(0xffd76a, { emissive: 0xdd9922, emissiveIntensity: 0.9 }));
    light.position.set(sx * 0.85, 0.95, 2.95); g.add(light);
  }
  // hopper (rear opening)
  const hopper = box(2.0, 1.0, 0.5, 0x1f5f3b); hopper.position.set(0, 1.35, -3.25); g.add(hopper);
  const mouth = box(1.7, 0.65, 0.4, 0x0e2f1e); mouth.position.set(0, 1.6, -3.2); g.add(mouth);
  // compactor plate (animates)
  const compactor = box(1.6, 0.55, 0.18, 0x8fa3ad, { metal: 0.5, rough: 0.4 });
  compactor.position.set(0, 1.6, -2.85); g.add(compactor);
  // wheels
  for (const [sx, z] of [[-1, 2.1], [1, 2.1], [-1, -0.5], [1, -0.5], [-1, -2.1], [1, -2.1]]) {
    const w = cyl(0.55, 0.55, 0.35, 0x24272a, 14); w.rotation.z = Math.PI / 2;
    w.position.set(sx * 1.1, 0.55, z); g.add(w);
    const hub = cyl(0.2, 0.2, 0.37, 0x9aa3a8, 10); hub.rotation.z = Math.PI / 2;
    hub.position.copy(w.position); g.add(hub);
  }
  g.userData = { compactor, hopperLocal: new THREE.Vector3(0, 1.9, -3.2) };
  return g;
}

export function makeShopHut() {
  const g = new THREE.Group();
  const base = box(4.4, 2.7, 3.6, 0x8a6240); base.position.y = 1.35; g.add(base);
  // roof — two slanted panels
  for (const sx of [-1, 1]) {
    const panel = box(2.9, 0.16, 4.2, 0x5e3f28);
    panel.position.set(sx * 1.05, 3.2, 0); panel.rotation.z = sx * -0.55; g.add(panel);
  }
  const ridge = box(0.3, 0.22, 4.2, 0x4a3018); ridge.position.y = 3.85; g.add(ridge);
  // counter window
  const win = box(2.4, 1.1, 0.12, 0x2b1d12); win.position.set(0, 1.6, 1.81); g.add(win);
  const counter = box(2.7, 0.14, 0.5, 0xa87c4f); counter.position.set(0, 1.05, 2.0); g.add(counter);
  // striped awning
  const awnTex = canvasTex(128, 64, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#f2ead6' : '#4a7d4a'; ctx.fillRect(i * 16, 0, 16, h); }
  });
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), new THREE.MeshStandardMaterial({ map: awnTex, side: THREE.DoubleSide }));
  awning.position.set(0, 2.6, 2.35); awning.rotation.x = 0.6; awning.castShadow = true; g.add(awning);
  // sign
  const signTex = canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 64px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('🏪 RANGER SHOP', w / 2, 88);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: signTex }));
  sign.position.set(0, 4.1, 1.2); sign.rotation.x = -0.1; g.add(sign);
  return g;
}

export function makeJail() {
  const g = new THREE.Group();
  const base = box(4.6, 0.25, 3.6, 0x777f84); base.position.y = 0.12; g.add(base);
  const roof = box(4.8, 0.18, 3.8, 0x565e63); roof.position.y = 2.6; g.add(roof);
  const barMat = std(0x3d4449, { metal: 0.6, rough: 0.35 });
  const W = 2.2, D = 1.7;
  for (let x = -W; x <= W + 0.01; x += 0.44) {
    for (const sz of [-1, 1]) {
      if (sz === 1 && Math.abs(x) < 0.7) continue; // door gap (front)
      const b = cyl(0.045, 0.045, 2.4, barMat, 6); b.position.set(x, 1.36, sz * D); g.add(b);
    }
  }
  for (let z = -D; z <= D + 0.01; z += 0.44) {
    for (const sx of [-1, 1]) {
      const b = cyl(0.045, 0.045, 2.4, barMat, 6); b.position.set(sx * W, 1.36, z); g.add(b);
    }
  }
  const signTex = canvasTex(384, 96, (ctx, w, h) => {
    ctx.fillStyle = '#33393d'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8e2d2'; ctx.font = 'bold 52px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('POACHER JAIL', w / 2, 66);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: signTex }));
  sign.position.set(0, 3.15, 1.85); g.add(sign);
  g.userData = {
    slots: [new THREE.Vector3(-1.4, 0.25, -0.8), new THREE.Vector3(0, 0.25, -1.0), new THREE.Vector3(1.4, 0.25, -0.8),
            new THREE.Vector3(-0.8, 0.25, 0.6), new THREE.Vector3(0.8, 0.25, 0.6), new THREE.Vector3(0, 0.25, 0)],
  };
  return g;
}

export function makeBannerArch(text) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const post = cyl(0.28, 0.34, 7, 0x6b4a2c, 10); post.position.set(sx * 6, 3.5, 0); g.add(post);
    const cap = sph(0.4, 0x53381f); cap.position.set(sx * 6, 7.05, 0); g.add(cap);
  }
  const bar = cyl(0.2, 0.2, 12.8, 0x53381f, 8); bar.rotation.z = Math.PI / 2; bar.position.y = 6.9; g.add(bar);
  const tex = canvasTex(1024, 192, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1e5a34'); grad.addColorStop(1, '#153f24');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#ffd76a'; ctx.textAlign = 'center';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.fillText(text, w / 2, 105);
    ctx.font = '38px Georgia, serif'; ctx.fillStyle = '#cfe8cf';
    ctx.fillText('🐘  🦏  🐅  — protect  ·  recycle  ·  respect —', w / 2, 158);
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.0), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  banner.position.y = 5.6; banner.castShadow = true; g.add(banner);
  for (const sx of [-1, 1]) {
    const rope = cyl(0.03, 0.03, 0.65, 0xd8c9a0, 5); rope.position.set(sx * 4.9, 6.55, 0); g.add(rope);
  }
  g.userData = { banner };
  return g;
}

export function makeSign(text, sub = '') {
  const g = new THREE.Group();
  const post = cyl(0.09, 0.12, 1.6, 0x6b4a2c, 8); post.position.y = 0.8; g.add(post);
  const tex = canvasTex(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#7a5230'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#ffedbf'; ctx.textAlign = 'center';
    ctx.font = 'bold 52px Georgia, serif'; ctx.fillText(text, w / 2, sub ? 70 : 95);
    if (sub) { ctx.font = '36px Georgia, serif'; ctx.fillText(sub, w / 2, 125); }
  });
  const plank = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  plank.position.y = 1.75; plank.castShadow = true; g.add(plank);
  return g;
}

export function makePodium() {
  const g = new THREE.Group();
  const base = box(1.3, 0.95, 1.3, 0x7a5230); base.position.y = 0.48; g.add(base);
  const top = box(1.5, 0.14, 1.5, 0x8f6239); top.position.y = 1.0; g.add(top);
  const button = cyl(0.3, 0.34, 0.16, std(0x35c04a, { emissive: 0x1d8f2e, emissiveIntensity: 0.8 }));
  button.position.y = 1.15; g.add(button);
  const ring = cyl(0.42, 0.42, 0.08, 0xc9a227, 16); ring.position.y = 1.08; g.add(ring);
  const sign = makeSign('START PATROL', 'press E');
  sign.position.set(0, 0.6, -0.4); sign.scale.setScalar(0.85);
  sign.rotation.y = Math.PI; // face the camp approach
  g.add(sign);
  g.userData = { button };
  return g;
}

export function makeWinSign() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const post = cyl(0.18, 0.22, 4.4, 0x6b4a2c, 8); post.position.set(sx * 4, 2.2, 0); g.add(post);
  }
  const tex = canvasTex(1024, 384, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#fff3c2'); grad.addColorStop(0.5, '#ffd76a'); grad.addColorStop(1, '#e8a33d');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7a4a12'; ctx.lineWidth = 16; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#5a320a'; ctx.textAlign = 'center';
    ctx.font = 'bold 150px Georgia, serif';
    ctx.fillText('🏆 YOU WIN! 🏆', w / 2, 190);
    ctx.font = 'bold 56px Georgia, serif';
    ctx.fillText('Guardian of Humara Desh', w / 2, 300);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 3.2), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x332200, emissiveIntensity: 0.4 }));
  board.position.y = 3.3; board.castShadow = true; g.add(board);
  return g;
}

export function makeCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const log = cyl(0.09, 0.09, 1.1, 0x5e3f28, 6);
    log.rotation.z = Math.PI / 2 - 0.35; log.rotation.y = (i / 5) * Math.PI * 2;
    log.position.y = 0.18; g.add(log);
  }
  const stoneMat = std(0x8b8b8b);
  for (let i = 0; i < 8; i++) {
    const st = sph(rnd(0.12, 0.18), stoneMat);
    const a = (i / 8) * Math.PI * 2;
    st.position.set(Math.cos(a) * 0.85, 0.08, Math.sin(a) * 0.85); g.add(st);
  }
  const flames = [];
  const flameCols = [0xff6a00, 0xffa200, 0xffd000];
  for (let i = 0; i < 3; i++) {
    const f = cone(0.28 - i * 0.07, 0.75 - i * 0.15, std(flameCols[i], { emissive: flameCols[i], emissiveIntensity: 1.6 }));
    f.position.y = 0.45 + i * 0.12; f.castShadow = false; g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff9a3d, 12, 14, 2); light.position.y = 1.0; g.add(light);
  g.userData = { flames, light };
  return g;
}

/* ---------- trash ---------- */
export function makeTrash(kind) {
  const g = new THREE.Group();
  if (kind === 'bottle') {
    const b = cyl(0.1, 0.1, 0.4, std(0x69c07a, { opacity: 0.75, rough: 0.2 })); b.position.y = 0.2; g.add(b);
    const neck = cyl(0.045, 0.08, 0.12, std(0x69c07a, { opacity: 0.75, rough: 0.2 })); neck.position.y = 0.46; g.add(neck);
    const cap = cyl(0.05, 0.05, 0.05, 0xd8d8d8); cap.position.y = 0.545; g.add(cap);
    g.rotation.z = 1.35;
    g.position.y = 0.12;
  } else if (kind === 'can') {
    const tex = canvasTex(64, 32, (ctx, w, h) => {
      ctx.fillStyle = '#c0392b'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ecf0f1'; ctx.fillRect(0, h / 3, w, h / 3);
    });
    const c = cyl(0.11, 0.11, 0.3, std(0xffffff, { map: tex, metal: 0.5, rough: 0.35 })); c.position.y = 0.15; g.add(c);
    g.rotation.x = 0.5;
  } else if (kind === 'bag') {
    const b = sph(0.24, std(0x4d5257, { rough: 1 })); b.scale.set(1.15, 0.7, 1); b.position.y = 0.17; g.add(b);
    const knot = sph(0.07, 0x3a3e42); knot.position.y = 0.38; g.add(knot);
  } else if (kind === 'tire') {
    const t = S(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.1, 8, 16), std(0x24272a, { rough: 0.95 })));
    t.rotation.x = Math.PI / 2; t.position.y = 0.1; g.add(t);
  } else {
    const b = box(0.36, 0.3, 0.36, 0xa87c4f); b.position.y = 0.15; b.rotation.y = rnd(0, 1); g.add(b);
    const tape = box(0.38, 0.05, 0.09, 0x8a6236); tape.position.y = 0.3; g.add(tape);
  }
  g.userData.kind = kind;
  return g;
}
export const TRASH_KINDS = ['bottle', 'can', 'bag', 'tire', 'box'];

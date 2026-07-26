// Procedural model factories. Every factory returns a THREE.Group.
// Interactive roots carry userData.kind; child meshes get userData.root set
// via tagRoot() so raycasts can find their interactive root.

import * as THREE from 'three';

export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });
}

export function tagRoot(group, kind) {
  group.userData.kind = kind;
  group.traverse(o => { o.userData.root = group; });
  return group;
}

export function shadow(o, cast = true, receive = false) {
  o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
  return o;
}

// ---------- text / emoji sprites ----------
export function makeSprite(text, { size = 128, scale = 1, font = null, bg = null } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 4, 0, 7); ctx.fill(); }
  ctx.font = font || `${size * 0.62}px "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.setScalar(scale);
  return sp;
}

export function makeTextPlane(text, { w = 4, h = 1, fg = '#ffffff', bg = '#1f6b38', fontPx = 90 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 10; ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = fg; ctx.font = `900 ${fontPx}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}

// ---------- PLAYER : Eco Ranger ----------
export function makeRanger() {
  const g = new THREE.Group();
  const skin = mat(0xdba876), shirt = mat(0x2e8b57, { roughness: 0.7 }),
        pants = mat(0x35506e), shoe = mat(0xf4f4f4, { roughness: 0.5 }),
        capM = mat(0x1f8a3d, { roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.42, 6, 12), shirt);
  torso.position.y = 1.05; g.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 12), mat(0x6b4a2b));
  belt.position.y = 0.82; g.add(belt);

  const head = new THREE.Group();
  head.position.y = 1.62;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), skin);
  head.add(skull);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.225, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), capM);
  cap.position.y = 0.03; head.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.03, 14, 1, false, -Math.PI * 0.42, Math.PI * 0.84), capM);
  brim.position.set(0, 0.06, 0.16); head.add(brim);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), eyeM);
    eye.position.set(0.08 * s, 0.02, 0.185); head.add(eye);
  }
  g.add(head);

  function limb(matA, matB, upperLen, lowerR) {
    const pivot = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(lowerR, upperLen, 4, 8), matA);
    upper.position.y = -upperLen / 2 - lowerR;
    pivot.add(upper);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(lowerR * 1.25, 8, 8), matB);
    tip.position.y = -upperLen - lowerR * 1.6;
    pivot.add(tip);
    return pivot;
  }
  const lArm = limb(shirt, skin, 0.34, 0.075); lArm.position.set(-0.34, 1.32, 0); g.add(lArm);
  const rArm = limb(shirt, skin, 0.34, 0.075); rArm.position.set(0.34, 1.32, 0); g.add(rArm);
  const lLeg = limb(pants, shoe, 0.4, 0.09); lLeg.position.set(-0.14, 0.72, 0); g.add(lLeg);
  const rLeg = limb(pants, shoe, 0.4, 0.09); rLeg.position.set(0.14, 0.72, 0); g.add(rLeg);

  // trash backpack — visibly fills up
  const backpack = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.25, 4, 10), mat(0xd9a824, { roughness: 0.9 }));
  backpack.position.set(0, 1.1, -0.3);
  backpack.scale.setScalar(0.7);
  g.add(backpack);

  // grapple gauntlet on right hand
  const gauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.14, 10), mat(0x888c92, { metalness: 0.6, roughness: 0.3 }));
  gauntlet.position.y = -0.5; rArm.add(gauntlet);

  shadow(g);
  return { group: g, refs: { head, torso, lArm, rArm, lLeg, rLeg, backpack } };
}

// ---------- ANIMALS ----------
export function makeAnimal(type) {
  const g = new THREE.Group();
  const refs = {};
  if (type === 'bird') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(0x7fa8d6));
    body.scale.set(1, 0.9, 1.3); body.position.y = 0.18; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0x8fb8e6));
    head.position.set(0, 0.34, 0.14); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 8), mat(0xffa726));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.33, 0.25); g.add(beak);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x6a93c2));
      wing.scale.set(0.35, 0.12, 1); wing.position.set(0.15 * s, 0.22, 0); g.add(wing);
      refs[s === -1 ? 'lWing' : 'rWing'] = wing;
    }
  } else if (type === 'rabbit') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0xcfc4b3));
    body.scale.set(1, 0.95, 1.25); body.position.y = 0.22; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat(0xd8cec0));
    head.position.set(0, 0.44, 0.16); g.add(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 4, 6), mat(0xd8cec0));
      ear.position.set(0.06 * s, 0.66, 0.12); ear.rotation.z = -0.15 * s; g.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(0xffffff));
    tail.position.set(0, 0.22, -0.26); g.add(tail);
  } else if (type === 'squirrel') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(0x9c5f33));
    body.scale.set(0.9, 1, 1.15); body.position.y = 0.17; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xa96b3d));
    head.position.set(0, 0.33, 0.13); g.add(head);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0x8a4f28));
    tail.scale.set(0.5, 1.7, 0.5); tail.position.set(0, 0.34, -0.22); tail.rotation.x = 0.5; g.add(tail);
  } else if (type === 'turtle') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3f7042));
    shell.position.y = 0.12; g.add(shell);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.1, 14), mat(0x77a05a));
    body.position.y = 0.1; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0x8ab06a));
    head.position.set(0, 0.16, 0.3); g.add(head);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x8ab06a));
      fin.scale.set(1.3, 0.4, 0.8); fin.position.set(0.24 * sx, 0.07, 0.16 * sz); g.add(fin);
    }
  } else if (type === 'deer') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 6, 10), mat(0xa5713f));
    body.rotation.z = Math.PI / 2; body.position.y = 0.62; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.4, 8), mat(0xa5713f));
    neck.position.set(0, 0.92, 0.32); neck.rotation.x = -0.5; g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0xb37d47));
    head.position.set(0, 1.1, 0.44); g.add(head);
    for (const s of [-1, 1]) {
      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.3, 6), mat(0x6b4a2b));
      antler.position.set(0.08 * s, 1.28, 0.4); antler.rotation.z = 0.4 * s; g.add(antler);
      for (const zz of [0.28, 0.36]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.6, 6), mat(0x8f6136));
        leg.position.set(0.12 * s, 0.3, zz === 0.28 ? 0.28 : -0.28); g.add(leg);
      }
    }
  }
  shadow(g);
  return { group: g, refs };
}

export function makeCage() {
  const g = new THREE.Group();
  const netM = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.6, wireframe: true });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), netM);
  g.add(dome);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 20), mat(0x777c82, { metalness: 0.5, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; g.add(rim);
  shadow(g);
  return g;
}

// ---------- TRASH ----------
export function makeTrash(type) {
  const g = new THREE.Group();
  if (type === 'plastic') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.36, 10),
      mat(0xbfe4ff, { transparent: true, opacity: 0.85, roughness: 0.25 }));
    b.position.y = 0.18; g.add(b);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), mat(0x2f7fd6));
    cap.position.y = 0.4; g.add(cap);
    g.rotation.z = 1.2;
  } else if (type === 'paper') {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(0xf1ead2, { roughness: 1 }));
    b.position.y = 0.15; b.rotation.set(0.4, 0.8, 0.2); g.add(b);
  } else if (type === 'metal') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 12),
      mat(0xd6473f, { metalness: 0.75, roughness: 0.3 }));
    b.position.y = 0.12; g.add(b);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 12),
      mat(0xcccccc, { metalness: 0.9, roughness: 0.2 }));
    top.position.y = 0.25; g.add(top);
    g.rotation.z = 0.9;
  } else if (type === 'glass') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.34, 10),
      mat(0x4a8a4f, { transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.1 }));
    b.position.y = 0.17; g.add(b);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 8),
      mat(0x4a8a4f, { transparent: true, opacity: 0.75, roughness: 0.1 }));
    neck.position.y = 0.4; g.add(neck);
    g.rotation.z = -1.1;
  } else if (type === 'organic') {
    for (let i = 0; i < 3; i++) {
      const peel = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 6), mat(0xf3d13c, { roughness: 0.9 }));
      peel.position.y = 0.1;
      peel.rotation.set(0.9, i * 2.1, 0.5);
      g.add(peel);
    }
  } else if (type === 'ewaste') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.22), mat(0x2c5d34, { roughness: 0.6 }));
    b.position.y = 0.06; g.add(b);
    for (let i = 0; i < 5; i++) {
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05),
        mat(i % 2 ? 0x222222 : 0xd9a824, { metalness: 0.5, roughness: 0.4 }));
      chip.position.set(-0.1 + i * 0.05, 0.1, (i % 2) * 0.06 - 0.03); g.add(chip);
    }
  } else if (type === 'net') {
    const netM = new THREE.MeshStandardMaterial({ color: 0x9adcff, roughness: 0.7, wireframe: true });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), netM);
    b.scale.set(1.2, 0.5, 1); b.position.y = 0.14; g.add(b);
    const floatB = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat(0xff5f57));
    floatB.position.set(0.2, 0.22, 0.1); g.add(floatB);
  } else if (type === 'barrel') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 14), mat(0x6a7a2a, { roughness: 0.5, metalness: 0.3 }));
    b.position.y = 0.25; g.add(b);
    for (const y of [0.12, 0.38]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.015, 6, 16), mat(0x3d4718, { metalness: 0.5 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
    }
    const skull = makeSprite('☢', { scale: 0.28 });
    skull.position.set(0, 0.27, 0.19); g.add(skull);
  }
  // glow halo so litter is readable at distance
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3ae, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.03;
  g.add(halo);
  g.userData.halo = halo;
  shadow(g);
  return g;
}

export function makeGolden() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 12),
    mat(0xffd76a, { metalness: 0.9, roughness: 0.15, emissive: 0xaa7700, emissiveIntensity: 0.5 }));
  b.position.y = 0.3; g.add(b);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.16, 10),
    mat(0xffd76a, { metalness: 0.9, roughness: 0.15, emissive: 0xaa7700, emissiveIntensity: 0.5 }));
  neck.position.y = 0.62; g.add(neck);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04; g.add(halo);
  shadow(g);
  return g;
}

// ---------- RECYCLING STATION ----------
export function makeBin(color, label) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 1.0, 14), mat(color, { roughness: 0.5 }));
  body.position.y = 0.5; g.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 14), mat(color, { roughness: 0.4 }));
  lid.position.y = 1.02; g.add(lid);
  const lbl = makeTextPlane(label, { w: 0.66, h: 0.24, bg: '#0b2418', fontPx: 110 });
  lbl.position.set(0, 0.62, 0.4); g.add(lbl);
  const recycleIcon = makeSprite('♻', { scale: 0.34 });
  recycleIcon.position.set(0, 1.28, 0); g.add(recycleIcon);
  g.userData.lid = lid;
  shadow(g);
  return g;
}

export function makeStation(bins) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.7, 0.22, 28), mat(0x77807a, { roughness: 0.9 }));
  pad.position.y = 0.11; pad.receiveShadow = true; g.add(pad);
  const binRefs = {};
  bins.forEach((b, i) => {
    const a = (i / bins.length) * Math.PI * 2;
    const bin = makeBin(b.color, b.label);
    bin.position.set(Math.sin(a) * 3.2, 0.22, Math.cos(a) * 3.2);
    bin.lookAt(0, 0.22, 0);
    g.add(bin);
    binRefs[b.id] = bin;
  });
  // sign
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), mat(0x6b4a2b));
  pole.position.y = 1.7; g.add(pole);
  const sign = makeTextPlane('♻ RECYCLING STATION', { w: 4.4, h: 0.9, bg: '#1f6b38', fontPx: 68 });
  sign.position.y = 3.5; g.add(sign);
  const sign2 = sign.clone(); sign2.rotation.y = Math.PI; g.add(sign2);
  g.userData.signs = [sign, sign2];
  g.userData.bins = binRefs;
  shadow(g, true, true);
  return g;
}

// ---------- GRAPPLE RING ----------
export function makeGrappleRing() {
  const g = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 10, 26),
    mat(0x34c759, { emissive: 0x1f8a3d, emissiveIntensity: 0.9, roughness: 0.3 }));
  g.add(torus);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20),
    new THREE.MeshBasicMaterial({ color: 0x7dffa0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  g.add(inner);
  g.userData.torus = torus;
  return g;
}

// ---------- VEGETATION ----------
export function makeTree(variant = 0) {
  const g = new THREE.Group();
  const h = 2.6 + (variant % 3) * 0.7;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, h, 8), mat(0x6b4a2b, { roughness: 1 }));
  trunk.position.y = h / 2; g.add(trunk);
  const leaves = [];
  const blobs = [[0, h + 0.5, 0, 1.15], [0.6, h - 0.1, 0.2, 0.75], [-0.55, h - 0.05, -0.15, 0.7], [0.05, h + 1.15, -0.1, 0.7]];
  for (const [x, y, z, s] of blobs) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat(0x2f8f3a, { roughness: 0.95 }));
    leaf.position.set(x, y, z);
    g.add(leaf); leaves.push(leaf);
  }
  g.userData.leaves = leaves;
  shadow(g);
  return g;
}

export function makePalm() {
  const g = new THREE.Group();
  const segs = 5, leaves = [];
  let y = 0;
  for (let i = 0; i < segs; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.13 - i * 0.012, 0.16 - i * 0.012, 0.85, 8), mat(0x8f6b40, { roughness: 1 }));
    seg.position.set(i * 0.09, y + 0.42, 0);
    seg.rotation.z = -0.09 * i;
    g.add(seg); y += 0.8;
  }
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.1, 4), mat(0x2f8f3a, { roughness: 0.95 }));
    const a = (i / 7) * Math.PI * 2;
    frond.position.set(0.42, y + 0.15, 0);
    frond.rotation.z = Math.PI / 2 - 0.5;
    frond.rotation.y = a;
    frond.geometry.translate(0, -0.9, 0);
    g.add(frond); leaves.push(frond);
  }
  g.userData.leaves = leaves;
  shadow(g);
  return g;
}

// ---------- URBAN ----------
export function windowTexture(w, h, base = '#3c4754', lit = '#ffd76a') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  const cols = Math.max(2, Math.round(w * 1.4)), rows = Math.max(3, Math.round(h * 1.2));
  const cw = 256 / cols, ch = 256 / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    ctx.fillStyle = Math.random() < 0.35 ? lit : 'rgba(150,190,220,.75)';
    ctx.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.22, cw * 0.56, ch * 0.56);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeBuilding(w, h, d, color) {
  const g = new THREE.Group();
  const tex = windowTexture(w, h);
  const matWall = new THREE.MeshStandardMaterial({ color, roughness: 0.85, map: tex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matWall);
  body.position.y = h / 2; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.25, d + 0.3), mat(0x4a4f55, { roughness: 0.95 }));
  roof.position.y = h + 0.12; g.add(roof);
  shadow(g, true, true);
  return g;
}

export function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 3.1), mat(color, { roughness: 0.35, metalness: 0.4 }));
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.6), mat(0xbfe4ff, { roughness: 0.15, metalness: 0.2 }));
  cabin.position.set(0, 1.0, -0.1); g.add(cabin);
  const wheels = [];
  for (const [x, z] of [[-0.75, 1.0], [0.75, 1.0], [-0.75, -1.0], [0.75, -1.0]]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12), mat(0x1c1c1c, { roughness: 0.9 }));
    wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.32, z);
    g.add(wh); wheels.push(wh);
  }
  g.userData.wheels = wheels;
  shadow(g);
  return g;
}

export function makeLamppost() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 8), mat(0x3a4046, { metalness: 0.6, roughness: 0.4 }));
  pole.position.y = 2.3; g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), mat(0x3a4046, { metalness: 0.6 }));
  arm.rotation.z = Math.PI / 2; arm.position.set(0.5, 4.5, 0); g.add(arm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
    mat(0xfff3ae, { emissive: 0xffd76a, emissiveIntensity: 1.4 }));
  lamp.position.set(1.0, 4.42, 0); g.add(lamp);
  shadow(g);
  return g;
}

export function makeBench() {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), mat(0x8f6b40, { roughness: 1 }));
  seat.position.y = 0.5; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.07), mat(0x8f6b40, { roughness: 1 }));
  back.position.set(0, 0.85, -0.22); back.rotation.x = -0.15; g.add(back);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.45), mat(0x3a4046, { metalness: 0.5 }));
    leg.position.set(0.8 * s, 0.25, 0); g.add(leg);
  }
  shadow(g);
  return g;
}

export function makeRock(s = 1) {
  const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat(0x8b8f94, { roughness: 1 }));
  r.position.y = s * 0.55;
  r.rotation.set(Math.random() * 2, Math.random() * 2, Math.random());
  const g = new THREE.Group(); g.add(r);
  shadow(g, true, true);
  return g;
}

export function makeFountain() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.7, 0.6, 22), mat(0xb9bcb2, { roughness: 0.8 }));
  base.position.y = 0.3; g.add(base);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.12, 22),
    mat(0x4aa8ff, { transparent: true, opacity: 0.8, roughness: 0.1 }));
  water.position.y = 0.62; g.add(water);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 12), mat(0xb9bcb2));
  column.position.y = 1.3; g.add(column);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), mat(0x4aa8ff, { transparent: true, opacity: 0.7, roughness: 0.1 }));
  top.position.y = 2.2; g.add(top);
  g.userData.water = water;
  shadow(g, true, true);
  return g;
}

export function makeUmbrella(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), mat(0xf1ead2));
  pole.position.y = 1.3; g.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 10), mat(color, { roughness: 0.7, side: THREE.DoubleSide }));
  top.position.y = 2.65; g.add(top);
  shadow(g);
  return g;
}

// ---------- NPC ----------
export function makeNPC(shirtColor) {
  const g = new THREE.Group();
  const skinTones = [0xdba876, 0xb07b4f, 0x8a5a35, 0xe8c39e];
  const skin = mat(skinTones[Math.floor(Math.random() * skinTones.length)]);
  const shirt = mat(shirtColor, { roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.4, 6, 10), shirt);
  torso.position.y = 1.0; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), skin);
  head.position.y = 1.56; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mat([0x2b2b2b, 0x54371c, 0x777777][Math.floor(Math.random() * 3)]));
  hair.position.y = 1.6; g.add(hair);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.75, 10), mat(0x44506e));
  legs.position.y = 0.42; g.add(legs);
  const arms = {};
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 4, 6), shirt);
    m.position.y = -0.22; arm.add(m);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skin);
    hand.position.y = -0.46; arm.add(hand);
    arm.position.set(0.3 * s, 1.28, 0);
    g.add(arm);
    arms[s === -1 ? 'lArm' : 'rArm'] = arm;
  }
  g.userData.arms = arms;
  const bubble = makeSprite('💬', { scale: 0.001 });
  bubble.position.y = 2.2; g.add(bubble);
  g.userData.bubble = bubble;
  shadow(g);
  return g;
}

// ---------- POWER-UPS ----------
const PU_ICONS = { magnet: '🧲', speed: '👟', freeze: '❄️', double: '⭐' };
export function makePowerup(kind) {
  const g = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12),
    mat(0xffffff, { transparent: true, opacity: 0.25, roughness: 0.1, emissive: 0x7dffa0, emissiveIntensity: 0.3 }));
  orb.position.y = 1.0; g.add(orb);
  const icon = makeSprite(PU_ICONS[kind] || '❔', { scale: 0.62 });
  icon.position.y = 1.0; g.add(icon);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 22),
    mat(0x7dffa0, { emissive: 0x34c759, emissiveIntensity: 1 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  g.userData.orb = orb; g.userData.ring = ring;
  return g;
}

// ---------- SKY LIFE ----------
export function makeButterfly() {
  const g = new THREE.Group();
  const colors = [0xffa8d6, 0xffd76a, 0x9adcff, 0xb17aff];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    w.position.x = 0.14 * s;
    const piv = new THREE.Group(); piv.add(w); g.add(piv);
    wings.push(piv);
  }
  g.userData.wings = wings;
  return g;
}

export function makeFlyingBird() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(0xffffff));
  body.scale.set(1, 0.8, 1.6); g.add(body);
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.2),
      mat(0xf0f0f0, { side: THREE.DoubleSide }));
    w.position.x = 0.3 * s;
    piv.add(w); g.add(piv);
    wings.push(piv);
  }
  g.userData.wings = wings;
  return g;
}

export function makeRainbow() {
  const g = new THREE.Group();
  const colors = [0xff5f57, 0xff9f43, 0xffd76a, 0x34c759, 0x4aa8ff, 0xb17aff];
  colors.forEach((c, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(26 - i * 1.1, 0.5, 8, 48, Math.PI),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false }));
    g.add(arc);
  });
  return g;
}

// ---------- BOSS : The Garbage Monster ----------
export function makeBoss() {
  const g = new THREE.Group();
  const junkColors = [0x5d6650, 0x6a5a48, 0x4a5560, 0x6d6d3a, 0x555b4e];
  const body = new THREE.Group();
  // lumpy trash body
  for (let i = 0; i < 26; i++) {
    const s = 0.7 + Math.random() * 1.1;
    const geo = Math.random() < 0.5 ? new THREE.BoxGeometry(s, s * 0.8, s * 0.9) : new THREE.IcosahedronGeometry(s * 0.6, 0);
    const m = new THREE.Mesh(geo, mat(junkColors[i % junkColors.length], { roughness: 1 }));
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5, y = 1 + Math.random() * 3.6;
    m.position.set(Math.cos(a) * r * (1 - y / 7), y, Math.sin(a) * r * (1 - y / 7));
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    body.add(m);
  }
  // sticking-out recognizable junk
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 8, 18), mat(0x1c1c1c, { roughness: 0.9 }));
  tyre.position.set(-1.1, 3.4, 0.6); tyre.rotation.y = 0.7; body.add(tyre);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), mat(0x8b8f94, { metalness: 0.7 }));
  pipe.position.set(1.2, 4.0, -0.3); pipe.rotation.z = 0.9; body.add(pipe);
  g.add(body);

  // eyes
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10),
      mat(0xfff3ae, { emissive: 0xffb300, emissiveIntensity: 1.6 }));
    eye.position.set(0.6 * s, 4.35, 1.15);
    g.add(eye); eyes.push(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x331100 }));
    pupil.position.set(0.6 * s, 4.35, 1.4); g.add(pupil);
  }
  // arms
  const arms = {};
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 - i * 0.08, 0), mat(junkColors[i % junkColors.length], { roughness: 1 }));
      seg.position.set(0, -i * 0.75, 0);
      arm.add(seg);
    }
    arm.position.set(2.1 * s, 3.6, 0);
    g.add(arm);
    arms[s === -1 ? 'lArm' : 'rArm'] = arm;
  }
  // glowing green pollution core (grapple target)
  const core = new THREE.Group();
  const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1),
    mat(0x7dffa0, { emissive: 0x34ff70, emissiveIntensity: 2.2, roughness: 0.2, transparent: true, opacity: 0.95 }));
  core.add(coreMesh);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 22),
    mat(0x7dffa0, { emissive: 0x34ff70, emissiveIntensity: 1.5 }));
  core.add(coreRing);
  core.position.set(0, 2.6, 1.35);
  core.visible = false;
  g.add(core);

  g.userData = { body, eyes, arms, core, coreMesh };
  shadow(g);
  return g;
}

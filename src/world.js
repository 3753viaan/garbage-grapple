// World builder: constructs each level's environment, owns the real-time
// environment-transformation system, hazards, wildlife, NPCs, particles, boss.

import * as THREE from 'three';
import * as M from './models.js';
import { TRASH_TYPES, BINS, NPC_CHEERS } from './levels.js';

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// ---------------- Particles ----------------
class Particles {
  constructor(parent) {
    this.parent = parent;
    this.list = [];
    this.texCache = new Map();
  }
  texFor(char) {
    if (this.texCache.has(char)) return this.texCache.get(char);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = '48px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char, 32, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(char, tex);
    return tex;
  }
  burst(pos, char, count = 8, opts = {}) {
    const { speed = 2.5, up = 3, life = 1, size = 0.4, gravity = -5 } = opts;
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.texFor(char), transparent: true, depthWrite: false }));
      sp.position.copy(pos);
      sp.scale.setScalar(size * rand(0.7, 1.3));
      const a = Math.random() * TAU;
      const v = new THREE.Vector3(Math.cos(a) * speed * Math.random(),
        up * rand(0.5, 1), Math.sin(a) * speed * Math.random());
      this.parent.add(sp);
      this.list.push({ sp, v, life: life * rand(0.8, 1.3), age: 0, gravity });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.parent.remove(p.sp); p.sp.material.dispose();
        this.list.splice(i, 1); continue;
      }
      p.v.y += p.gravity * dt;
      p.sp.position.addScaledVector(p.v, dt);
      p.sp.material.opacity = 1 - p.age / p.life;
    }
  }
}

// palettes: [dirty, clean]
const ENV = {
  campus: { sky: [0x9aa08e, 0x74c7ff], fog: [0.028, 0.008], ground: [0x8a7f5f, 0x4e9b45], sun: [0.9, 1.6] },
  park:   { sky: [0x93987f, 0x79ccff], fog: [0.030, 0.008], ground: [0x84754f, 0x3f9b45], sun: [0.85, 1.6] },
  city:   { sky: [0x7d7f78, 0x6fc4ff], fog: [0.040, 0.010], ground: [0x6f6a5e, 0x55a04e], sun: [0.7, 1.5] },
  beach:  { sky: [0x9d9c88, 0x86d4ff], fog: [0.026, 0.007], ground: [0xa89468, 0xe6cf96], sun: [0.9, 1.7] },
  river:  { sky: [0x86887a, 0x7ecbff], fog: [0.034, 0.009], ground: [0x77694a, 0x459b48], sun: [0.8, 1.6] },
};

export class World {
  constructor(scene, cfg, audio) {
    this.scene = scene;
    this.cfg = cfg;
    this.audio = audio;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pal = ENV[cfg.env];

    this.time = 0;
    this.envH = 0;
    this.trash = [];
    this.rings = [];
    this.animals = [];
    this.powerups = [];
    this.npcs = [];
    this.boxes = [];      // AABB colliders (walkable tops)
    this.cyls = [];       // cylinder colliders
    this.cars = [];
    this.gas = [];
    this.droppers = [];
    this.slicks = [];
    this.projectiles = [];
    this.smokes = [];
    this.trees = [];
    this.butterflies = [];
    this.birds = [];
    this.waterMeshes = [];
    this.celebrated = false;
    this.boss = null;
    this.golden = null;

    this.particles = new Particles(this.root);

    // every level has a boss guarding the far side of the area
    this.bossPos = cfg.boss ? new THREE.Vector3(0, 0, -cfg.bounds * 0.45) : null;

    this.buildLights();
    this.buildGround();
    this.buildEnvironment();
    if (cfg.boss) this.buildBoss(this.bossPos, cfg.boss);
    this.buildStation();
    this.buildFlowers();
    this.placeGameplay();
    this.applyEnvHealth(0, true);
  }

  // ---------------- lights / sky ----------------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4a35, 0.8);
    this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.2);
    this.sun.position.set(40, 60, 25);
    this.sun.castShadow = true;
    const s = Math.min(70, this.cfg.bounds + 10);
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 5, far: 160 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.root.add(this.sun);
    this.scene.background = new THREE.Color(this.pal.sky[0]);
    this.scene.fog = new THREE.FogExp2(this.pal.sky[0], this.pal.fog[0]);
  }

  buildGround() {
    const R = this.cfg.bounds + 30;
    this.groundMat = M.mat(this.pal.ground[0], { roughness: 1 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(R, 48), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  addWater(mesh) {
    mesh.receiveShadow = true;
    this.waterMeshes.push(mesh);
    this.root.add(mesh);
  }

  // ---------------- per-environment scenery ----------------
  buildEnvironment() {
    const env = this.cfg.env, B = this.cfg.bounds;

    // ring of boundary trees/rocks
    const nEdge = Math.floor(B / 3.2);
    for (let i = 0; i < nEdge; i++) {
      const a = (i / nEdge) * TAU + rand(-0.1, 0.1);
      const r = B + rand(2, 8);
      const t = (env === 'beach' && Math.cos(a) > 0.2) ? M.makeRock(rand(0.8, 1.6)) : this.addTree(0, 0, env);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.root.add(t);
    }

    if (env === 'campus') {
      const school = M.makeBuilding(18, 7, 8, 0xc9b8a0);
      school.position.set(0, 0, -B + 18);
      this.root.add(school);
      this.boxes.push(this.boxFor(school.position, 18, 7.25, 8));
      const sign = M.makeTextPlane('GREEN VALLEY SCHOOL', { w: 10, h: 1.4, bg: '#1f6b38', fontPx: 60 });
      sign.position.set(0, 5.2, -B + 18 + 4.05);
      this.root.add(sign);
      for (let i = 0; i < 8; i++) this.scatterTree(10, B - 10, env);
      for (let i = 0; i < 4; i++) {
        const bench = M.makeBench();
        bench.position.set(rand(-20, 20), 0, rand(-10, 20));
        bench.rotation.y = rand(0, TAU);
        this.root.add(bench);
      }
      this.addLampposts(5, B);
    }

    if (env === 'park') {
      const fountain = M.makeFountain();
      fountain.position.set(0, 0, -12);
      this.root.add(fountain);
      this.cyls.push({ x: 0, z: -12, r: 2.9 });
      this.waterMeshes.push(fountain.userData.water);
      for (let i = 0; i < 18; i++) this.scatterTree(9, B - 8, env);
      for (let i = 0; i < 6; i++) {
        const bench = M.makeBench();
        const a = rand(0, TAU), r = rand(12, B - 14);
        bench.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        bench.rotation.y = rand(0, TAU);
        this.root.add(bench);
      }
      this.addLampposts(6, B);
    }

    if (env === 'city') {
      // two east-west streets
      const roadM = M.mat(0x3b3f45, { roughness: 1 });
      for (const rz of [-14, 14]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(B * 2.2, 8), roadM);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, 0.02, rz);
        road.receiveShadow = true;
        this.root.add(road);
        const dashM = new THREE.MeshBasicMaterial({ color: 0xd9d9c0 });
        for (let x = -B; x < B; x += 6) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), dashM);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(x, 0.03, rz);
          this.root.add(dash);
        }
      }
      // buildings away from roads
      const palette = [0xb0a494, 0x8fa0b3, 0xc9b8a0, 0x9c8f80, 0x7e8b99];
      let placed = 0, tries = 0;
      while (placed < 14 && tries++ < 200) {
        const x = rand(-B + 12, B - 12), z = rand(-B + 12, B - 12);
        if (Math.abs(z - 14) < 10 || Math.abs(z + 14) < 10) continue;
        if (Math.hypot(x, z) > B - 8 || Math.hypot(x - 6, z - 26) < 14) continue;
        if (this.bossPos && Math.hypot(x - this.bossPos.x, z - this.bossPos.z) < 16) continue;
        if (this.boxes.some(b => x > b.min.x - 8 && x < b.max.x + 8 && z > b.min.z - 8 && z < b.max.z + 8)) continue;
        const w = rand(6, 10), h = rand(5, 12), d = rand(6, 10);
        const bld = M.makeBuilding(w, h, d, palette[placed % palette.length]);
        bld.position.set(x, 0, z);
        this.root.add(bld);
        this.boxes.push(this.boxFor(bld.position, w, h + 0.25, d));
        placed++;
      }
      this.addLampposts(8, B);
      for (let i = 0; i < 5; i++) this.scatterTree(10, B - 10, env);
      // smog chimneys
      for (let i = 0; i < 4; i++) {
        const a = rand(0, TAU), r = rand(20, B - 10);
        this.addSmoke(new THREE.Vector3(Math.cos(a) * r, 6, Math.sin(a) * r));
      }
    }

    if (env === 'beach') {
      // sea on the east (x > 14)
      const seaM = M.mat(0x5a6e5e, { transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1 });
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(B * 1.6, B * 2.6), seaM);
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(14 + B * 0.8, 0.12, 0);
      this.seaMat = seaM;
      this.addWater(sea);
      this.waterX = 14;
      for (let i = 0; i < 10; i++) {
        const p = M.makePalm();
        const x = rand(-B + 8, 8), z = rand(-B + 8, B - 8);
        if (Math.hypot(x, z) > B - 6) continue;
        p.position.set(x, 0, z);
        p.rotation.y = rand(0, TAU);
        this.root.add(p);
        this.trees.push(p);
        this.cyls.push({ x, z, r: 0.5 });
      }
      for (let i = 0; i < 5; i++) {
        const u = M.makeUmbrella([0xff5f57, 0xffd76a, 0x4aa8ff][i % 3]);
        u.position.set(rand(-B + 12, 4), 0, rand(-B + 12, B - 12));
        this.root.add(u);
      }
      for (let i = 0; i < 6; i++) {
        const rk = M.makeRock(rand(0.6, 1.4));
        rk.position.set(rand(8, 13), 0, rand(-B + 8, B - 8));
        this.root.add(rk);
      }
    }

    if (env === 'river') {
      // river strip |z| < 5.5
      const rivM = M.mat(0x5e6648, { transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1 });
      const riv = new THREE.Mesh(new THREE.PlaneGeometry(B * 2.4, 11), rivM);
      riv.rotation.x = -Math.PI / 2;
      riv.position.set(0, 0.12, 0);
      this.riverMat = rivM;
      this.addWater(riv);
      // broken bridge planks — platforms with gaps
      for (const [x, z, w] of [[0, 4.2, 3], [1.2, 1.4, 2.6], [-0.6, -1.6, 2.8], [0.4, -4.4, 3]]) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 1.7), M.mat(0x8f6b40, { roughness: 1 }));
        plank.position.set(x, 1.1, z);
        plank.castShadow = plank.receiveShadow = true;
        this.root.add(plank);
        this.boxes.push(this.boxFor(plank.position, w, 1.25, 1.7, 1.1 - 0.15));
      }
      for (let i = 0; i < 14; i++) this.scatterTree(9, B - 8, env, true);
      for (let i = 0; i < 8; i++) {
        const rk = M.makeRock(rand(0.7, 1.7));
        const x = rand(-B + 8, B - 8), z = (Math.random() < 0.5 ? 1 : -1) * rand(8, B - 8);
        rk.position.set(x, 0, z);
        this.root.add(rk);
      }
      this.addSmoke(new THREE.Vector3(-20, 4, -20));
      this.addSmoke(new THREE.Vector3(24, 4, -24));
    }

    // generic ambient smoke for dirty look
    if (env !== 'city' && env !== 'river') {
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU), r = rand(18, B - 12);
        this.addSmoke(new THREE.Vector3(Math.cos(a) * r, 3, Math.sin(a) * r));
      }
    }
  }

  boxFor(pos, w, h, d, minY = 0) {
    return {
      min: new THREE.Vector3(pos.x - w / 2, minY, pos.z - d / 2),
      max: new THREE.Vector3(pos.x + w / 2, h, pos.z + d / 2),
    };
  }

  addTree(x, z, env) {
    const t = (env === 'beach') ? M.makePalm() : M.makeTree(Math.floor(rand(0, 3)));
    t.position.set(x, 0, z);
    t.rotation.y = rand(0, TAU);
    this.trees.push(t);
    return t;
  }

  scatterTree(minR, maxR, env, avoidRiver = false) {
    for (let tries = 0; tries < 20; tries++) {
      const a = rand(0, TAU), r = rand(minR, maxR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (avoidRiver && Math.abs(z) < 8) continue;
      if (this.pointInBox(x, z, 3)) continue;
      if (Math.hypot(x - 6, z - 26) < 8) continue;
      const t = this.addTree(x, z, env);
      this.root.add(t);
      this.cyls.push({ x, z, r: 0.45 });
      return t;
    }
    return null;
  }

  addLampposts(n, B) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.4;
      const r = B * 0.55;
      const lp = M.makeLamppost();
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.pointInBox(x, z, 2)) continue;
      lp.position.set(x, 0, z);
      this.root.add(lp);
      this.cyls.push({ x, z, r: 0.3 });
    }
  }

  addSmoke(base) {
    const sprites = [];
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.particles.texFor('💨'), transparent: true, opacity: 0.5, depthWrite: false }));
      sp.position.copy(base).add(new THREE.Vector3(rand(-0.5, 0.5), i * 1.6, rand(-0.5, 0.5)));
      sp.scale.setScalar(rand(1.6, 2.6));
      this.root.add(sp);
      sprites.push({ sp, off: i * 1.6, ph: rand(0, TAU) });
    }
    this.smokes.push({ base, sprites });
  }

  // ---------------- station / flowers ----------------
  buildStation() {
    this.station = M.makeStation(BINS);
    this.stationPos = new THREE.Vector3(6, 0, 26);
    if (this.cfg.env === 'beach') this.stationPos.set(-10, 0, 20);
    this.station.position.copy(this.stationPos);
    this.root.add(this.station);
    this.stationRadius = 5.2;
  }

  buildFlowers() {
    const N = this.flowerCount = 130;
    const stemG = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5);
    stemG.translate(0, 0.25, 0);
    const headG = new THREE.IcosahedronGeometry(0.14, 0);
    headG.translate(0, 0.55, 0);
    this.flowerStems = new THREE.InstancedMesh(stemG, M.mat(0x2f8f3a, { roughness: 1 }), N);
    this.flowerHeads = new THREE.InstancedMesh(headG,
      new THREE.MeshStandardMaterial({ roughness: 0.7 }), N);
    const colors = [0xff5f8f, 0xffd76a, 0xff9f43, 0xb17aff, 0xffffff, 0xff5f57];
    const dummy = new THREE.Object3D();
    this.flowerPos = [];
    const B = this.cfg.bounds;
    for (let i = 0; i < N; i++) {
      let x, z, tries = 0;
      do {
        const a = rand(0, TAU), r = rand(6, B - 4);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
      } while ((this.pointInBox(x, z, 1) || this.isWater(x, z)) && tries++ < 12);
      this.flowerPos.push([x, z]);
      dummy.position.set(x, 0, z);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      this.flowerStems.setMatrixAt(i, dummy.matrix);
      this.flowerHeads.setMatrixAt(i, dummy.matrix);
      this.flowerHeads.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    }
    this.flowersShown = 0;
    this.root.add(this.flowerStems, this.flowerHeads);
  }

  updateFlowers(count) {
    count = Math.min(this.flowerCount, count);
    if (count === this.flowersShown) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.flowerCount; i++) {
      const [x, z] = this.flowerPos[i];
      dummy.position.set(x, 0, z);
      dummy.rotation.y = i * 1.7;
      dummy.scale.setScalar(i < count ? 1 : 0.001);
      dummy.updateMatrix();
      this.flowerStems.setMatrixAt(i, dummy.matrix);
      this.flowerHeads.setMatrixAt(i, dummy.matrix);
      if (i < count && i >= this.flowersShown)
        this.particles.burst(new THREE.Vector3(x, 0.6, z), '✨', 3, { size: 0.3, life: 0.7 });
    }
    this.flowerStems.instanceMatrix.needsUpdate = true;
    this.flowerHeads.instanceMatrix.needsUpdate = true;
    this.flowersShown = count;
  }

  // ---------------- gameplay object placement ----------------
  pointInBox(x, z, pad = 0) {
    return this.boxes.some(b => x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad);
  }

  randGroundPos(minR = 8) {
    const B = this.cfg.bounds;
    for (let tries = 0; tries < 40; tries++) {
      const a = rand(0, TAU), r = rand(minR, B - 5);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.pointInBox(x, z, 1.2)) continue;
      if (new THREE.Vector2(x - this.stationPos.x, z - this.stationPos.z).length() < 7) continue;
      if (this.cfg.env === 'river' && Math.abs(z) < 7) continue;
      if (this.bossPos && Math.hypot(x - this.bossPos.x, z - this.bossPos.z) < 10) continue;
      if (this.cfg.env === 'beach' && x > this.waterX - 2) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(rand(-10, 10), 0, rand(-10, 10));
  }

  placeGameplay() {
    const cfg = this.cfg;
    // --- litter ---
    const types = cfg.trashMix;
    const nElev = Math.round(cfg.trash * (cfg.elevatedRatio || 0));
    for (let i = 0; i < cfg.trash; i++) {
      const type = types[i % types.length];
      const g = M.makeTrash(type);
      let pos, elevated = i < nElev;
      if (elevated) pos = this.elevatedTrashPos();
      else { pos = this.randGroundPos(); }
      g.position.copy(pos);
      g.rotation.y = rand(0, TAU);
      M.tagRoot(g, 'trash');
      this.root.add(g);
      const item = { group: g, type, collected: false, pulling: false, pullT: 0, bob: rand(0, TAU), baseY: pos.y };
      g.userData.item = item;
      this.trash.push(item);
    }

    // --- grapple rings ---
    const nRings = Math.max(10, Math.round(cfg.bounds / 5));
    for (let i = 0; i < nRings; i++) {
      const a = (i / nRings) * TAU + rand(-0.2, 0.2);
      const r = rand(cfg.bounds * 0.3, cfg.bounds * 0.85);
      const ring = M.makeGrappleRing();
      ring.position.set(Math.cos(a) * r, rand(6.5, 11), Math.sin(a) * r);
      M.tagRoot(ring, 'ring');
      this.root.add(ring);
      this.rings.push(ring);
    }
    if (cfg.env === 'river') {
      for (const x of [-6, 0, 6]) {
        const ring = M.makeGrappleRing();
        ring.position.set(x, 7.5, 0);
        M.tagRoot(ring, 'ring');
        this.root.add(ring);
        this.rings.push(ring);
      }
    }

    // --- animals with cages ---
    for (const a of cfg.animals) {
      const { group } = M.makeAnimal(a.type);
      const pos = this.randGroundPos(14);
      group.position.copy(pos);
      group.rotation.y = rand(0, TAU);
      this.root.add(group);
      const cage = M.makeCage();
      cage.position.copy(pos);
      this.root.add(cage);
      this.animals.push({ group, cage, pos, type: a.type, name: a.name, rescued: false, hop: rand(0, TAU), wanderA: rand(0, TAU) });
    }

    // --- power-ups ---
    for (const kind of cfg.powerups) {
      const g = M.makePowerup(kind);
      g.position.copy(this.randGroundPos(12));
      this.root.add(g);
      this.powerups.push({ group: g, kind, taken: false, ph: rand(0, TAU) });
    }

    // --- hidden golden bottle ---
    {
      const g = M.makeGolden();
      let pos;
      if (this.boxes.length > 2) {  // on a rooftop
        const b = this.boxes[Math.floor(rand(1, this.boxes.length))];
        pos = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
      } else {
        pos = this.randGroundPos(cfg.bounds * 0.75);
      }
      g.position.copy(pos);
      M.tagRoot(g, 'golden');
      this.root.add(g);
      this.golden = { group: g, taken: false };
    }

    // --- NPCs ---
    const shirtColors = [0xd6473f, 0x4aa8ff, 0xffd76a, 0xb17aff, 0xff9f43, 0x6dd34e];
    for (let i = 0; i < 5; i++) {
      const npc = M.makeNPC(shirtColors[i % shirtColors.length]);
      npc.position.copy(this.randGroundPos(10));
      npc.rotation.y = rand(0, TAU);
      this.root.add(npc);
      this.npcs.push({ group: npc, cheer: 0, ph: rand(0, TAU) });
    }

    // --- hazards ---
    const hz = cfg.hazards || {};
    if (hz.cars) {
      const colors = [0xd6473f, 0x4aa8ff, 0xf1ead2, 0xffd76a];
      for (let i = 0; i < hz.cars; i++) {
        const car = M.makeCar(colors[i % colors.length]);
        const lane = [-15.5, -12.5, 12.5, 15.5][i % 4];
        const dir = lane < -14 || (lane > 12 && lane < 14) ? 1 : (i % 2 ? 1 : -1);
        car.position.set(rand(-cfg.bounds, cfg.bounds), 0, lane);
        car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.root.add(car);
        this.cars.push({ group: car, dir, speed: rand(9, 14), lane });
      }
    }
    if (hz.gas) {
      for (let i = 0; i < hz.gas; i++) {
        const pos = this.randGroundPos(16);
        const cloud = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10),
          new THREE.MeshStandardMaterial({ color: 0x9dff43, transparent: true, opacity: 0.28, roughness: 1, depthWrite: false }));
        cloud.position.copy(pos).setY(1.6);
        this.root.add(cloud);
        const warning = M.makeSprite('☠️', { scale: 0.9 });
        warning.position.copy(pos).setY(4.4);
        this.root.add(warning);
        this.gas.push({ mesh: cloud, pos, r: 2.8, ph: rand(0, TAU) });
      }
    }
    if (hz.droppers) {
      const char = cfg.env === 'beach' ? '🥥' : '🪵';
      for (let i = 0; i < hz.droppers; i++) {
        const pos = this.randGroundPos(14);
        const marker = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20),
          new THREE.MeshBasicMaterial({ color: 0xff5f57, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        marker.rotation.x = -Math.PI / 2;
        marker.position.copy(pos).setY(0.05);
        this.root.add(marker);
        this.droppers.push({ pos, marker, char, cooldown: rand(1, 3), falling: null });
      }
    }
    if (hz.slicks) {
      for (let i = 0; i < hz.slicks; i++) {
        const pos = this.randGroundPos(12);
        const slick = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20),
          new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.05, metalness: 0.6 }));
        slick.rotation.x = -Math.PI / 2;
        slick.position.copy(pos).setY(0.04);
        slick.scale.x = 1.4;
        this.root.add(slick);
        this.slicks.push({ pos, r: 2.6 });
      }
    }

    // rainbow, hidden until 100%
    this.rainbow = M.makeRainbow();
    this.rainbow.position.set(0, 0, -this.cfg.bounds * 0.7);
    this.rainbow.visible = false;
    this.root.add(this.rainbow);

    this.playerSpawn = new THREE.Vector3(0, 0, this.cfg.bounds * 0.55);
    if (this.cfg.env === 'river') this.playerSpawn.set(0, 0, 24);
  }

  elevatedTrashPos() {
    // rooftops in city; floating over water at beach/river; treetops elsewhere
    if (this.cfg.env === 'beach') {
      return new THREE.Vector3(rand(this.waterX + 4, this.waterX + 22), 0.35, rand(-this.cfg.bounds + 10, this.cfg.bounds - 10));
    }
    if (this.cfg.env === 'river') {
      return new THREE.Vector3(rand(-this.cfg.bounds + 12, this.cfg.bounds - 12), 0.35, rand(-3.5, 3.5));
    }
    if (this.boxes.length > 1) {
      const b = this.boxes[Math.floor(rand(0, this.boxes.length))];
      return new THREE.Vector3(rand(b.min.x + 1, b.max.x - 1), b.max.y, rand(b.min.z + 1, b.max.z - 1));
    }
    const inland = this.trees.filter(t => Math.hypot(t.position.x, t.position.z) < this.cfg.bounds - 5);
    if (inland.length) {
      const t = inland[Math.floor(rand(0, inland.length))];
      return new THREE.Vector3(t.position.x + rand(-0.5, 0.5), 3.4, t.position.z + rand(-0.5, 0.5));
    }
    return this.randGroundPos();
  }

  // ---------------- boss ----------------
  buildBoss(pos, bossCfg) {
    const g = M.makeBoss(bossCfg.variant);
    g.position.copy(pos);
    g.scale.setScalar(bossCfg.scale);
    const core = g.userData.core;
    M.tagRoot(core, 'core');
    this.root.add(g);
    // floating name banner (readable from both sides)
    const bannerY = 6.4 * bossCfg.scale + 1.4;
    for (const rot of [0, Math.PI]) {
      const banner = M.makeTextPlane(`⚔ ${bossCfg.name}`, { w: 6.5, h: 0.95, bg: '#b3402f', fontPx: 68 });
      banner.position.copy(pos).setY(bannerY);
      banner.rotation.y = rot;
      this.root.add(banner);
    }
    this.boss = {
      group: g, pos, cfg: bossCfg, hp: bossCfg.hits, maxHp: bossCfg.hits,
      state: 'active', coreOpen: false, coreTimer: 0, throwT: 4,
      announced: false, refs: g.userData,
    };
    // arena warning ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(13.4, 14, 40),
      new THREE.MeshBasicMaterial({ color: 0xff5f57, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).setY(0.06);
    this.root.add(ring);
  }

  bossExposeCore() {
    const b = this.boss;
    if (!b || b.state !== 'active') return;
    b.state = 'stunned';
    b.coreOpen = true;
    b.coreTimer = 12;
    b.refs.core.visible = true;
    this.audio.bossRoar();
    this.particles.burst(b.refs.core.getWorldPosition(new THREE.Vector3()), '⚡', 10, { size: 0.5 });
  }

  bossHit() {
    const b = this.boss;
    if (!b || !b.coreOpen) return false;
    b.hp--;
    b.coreOpen = false;
    b.refs.core.visible = false;
    b.state = b.hp <= 0 ? 'dead' : 'active';
    this.audio.bossHit();
    const wp = b.group.position.clone().setY(3);
    this.particles.burst(wp, '💥', 12, { size: 0.7, speed: 4 });
    this.particles.burst(wp, '♻️', 10, { size: 0.5, speed: 4 });
    if (b.state === 'dead') {
      this.audio.bossRoar();
      this.particles.burst(wp, '🍃', 24, { size: 0.6, speed: 5, up: 5, life: 1.8 });
    }
    return true;
  }

  spawnBossTrash() {
    const b = this.boss;
    const a = rand(0, TAU), r = rand(5, 11);
    const types = this.cfg.trashMix;
    const type = types[Math.floor(rand(0, types.length))];
    const g = M.makeTrash(type);
    const pos = new THREE.Vector3(b.pos.x + Math.cos(a) * r, 0, b.pos.z + Math.sin(a) * r);
    if (this.cfg.env === 'river' && Math.abs(pos.z) < 6.5) pos.z = Math.sign(pos.z || 1) * 7;
    const rr = Math.hypot(pos.x, pos.z), BB = this.cfg.bounds - 3;
    if (rr > BB) { pos.x *= BB / rr; pos.z *= BB / rr; }
    g.position.copy(pos);
    M.tagRoot(g, 'trash');
    this.root.add(g);
    const item = { group: g, type, collected: false, pulling: false, pullT: 0, bob: rand(0, TAU), baseY: 0, bossSpawned: true };
    g.userData.item = item;
    this.trash.push(item);
    return item;
  }

  bossThrowAt(target, game) {
    const b = this.boss;
    this.audio.bossThrow();
    const start = b.group.position.clone().setY(4.5);
    const dest = target.clone().setY(0);
    const tele = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.6, 22),
      new THREE.MeshBasicMaterial({ color: 0xff5f57, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    tele.rotation.x = -Math.PI / 2;
    tele.position.copy(dest).setY(0.06);
    this.root.add(tele);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), M.mat(0x5d6650, { roughness: 1 }));
    ball.castShadow = true;
    this.root.add(ball);
    this.projectiles.push({ ball, tele, start, dest, t: 0, dur: 1.25, dmg: b.cfg.dmg, game });
  }

  // ---------------- queries used by the player ----------------
  getGrappleTargets() {
    const out = [...this.rings];
    for (const t of this.trash) if (!t.collected && !t.pulling) out.push(t.group);
    if (this.golden && !this.golden.taken) out.push(this.golden.group);
    if (this.boss && this.boss.coreOpen) out.push(this.boss.refs.core);
    return out;
  }

  groundHeightAt(x, z, feetY) {
    let h = 0;
    for (const b of this.boxes) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) {
        if (b.max.y <= feetY + 0.55 && b.max.y > h) h = b.max.y;
      }
    }
    // station pad
    if (Math.hypot(x - this.stationPos.x, z - this.stationPos.z) < 4.4 && feetY > -0.4) h = Math.max(h, 0.22);
    return h;
  }

  collide(pos, radius, feetY) {
    for (const b of this.boxes) {
      if (feetY + 0.55 >= b.max.y) continue; // can step/stand on it
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // inside: push out along x
          const pushL = pos.x - b.min.x, pushR = b.max.x - pos.x;
          pos.x = pushL < pushR ? b.min.x - radius : b.max.x + radius;
        }
      }
    }
    for (const c of this.cyls) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6 && feetY < 3) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * rr;
        pos.z = c.z + (dz / d) * rr;
      }
    }
    // boss body
    if (this.boss && this.boss.state !== 'dead') {
      const dx = pos.x - this.boss.pos.x, dz = pos.z - this.boss.pos.z;
      const rr = 3.2 * this.boss.cfg.scale + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = this.boss.pos.x + (dx / d) * rr;
        pos.z = this.boss.pos.z + (dz / d) * rr;
      }
    }
    // circular world bound
    const B = this.cfg.bounds;
    const r = Math.hypot(pos.x, pos.z);
    if (r > B) { pos.x *= B / r; pos.z *= B / r; }
  }

  isWater(x, z) {
    if (this.cfg.env === 'beach') return x > this.waterX;
    if (this.cfg.env === 'river') return Math.abs(z) < 5.5;
    return false;
  }

  isSlick(x, z) {
    return this.slicks.some(s => Math.hypot(x - s.pos.x, z - s.pos.z) < s.r);
  }

  // ---------------- interactions ----------------
  collectItem(item) {
    item.collected = true;
    const wp = item.group.position.clone().add(new THREE.Vector3(0, 0.4, 0));
    this.particles.burst(wp, '✨', 7, { size: 0.35, life: 0.8 });
    this.root.remove(item.group);
  }

  rescue(animal) {
    animal.rescued = true;
    const cage = animal.cage;
    const t0 = this.time;
    animal.cageAnim = { t0, cage };
    this.particles.burst(animal.group.position.clone().setY(1), '💚', 10, { size: 0.45, up: 4, life: 1.4 });
    this.particles.burst(animal.group.position.clone().setY(1), '✨', 8, { size: 0.35 });
  }

  takePowerup(p) {
    p.taken = true;
    this.particles.burst(p.group.position.clone().setY(1.2), '⭐', 8, { size: 0.4 });
    this.root.remove(p.group);
  }

  takeGolden() {
    this.golden.taken = true;
    this.particles.burst(this.golden.group.position.clone().setY(1), '🏆', 10, { size: 0.5, up: 4, life: 1.5 });
    this.root.remove(this.golden.group);
  }

  cheerNPCs(strength = 3) {
    for (const n of this.npcs) n.cheer = strength + rand(0, 1.5);
    this.audio.cheer();
  }

  celebrate() {
    if (this.celebrated) return;
    this.celebrated = true;
    this.rainbow.visible = true;
    this.rainbow.scale.setScalar(0.01);
    this.cheerNPCs(8);
    // birds!
    for (let i = 0; i < 6; i++) {
      const b = M.makeFlyingBird();
      b.position.set(rand(-30, 30), rand(12, 20), rand(-30, 30));
      this.root.add(b);
      this.birds.push({ group: b, a: rand(0, TAU), r: rand(14, 30), h: rand(11, 19), sp: rand(0.2, 0.45) });
    }
  }

  leafFireworks(center) {
    for (let i = 0; i < 4; i++) {
      const p = center.clone().add(new THREE.Vector3(rand(-14, 14), rand(6, 14), rand(-14, 14)));
      this.particles.burst(p, ['🍃', '🌸', '✨'][i % 3], 14, { size: 0.5, speed: 5, up: 2, gravity: -2, life: 2 });
    }
  }

  // ---------------- environment transformation ----------------
  applyEnvHealth(h, instant = false) {
    this.envH = h;
    // sky + fog
    const sky = new THREE.Color(this.pal.sky[0]).lerp(new THREE.Color(this.pal.sky[1]), h);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.density = this.pal.fog[0] + (this.pal.fog[1] - this.pal.fog[0]) * h;
    this.sun.intensity = this.pal.sun[0] + (this.pal.sun[1] - this.pal.sun[0]) * h;
    this.hemi.intensity = 0.7 + h * 0.5;
    this.groundMat.color.lerpColors(new THREE.Color(this.pal.ground[0]), new THREE.Color(this.pal.ground[1]), h);
    // trees
    const leafC = new THREE.Color(0x6b6448).lerp(new THREE.Color(0x2f8f3a), h);
    const leafS = 0.72 + h * 0.33;
    for (const t of this.trees) {
      for (const leaf of (t.userData.leaves || [])) {
        leaf.material.color.copy(leafC);
        leaf.scale.setScalar(leafS);
      }
    }
    // water
    if (this.seaMat) this.seaMat.color.lerpColors(new THREE.Color(0x5a6e5e), new THREE.Color(0x2e9adf), h);
    if (this.riverMat) this.riverMat.color.lerpColors(new THREE.Color(0x5e6648), new THREE.Color(0x35a8e0), h);
    // smoke fades
    for (const s of this.smokes) for (const sp of s.sprites) sp.sp.material.opacity = 0.5 * (1 - h);
    // flowers bloom in waves
    this.updateFlowers(Math.floor(h * this.flowerCount));
    // butterflies at 70%
    if (h >= 0.7 && !this.butterflies.length) {
      for (let i = 0; i < 8; i++) {
        const bf = M.makeButterfly();
        const [x, z] = this.flowerPos[Math.floor(rand(0, this.flowerPos.length))];
        bf.position.set(x, 1.2, z);
        this.root.add(bf);
        this.butterflies.push({ group: bf, cx: x, cz: z, ph: rand(0, TAU) });
      }
    }
  }

  // ---------------- per-frame ----------------
  update(dt, game, playerPos) {
    this.time += dt;
    const T = this.time;

    // litter bob + halo pulse + magnet pull
    for (const item of this.trash) {
      if (item.collected) continue;
      const g = item.group;
      if (item.pulling) {
        item.pullT += dt * 2.6;
        const target = playerPos.clone().setY(playerPos.y + 1);
        g.position.lerp(target, Math.min(1, item.pullT));
        g.rotation.y += dt * 10;
        if (item.pullT >= 1 || g.position.distanceTo(target) < 0.7) game.collectTrash(item, true);
        continue;
      }
      g.position.y = item.baseY + Math.sin(T * 2 + item.bob) * 0.07 + 0.05;
      g.rotation.y += dt * 0.8;
      if (g.userData.halo) {
        g.userData.halo.material.opacity = 0.4 + Math.sin(T * 3 + item.bob) * 0.2;
        g.userData.halo.rotation.z += dt;
      }
      if (game.power.magnet > 0 && game.bagFree() && g.position.distanceTo(playerPos) < 13) item.pulling = true;
    }

    // rings spin + gentle float
    for (const r of this.rings) {
      r.rotation.y += dt * 0.6;
      r.userData.torus.rotation.z += dt * 1.5;
    }

    // golden bottle
    if (this.golden && !this.golden.taken) {
      this.golden.group.rotation.y += dt * 1.6;
    }

    // power-ups
    for (const p of this.powerups) {
      if (p.taken) continue;
      p.group.position.y = Math.sin(T * 2 + p.ph) * 0.15;
      p.group.userData.ring.rotation.z += dt * 2;
      p.group.rotation.y += dt;
    }

    // animals
    for (const a of this.animals) {
      if (a.cageAnim) {
        const el = T - a.cageAnim.t0;
        a.cageAnim.cage.position.y = el * el * 8;
        a.cageAnim.cage.rotation.z = el * 3;
        if (el > 1.2) { this.root.remove(a.cageAnim.cage); a.cageAnim = null; }
      }
      if (a.rescued) {
        // happy free wandering + hopping
        a.hop += dt * 6;
        a.wanderA += dt * 0.4;
        a.group.position.x += Math.cos(a.wanderA) * dt * 1.2;
        a.group.position.z += Math.sin(a.wanderA) * dt * 1.2;
        a.group.position.y = Math.abs(Math.sin(a.hop)) * 0.25;
        a.group.rotation.y = -a.wanderA;
        if (Math.random() < dt * 0.5)
          this.particles.burst(a.group.position.clone().setY(0.8), '💚', 1, { size: 0.3, up: 2, life: 1 });
      } else {
        // trapped: struggle
        a.group.rotation.y += Math.sin(T * 5 + a.hop) * dt * 1.4;
      }
    }

    // NPCs
    for (const n of this.npcs) {
      const arms = n.group.userData.arms;
      if (n.cheer > 0) {
        n.cheer -= dt;
        n.group.position.y = Math.abs(Math.sin(T * 8 + n.ph)) * 0.3;
        arms.lArm.rotation.z = Math.PI * 0.85 + Math.sin(T * 10) * 0.2;
        arms.rArm.rotation.z = -Math.PI * 0.85 - Math.sin(T * 10) * 0.2;
        n.group.userData.bubble.scale.setScalar(0.7);
      } else {
        n.group.position.y = 0;
        arms.lArm.rotation.z = Math.sin(T + n.ph) * 0.08;
        arms.rArm.rotation.z = -Math.sin(T + n.ph) * 0.08;
        n.group.userData.bubble.scale.setScalar(0.001);
      }
    }

    // smoke drift
    for (const s of this.smokes) {
      for (const spr of s.sprites) {
        spr.off += dt * 0.8;
        if (spr.off > 8) spr.off = 0;
        spr.sp.position.set(s.base.x + Math.sin(T + spr.ph) * 0.6, s.base.y + spr.off, s.base.z);
      }
    }

    // butterflies / birds
    for (const b of this.butterflies) {
      b.ph += dt;
      b.group.position.set(b.cx + Math.sin(b.ph * 0.7) * 2, 1.1 + Math.sin(b.ph * 1.3) * 0.5, b.cz + Math.cos(b.ph * 0.9) * 2);
      b.group.userData.wings[0].rotation.y = Math.sin(b.ph * 14) * 0.9;
      b.group.userData.wings[1].rotation.y = -Math.sin(b.ph * 14) * 0.9;
    }
    for (const b of this.birds) {
      b.a += dt * b.sp;
      b.group.position.set(Math.cos(b.a) * b.r, b.h + Math.sin(b.a * 3) * 1, Math.sin(b.a) * b.r);
      b.group.rotation.y = -b.a + Math.PI;
      b.group.userData.wings[0].rotation.z = Math.sin(T * 9) * 0.6;
      b.group.userData.wings[1].rotation.z = -Math.sin(T * 9) * 0.6;
    }

    // rainbow grow-in
    if (this.rainbow.visible && this.rainbow.scale.x < 1)
      this.rainbow.scale.setScalar(Math.min(1, this.rainbow.scale.x + dt * 0.5));

    // water shimmer
    for (const w of this.waterMeshes) w.position.y = 0.12 + Math.sin(T * 1.4) * 0.035;

    // ---- hazards ----
    const B = this.cfg.bounds;
    for (const c of this.cars) {
      c.group.position.x += c.dir * c.speed * dt;
      if (c.group.position.x > B + 6) c.group.position.x = -B - 6;
      if (c.group.position.x < -B - 6) c.group.position.x = B + 6;
      for (const w of c.group.userData.wheels) w.rotation.x += c.dir * c.speed * dt * 2;
      const dx = playerPos.x - c.group.position.x, dz = playerPos.z - c.group.position.z;
      if (Math.abs(dx) < 2.1 && Math.abs(dz) < 1.5 && playerPos.y < 1.4)
        game.damage(15, c.group.position, 'Hit by traffic! Watch the roads!');
    }
    for (const gz of this.gas) {
      gz.mesh.scale.setScalar(1 + Math.sin(T * 2 + gz.ph) * 0.1);
      if (playerPos.distanceTo(gz.pos.clone().setY(playerPos.y)) < gz.r && playerPos.y < 3.4)
        game.damageOverTime(8 * dt, 'Toxic gas! Stay clear!');
    }
    for (const d of this.droppers) {
      if (d.falling) {
        d.falling.v += 22 * dt;
        d.falling.mesh.position.y -= d.falling.v * dt;
        if (d.falling.mesh.position.y <= 0.4) {
          if (playerPos.distanceTo(d.falling.mesh.position) < 1.6)
            game.damage(10, d.falling.mesh.position, 'Ouch! Watch out for falling objects!');
          this.particles.burst(d.falling.mesh.position, '💥', 5, { size: 0.4, life: 0.6 });
          this.root.remove(d.falling.mesh);
          d.falling = null;
          d.marker.material.opacity = 0;
          d.cooldown = rand(2.5, 5);
        }
      } else {
        const near = Math.hypot(playerPos.x - d.pos.x, playerPos.z - d.pos.z) < 5.5;
        d.cooldown -= dt;
        d.marker.material.opacity = near && d.cooldown < 1 ? 0.35 + Math.sin(T * 10) * 0.25 : 0;
        if (near && d.cooldown <= 0) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.particles.texFor(d.char), depthWrite: false }));
          sp.scale.setScalar(0.9);
          sp.position.set(d.pos.x, 8, d.pos.z);
          this.root.add(sp);
          d.falling = { mesh: sp, v: 0 };
        }
      }
    }

    // ---- boss ----
    if (this.boss) this.updateBoss(dt, game, playerPos);

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.ball.position.lerpVectors(p.start, p.dest, k);
      p.ball.position.y += Math.sin(k * Math.PI) * 7;
      p.ball.rotation.x += dt * 6;
      p.tele.material.opacity = 0.35 + Math.sin(T * 12) * 0.25;
      if (k >= 1) {
        if (playerPos.distanceTo(p.dest) < 2.2)
          game.damage(p.dmg, p.dest, 'The monster hit you! Keep moving!');
        this.particles.burst(p.dest.clone().setY(0.5), '💥', 8, { size: 0.5 });
        this.root.remove(p.ball, p.tele);
        this.projectiles.splice(i, 1);
      }
    }

    this.particles.update(dt);
  }

  updateBoss(dt, game, playerPos) {
    const b = this.boss;
    const refs = b.refs;
    if (b.state === 'dead') {
      if (b.group.scale.y > 0.25) {
        b.group.scale.y -= dt * 0.3;
        b.group.scale.x += dt * 0.12;
        b.group.scale.z += dt * 0.12;
      }
      return;
    }
    // idle sway + breathing
    refs.body.rotation.y = Math.sin(this.time * 0.6) * 0.15;
    refs.body.position.y = Math.sin(this.time * 1.4) * 0.15;
    const inArena = playerPos.distanceTo(b.pos) < 34;
    if (inArena && !b.announced) {
      b.announced = true;
      game.onBossEncounter(b.cfg.name);
    }
    if (b.state === 'active') {
      refs.arms.lArm.rotation.x = Math.sin(this.time * 1.2) * 0.4;
      refs.arms.rArm.rotation.x = -Math.sin(this.time * 1.2) * 0.4;
      for (const e of refs.eyes) e.material.emissiveIntensity = 1.6;
      if (inArena) {
        b.throwT -= dt;
        if (b.throwT <= 0) {
          b.throwT = rand(b.cfg.throwT[0], b.cfg.throwT[1]);
          this.bossThrowAt(playerPos, game);
        }
      }
    } else if (b.state === 'stunned') {
      refs.arms.lArm.rotation.x = 0.9;
      refs.arms.rArm.rotation.x = 0.9;
      for (const e of refs.eyes) e.material.emissiveIntensity = 0.4;
      refs.core.rotation.y += dt * 2;
      refs.coreMesh.scale.setScalar(1 + Math.sin(this.time * 6) * 0.15);
      b.coreTimer -= dt;
      if (b.coreTimer <= 0) {
        b.state = 'active';
        b.coreOpen = false;
        refs.core.visible = false;
        game.onBossCoreClosed();
      }
    }
    // boss sheds litter only when the level doesn't have enough left to stun it
    b.shedT = (b.shedT || 6) - dt;
    const liveTrash = this.trash.filter(t => !t.collected).length;
    const available = liveTrash + game.bag.length;
    if (b.shedT <= 0 && available < b.cfg.coreNeed + 1 && b.state === 'active') {
      b.shedT = 7;
      this.spawnBossTrash();
      this.particles.burst(b.pos.clone().setY(4), '🗑️', 3, { size: 0.5 });
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    this.scene.fog = null;
  }
}

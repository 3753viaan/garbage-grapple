// Player controller — Mario-style platforming (acceleration, coyote time, jump
// buffering, variable jump height, double jump, air control) + physics-based
// grappling hook (pendulum swing with momentum-preserving release).

import * as THREE from 'three';
import { makeRanger } from './models.js';

const GRAVITY = 25;
const RUN_SPEED = 8;
const SPRINT_MULT = 1.5;
const ACCEL = 42;
const FRICTION = 26;
const AIR_ACCEL = 18;
const JUMP_V = 10.6;
const DJUMP_V = 9.4;
const COYOTE = 0.12;
const JBUFFER = 0.13;
const RADIUS = 0.45;

export class Player {
  constructor(scene, camera, world, audio) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.audio = audio;

    const { group, refs } = makeRanger();
    this.model = group;
    this.refs = refs;
    scene.add(group);

    this.pos = world.playerSpawn.clone();
    this.vel = new THREE.Vector3();
    this.onGround = true;
    this.jumpsLeft = 1;
    this.coyote = 0;
    this.jbuffer = 0;
    this.faceYaw = 0;
    this.runPhase = 0;
    this.invuln = 0;
    this.airTime = 0;

    this.yaw = 0;                // camera starts behind the player, facing level center
    this.pitch = -0.18;
    this.camDist = 6.8;

    // grapple
    this.grapple = null;         // { mode:'swing'|'pull', anchor:Vector3, ropeLen, visTimer, targetGroup }
    this.aimHit = null;
    this.ray = new THREE.Raycaster();
    this.ray.far = 55;

    this.rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xd8ffe2 }));
    this.rope.visible = false;
    scene.add(this.rope);
    this.hook = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x7dffa0 }));
    this.hook.visible = false;
    scene.add(this.hook);

    this.model.position.copy(this.pos);
  }

  chestPos() { return this.pos.clone().add(new THREE.Vector3(0, 1.3, 0)); }
  handPos() {
    return this.model.localToWorld(new THREE.Vector3(0.34, 1.15, 0.2));
  }

  respawn() {
    this.pos.copy(this.world.stationPos).add(new THREE.Vector3(0, 0.3, 5));
    this.vel.set(0, 0, 0);
    this.releaseGrapple();
    this.invuln = 2;
  }

  hurt(srcPos) {
    if (this.invuln > 0) return false;
    this.invuln = 1.3;
    const away = this.pos.clone().sub(srcPos).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();
    this.vel.add(away.multiplyScalar(7)).y = 5;
    this.audio.damage();
    return true;
  }

  // ---------- grapple ----------
  aim(game) {
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    const targets = this.world.getGrappleTargets();
    const hits = this.ray.intersectObjects(targets, true);
    this.aimHit = null;
    for (const h of hits) {
      const root = h.object.userData.root;
      if (!root) continue;
      this.aimHit = { root, kind: root.userData.kind, point: h.point };
      break;
    }
    return this.aimHit;
  }

  fireGrapple(game) {
    const hit = this.aimHit;
    if (!hit) { this.audio.grappleShoot(); return; }
    this.audio.grappleShoot();
    const kind = hit.kind;
    if (kind === 'ring') {
      const anchor = new THREE.Vector3();
      hit.root.getWorldPosition(anchor);
      const len = Math.max(3.5, Math.min(30, this.chestPos().distanceTo(anchor) * 0.96));
      this.grapple = { mode: 'swing', anchor, ropeLen: len };
      this.audio.grappleHit();
      game.onSwingStart();
    } else if (kind === 'trash') {
      if (!game.bagFree()) { game.bagFullNotice(); return; }
      const item = hit.root.userData.item;
      if (item && !item.collected && !item.pulling) {
        item.pulling = true;
        this.grapple = { mode: 'pull', targetGroup: hit.root, visTimer: 0.45 };
        this.audio.grappleHit();
      }
    } else if (kind === 'golden') {
      this.grapple = { mode: 'pull', targetGroup: hit.root, visTimer: 0.45 };
      game.collectGolden();
      this.audio.grappleHit();
    } else if (kind === 'core') {
      this.grapple = { mode: 'pull', targetGroup: hit.root, visTimer: 0.6 };
      // yank toward the boss slightly, dramatic
      const toBoss = hit.point.clone().sub(this.pos).setY(0).normalize();
      this.vel.add(toBoss.multiplyScalar(4)).y += 3;
      game.bossCorePulled();
    }
  }

  releaseGrapple() {
    if (this.grapple && this.grapple.mode === 'swing') {
      this.audio.release();
      // small upward pop for satisfying swing exits
      if (this.vel.y > 0) this.vel.y += 1.5;
    }
    this.grapple = null;
  }

  // ---------- main update ----------
  update(dt, input, game) {
    const world = this.world;
    if (this.invuln > 0) this.invuln -= dt;

    // camera orbit from mouse
    this.yaw -= input.mdx * 0.0026;
    this.pitch -= input.mdy * 0.0024;
    this.pitch = Math.max(-1.2, Math.min(1.15, this.pitch));

    // aim every frame (crosshair feedback)
    this.aim(game);

    // fire / release grapple
    if (input.grapplePressed) this.fireGrapple(game);
    if (this.grapple && this.grapple.mode === 'swing' && !input.grappleDown) this.releaseGrapple();
    if (this.grapple && this.grapple.mode === 'pull') {
      this.grapple.visTimer -= dt;
      if (this.grapple.visTimer <= 0) this.grapple = null;
    }

    // movement input in camera space
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const mv = new THREE.Vector3();
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) mv.add(f);
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) mv.sub(f);
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mv.add(r);
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mv.sub(r);
    const hasInput = mv.lengthSq() > 0;
    if (hasInput) mv.normalize();

    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const speedBoost = game.power.speed > 0 ? 1.45 : 1;
    const inWater = world.isWater(this.pos.x, this.pos.z) && this.pos.y < 0.5;
    const onSlick = this.onGround && world.isSlick(this.pos.x, this.pos.z);
    let maxSpeed = RUN_SPEED * (sprint ? SPRINT_MULT : 1) * speedBoost * (inWater ? 0.42 : 1);

    const swinging = this.grapple && this.grapple.mode === 'swing';

    if (swinging) {
      // pendulum: gravity + air pump toward camera forward
      this.vel.y -= GRAVITY * dt;
      if (hasInput) this.vel.addScaledVector(mv, 10 * dt);
      this.pos.addScaledVector(this.vel, dt);
      const chest = this.chestPos();
      const d = chest.sub(this.grapple.anchor);
      const dist = d.length();
      if (dist > this.grapple.ropeLen) {
        d.normalize();
        // clamp position to rope length
        const corrected = this.grapple.anchor.clone().addScaledVector(d, this.grapple.ropeLen);
        this.pos.copy(corrected.sub(new THREE.Vector3(0, 1.3, 0)));
        // remove outward radial velocity
        const radial = d.dot(this.vel);
        if (radial > 0) this.vel.addScaledVector(d, -radial);
      }
      // reel in slightly for energy (makes swings feel powerful)
      this.grapple.ropeLen = Math.max(3.2, this.grapple.ropeLen - dt * 1.1);
    } else {
      // Mario-style ground/air control
      const accel = (this.onGround ? ACCEL : AIR_ACCEL) * (onSlick ? 0.16 : 1);
      const fric = (this.onGround ? FRICTION : 2.5) * (onSlick ? 0.06 : 1);
      const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
      if (hasInput) {
        hv.addScaledVector(mv, accel * dt);
        if (hv.length() > maxSpeed) hv.setLength(Math.max(maxSpeed, hv.length() - fric * dt * 2));
      } else {
        const sp = hv.length();
        hv.setLength(Math.max(0, sp - fric * dt));
      }
      this.vel.x = hv.x; this.vel.z = hv.z;
      this.vel.y -= GRAVITY * dt;
      // variable jump height
      if (!input.jumpHeld && this.vel.y > 4.5) this.vel.y = 4.5;
      this.pos.addScaledVector(this.vel, dt);
    }

    // ---- ground + collision resolution ----
    world.collide(this.pos, RADIUS, this.pos.y);
    const floorY = world.groundHeightAt(this.pos.x, this.pos.z, this.pos.y);
    const wasGround = this.onGround;
    if (this.pos.y <= floorY + 0.02 && this.vel.y <= 0.01) {
      this.pos.y = floorY;
      if (!wasGround && this.airTime > 0.25) this.audio.land();
      this.vel.y = 0;
      this.onGround = true;
      this.jumpsLeft = 1;
      this.coyote = COYOTE;
      this.airTime = 0;
      if (swinging) this.releaseGrapple();
    } else {
      this.onGround = false;
      this.coyote -= dt;
      this.airTime += dt;
    }

    // ---- jumping (buffered + coyote + double) ----
    if (input.jumpPressed) this.jbuffer = JBUFFER;
    else this.jbuffer -= dt;
    if (this.jbuffer > 0) {
      if (swinging) {
        this.releaseGrapple();
        this.vel.y = Math.max(this.vel.y, 6);
        this.jbuffer = 0;
        this.audio.jump();
      } else if (this.onGround || this.coyote > 0) {
        this.vel.y = JUMP_V * (inWater ? 0.75 : 1);
        this.onGround = false;
        this.coyote = 0;
        this.jbuffer = 0;
        this.audio.jump();
        game.onJump();
      } else if (this.jumpsLeft > 0) {
        this.vel.y = DJUMP_V;
        this.jumpsLeft--;
        this.jbuffer = 0;
        this.audio.doubleJump();
        game.onDoubleJump();
        this.world.particles.burst(this.pos.clone().setY(this.pos.y + 0.3), '💨', 4, { size: 0.3, up: 0.5, life: 0.5, gravity: 0 });
      }
    }

    // ---- character model ----
    this.model.position.copy(this.pos);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.5 || swinging) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let dy = targetYaw - this.faceYaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      this.faceYaw += dy * Math.min(1, dt * 12);
    }
    this.model.rotation.y = this.faceYaw;
    this.animate(dt, hSpeed, swinging);

    // invulnerability blink
    this.model.visible = this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0;

    // ---- rope visuals ---- (re-check grapple: landing may have released it)
    let ropeTo = null;
    if (this.grapple && this.grapple.mode === 'swing') ropeTo = this.grapple.anchor;
    else if (this.grapple && this.grapple.mode === 'pull' && this.grapple.targetGroup)
      ropeTo = this.grapple.targetGroup.getWorldPosition(new THREE.Vector3());
    if (ropeTo) {
      const from = this.handPos();
      const mid = from.clone().add(ropeTo).multiplyScalar(0.5);
      const len = from.distanceTo(ropeTo);
      this.rope.visible = this.hook.visible = true;
      this.rope.position.copy(mid);
      this.rope.scale.set(1, len, 1);
      this.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
        ropeTo.clone().sub(from).normalize());
      this.hook.position.copy(ropeTo);
    } else {
      this.rope.visible = this.hook.visible = false;
    }

    // ---- camera follow ----
    // view direction comes straight from yaw/pitch so the crosshair can aim
    // anywhere (including up at grapple rings) even when the camera position
    // is clamped above the ground.
    const camTarget = this.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
    const fdir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch));
    const desired = camTarget.clone().addScaledVector(fdir, -this.camDist);
    if (desired.y < 0.5) desired.y = 0.5;
    this.camera.position.lerp(desired, Math.min(1, dt * 10));
    this.camera.lookAt(this.camera.position.clone().add(fdir));

    // fell out of world safety
    if (this.pos.y < -12) this.respawn();
  }

  animate(dt, hSpeed, swinging) {
    const R = this.refs;
    if (swinging) {
      R.lArm.rotation.x = -2.6;
      R.rArm.rotation.x = -2.6;
      R.lLeg.rotation.x = 0.5;
      R.rLeg.rotation.x = -0.3;
      R.torso.rotation.x = 0.25;
      return;
    }
    R.torso.rotation.x = 0;
    if (!this.onGround) {
      // jump pose
      R.lArm.rotation.x = -0.8;
      R.rArm.rotation.x = -0.8;
      R.lLeg.rotation.x = 0.55;
      R.rLeg.rotation.x = -0.4;
      return;
    }
    if (hSpeed > 0.4) {
      this.runPhase += dt * (4 + hSpeed * 1.35);
      const k = Math.min(1, hSpeed / RUN_SPEED);
      const s = Math.sin(this.runPhase);
      R.lLeg.rotation.x = s * 0.95 * k;
      R.rLeg.rotation.x = -s * 0.95 * k;
      R.lArm.rotation.x = -s * 0.8 * k;
      R.rArm.rotation.x = s * 0.8 * k;
      this.model.position.y = this.pos.y + Math.abs(Math.sin(this.runPhase)) * 0.06 * k;
    } else {
      // idle breathe
      const b = Math.sin(performance.now() * 0.002);
      R.lLeg.rotation.x = R.rLeg.rotation.x = 0;
      R.lArm.rotation.x = b * 0.06;
      R.rArm.rotation.x = -b * 0.06;
    }
  }

  setBagFill(frac) {
    this.refs.backpack.scale.setScalar(0.7 + frac * 0.55);
  }
}

// Garbage Grapple — main game orchestrator.

import * as THREE from 'three';
import { LEVELS, TRASH_TYPES, NPC_CHEERS } from './levels.js';
import { World } from './world.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';

// ---------------- renderer / scene ----------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 4, 10);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- input ----------------
const input = {
  keys: new Set(), mdx: 0, mdy: 0,
  grappleDown: false, grapplePressed: false,
  jumpPressed: false, jumpHeld: false, interactPressed: false,
  endFrame() { this.mdx = 0; this.mdy = 0; this.grapplePressed = false; this.jumpPressed = false; this.interactPressed = false; },
};

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  input.keys.add(e.code);
  if (e.code === 'Space') { input.jumpPressed = true; input.jumpHeld = true; }
  if (e.code === 'KeyE') input.interactPressed = true;
  if (e.code === 'KeyP') game.togglePause();
});
window.addEventListener('keyup', e => {
  input.keys.delete(e.code);
  if (e.code === 'Space') input.jumpHeld = false;
});
window.addEventListener('blur', () => { input.keys.clear(); input.jumpHeld = false; input.grappleDown = false; });

renderer.domElement.addEventListener('mousedown', e => {
  if (e.button === 0) {
    if (game.state === 'play' && document.pointerLockElement !== renderer.domElement) {
      lockPointer();
      return;
    }
    input.grappleDown = true;
    input.grapplePressed = true;
  }
});
window.addEventListener('mouseup', e => { if (e.button === 0) input.grappleDown = false; });
// Pointer-lock spike filter: browsers can report a huge bogus movementX/Y right
// after (re)locking, which whipped the camera around. Ignore deltas for a short
// window after any lock change and discard any single outlier spike.
let lockSettleUntil = 0;
window.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (performance.now() < lockSettleUntil) return;
  const mx = e.movementX, my = e.movementY;
  if (Math.abs(mx) > 220 || Math.abs(my) > 220) return;   // spike — not a real hand movement
  input.mdx += mx; input.mdy += my;
});
window.addEventListener('contextmenu', e => e.preventDefault());
function lockPointer() {
  try {
    const r = renderer.domElement.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* pointer lock unavailable — game still playable */ }
}
document.addEventListener('pointerlockchange', () => {
  input.mdx = 0; input.mdy = 0;                 // drop anything accumulated across the change
  lockSettleUntil = performance.now() + 80;     // and ignore the first post-lock deltas
  if (document.pointerLockElement !== renderer.domElement && game.state === 'play') game.pause();
});

// ---------------- game ----------------
const ui = new UI();
const audio = new AudioEngine();

class Game {
  constructor() {
    this.state = 'menu';
    this.levelIdx = 0;
    this.totalScore = 0;
    this.totals = { recycled: 0, animals: 0, score: 0 };
    this.badges = [];
    this.playerName = '';
    this.world = null;
    this.player = null;
    this.howtoReturn = 'start';
    this.comboWindow = 4;
  }

  bagFree() { return this.bag.length < this.cfg.bagCap; }

  bagFullNotice() {
    if (this._bagNoticeT && performance.now() - this._bagNoticeT < 2500) return;
    this._bagNoticeT = performance.now();
    ui.toast('🎒 <b>Bag full!</b> Take it to the ♻ Recycling Station and press <kbd>E</kbd>');
  }

  // ---------- level lifecycle ----------
  loadLevel(idx) {
    this.levelIdx = idx;
    this.cfg = LEVELS[idx];
    // persist progress so quitting to the menu (or closing the tab) never loses it
    try {
      localStorage.setItem('gg-progress', JSON.stringify({
        idx, totalScore: this.totalScore, totals: this.totals,
        badges: this.badges, name: this.playerName,
      }));
    } catch (e) { /* storage unavailable — progress just won't persist */ }
    if (this.world) this.world.dispose();
    if (this.player) { scene.remove(this.player.model, this.player.rope, this.player.hook); }
    this.world = new World(scene, this.cfg, audio);
    this.player = new Player(scene, camera, this.world, audio);
    this.player.model.add(makeNameTag(this.playerName || 'Eco Ranger'));

    this.score = this.scoreAtLevelStart = this.totalScore;
    this.timeLeft = this.cfg.time;
    this.health = 100;
    this.bag = [];
    this.recycled = 0;
    this.collected = 0;
    this.trashTotal = this.cfg.trash;
    this.combo = 0; this.comboTimer = 0; this.bestCombo = 0; this.multiplier = 1;
    this.animalsRescued = 0;
    this.animalsTotal = this.cfg.animals.length;
    this.goldenFound = false;
    this.power = { magnet: 0, speed: 0, freeze: 0, double: 0 };
    this.envTarget = 0; this.envHealthDisplay = 0;
    this.milestones = new Set();
    this.recycledSinceCore = 0;
    this.coreNeed = this.cfg.boss.coreNeed;
    this.levelStats = { trashPts: 0, recycleBonus: 0, wildlifePts: 0, goldenPts: 0 };
    this.celebrateT = 0;
    this.flags = { moved: 0, doubleJumped: false, latched: false, recycledOnce: false, rescuedOnce: false };
    this.tutorialStep = this.cfg.tutorial ? 0 : -1;
    this._lastTick = -1;
    this._guide = { item: null, dirX: 0, dirZ: -1 };   // guide trail state (reset per level)

    ui.setLevelIntro(this.cfg);
    ui.show('intro');
    ui.hudVisible(false);
    this.state = 'intro';
  }

  begin() {
    this.state = 'play';
    ui.show(null);
    ui.hudVisible(true);
    audio.ensure();
    audio.startMusic();
    audio.setBrightness(0);
    lockPointer();
    ui.announce(`MISSION ${this.cfg.id}: ${this.cfg.name.split('—')[0].trim().toUpperCase()}`);
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    ui.show('pause');
    document.exitPointerLock();
  }

  resume() {
    this.state = 'play';
    ui.show(null);
    lockPointer();
  }

  togglePause() {
    if (this.state === 'play') this.pause();
    else if (this.state === 'pause') this.resume();
  }

  quitToMenu() {
    this.state = 'menu';
    ui.show('start');
    ui.hudVisible(false);
    audio.stopMusic();
    document.exitPointerLock();
    refreshStartScreen();
  }

  // ---------- scoring / collection ----------
  gainMult() { return (this.power.double > 0 ? 2 : 1) * this.multiplier; }

  collectTrash(item, viaGrapple = false) {
    if (item.collected) return;
    this.world.collectItem(item);
    this.bag.push(item.type);
    this.collected++;
    // combo
    this.combo++;
    this.comboTimer = this.comboWindow;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.multiplier = this.combo >= 10 ? 10 : this.combo >= 6 ? 5 : this.combo >= 3 ? 2 : 1;
    const pts = TRASH_TYPES[item.type].points * this.gainMult();
    this.score += pts;
    this.levelStats.trashPts += pts;
    audio.collect(this.combo);
    ui.comboPop();
    if (this.combo === 3) ui.announce('ECO COMBO ×2!');
    if (this.combo === 6) ui.announce('ECO COMBO ×5!');
    if (this.combo === 10) ui.announce('🔥 ECO COMBO ×10!');
    this.player.setBagFill(this.bag.length / this.cfg.bagCap);
    if (!this.bagFree()) this.bagFullNotice();
  }

  deposit() {
    const n = this.bag.length;
    if (!n) return;
    const bins = this.world.station.userData.bins;
    this.bag.forEach((type, i) => {
      const binId = TRASH_TYPES[type].bin;
      const bin = bins[binId];
      const wp = new THREE.Vector3();
      bin.getWorldPosition(wp);
      setTimeout(() => {
        audio.deposit(i);
        this.world.particles.burst(wp.clone().setY(1.4), '♻️', 2, { size: 0.35, up: 2.5, life: 0.8 });
      }, i * 110);
    });
    const bonus = 50 * n * (this.power.double > 0 ? 2 : 1);
    this.score += bonus;
    this.levelStats.recycleBonus += bonus;
    this.recycled += n;
    this.recycledSinceCore += n;
    this.bag = [];
    this.player.setBagFill(0);
    this.flags.recycledOnce = true;
    ui.announce(`♻ +${n} RECYCLED!`);
    // boss core exposure
    const boss = this.world.boss;
    if (boss && boss.state === 'active' && this.recycledSinceCore >= this.coreNeed) {
      this.world.bossExposeCore();
      ui.announce('⚡ CORE EXPOSED — GRAPPLE IT!');
      ui.toast('The monster is stunned! Aim at its glowing <b>green core</b> and <kbd>CLICK</kbd> to grapple it!', 6);
    }
  }

  rescueAnimal(animal) {
    this.world.rescue(animal);
    this.animalsRescued++;
    const pts = 250 * (this.power.double > 0 ? 2 : 1);
    this.score += pts;
    this.levelStats.wildlifePts += pts;
    audio.rescue();
    this.flags.rescuedOnce = true;
    ui.announce(`💚 ${animal.name} RESCUED!`);
  }

  collectGolden() {
    if (this.goldenFound) return;
    this.goldenFound = true;
    this.world.takeGolden();
    this.score += 1000;
    this.levelStats.goldenPts = 1000;
    audio.golden();
    ui.announce('🏆 GOLDEN BOTTLE! +1000');
  }

  takePowerup(p) {
    this.world.takePowerup(p);
    audio.powerup();
    const dur = { magnet: 10, speed: 8, freeze: 8, double: 10 }[p.kind];
    this.power[p.kind] = dur;
    const names = { magnet: '🧲 MAGNETIC RECYCLER!', speed: '👟 SPEED SHOES!', freeze: '❄️ TIME FROZEN!', double: '⭐ DOUBLE SCORE!' };
    ui.announce(names[p.kind]);
  }

  // ---------- damage ----------
  damage(n, srcPos, msg) {
    if (this.state !== 'play') return;
    if (!this.player.hurt(srcPos)) return;
    this.health -= n;
    ui.damageFlash();
    if (msg) ui.toast(`⚠️ ${msg}`, 2.2);
    this.checkKO();
  }

  damageOverTime(amount, msg) {
    if (this.state !== 'play') return;
    this.health -= amount;
    if (Math.random() < 0.06) { ui.damageFlash(); ui.toast(`⚠️ ${msg}`, 1.6); }
    this.checkKO();
  }

  checkKO() {
    if (this.health > 0) return;
    this.health = 100;
    this.timeLeft = Math.max(5, this.timeLeft - 15);
    this.player.respawn();
    ui.announce('💫 KNOCKED OUT! −15 seconds');
  }

  // ---------- boss ----------
  bossCorePulled() {
    if (!this.world.bossHit()) return;
    this.recycledSinceCore = 0;
    const boss = this.world.boss;
    this.score += 500;
    if (boss.state === 'dead') {
      ui.announce(`🎉 ${boss.cfg.name.toUpperCase()} DEFEATED!`);
      this.score += 500 * boss.maxHp;
      setTimeout(() => this.completeLevel(), 1500);
    } else {
      ui.announce(`💥 CORE RIPPED OUT! ${boss.hp} TO GO!`);
    }
  }

  onBossEncounter(name) {
    audio.bossRoar();
    ui.announce(`⚔️ ${name.toUpperCase()}!`);
    ui.toast(`This is <b>${name}</b>! Recycle <b>${this.coreNeed} litter</b> at the ♻ station to STUN it — then <kbd>CLICK</kbd> its glowing green core to grapple it out!`, 6);
  }

  onBossCoreClosed() {
    this.recycledSinceCore = 0;
    ui.toast(`The core re-sealed! Recycle ${this.coreNeed} more pieces to stun the monster again.`, 4);
  }

  // ---------- player event hooks (tutorial flags) ----------
  onJump() {}
  onDoubleJump() { this.flags.doubleJumped = true; }
  onLatch() { this.flags.latched = true; }


  // ---------- completion ----------
  completeLevel() {
    if (this.state !== 'play') return;
    this.state = 'celebrate';
    this.celebrateT = 0;
    this.envTarget = 1;
    this.world.celebrate();
    audio.fanfare();
    audio.setBrightness(1);
    ui.announce('🌈 AREA RESTORED!');
    ui.prompt(null); ui.tutorial(null);
  }

  finishResults() {
    const timeBonus = Math.ceil(Math.max(0, this.timeLeft)) * 5;
    const healthBonus = Math.ceil(this.health) * 2;
    const perfect = (this.animalsRescued >= this.animalsTotal && this.goldenFound) ? 500 : 0;
    this.score += timeBonus + healthBonus + perfect;
    this.totalScore = this.score;
    this.totals.recycled += this.recycled;
    this.totals.animals += this.animalsRescued;
    this.totals.score = this.totalScore;
    this.badges.push(this.cfg.badge.icon);
    // level is beaten — advance the save NOW so quitting from the results
    // screen continues at the NEXT level, not the one just completed
    try {
      if (this.levelIdx + 1 < LEVELS.length) {
        localStorage.setItem('gg-progress', JSON.stringify({
          idx: this.levelIdx + 1, totalScore: this.totalScore, totals: this.totals,
          badges: this.badges, name: this.playerName,
        }));
      } else {
        localStorage.removeItem('gg-progress');
      }
    } catch (e) {}
    const rows = [
      ['🗑 Litter collected', `+${this.levelStats.trashPts.toLocaleString()}`],
      ['♻ Recycling bonus', `+${this.levelStats.recycleBonus.toLocaleString()}`],
      ['🐾 Wildlife rescued', `+${this.levelStats.wildlifePts.toLocaleString()}`],
      ['🔥 Best combo', `×${this.bestCombo >= 10 ? 10 : this.bestCombo >= 6 ? 5 : this.bestCombo >= 3 ? 2 : 1} (${this.bestCombo} chain)`],
      ['🏆 Golden bottle', this.goldenFound ? '+1,000' : '—'],
      ['⏱ Time bonus', `+${timeBonus.toLocaleString()}`],
      ['❤ Health bonus', `+${healthBonus.toLocaleString()}`],
      ...(perfect ? [['✨ Perfect cleanup', `+${perfect}`]] : []),
      ['TOTAL SCORE', this.totalScore.toLocaleString()],
    ];
    ui.results(this.cfg, rows, this.levelIdx === LEVELS.length - 1);
    ui.hudVisible(false);
    document.exitPointerLock();
    this.state = 'results';
  }

  nextLevel() {
    if (this.state !== 'results') return; // double-click guard
    if (this.levelIdx >= LEVELS.length - 1) {
      try { localStorage.removeItem('gg-progress'); } catch (e) {}
      audio.stopMusic();
      audio.fanfare();
      ui.victory(this.playerName, this.totals, this.badges);
      ui.hudVisible(false);
      this.state = 'victory';
      return;
    }
    this.loadLevel(this.levelIdx + 1);
  }

  gameOver() {
    this.state = 'gameover';
    ui.gameover(this.cfg, this.recycled);
    ui.hudVisible(false);
    document.exitPointerLock();
  }

  retry() {
    if (this.state !== 'pause' && this.state !== 'gameover') return;
    this.totalScore = this.scoreAtLevelStart;
    this.loadLevel(this.levelIdx);
  }

  // ---------- tutorial ----------
  tutorialSteps() {
    return [
      { html: 'Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move and the <kbd>Mouse</kbd> to look around', done: () => this.flags.moved > 5 },
      { html: 'Press <kbd>SPACE</kbd> to jump — press it <b>again in mid-air</b> to Double Jump!', done: () => this.flags.doubleJumped },
      { html: 'See the glowing ✨ litter? Walk over it — or aim your crosshair at it and <kbd>CLICK</kbd> to grapple it into your bag!', done: () => this.collected >= 1 },
      { html: 'See the school building? Aim at its <b>wall</b> and <kbd>CLICK</kbd> to latch on and <b>zip up it</b>! Latch again mid-air to climb even higher', done: () => this.flags.latched },
      { html: 'Take your litter to the ♻ <b>RECYCLING STATION</b> (green square on the map, bottom-left) and press <kbd>E</kbd>', done: () => this.flags.recycledOnce },
      { html: 'An animal is trapped in a net! Find the pink dot on the map, walk close and press <kbd>E</kbd> to rescue it', done: () => this.flags.rescuedOnce },
      { html: `Boss time! The <b>Litter Imp</b> (red dot on the map) is guarding the campus. Recycle <b>${this.cfg.boss.coreNeed} litter</b> to STUN it!`, done: () => this.world.boss.coreOpen || this.world.boss.state === 'dead' },
      { html: 'Its glowing <b>green core</b> is exposed! Get close, aim your crosshair at the core and <kbd>CLICK</kbd> to grapple it out! ⚡', done: () => this.world.boss.state === 'dead' },
    ];
  }

  updateTutorial() {
    if (this.tutorialStep < 0) return;
    const steps = this.tutorialSteps();
    while (this.tutorialStep < steps.length && steps[this.tutorialStep].done()) {
      this.tutorialStep++;
      audio.cheer();
    }
    if (this.tutorialStep >= steps.length) { this.tutorialStep = -1; ui.tutorial(null); return; }
    ui.tutorial('📘 ' + steps[this.tutorialStep].html);
  }

  // ---------- main update ----------
  update(dt) {
    if (this.state !== 'play' && this.state !== 'celebrate') return;

    const prevPos = this.player.pos.clone();
    this.player.update(dt, input, this);
    this.flags.moved += prevPos.distanceTo(this.player.pos);
    this.world.update(dt, this, this.player.pos);

    // env health smoothing → live world transformation
    if (this.state === 'play') {
      const boss = this.world.boss;
      this.envTarget = Math.min(1,
        (this.recycled / this.trashTotal) * 0.65 + ((boss.maxHp - boss.hp) / boss.maxHp) * 0.35);
    }
    const rate = this.state === 'celebrate' ? 2.2 : 0.9;
    this.envHealthDisplay += (this.envTarget - this.envHealthDisplay) * Math.min(1, dt * rate);
    if (Math.abs(this.envTarget - this.envHealthDisplay) < 0.002) this.envHealthDisplay = this.envTarget;

    const vision = input.keys.has('KeyV') && this.state === 'play';
    ui.vision(vision);
    this.world.applyEnvHealth(vision ? 1 : this.envHealthDisplay);
    audio.setBrightness(this.envHealthDisplay);

    // milestones
    for (const m of [0.25, 0.5, 0.75]) {
      if (this.envHealthDisplay >= m && !this.milestones.has(m)) {
        this.milestones.add(m);
        this.world.cheerNPCs();
        ui.toast(`💬 "${NPC_CHEERS[Math.floor(Math.random() * NPC_CHEERS.length)]}"`, 3);
      }
    }

    if (this.state === 'celebrate') {
      this.celebrateT += dt;
      if (this.celebrateT % 0.8 < dt) this.world.leafFireworks(this.player.pos);
      if (this.celebrateT > 4.2) this.finishResults();
      input.endFrame();
      ui.updateHUD(this);
      ui.drawMinimap(this.world, this.player, this);
      return;
    }

    // timers
    for (const k of Object.keys(this.power)) this.power[k] = Math.max(0, this.power[k] - dt);
    if (this.power.freeze <= 0) {
      this.timeLeft -= dt;
      const t = Math.ceil(this.timeLeft);
      if (t <= 10 && t >= 0 && t !== this._lastTick) { this._lastTick = t; audio.tick(); }
      if (this.timeLeft <= 0) { this.gameOver(); return; }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; this.multiplier = 1; }
    }

    const p = this.player.pos;

    // walk-over collection
    for (const item of this.world.trash) {
      if (item.collected || item.pulling) continue;
      const gp = item.group.position;
      if (Math.abs(gp.y - p.y) < 2 && Math.hypot(gp.x - p.x, gp.z - p.z) < 1.35) {
        if (this.bagFree()) this.collectTrash(item);
        else this.bagFullNotice();
      }
    }
    // golden walk-over
    if (this.world.golden && !this.world.golden.taken &&
        this.world.golden.group.position.distanceTo(p) < 1.6) this.collectGolden();
    // power-ups
    for (const pu of this.world.powerups) {
      if (pu.taken) continue;
      if (Math.hypot(pu.group.position.x - p.x, pu.group.position.z - p.z) < 1.5 && p.y < pu.group.position.y + 2.4)
        this.takePowerup(pu);
    }

    // interactions + prompt
    let prompt = null;
    const nearStation = Math.hypot(p.x - this.world.stationPos.x, p.z - this.world.stationPos.z) < this.world.stationRadius;
    let nearAnimal = null;
    for (const a of this.world.animals) {
      if (!a.rescued && a.pos.distanceTo(p) < 2.4) { nearAnimal = a; break; }
    }
    if (nearAnimal) prompt = `Press <kbd>E</kbd> to rescue the ${nearAnimal.name}! 🐾`;
    else if (nearStation && this.bag.length > 0) prompt = `Press <kbd>E</kbd> to recycle ${this.bag.length} item${this.bag.length > 1 ? 's' : ''} ♻`;
    else if (this.player.aimHit) {
      const k = this.player.aimHit.kind;
      if (k === 'wall') prompt = `<kbd>CLICK</kbd> to latch on and zip up the wall 🧗`;
      else if (k === 'trash') prompt = `<kbd>CLICK</kbd> to grapple the litter ✨`;
      else if (k === 'core') prompt = `<kbd>CLICK</kbd> to GRAPPLE THE CORE! ⚡`;
      else if (k === 'golden') prompt = `<kbd>CLICK</kbd> to grab the Golden Bottle! 🏆`;
    }
    ui.prompt(prompt);
    ui.crosshair(!!this.player.aimHit && this.player.aimHit.kind !== 'ground');

    if (input.interactPressed) {
      if (nearAnimal) this.rescueAnimal(nearAnimal);
      else if (nearStation && this.bag.length > 0) this.deposit();
    }

    this.updateTutorial();
    this.updateGuide(dt);
    ui.updateHUD(this);
    ui.drawMinimap(this.world, this.player, this);
    input.endFrame();
  }
}

// billboard name tag shown above the character's head
function makeNameTag(name) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = '900 58px "Segoe UI", sans-serif';
  const w = Math.min(490, x.measureText(name).width + 70);
  x.fillStyle = 'rgba(5,20,12,.68)';
  x.beginPath();
  x.roundRect((512 - w) / 2, 24, w, 80, 40);
  x.fill();
  x.strokeStyle = 'rgba(125,255,160,.55)';
  x.lineWidth = 4;
  x.stroke();
  x.fillStyle = '#eafff0';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(name, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.2, 0.55, 1);
  sp.position.set(0, 2.3, 0);
  return sp;
}

const game = new Game();

// ---------------- guide trail: a line of ground arrows to the nearest litter ----------------
const TRAIL_N = 26;
const TRAIL_SPACING = 2.4;
const guideTrail = (() => {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.8, depthWrite: false });
  // flat chevron, tip toward -z after rotateX
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.52);
  shape.lineTo(0.44, -0.3);
  shape.lineTo(0, 0.04);
  shape.lineTo(-0.44, -0.3);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < TRAIL_N; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    g.add(m);
  }
  g.userData.mat = mat;
  scene.add(g);
  return g;
})();

Game.prototype.updateGuide = function (dt) {
  const g = guideTrail;
  if (this.state !== 'play') { for (const m of g.children) m.visible = false; return; }
  if (!this._guide) this._guide = { item: null, dirX: 0, dirZ: -1 };
  const gd = this._guide;
  let target = null, color = 0xffd76a;
  if (!this.bagFree()) {
    target = this.world.stationPos;              // bag full → lead to the station
    color = 0x34c759;
  } else {
    // sticky nearest-litter target: only switch when another piece is CLEARLY
    // closer, so the trail doesn't flicker between two similar candidates
    let cur = gd.item;
    if (cur && (cur.collected || cur.pulling)) cur = null;
    let best = null, bd = Infinity;
    for (const t of this.world.trash) {
      if (t.collected || t.pulling) continue;
      const d = t.group.position.distanceTo(this.player.pos);
      if (d < bd) { bd = d; best = t; }
    }
    if (!cur) cur = best;
    else if (best && best !== cur && bd < cur.group.position.distanceTo(this.player.pos) - 3) cur = best;
    gd.item = cur;
    if (cur) target = cur.group.position;   // litter only — no boss/bottle arrows
  }
  if (!target) { for (const m of g.children) m.visible = false; return; }
  const mat = g.userData.mat;
  mat.color.setHex(color);
  mat.opacity = 0.55 + Math.sin(performance.now() * 0.005) * 0.2;
  const p = this.player.pos;
  const dx = target.x - p.x, dz = target.z - p.z;
  const dist = Math.hypot(dx, dz) || 1;
  // smooth the trail direction so target changes sweep instead of snapping
  const k = 1 - Math.exp(-(dt || 0.016) * 9);
  let ux = gd.dirX + (dx / dist - gd.dirX) * k;
  let uz = gd.dirZ + (dz / dist - gd.dirZ) * k;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul; uz /= ul;
  gd.dirX = ux; gd.dirZ = uz;
  const ang = Math.atan2(-ux, -uz);              // chevron tip faces the target
  const flow = (performance.now() * 0.0035 % 1) * TRAIL_SPACING;   // arrows flow toward it
  let i = 0;
  for (let d = 1.8 + flow; d < dist - 1 && i < TRAIL_N; d += TRAIL_SPACING, i++) {
    const m = g.children[i];
    const x = p.x + ux * d, z = p.z + uz * d;
    const h = this.world.groundHeightAt(x, z, 100);
    m.position.set(x, (this.world.isWater(x, z) ? 0.2 : h + 0.07), z);
    m.rotation.y = ang;
    m.visible = true;
  }
  for (; i < TRAIL_N; i++) g.children[i].visible = false;
};

// ---------------- menu wiring ----------------
const $ = id => document.getElementById(id);

function readProgress() {
  try { return JSON.parse(localStorage.getItem('gg-progress')); } catch (e) { return null; }
}

function refreshStartScreen() {
  const s = readProgress();
  const has = !!(s && s.idx > 0);
  $('playBtn').textContent = has ? `▶ Continue (Level ${s.idx + 1})` : '▶ Play';
  $('newGameBtn').classList.toggle('hidden', !has);
  if (has && s.name && !$('playerName').value) $('playerName').value = s.name;
}

function startGame(fresh) {
  const s = fresh ? null : readProgress();
  game.playerName = $('playerName').value.trim() || (s && s.name) || 'Eco Ranger';
  if (s && s.idx > 0) {
    game.totalScore = s.totalScore || 0;
    game.totals = s.totals || { recycled: 0, animals: 0, score: 0 };
    game.badges = s.badges || [];
  } else {
    game.totalScore = 0;
    game.totals = { recycled: 0, animals: 0, score: 0 };
    game.badges = [];
  }
  audio.ensure();
  $('startScreen').classList.add('fading');
  setTimeout(() => {
    $('startScreen').classList.remove('fading');
    game.loadLevel(s && s.idx > 0 ? s.idx : 0);
  }, 550);
}

$('playBtn').addEventListener('click', () => startGame(false));
$('newGameBtn').addEventListener('click', () => {
  try { localStorage.removeItem('gg-progress'); } catch (e) {}
  refreshStartScreen();
  startGame(true);
});
refreshStartScreen();
$('howtoBtn').addEventListener('click', () => ui.overlay('howto', true));
$('aboutBtn').addEventListener('click', () => ui.overlay('about', true));
$('aboutBack').addEventListener('click', () => ui.overlay('about', false));
$('pauseHowto').addEventListener('click', () => ui.overlay('howto', true));
$('howtoBack').addEventListener('click', () => ui.overlay('howto', false));
$('resMenuBtn').addEventListener('click', () => game.quitToMenu());
$('liStart').addEventListener('click', () => game.begin());
$('resumeBtn').addEventListener('click', () => game.resume());
$('restartBtn').addEventListener('click', () => game.retry());
$('quitBtn').addEventListener('click', () => game.quitToMenu());
$('nextBtn').addEventListener('click', () => game.nextLevel());
$('retryBtn').addEventListener('click', () => game.retry());
$('goQuitBtn').addEventListener('click', () => game.quitToMenu());
$('againBtn').addEventListener('click', () => game.quitToMenu());
$('playerName').addEventListener('keydown', e => e.stopPropagation());

// falling leaves on start screen
{
  const fx = $('startFx');
  const chars = ['🍃', '🌿', '♻️', '🌸', '🍂'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.className = 'fx';
    s.textContent = chars[i % chars.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDuration = `${6 + Math.random() * 9}s`;
    s.style.animationDelay = `${-Math.random() * 12}s`;
    s.style.fontSize = `${16 + Math.random() * 20}px`;
    fx.appendChild(s);
  }
}

// ---------------- loop ----------------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  game.update(dt);
  renderer.render(scene, camera);
}
loop();

// dev/test hook: manual stepping + state inspection (harmless in production)
window.__gg = {
  game, input, scene, camera, renderer,
  step(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) game.update(dt);
    renderer.render(scene, camera);
  },
  shot(w = 640) {
    const c = renderer.domElement;
    const o = document.createElement('canvas');
    o.width = w; o.height = Math.round(w * c.height / c.width);
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return o.toDataURL('image/jpeg', 0.6);
  },
};

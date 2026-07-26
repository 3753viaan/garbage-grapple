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
window.addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) {
    input.mdx += e.movementX; input.mdy += e.movementY;
  }
});
window.addEventListener('contextmenu', e => e.preventDefault());
function lockPointer() {
  try {
    const r = renderer.domElement.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* pointer lock unavailable — game still playable */ }
}
document.addEventListener('pointerlockchange', () => {
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
    if (this.world) this.world.dispose();
    if (this.player) { scene.remove(this.player.model, this.player.rope, this.player.hook); }
    this.world = new World(scene, this.cfg, audio);
    this.player = new Player(scene, camera, this.world, audio);

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
    this.coreNeed = 8;
    this.levelStats = { trashPts: 0, recycleBonus: 0, wildlifePts: 0, goldenPts: 0 };
    this.celebrateT = 0;
    this.flags = { moved: 0, doubleJumped: false, swung: false, recycledOnce: false, rescuedOnce: false };
    this.tutorialStep = this.cfg.tutorial ? 0 : -1;
    this._lastTick = -1;

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
    // level completion (non-boss levels)
    if (!boss && this.recycled >= this.trashTotal) this.completeLevel();
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
      ui.announce('🎉 GARBAGE MONSTER DEFEATED!');
      this.score += 1500;
      setTimeout(() => this.completeLevel(), 1500);
    } else {
      ui.announce(`💥 CORE RIPPED OUT! ${boss.hp} TO GO!`);
    }
  }

  onBossCoreClosed() {
    this.recycledSinceCore = 0;
    ui.toast(`The core re-sealed! Recycle ${this.coreNeed} more pieces to stun the monster again.`, 4);
  }

  // ---------- player event hooks (tutorial flags) ----------
  onJump() {}
  onDoubleJump() { this.flags.doubleJumped = true; }
  onSwingStart() { this.flags.swung = true; }

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
      { html: 'Now try swinging: aim at a green ⭕ <b>Grapple Ring</b> up high, <b>HOLD CLICK</b> to swing, release to fly!', done: () => this.flags.swung },
      { html: 'Take your litter to the ♻ <b>RECYCLING STATION</b> (green square on the map, bottom-left) and press <kbd>E</kbd>', done: () => this.flags.recycledOnce },
      { html: 'An animal is trapped in a net! Find the pink dot on the map, walk close and press <kbd>E</kbd> to rescue it', done: () => this.flags.rescuedOnce },
      { html: 'Recycle <b>ALL the litter</b> before time runs out — watch the campus come back to life! 🌱 (Hold <kbd>V</kbd> to preview the future)', done: () => this.recycled >= this.trashTotal },
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
      this.envTarget = boss
        ? Math.min(1, (this.recycled / this.trashTotal) * 0.65 + ((3 - boss.hp) / 3) * 0.35)
        : this.recycled / this.trashTotal;
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
      if (k === 'ring') prompt = `<kbd>HOLD CLICK</kbd> to swing from the ring ⭕`;
      else if (k === 'trash') prompt = `<kbd>CLICK</kbd> to grapple the litter ✨`;
      else if (k === 'core') prompt = `<kbd>CLICK</kbd> to GRAPPLE THE CORE! ⚡`;
      else if (k === 'golden') prompt = `<kbd>CLICK</kbd> to grab the Golden Bottle! 🏆`;
    }
    ui.prompt(prompt);
    ui.crosshair(!!this.player.aimHit);

    if (input.interactPressed) {
      if (nearAnimal) this.rescueAnimal(nearAnimal);
      else if (nearStation && this.bag.length > 0) this.deposit();
    }

    this.updateTutorial();
    ui.updateHUD(this);
    ui.drawMinimap(this.world, this.player, this);
    input.endFrame();
  }
}

const game = new Game();

// ---------------- menu wiring ----------------
const $ = id => document.getElementById(id);
$('playBtn').addEventListener('click', () => {
  game.playerName = $('playerName').value.trim() || 'Eco Ranger';
  game.totalScore = 0;
  game.totals = { recycled: 0, animals: 0, score: 0 };
  game.badges = [];
  audio.ensure();
  $('startScreen').classList.add('fading');
  setTimeout(() => { $('startScreen').classList.remove('fading'); game.loadLevel(0); }, 550);
});
$('howtoBtn').addEventListener('click', () => { game.howtoReturn = 'start'; ui.show('howto'); });
$('pauseHowto').addEventListener('click', () => { game.howtoReturn = 'pause'; ui.show('howto'); });
$('howtoBack').addEventListener('click', () => ui.show(game.howtoReturn));
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

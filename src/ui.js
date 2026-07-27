// DOM-based HUD and screens.

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      start: $('startScreen'), howto: $('howto'), about: $('about'),
      leaderboard: $('leaderboard'), shop: $('shop'), intro: $('levelIntro'),
      coinsHud: $('coinsHud'),
      hud: $('hud'), pause: $('pauseScreen'), results: $('resultsScreen'),
      gameover: $('gameoverScreen'), victory: $('victoryScreen'),
      objectives: $('objectives'), timer: $('timer'), levelTag: $('levelTag'),
      frozenTag: $('frozenTag'), score: $('score'), combo: $('combo'),
      comboBar: $('comboBar'), healthFill: $('healthFill'), healthTxt: $('healthTxt'),
      bagFill: $('bagFill'), bagTxt: $('bagTxt'), envFill: $('envFill'), envTxt: $('envTxt'),
      minimap: $('minimap'), crosshair: $('crosshair'), prompt: $('prompt'),
      tutorial: $('tutorialCard'), announce: $('announce'), powerupRow: $('powerupRow'),
      damageFlash: $('damageFlash'), visionTint: $('visionTint'),
      liNum: $('liNum'), liName: $('liName'), liSub: $('liSub'), liGoals: $('liGoals'),
      resHead: $('resHead'), resTable: $('resTable'), resBadge: $('resBadge'), resFact: $('resFact'),
      goMsg: $('goMsg'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
  }

  show(name) {
    for (const k of ['start', 'howto', 'about', 'intro', 'pause', 'results', 'gameover', 'victory'])
      this.el[k].classList.add('hidden');
    if (name) this.el[name].classList.remove('hidden');
  }
  hudVisible(v) { this.el.hud.classList.toggle('hidden', !v); }

  // show/hide a card on TOP of whatever is currently visible (menu stays behind)
  overlay(name, on) { this.el[name].classList.toggle('hidden', !on); }

  setLevelIntro(cfg) {
    this.el.liNum.textContent = `MISSION ${cfg.id} OF 5`;
    this.el.liName.textContent = cfg.name;
    this.el.liSub.textContent = cfg.sub;
    const goals = [
      `⚔️ <b>BOSS: Defeat ${cfg.boss.name}</b> — recycle <b>${cfg.boss.coreNeed} litter</b> to stun it, then grapple its glowing core${cfg.boss.hits > 1 ? ` <b>${cfg.boss.hits} times</b>` : ''}!`,
      `🗑 Clean the <b>${cfg.trash} pieces of litter</b> — recycling fuels the boss fight and heals the land`,
    ];
    if (cfg.animals.length) goals.push(`🐾 Rescue <b>${cfg.animals.length} trapped animal${cfg.animals.length > 1 ? 's' : ''}</b>`);
    goals.push(`🏆 Find the hidden <b>Golden Bottle</b> (bonus)`);
    goals.push(`⏱ Time limit: <b>${Math.floor(cfg.time / 60)}:${String(cfg.time % 60).padStart(2, '0')}</b>`);
    this.el.liGoals.innerHTML = goals.join('<br>');
  }

  updateHUD(g) {
    const t = Math.max(0, Math.ceil(g.timeLeft));
    this.el.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.el.timer.classList.toggle('low', t <= 15 && g.power.freeze <= 0);
    this.el.frozenTag.style.display = g.power.freeze > 0 ? 'block' : 'none';
    this.el.levelTag.textContent = `LEVEL ${g.cfg.id} — ${g.cfg.name.split('—')[0].trim().toUpperCase()}`;
    this.el.score.textContent = g.score.toLocaleString();
    // rolling coin counter — ticks up toward the real balance
    const target = g.coins || 0;
    if (this._coinsShown === undefined) this._coinsShown = target;
    if (this._coinsShown !== target) {
      const d = target - this._coinsShown;
      this._coinsShown += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * 0.18));
      if (Math.sign(target - this._coinsShown) !== Math.sign(d)) this._coinsShown = target;
    }
    this.el.coinsHud.textContent = `🪙 ${this._coinsShown}`;

    if (g.combo >= 2) {
      this.el.combo.textContent = `🔥 Combo ×${g.multiplier} (${g.combo})`;
      this.el.comboBar.style.width = `${(g.comboTimer / g.comboWindow) * 100}%`;
    } else {
      this.el.combo.textContent = '';
      this.el.comboBar.style.width = '0%';
    }

    this.el.healthFill.style.width = `${g.health}%`;
    this.el.healthTxt.textContent = Math.ceil(g.health);
    this.el.bagFill.style.width = `${(g.bag.length / g.cfg.bagCap) * 100}%`;
    this.el.bagTxt.textContent = `${g.bag.length} / ${g.cfg.bagCap}`;
    const envPct = Math.round(g.envHealthDisplay * 100);
    this.el.envFill.style.width = `${envPct}%`;
    this.el.envTxt.textContent = `${envPct}%`;

    // objectives
    const lines = [`<span class="obj-title">MISSION</span>`];
    const done = (ok, txt) => `<span class="${ok ? 'done' : ''}">${ok ? '✔' : '○'} ${txt}</span>`;
    lines.push(done(g.recycled >= g.trashTotal, `Litter recycled: ${g.recycled}/${g.trashTotal}`));
    if (g.bag.length > 0) lines.push(`&nbsp;&nbsp;🎒 ${g.bag.length} in bag — take to ♻ station`);
    if (g.animalsTotal > 0) lines.push(done(g.animalsRescued >= g.animalsTotal, `Animals rescued: ${g.animalsRescued}/${g.animalsTotal}`));
    if (g.world.boss) {
      const b = g.world.boss;
      lines.push(done(b.state === 'dead', `${b.cfg.name}: ${'💚'.repeat(b.hp)}${'🖤'.repeat(b.maxHp - b.hp)}`));
      if (b.coreOpen) lines.push(`<span style="color:#7dffa0">⚡ CORE EXPOSED — GRAPPLE IT!</span>`);
      else if (b.state !== 'dead') lines.push(`&nbsp;&nbsp;Recycle ${Math.max(0, g.coreNeed - g.recycledSinceCore)} more to stun it`);
    }
    lines.push(done(g.goldenFound, `Hidden Golden Bottle`));
    this.el.objectives.innerHTML = lines.join('<br>');

    // power-up chips
    const chips = [];
    if (g.power.magnet > 0) chips.push(`🧲 Magnet ${g.power.magnet.toFixed(0)}s`);
    if (g.power.speed > 0) chips.push(`👟 Speed ${g.power.speed.toFixed(0)}s`);
    if (g.power.freeze > 0) chips.push(`❄️ Freeze ${g.power.freeze.toFixed(0)}s`);
    if (g.power.double > 0) chips.push(`⭐ ×2 Score ${g.power.double.toFixed(0)}s`);
    this.el.powerupRow.innerHTML = chips.map(c => `<div class="puChip">${c}</div>`).join('');
  }

  coinGain(amount) {
    // pop the counter and float a "+N" up from it
    const el = this.el.coinsHud;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    const fly = document.createElement('div');
    fly.className = 'coinFly';
    fly.textContent = `+${amount} 🪙`;
    const r = el.getBoundingClientRect();
    fly.style.left = `${r.left - 14}px`;
    fly.style.top = `${r.top + 4}px`;
    document.body.appendChild(fly);
    setTimeout(() => fly.remove(), 1300);
  }

  comboPop() {
    this.el.combo.classList.remove('pop');
    void this.el.combo.offsetWidth;
    this.el.combo.classList.add('pop');
  }

  crosshair(active) { this.el.crosshair.classList.toggle('target', active); }

  prompt(html) {
    if (html) { this.el.prompt.innerHTML = html; this.el.prompt.classList.remove('hidden'); }
    else this.el.prompt.classList.add('hidden');
  }

  tutorial(html) {
    if (html) { this.el.tutorial.innerHTML = html; this.el.tutorial.classList.remove('hidden'); }
    else this.el.tutorial.classList.add('hidden');
  }

  toast(html, secs = 2.6) {
    this.tutorial(html);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.tutorial(null), secs * 1000);
  }

  announce(text) {
    const a = this.el.announce;
    a.textContent = text;
    a.classList.remove('show');
    void a.offsetWidth;
    a.classList.add('show');
  }

  damageFlash() {
    const f = this.el.damageFlash;
    f.style.opacity = 1;
    setTimeout(() => { f.style.opacity = 0; }, 160);
  }

  vision(on) { this.el.visionTint.style.opacity = on ? 1 : 0; }

  results(cfg, rows, isLast) {
    this.el.resHead.textContent = `✅ ${cfg.name.split('—')[0].trim()} Restored!`;
    this.el.resTable.innerHTML = rows.map(([label, val], i) =>
      `<tr${i === rows.length - 1 ? ' class="total"' : ''}><td>${label}</td><td>${val}</td></tr>`).join('');
    this.el.resBadge.innerHTML = `<div class="badgeIcon">${cfg.badge.icon}</div>
      <div><div class="badgeName">Badge earned: ${cfg.badge.name}</div>
      <div class="badgeSub">${cfg.badge.sub}</div></div>`;
    this.el.resFact.textContent = cfg.fact;
    $('nextBtn').textContent = isLast ? 'See Your Certificate 🏆' : 'Next Mission ➜';
    this.show('results');
  }

  gameover(cfg, recycled) {
    this.el.goMsg.textContent =
      `You recycled ${recycled} of ${cfg.trash} pieces of litter in ${cfg.name.split('—')[0].trim()}. The planet needs you — try again!`;
    this.show('gameover');
  }

  victory(name, totals, badges) {
    $('certName').textContent = name || 'Eco Ranger';
    $('certTrash').textContent = totals.recycled;
    $('certAnimals').textContent = totals.animals;
    $('certScore').textContent = totals.score.toLocaleString();
    $('certBadges').textContent = badges.join(' ');
    this.show('victory');
  }

  drawMinimap(world, player, game) {
    const ctx = this.mapCtx, S = 150;
    const B = world.cfg.bounds + 6;
    const sc = S / (B * 2);
    const px = v => S / 2 + v * sc;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,30,18,.85)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(125,255,160,.4)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, world.cfg.bounds * sc, 0, 7); ctx.stroke();
    // station
    ctx.fillStyle = '#34c759';
    ctx.fillRect(px(world.stationPos.x) - 4, px(world.stationPos.z) - 4, 8, 8);
    // trash
    ctx.fillStyle = '#ffd76a';
    for (const t of world.trash) {
      if (t.collected) continue;
      ctx.beginPath(); ctx.arc(px(t.group.position.x), px(t.group.position.z), 2.2, 0, 7); ctx.fill();
    }
    // animals
    ctx.fillStyle = '#ff8ab5';
    for (const a of world.animals) {
      if (a.rescued) continue;
      ctx.beginPath(); ctx.arc(px(a.pos.x), px(a.pos.z), 3, 0, 7); ctx.fill();
    }
    // golden
    if (world.golden && !world.golden.taken && game.envHealthDisplay > 0.4) {
      ctx.fillStyle = '#fff3ae';
      const gp = world.golden.group.position;
      ctx.beginPath(); ctx.arc(px(gp.x), px(gp.z), 2.5, 0, 7); ctx.fill();
    }
    // boss
    if (world.boss && world.boss.state !== 'dead') {
      ctx.fillStyle = '#ff5f57';
      ctx.beginPath(); ctx.arc(px(world.boss.pos.x), px(world.boss.pos.z), 5, 0, 7); ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(px(player.pos.x), px(player.pos.z));
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

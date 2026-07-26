// Fully procedural WebAudio engine — SFX + adaptive music that brightens
// as the environment heals (checklist: "Adaptive Music").

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.melodyGain = null;
    this.filter = null;
    this.musicTimer = null;
    this.step = 0;
    this.brightness = 0;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;
    this.filter.Q.value = 0.6;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.filter);
    this.filter.connect(this.master);

    this.melodyGain = this.ctx.createGain();
    this.melodyGain.gain.value = 0.0;
    this.melodyGain.connect(this.master);
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  tone({ freq = 440, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, slide = 0, delay = 0, dest = null }) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.25, freq = 1200, type = 'bandpass', delay = 0, slide = 0 }) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------- SFX ----------
  jump()        { this.tone({ freq: 300, type: 'square', dur: 0.15, vol: 0.12, slide: 260 }); }
  doubleJump()  { this.tone({ freq: 380, type: 'square', dur: 0.16, vol: 0.12, slide: 380 });
                  this.tone({ freq: 570, type: 'square', dur: 0.12, vol: 0.08, slide: 300, delay: 0.06 }); }
  land()        { this.noise({ dur: 0.08, vol: 0.1, freq: 300, type: 'lowpass' }); }
  grappleShoot(){ this.noise({ dur: 0.25, vol: 0.22, freq: 2500, slide: -1800 }); }
  grappleHit()  { this.tone({ freq: 720, type: 'triangle', dur: 0.1, vol: 0.2 });
                  this.noise({ dur: 0.06, vol: 0.12, freq: 3000 }); }
  release()     { this.noise({ dur: 0.15, vol: 0.1, freq: 1400, slide: 800 }); }
  collect(combo = 0) {
    const base = 520 * Math.pow(1.06, Math.min(combo, 12));
    this.tone({ freq: base, type: 'sine', dur: 0.12, vol: 0.25 });
    this.tone({ freq: base * 1.5, type: 'sine', dur: 0.18, vol: 0.2, delay: 0.06 });
  }
  deposit(i = 0){ this.tone({ freq: 660 + i * 60, type: 'triangle', dur: 0.1, vol: 0.22 });
                  this.tone({ freq: 990 + i * 60, type: 'sine', dur: 0.14, vol: 0.14, delay: 0.05 }); }
  powerup()     { [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.12, delay: i * 0.07 })); }
  rescue()      { [392, 494, 587, 784, 988].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.35, vol: 0.16, delay: i * 0.08 })); }
  damage()      { this.noise({ dur: 0.2, vol: 0.3, freq: 250, type: 'lowpass' });
                  this.tone({ freq: 140, type: 'sawtooth', dur: 0.25, vol: 0.2, slide: -60 }); }
  tick()        { this.tone({ freq: 1000, type: 'sine', dur: 0.05, vol: 0.15 }); }
  cheer()       { [660, 880, 990, 1320].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.1, delay: i * 0.05 })); }
  bossRoar()    { this.tone({ freq: 90, type: 'sawtooth', dur: 0.9, vol: 0.3, slide: -35 });
                  this.noise({ dur: 0.8, vol: 0.2, freq: 220, type: 'lowpass' }); }
  bossHit()     { this.tone({ freq: 160, type: 'square', dur: 0.3, vol: 0.28, slide: -80 });
                  this.tone({ freq: 1200, type: 'sine', dur: 0.2, vol: 0.2, slide: 500 }); }
  bossThrow()   { this.noise({ dur: 0.35, vol: 0.2, freq: 500, slide: 900 }); }
  fanfare() {
    const seq = [[523, 0], [659, 0.14], [784, 0.28], [1047, 0.42], [784, 0.62], [1047, 0.76], [1319, 0.9]];
    seq.forEach(([f, d]) => { this.tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.22, delay: d });
                              this.tone({ freq: f / 2, type: 'sine', dur: 0.4, vol: 0.12, delay: d }); });
  }
  golden()      { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.3, vol: 0.18, delay: i * 0.06 })); }

  // ---------- Adaptive music ----------
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.musicGain.gain.linearRampToValueAtTime(0.5, this.now() + 2);
    const chords = [
      [130.8, 164.8, 196.0], // C
      [110.0, 130.8, 164.8], // Am
      [87.3, 130.8, 174.6],  // F
      [98.0, 146.8, 196.0],  // G
    ];
    const penta = [392, 440, 523, 587, 659, 784, 880];
    const stepDur = 0.42;
    const loop = () => {
      if (!this.ctx) return;
      const bar = Math.floor(this.step / 8) % 4;
      const inBar = this.step % 8;
      if (inBar === 0) {
        chords[bar].forEach(f => this.tone({ freq: f, type: 'sawtooth', dur: stepDur * 8.2, vol: 0.06, attack: 0.4, dest: this.musicGain }));
        this.tone({ freq: chords[bar][0] / 2, type: 'sine', dur: stepDur * 7.5, vol: 0.12, attack: 0.1, dest: this.musicGain });
      }
      // soft pulse
      if (inBar % 2 === 0) this.tone({ freq: chords[bar][0], type: 'triangle', dur: 0.12, vol: 0.05, dest: this.musicGain });
      // melody layer — only audible when the world heals
      if (this.brightness > 0.05 && (inBar === 0 || Math.random() < 0.28 + this.brightness * 0.4)) {
        const n = penta[Math.floor(Math.random() * penta.length)];
        this.tone({ freq: n, type: 'sine', dur: 0.5, vol: 0.1, dest: this.melodyGain });
      }
      this.step++;
    };
    this.musicTimer = setInterval(loop, stepDur * 1000);
    loop();
  }

  setBrightness(h) {
    this.brightness = h;
    if (!this.ctx) return;
    const t = this.now();
    this.filter.frequency.linearRampToValueAtTime(700 + h * 5500, t + 1.2);
    this.melodyGain.gain.linearRampToValueAtTime(h * 0.75, t + 1.2);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.ctx) this.musicGain.gain.linearRampToValueAtTime(0, this.now() + 0.8);
  }
}

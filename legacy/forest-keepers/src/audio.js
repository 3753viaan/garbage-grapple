// Forest Keepers — tiny WebAudio synth for game sounds
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur = 0.15, type = 'sine', vol = 0.18, slideTo = 0, delay = 0) {
  try {
    const c = ac();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  } catch (e) { /* audio unavailable */ }
}
export const sfx = {
  unlock() { ac(); },
  click() { tone(520, 0.06, 'triangle', 0.15); tone(760, 0.09, 'triangle', 0.12, 0, 0.05); },
  pickup() { tone(620, 0.09, 'sine', 0.2, 920); },
  bagFull() { tone(240, 0.18, 'sawtooth', 0.1, 180); },
  coin() { tone(1050, 0.06, 'square', 0.07, 1500); tone(1400, 0.08, 'square', 0.05, 1800, 0.05); },
  deposit() { tone(500, 0.1, 'triangle', 0.16, 700); },
  compact() { tone(140, 0.22, 'sawtooth', 0.12, 90); },
  alert() { tone(900, 0.16, 'sawtooth', 0.1, 500); tone(900, 0.16, 'sawtooth', 0.1, 500, 0.22); },
  whistle() { tone(650, 0.28, 'sine', 0.2, 1250); },
  jail() { tone(320, 0.12, 'square', 0.12, 240); tone(220, 0.16, 'square', 0.1, 170, 0.12); },
  buy() { tone(700, 0.09, 'triangle', 0.16, 1050); tone(1050, 0.14, 'triangle', 0.14, 1400, 0.09); },
  denied() { tone(220, 0.14, 'sawtooth', 0.12, 200); },
  tick() { tone(1000, 0.035, 'square', 0.055); },
  go() { tone(620, 0.14, 'triangle', 0.2, 930); tone(930, 0.2, 'triangle', 0.2, 1240, 0.13); },
  fail() { tone(330, 0.3, 'sawtooth', 0.14, 165); tone(165, 0.5, 'sawtooth', 0.12, 110, 0.28); },
  levelDone() { [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 0, i * 0.11)); },
  chirp() { const f = 1800 + Math.random() * 1400; tone(f, 0.06, 'sine', 0.05, f * 1.3); tone(f * 1.1, 0.05, 'sine', 0.04, f * 1.4, 0.09); },
  tension() { tone(88, 0.18, 'sine', 0.12, 70); },
  streak(n) { tone(700 + n * 90, 0.08, 'square', 0.09, 900 + n * 120); },
  powerup() { tone(880, 0.09, 'triangle', 0.16, 1320); tone(1320, 0.12, 'triangle', 0.14, 1760, 0.08); },
  clockUp() { tone(1200, 0.08, 'sine', 0.14); tone(1500, 0.1, 'sine', 0.12, 0, 0.1); tone(1800, 0.12, 'sine', 0.1, 0, 0.2); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, 0, i * 0.15)); },
};

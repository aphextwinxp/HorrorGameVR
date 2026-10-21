// Процедурный 3D-звук (Web Audio API, HRTF). Внешних аудиофайлов нет — всё синтезируется.

export class AudioSystem {
  constructor(listener) {
    this.listener = listener;
    this.ctx = listener.context;
    this.out = listener.getInput();
    this.noiseBuf = this._noiseBuffer(2);
    this.dripT = 3; this.beatT = 0;
    this.mon = null; this.started = false;
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (!this.started) { this.started = true; this._ambient(); this._monsterLoop(); }
  }

  _noiseBuffer(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _setPos(p, pos) {
    const y = pos.y ?? 0.5;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, y, pos.z);
  }

  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 1; p.rolloffFactor = 1.3; p.maxDistance = 60;
    this._setPos(p, pos);
    p.connect(this.out);
    return p;
  }

  _dest(pos) { return pos ? this._panner(pos) : this.out; }

  _env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  noiseHit(pos, { type = 'bandpass', freq = 800, q = 1, gain = 0.4, dur = 0.15, delay = 0, sweepTo = 0 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); this._env(g, t, 0.004, dur, gain);
    src.connect(f); f.connect(g); g.connect(this._dest(pos));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  tone(pos, { type = 'sine', f0 = 100, f1 = 50, gain = 0.3, dur = 0.2, delay = 0 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = ctx.createGain(); this._env(g, t, 0.005, dur, gain);
    o.connect(g); g.connect(this._dest(pos));
    o.start(t); o.stop(t + dur + 0.05);
  }

  // --- звуки событий ---
  step(pos, vol = 0.3) { this.noiseHit(pos, { type: 'lowpass', freq: 420, gain: vol * 0.9, dur: 0.09 }); }
  monsterStep(pos, vol = 0.5) {
    this.tone(pos, { f0: 70, f1: 35, gain: vol * 0.8, dur: 0.16 });
    this.noiseHit(pos, { type: 'lowpass', freq: 300, gain: vol * 0.6, dur: 0.1 });
  }
  thud(pos, vol = 0.5) {
    this.tone(pos, { f0: 120, f1: 45, gain: vol, dur: 0.15 });
    this.noiseHit(pos, { type: 'lowpass', freq: 500, gain: vol * 0.5, dur: 0.08 });
  }
  clatter(pos, vol = 0.5) {
    for (let i = 0; i < 3; i++)
      this.noiseHit(pos, { type: 'bandpass', freq: 2200 + Math.random() * 1500, q: 8, gain: vol * (1 - i * 0.25), dur: 0.07, delay: i * 0.045 });
    this.tone(pos, { f0: 900, f1: 500, gain: vol * 0.15, dur: 0.12, type: 'triangle' });
  }
  click(pos) { this.noiseHit(pos, { type: 'highpass', freq: 3000, gain: 0.25, dur: 0.02 }); }
  drip(pos) { this.tone(pos, { f0: 1300, f1: 600, gain: 0.06, dur: 0.09 }); }
  creak(pos) {
    const ctx = this.ctx, t = ctx.currentTime, dur = 2.5;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(170, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain(); this._env(g, t, 0.3, dur, 0.25);
    o.connect(f); f.connect(g); g.connect(this._dest(pos)); o.start(t); o.stop(t + dur + 0.2);
  }
  radioBlip() {
    this.noiseHit(null, { type: 'bandpass', freq: 1800, q: 2, gain: 0.12, dur: 0.25 });
    this.tone(null, { type: 'square', f0: 1200, f1: 1200, gain: 0.03, dur: 0.06 });
  }
  // Финал: гул резонатора, нарастающий на seconds секунд
  hum(seconds) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(50, t); o.frequency.linearRampToValueAtTime(110, t + seconds);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 2); g.gain.setValueAtTime(0.18, t + seconds - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 1);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + seconds + 1.1);
  }
  pulse(pos) { this.tone({ x: pos.x, y: pos.y, z: pos.z }, { f0: 240, f1: 110, gain: 0.45, dur: 0.7 }); }
  sleepSound() {
    this.tone(null, { type: 'sawtooth', f0: 120, f1: 30, gain: 0.35, dur: 2.5 });
    this.noiseHit(null, { type: 'lowpass', freq: 300, gain: 0.2, dur: 2.0 });
  }
  scare() { this.tone(null, { type: 'sawtooth', f0: 240, f1: 50, gain: 0.5, dur: 0.9 }); this.noiseHit(null, { type: 'bandpass', freq: 900, gain: 0.4, dur: 0.7 }); }

  // Плёнка: шипение + «плавающий» тон
  tape(seconds) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
    g.gain.setValueAtTime(0.05, t + seconds - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(f); f.connect(g); g.connect(this.out); src.start(t); src.stop(t + seconds + 0.1);
    for (let i = 0; i < seconds * 1.5; i++)
      this.tone(null, { f0: 300 + Math.random() * 200, f1: 250 + Math.random() * 200, gain: 0.015, dur: 0.3, delay: i * 0.65, type: 'triangle' });
  }

  _ambient() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0.06;
    [38, 57.3, 19.1].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const og = ctx.createGain(); og.gain.value = i === 2 ? 0.8 : 0.5;
      o.connect(og); og.connect(g); o.start();
    });
    g.connect(this.out);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(wg.gain);
    n.connect(lp); lp.connect(wg); wg.connect(this.out); n.start(); lfo.start();
  }

  _monsterLoop() {
    const ctx = this.ctx;
    const p = this._panner({ x: 0, y: 1.5, z: 0 });
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
    [41, 43.5, 82].forEach(fr => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(lp); o.start(); });
    lp.connect(g); g.connect(p);
    this.mon = { p, g };
  }

  setMonsterLoop(pos, level) {
    if (!this.mon) return;
    this._setPos(this.mon.p, { x: pos.x, y: 1.5, z: pos.z });
    this.mon.g.gain.setTargetAtTime(level * 0.25, this.ctx.currentTime, 0.3);
  }

  update(dt, threat, head) {
    if (!this.started) return;
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 3 + Math.random() * 6;
      const a = Math.random() * 6.28, r = 5 + Math.random() * 8;
      this.drip({ x: head.x + Math.cos(a) * r, y: 2.5, z: head.z + Math.sin(a) * r });
    }
    if (threat > 0.05) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 1.1 - 0.65 * threat;
        this.tone(null, { f0: 60, f1: 35, gain: 0.2 + 0.45 * threat, dur: 0.14 });
        this.tone(null, { f0: 55, f1: 32, gain: 0.15 + 0.35 * threat, dur: 0.12, delay: 0.18 });
      }
    }
  }
}

// Опциональный микрофон: громкий звук в реальной комнате = шум в игре.

export class Mic {
  constructor(ctx, noise, player) {
    this.ctx = ctx; this.noise = noise; this.player = player;
    this.on = false; this.last = 0;
  }
  async enable() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      const src = this.ctx.createMediaStreamSource(stream);
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 512;
      src.connect(this.an); // в динамики НЕ подключаем
      this.buf = new Float32Array(this.an.fftSize);
      this.on = true;
      return true;
    } catch (e) { console.warn('Микрофон недоступен:', e); return false; }
  }
  update(now) {
    if (!this.on) return;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0; for (const v of this.buf) s += v * v;
    const rms = Math.sqrt(s / this.buf.length);
    if (rms > 0.05 && now - this.last > 0.25) {
      this.last = now;
      this.noise.emit(this.player.headPos, Math.min(1, rms * 5), 'player');
    }
  }
}

// Система шума — сердце игры. Любое действие вызывает emit(); существо подписано на события.

export class NoiseSystem {
  constructor() {
    this.listeners = [];
    this.level = 0;        // сглаженный уровень для индикатора на запястье
    this.recent = 0;
    this.hideFactor = 1;   // <1, когда игрок прячется
  }
  onNoise(fn) { this.listeners.push(fn); }

  // pos: {x,z}, loudness: 0..1, source: 'player' | 'throw' | 'radio' | 'door' ...
  emit(pos, loudness, source = 'misc') {
    if (source === 'player') loudness *= this.hideFactor;
    if (loudness <= 0.01) return;
    if (source === 'player' || source === 'radio') this.recent = Math.max(this.recent, loudness);
    const ev = { pos: { x: pos.x, z: pos.z }, loudness: Math.min(1, loudness), source };
    for (const fn of this.listeners) fn(ev);
  }

  update(dt) {
    this.level = Math.max(this.level - dt * 0.9, this.recent);
    this.recent = 0;
  }
}

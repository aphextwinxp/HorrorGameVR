// Взаимодействие: хват, бросок, фонарик, магнитофон, щиток. Лёгкая собственная физика предметов.
import * as THREE from 'three';
import { CFG } from './config.js';
import { resolveCircle } from './physics.js';

const _p = new THREE.Vector3(), _w = new THREE.Vector3();

export class Interaction {
  constructor({ scene, level, audio, noise, game }) {
    this.scene = scene; this.level = level; this.audio = audio; this.noise = noise; this.game = game;
    this.items = level.items;
    this.flash = level.flash;
    this.flash.battery = CFG.flashlight.battery;
    this.now = 0;
  }

  update(dt, hands, now) {
    this.now = now;
    for (const h of hands) {
      if (h.gripDown && !h.held) { const it = this._nearest(h); if (it) this._grab(h, it); }
      if (h.gripUp && h.held) this._release(h);
      if (h.triggerDown) this._trigger(h);
      h.record(now);
    }
    for (const it of this.items) if (!it.held && !it.inserted && !it.sleep) this._physics(it, dt);

    // батарея фонарика
    const f = this.flash;
    if (f.on) {
      f.battery -= dt;
      if (f.battery <= 0) { f.battery = 0; f.on = false; f.spot.intensity = 0; }
      else f.spot.intensity = CFG.flashlight.intensity * (f.battery < 25 && Math.random() > 0.92 ? 0.15 : 1);
    }
  }

  _nearest(h) {
    h.obj.getWorldPosition(_p);
    let best = null, bd = 1e9;
    for (const it of this.items) {
      if (it.held || it.inserted) continue;
      it.mesh.getWorldPosition(_w);
      const d = _w.distanceTo(_p);
      if (d < h.reach + it.radius && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  _grab(h, it) {
    h.held = it; it.held = h; it.sleep = false; it.vel.set(0, 0, 0);
    h.obj.attach(it.mesh);           // предмет едет вместе с рукой без задержки кадра
    it.mesh.position.set(0, 0, -0.06);
    it.mesh.quaternion.identity();
    this.game.onItemGrabbed(it);
  }

  _release(h) {
    const it = h.held; h.held = null; it.held = null;
    this.scene.attach(it.mesh);
    h.velocity(it.vel);
    h.throwOverride = null;
    if (it.vel.length() > 12) it.vel.setLength(12);
    it.mesh.getWorldPosition(_w);
    for (const sk of this.level.sockets) {
      if (!sk.done && sk.accepts === it.type && _w.distanceTo(sk.pos) < 0.5) { this._insert(it, sk); return; }
    }
    it.sleep = false;
  }

  _insert(it, sk) {
    it.inserted = true; it.sleep = true; sk.done = true;
    it.mesh.position.copy(sk.pos); if (sk.id !== 'plate') it.mesh.position.z += 0.05;
    it.mesh.quaternion.identity();
    sk.slot.material.color.set(0x22cc55);
    this.audio.thud(it.mesh.position, 0.4);
    this.game.onSocket(sk.id);
  }

  _trigger(h) {
    if (h.held && h.held.type === 'flashlight') {
      const f = h.held;
      if (f.battery <= 0) return;
      f.on = !f.on; f.spot.intensity = f.on ? CFG.flashlight.intensity : 0;
      f.mesh.getWorldPosition(_w);
      this.audio.click({ x: _w.x, y: _w.y, z: _w.z });
      this.noise.emit(_w, 0.12, 'player'); // щелчок слышен
      return;
    }
    h.obj.getWorldPosition(_p);
    for (const t of this.level.tapes) {
      if (!t.used && _p.distanceTo(t.pos) < h.reach + 0.25) { this.game.playTape(t); return; }
    }
  }

  _groundY(x, z, bottom) {
    let g = 0;
    for (const s of this.level.surfaces)
      if (x >= s.x1 && x <= s.x2 && z >= s.z1 && z <= s.z2 && bottom >= s.y2 - 0.12) g = Math.max(g, s.y2);
    return g;
  }

  _impact(it, speed) {
    if (this.now - it.lastImpact < 0.12) return;
    const loud = Math.min(1, speed / 7) * it.loud;
    if (loud < 0.05) return;
    it.lastImpact = this.now;
    const pos = it.mesh.position;
    if (it.type === 'can') this.audio.clatter(pos, loud); else this.audio.thud(pos, loud);
    this.noise.emit(pos, loud, 'throw');
  }

  _physics(it, dt) {
    const m = it.mesh, v = it.vel;
    v.y -= 9.8 * dt;
    m.position.addScaledVector(v, dt);
    const gy = this._groundY(m.position.x, m.position.z, m.position.y - it.halfH);
    if (m.position.y - it.halfH <= gy) {
      m.position.y = gy + it.halfH;
      if (v.y < -1.0) this._impact(it, -v.y);
      v.y = -v.y * 0.25;
      if (Math.abs(v.y) < 0.6) v.y = 0;
      v.x *= 1 - Math.min(1, 4 * dt); v.z *= 1 - Math.min(1, 4 * dt);
      if (v.lengthSq() < 0.02) { it.sleep = true; v.set(0, 0, 0); }
    }
    const p = { x: m.position.x, z: m.position.z };
    resolveCircle(p, it.radius, this.level.colliders, m.position.y - it.halfH);
    const dx = p.x - m.position.x, dz = p.z - m.position.z;
    if (dx || dz) {
      const n = Math.hypot(dx, dz), nx = dx / n, nz = dz / n, vn = v.x * nx + v.z * nz;
      if (vn < 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; this._impact(it, -vn); }
      m.position.x = p.x; m.position.z = p.z;
    }
    if (it.type === 'can') m.rotation.x += v.length() * dt * 3;
  }
}

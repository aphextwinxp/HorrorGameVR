// «Слушатель» — слепое существо. Реагирует только на звук.
// FSM: patrol → listen → suspect → search → chase  (+ sleep в финале)
import * as THREE from 'three';
import { CFG } from './config.js';
import { segmentBlocked } from './physics.js';

const M = CFG.monster;

export class Monster {
  constructor({ scene, nav, audio, level, game }) {
    this.nav = nav; this.audio = audio; this.level = level; this.game = game;
    this.wp = level.wpLab;
    this.mesh = this._build(); this.mesh.visible = false; scene.add(this.mesh);
    this.active = false;
    this.x = 0; this.z = 0; this.yaw = 0;
    this.state = 'patrol'; this.stateT = 0; this.t = 0;
    this.path = null; this.pathI = 0; this.repathT = 0;
    this.wpI = 0; this.waitT = 0; this.stepAcc = 0;
    this.heard = { x: 0, z: 0 }; this.heardT = -99; this.searchT = 0;
    this.dist = 99; this.fall = 0;
  }

  _build() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x1b1b1e, emissive: 0x060606 });
    const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); return m; };
    part(new THREE.CylinderGeometry(0.2, 0.28, 1.3, 6), 0, 1.25, 0);
    part(new THREE.SphereGeometry(0.19, 8, 6).scale(0.8, 1.3, 0.8), 0, 2.1, 0);
    this.earL = part(new THREE.ConeGeometry(0.26, 0.5, 6), -0.3, 2.12, 0, 0, Math.PI / 2);
    this.earR = part(new THREE.ConeGeometry(0.26, 0.5, 6), 0.3, 2.12, 0, 0, -Math.PI / 2);
    this.armL = part(new THREE.CylinderGeometry(0.04, 0.03, 1.7, 5), -0.34, 1.1, 0.05, 0, 0.08);
    this.armR = part(new THREE.CylinderGeometry(0.04, 0.03, 1.7, 5), 0.34, 1.1, 0.05, 0, -0.08);
    part(new THREE.CylinderGeometry(0.07, 0.05, 1.0, 5), -0.11, 0.5, 0);
    part(new THREE.CylinderGeometry(0.07, 0.05, 1.0, 5), 0.11, 0.5, 0);
    this.body = g;
    return g;
  }

  get k() { return this.game.lite ? 0.8 : 1; }   // «лёгкий режим»

  setWaypoints(list) { this.wp = list; this.wpI = this.wpI % list.length; }

  spawn(x, z) {
    this.x = x; this.z = z; this.active = true; this.mesh.visible = true;
    this.mesh.rotation.x = 0; this.fall = 0;
    this.wpI = this._nearestWp(x, z);
    this._setState('patrol');
  }
  reset(pt) { const p = pt || this.wp[Math.min(5, this.wp.length - 1)]; this.spawn(p.x, p.z); this.heardT = -99; }

  // Финал: существо засыпает
  sleep() { this.state = 'sleep'; this.path = null; this.fall = 0; }

  _nearestWp(x, z) {
    let best = 0, bd = 1e9;
    this.wp.forEach((w, i) => { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  _setState(s) {
    this.state = s; this.stateT = 0;
    if (s === 'patrol') { this.wpI = (this.wpI + 1) % this.wp.length; this._goTo(this.wp[this.wpI].x, this.wp[this.wpI].z); }
    else if (s === 'listen') { this.waitT = 3 + Math.random() * 2; this.path = null; }
    else if (s === 'suspect') this._goTo(this.heard.x, this.heard.z);
    else if (s === 'search') { this.searchT = 0; this.path = null; this.repathT = 0; }
    else if (s === 'chase') { this.repathT = 0; this.game.onChase?.(); }
  }

  _goTo(x, z) { this.path = this.nav.findPath(this.x, this.z, x, z); this.pathI = 0; }

  _follow(dt, speed) {
    if (!this.path || this.pathI >= this.path.length) return true;
    const p = this.path[this.pathI];
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    const step = speed * this.k * dt;
    if (d <= step) { this.x = p.x; this.z = p.z; this.pathI++; }
    else { this.x += (dx / d) * step; this.z += (dz / d) * step; }
    if (d > 0.001) {
      const ty = Math.atan2(dx, dz); let diff = ty - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 6);
    }
    this.stepAcc += Math.min(step, d);
    if (this.stepAcc > 0.9) {
      this.stepAcc = 0;
      this.audio.monsterStep({ x: this.x, y: 0.1, z: this.z }, this.state === 'chase' ? 0.9 : 0.45);
    }
    return this.pathI >= this.path.length;
  }

  hear(ev) {
    if (!this.active || this.game.busy || this.state === 'sleep') return;
    const d = Math.hypot(ev.pos.x - this.x, ev.pos.z - this.z);
    let radius = ev.loudness * M.hearRadius * (this.state === 'listen' ? 1.5 : 1);
    if (segmentBlocked(ev.pos.x, ev.pos.z, this.x, this.z, this.level.colliders)) radius *= 0.6;
    if (d > radius) return;
    this.heard = { x: ev.pos.x, z: ev.pos.z }; this.heardT = this.t;
    const strength = 1 - d / radius;
    const score = ev.loudness * 0.6 + strength * 0.6;
    if (this.state === 'chase') return;
    if (score > 0.75 || (d < 5 && ev.loudness > 0.3)) this._setState('chase');
    else this._setState('suspect');
  }

  update(dt, pl) {
    if (!this.active) { this.audio.setMonsterLoop({ x: 0, z: 0 }, 0); return; }
    this.t += dt; this.stateT += dt;
    this.dist = Math.hypot(pl.x - this.x, pl.z - this.z);

    if (this.state === 'sleep') {
      this.fall = Math.min(1, this.fall + dt * 0.6);
      this.mesh.rotation.x = -1.35 * this.fall;
      this.mesh.position.set(this.x, 0.35 * this.fall, this.z);
      this.mesh.rotation.y = this.yaw;
      this.audio.setMonsterLoop({ x: this.x, z: this.z }, 0.08);
      return;
    }

    // вплотную учует, даже если игрок молчит (если не прячется и нет стены)
    if (!pl.hidden && this.dist < M.smellDist * (this.game.lite ? 0.7 : 1) && !segmentBlocked(pl.x, pl.z, this.x, this.z, this.level.colliders)) {
      this.heard = { x: pl.x, z: pl.z }; this.heardT = this.t;
      if (this.state !== 'chase') this._setState('chase');
    }

    switch (this.state) {
      case 'patrol':
        if (this._follow(dt, M.patrolSpeed)) this._setState('listen');
        break;
      case 'listen':
        if (this.stateT > this.waitT) this._setState('patrol');
        break;
      case 'suspect':
        if (this._follow(dt, M.suspectSpeed)) this._setState('search');
        break;
      case 'search':
        this.searchT += dt; this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 2;
          this._goTo(this.heard.x + (Math.random() - 0.5) * 6, this.heard.z + (Math.random() - 0.5) * 6);
        }
        this._follow(dt, M.searchSpeed);
        if (this.searchT > 7) this._setState('patrol');
        break;
      case 'chase': {
        this.repathT -= dt;
        if (this.repathT <= 0) { this.repathT = 0.4; this._goTo(this.heard.x, this.heard.z); }
        const done = this._follow(dt, M.chaseSpeed);
        if (this.t - this.heardT > M.loseTime || (done && this.dist > 2)) this._setState('search');
        if (this.dist < M.catchDist) this.game.caught();
        break;
      }
    }

    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
    const sway = Math.sin(this.t * 2) * 0.05;
    this.armL.rotation.z = 0.08 + sway; this.armR.rotation.z = -0.08 - sway;
    const ear = this.state === 'listen' ? 1.35 : 1;
    this.earL.scale.setScalar(ear); this.earR.scale.setScalar(ear);

    const lvl = { patrol: 0.35, listen: 0.15, suspect: 0.5, search: 0.45, chase: 1 }[this.state] ?? 0.3;
    this.audio.setMonsterLoop({ x: this.x, z: this.z }, lvl);
  }

  threat(px, pz) {
    if (!this.active || this.state === 'sleep') return 0;
    const d = Math.hypot(px - this.x, pz - this.z);
    return Math.max(0, 1 - d / 14) * (this.state === 'chase' ? 1 : 0.65);
  }
}

// Диегетический интерфейс: индикатор шума на запястье, субтитры рации, затемнение, центральный текст.
import * as THREE from 'three';

function wrap(ctx, text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export class UI {
  constructor(camera) {
    // панель на запястье
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 256;
    this.cx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, fog: false, depthWrite: false }));
    this.panel.rotation.x = -1.15; this.panel.position.set(0, 0.04, 0.07);

    // центральный текст
    this.cc = document.createElement('canvas'); this.cc.width = 1024; this.cc.height = 256;
    this.ccx = this.cc.getContext('2d');
    this.ctex = new THREE.CanvasTexture(this.cc); this.ctex.colorSpace = THREE.SRGBColorSpace;
    this.center = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshBasicMaterial({ map: this.ctex, transparent: true, depthTest: false, fog: false }));
    this.center.position.set(0, -0.05, -1.4); this.center.renderOrder = 998; this.center.visible = false;
    camera.add(this.center);

    // затемнение
    this.fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, fog: false }));
    this.fadeMesh.position.z = -0.25; this.fadeMesh.renderOrder = 997; this.fadeMesh.visible = false;
    camera.add(this.fadeMesh);

    // виньетка комфорта (затемняет края при движении в VR)
    const vc = document.createElement('canvas'); vc.width = vc.height = 256;
    const vx = vc.getContext('2d');
    const grad = vx.createRadialGradient(128, 128, 60, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.55, 'rgba(0,0,0,0.35)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
    vx.fillStyle = grad; vx.fillRect(0, 0, 256, 256);
    const vtex = new THREE.CanvasTexture(vc); vtex.colorSpace = THREE.SRGBColorSpace;
    this.vig = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: vtex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    this.vig.position.z = -0.3; this.vig.renderOrder = 996; this.vig.visible = false;
    camera.add(this.vig);

    this.hud = document.getElementById('hud');
    this.line = ''; this.lineT = 0; this.objective = '';
    this.fade = 0; this.fadeTarget = 0; this.fadeSpeed = 1;
    this.drawT = 0;
  }

  attachWrist(obj) { obj.add(this.panel); }
  setLine(text, secs = 5) { this.line = text; this.lineT = secs; }
  setObjective(t) { this.objective = t; }
  fadeTo(v, secs) { this.fadeTarget = v; this.fadeSpeed = 1 / Math.max(secs, 0.01); }

  centerText(text) {
    if (!text) { this.center.visible = false; return; }
    const c = this.ccx; c.clearRect(0, 0, 1024, 256);
    c.fillStyle = 'rgba(0,0,0,0.0)'; c.fillRect(0, 0, 1024, 256);
    c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#d33';
    const lines = wrap(c, text, 960);
    lines.forEach((l, i) => c.fillText(l, 512, 110 + i * 72 - (lines.length - 1) * 36));
    this.ctex.needsUpdate = true; this.center.visible = true;
  }

  update(dt, st) {
    const vv = Math.min(1, st.vignette || 0);
    this.vig.material.opacity += (vv - this.vig.material.opacity) * Math.min(1, dt * 8);
    this.vig.visible = this.vig.material.opacity > 0.02;
    if (this.lineT > 0) { this.lineT -= dt; if (this.lineT <= 0) this.line = ''; }
    const d = this.fadeTarget - this.fade;
    this.fade += Math.sign(d) * Math.min(Math.abs(d), this.fadeSpeed * dt);
    this.fadeMesh.material.opacity = this.fade; this.fadeMesh.visible = this.fade > 0.01;

    this.drawT -= dt; if (this.drawT > 0) return;
    this.drawT = 0.1;
    const c = this.cx, W = 512, H = 256;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(5,8,10,0.75)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#345'; c.lineWidth = 4; c.strokeRect(2, 2, W - 4, H - 4);
    c.font = 'bold 26px monospace'; c.fillStyle = '#8ab'; c.fillText('ШУМ', 16, 40);
    c.fillStyle = '#111'; c.fillRect(100, 18, 390, 28);
    const v = Math.min(1, st.vu);
    c.fillStyle = v < 0.3 ? '#3c6' : (v < 0.6 ? '#ec3' : '#e33');
    c.fillRect(102, 20, 386 * v, 24);
    c.font = '22px monospace'; c.fillStyle = '#8ab';
    c.fillText(st.battery == null ? 'ФОНАРЬ: —' : `ФОНАРЬ: ${Math.round(st.battery * 100)}%`, 16, 78);
    c.fillText(`ХОД: ${st.mode}`, 280, 78);
    c.fillStyle = '#cb8'; c.font = '20px sans-serif';
    wrap(c, this.objective ? '▸ ' + this.objective : '', W - 32).forEach((l, i) => c.fillText(l, 16, 112 + i * 24));
    if (this.line) {
      c.fillStyle = '#fff'; c.font = '22px sans-serif';
      wrap(c, this.line, W - 32).slice(0, 4).forEach((l, i) => c.fillText(l, 16, 172 + i * 26));
    }
    this.tex.needsUpdate = true;

    if (st.desktop && this.hud) {
      this.hud.style.display = 'block';
      const bar = '█'.repeat(Math.round(v * 20)).padEnd(20, '░');
      this.hud.textContent = `ШУМ  ${bar}\nФОНАРЬ ${st.battery == null ? '—' : Math.round(st.battery * 100) + '%'}\n▸ ${this.objective}\n${this.line}`;
    } else if (this.hud) this.hud.style.display = 'none';
  }
}

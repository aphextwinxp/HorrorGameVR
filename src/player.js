// Игрок: VR-контроллеры (WebXR) + запасной режим для ПК. Передвижение, поворот, телепорт, шаги = шум.
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { CFG } from './config.js';
import { resolveCircle, segmentBlocked } from './physics.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3();

export class Hand {
  constructor(obj, handed) {
    this.obj = obj; this.handed = handed; this.source = null;
    this.held = null; this.reach = 0.3;
    this.grip = false; this.trigger = false;
    this.gripDown = false; this.gripUp = false; this.triggerDown = false;
    this.hist = []; this.throwOverride = null;
  }
  clearEdges() { this.gripDown = this.gripUp = this.triggerDown = false; }
  record(t) {
    this.obj.getWorldPosition(_v);
    this.hist.push({ t, p: _v.clone() });
    while (this.hist.length > 1 && t - this.hist[0].t > 0.15) this.hist.shift();
  }
  velocity(out) {
    if (this.throwOverride) return out.copy(this.throwOverride);
    if (this.hist.length < 2) return out.set(0, 0, 0);
    const a = this.hist[0], b = this.hist[this.hist.length - 1], dt = b.t - a.t;
    if (dt < 0.02) return out.set(0, 0, 0);
    return out.copy(b.p).sub(a.p).divideScalar(dt);
  }
}

export class Player {
  constructor({ renderer, scene, camera, level, audio, noise }) {
    this.r = renderer; this.cam = camera; this.level = level; this.audio = audio; this.noise = noise;
    this.rig = new THREE.Group(); this.rig.add(camera); scene.add(this.rig);

    this.xr = false; this.smooth = true;
    this.headPos = new THREE.Vector3(); this.forward = new THREE.Vector3(0, 0, -1);
    this.eye = 1.65; this.crouched = false; this.hidden = false;
    this.stride = 0; this.speedNow = 0; this.lastLocal = new THREE.Vector2();
    this.snapReady = true; this.tpActive = false; this.tpValid = false; this.tpPoint = new THREE.Vector3();
    this.prev = { l3: false, x: false, r3: false };
    this.comfort = 0; this.turnPulse = 0;
    this.onConnected = null; this.onToggleMute = null; this.onToggleLite = null;
    this.keys = {}; this.look = { yaw: 0, pitch: 0 }; this.locked = false; this.pend = {};

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.7, fog: false }));
    this.marker.visible = false; scene.add(this.marker);

    this.deskObj = new THREE.Object3D(); this.deskObj.position.set(0.22, -0.2, -0.55); camera.add(this.deskObj);
    this.deskHand = new Hand(this.deskObj, 'desktop'); this.deskHand.reach = 1.1;
    this.xrHands = []; this.hands = [this.deskHand];
    this._initXR(); this._initDesktop();
  }

  _initXR() {
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const ctrl = this.r.xr.getController(i); this.rig.add(ctrl);
      const grip = this.r.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip)); this.rig.add(grip);
      const hand = new Hand(ctrl, 'none'); this.xrHands.push(hand);
      ctrl.addEventListener('connected', (e) => { hand.handed = e.data.handedness; hand.source = e.data; this.onConnected?.(hand); });
      ctrl.addEventListener('disconnected', () => { hand.source = null; });
    }
  }

  _initDesktop() {
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (!this.locked) return;
      if (e.code === 'KeyE') this.pend.grip = true;
      if (e.code === 'KeyF') this.pend.trig = true;
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.yaw -= e.movementX * 0.0022;
      this.look.pitch = Math.max(-1.5, Math.min(1.5, this.look.pitch - e.movementY * 0.0022));
    });
    addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.pend.throw = true; });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.r.domElement; });
  }
  requestLock() { this.r.domElement.requestPointerLock?.(); }

  feet() { return { x: this.headPos.x, y: 0, z: this.headPos.z }; }

  setPosition(x, z, yaw) {
    if (this.xr) this.rig.rotation.y = yaw; else this.look.yaw = yaw;
    this.rig.updateMatrixWorld(true);
    this.cam.getWorldPosition(_v);
    const hasPose = this.xr && this.cam.position.lengthSq() > 0.01;
    if (this.xr && !hasPose) this.rig.position.set(x, 0, z);
    else { this.rig.position.x += x - _v.x; this.rig.position.z += z - _v.z; }
  }

  _applyMove(dx, dz) {
    const p = { x: this.headPos.x + dx, z: this.headPos.z + dz };
    resolveCircle(p, CFG.player.radius, this.level.colliders, 0);
    const ax = p.x - this.headPos.x, az = p.z - this.headPos.z;
    this.rig.position.x += ax; this.rig.position.z += az;
    this.headPos.x += ax; this.headPos.z += az;
    return Math.hypot(dx, dz);
  }

  _rotateAroundHead(angle) {
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.rig.quaternion.premultiply(_q);
    _v.copy(this.rig.position).sub(this.headPos).applyQuaternion(_q);
    this.rig.position.copy(this.headPos).add(_v);
    this.rig.position.y = 0;
  }

  _readXR() {
    const out = { mx: 0, my: 0, turn: 0, tpY: 0, sneakKey: false };
    for (const h of this.hands) {
      const gp = h.source?.gamepad; if (!gp) continue;
      const ax = gp.axes, b = gp.buttons;
      const sx = ax.length >= 4 ? ax[2] : ax[0], sy = ax.length >= 4 ? ax[3] : ax[1];
      const trig = !!b[0]?.pressed, sq = !!b[1]?.pressed;
      h.triggerDown = trig && !h.trigger; h.gripDown = sq && !h.grip; h.gripUp = !sq && h.grip;
      h.trigger = trig; h.grip = sq;
      if (h.handed === 'left') {
        out.mx = sx; out.my = sy;
        const l3 = !!b[3]?.pressed, x = !!b[4]?.pressed;
        if (l3 && !this.prev.l3) this.smooth = !this.smooth;
        if (x && !this.prev.x) this.onToggleMute?.();
        this.prev.l3 = l3; this.prev.x = x;
      } else if (h.handed === 'right') {
        out.turn = sx; out.tpY = sy;
        const r3 = !!b[3]?.pressed;
        if (r3 && !this.prev.r3) this.onToggleLite?.();
        this.prev.r3 = r3;
      }
    }
    return out;
  }

  _readDesktop() {
    const k = this.keys, dh = this.deskHand;
    if (this.pend.grip) { if (dh.held) dh.gripUp = true; else dh.gripDown = true; }
    if (this.pend.throw && dh.held) {
      dh.throwOverride = this.forward.clone().multiplyScalar(6).add(new THREE.Vector3(0, 1.2, 0));
      dh.gripUp = true;
    }
    if (this.pend.trig) dh.triggerDown = true;
    this.pend = {};
    return {
      mx: (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), my: (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0),
      turn: 0, tpY: 0, sneakKey: !!k.ShiftLeft
    };
  }

  update(dt) {
    for (const h of this.xrHands) h.clearEdges(); this.deskHand.clearEdges();
    this.xr = this.r.xr.isPresenting;
    this.hands = this.xr ? this.xrHands : [this.deskHand];
    const cam = this.cam;

    if (!this.xr) {
      cam.rotation.order = 'YXZ'; cam.rotation.set(this.look.pitch, this.look.yaw, 0);
      const target = (this.keys.ControlLeft || this.keys.KeyC) ? 1.0 : 1.65;
      this.eye += (target - this.eye) * Math.min(1, dt * 8);
      cam.position.set(0, this.eye, 0);
    }
    cam.getWorldPosition(this.headPos);
    cam.getWorldQuaternion(_q);
    this.forward.set(0, 0, -1).applyQuaternion(_q);
    const localY = this.xr ? (cam.position.y > 0.2 ? cam.position.y : 1.6) : cam.position.y;
    this.crouched = localY < CFG.player.crouchEye;

    const inp = this.xr ? this._readXR() : this._readDesktop();

    // --- плавное перемещение ---
    let moved = 0;
    const mag = Math.hypot(inp.mx, inp.my);
    if (mag > 0.15) {
      const k = Math.min(1, (mag - 0.15) / 0.85);
      let speed = (k < 0.55 || inp.sneakKey) ? CFG.player.sneak : CFG.player.walk;
      if (this.crouched) speed *= 0.6;
      _f.copy(this.forward); _f.y = 0;
      if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1);
      _f.normalize(); _v2.set(-_f.z, 0, _f.x);
      const dir = new THREE.Vector3().addScaledVector(_f, -inp.my).addScaledVector(_v2, inp.mx);
      if (dir.length() > 1) dir.normalize();
      const canWalk = !this.xr || this.smooth;
      if (canWalk) moved += this._applyMove(dir.x * speed * dt, dir.z * speed * dt);
    }

    // --- поворот (snap) ---
    if (this.xr) {
      if (Math.abs(inp.turn) > 0.7 && this.snapReady) { this._rotateAroundHead(-Math.sign(inp.turn) * CFG.player.snapAngle); this.snapReady = false; this.turnPulse = 0.6; }
      else if (Math.abs(inp.turn) < 0.3) this.snapReady = true;
    }

    // --- телепорт ---
    if (this.xr && !this.smooth) this._teleport(inp.tpY);
    else { this.marker.visible = false; this.tpActive = false; }

    // физическая ходьба по комнате
    let phys = 0;
    if (this.xr) {
      phys = Math.hypot(cam.position.x - this.lastLocal.x, cam.position.z - this.lastLocal.y);
      if (phys > 0.5) phys = 0; // скачок (старт сессии)
      this.lastLocal.set(cam.position.x, cam.position.z);
    }
    this._applyMove(0, 0); // выталкивание из стен при ходьбе по комнате

    // --- шаги = шум ---
    const total = moved + phys;
    this.speedNow += ((total / Math.max(dt, 1e-3)) - this.speedNow) * Math.min(1, dt * 6);
    this.stride += total;
    if (this.stride > CFG.player.stepLen) {
      this.stride = 0;
      let loud = this.speedNow < 0.9 ? 0.06 : (this.speedNow < 1.4 ? 0.18 : 0.32);
      if (this.crouched) loud *= 0.5;
      this.noise.emit(this.headPos, loud, 'player');
      this.audio.step(this.feet(), loud * 0.5);
    }

    // --- комфорт: чем быстрее идёшь/поворачиваешь, тем темнее края (виньетка) ---
    this.turnPulse = Math.max(0, this.turnPulse - dt * 2);
    this.comfort = this.xr ? Math.max(this.turnPulse, Math.min(1, this.speedNow / CFG.player.walk) * 0.7) : 0;

    // --- укрытие ---
    const hz = this.level.hideZones.some(z => this.headPos.x >= z.x1 && this.headPos.x <= z.x2 && this.headPos.z >= z.z1 && this.headPos.z <= z.z2);
    this.hidden = hz && this.crouched;
    this.noise.hideFactor = this.hidden ? 0.4 : 1;
  }

  _teleport(stickY) {
    const R = this.hands.find(h => h.handed === 'right');
    if (!R) return;
    if (stickY < -0.6) {
      this.tpActive = true;
      R.obj.getWorldPosition(_v); R.obj.getWorldQuaternion(_q);
      const dir = _v2.set(0, 0, -1).applyQuaternion(_q);
      this.tpValid = false;
      if (dir.y < -0.05) {
        const t = -_v.y / dir.y;
        if (t < 9) {
          this.tpPoint.copy(_v).addScaledVector(dir, t); this.tpPoint.y = 0.02;
          const p = { x: this.tpPoint.x, z: this.tpPoint.z };
          resolveCircle(p, 0.35, this.level.colliders, 0);
          this.tpValid = Math.hypot(p.x - this.tpPoint.x, p.z - this.tpPoint.z) < 0.05
            && this.level.inRooms(p.x, p.z)
            && !segmentBlocked(this.headPos.x, this.headPos.z, p.x, p.z, this.level.colliders);
        }
      }
      this.marker.visible = this.tpValid;
      if (this.tpValid) {
        this.marker.position.copy(this.tpPoint);
        this.marker.material.color.set(0x66ccff);
      }
    } else if (this.tpActive && stickY > -0.25) {
      this.tpActive = false; this.marker.visible = false;
      if (this.tpValid) {
        this.rig.position.x += this.tpPoint.x - this.headPos.x;
        this.rig.position.z += this.tpPoint.z - this.headPos.z;
        this.headPos.x = this.tpPoint.x; this.headPos.z = this.tpPoint.z;
        this.noise.emit(this.headPos, 0.05, 'player');
      }
    }
  }
}

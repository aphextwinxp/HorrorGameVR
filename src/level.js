// Уровень v0.2: A (кабинет) → коридор → B (лаборатория) → шлюз → C (жилой блок) → D (серверная) → E (камера резонанса).
// Всё из примитивов + процедурные текстуры. Позже заменить на glTF с запечённым светом.
import * as THREE from 'three';

function concrete(r, g, b, spread) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 128, 128);
  const img = x.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 14; i++) {
    x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
    x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 8 + Math.random() * 24, 0, 6.28); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function tileUV(geo, w, h, d, s = 2) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    let su, sv;
    if (face < 2) { su = d / s; sv = h / s; }
    else if (face < 4) { su = w / s; sv = d / s; }
    else { su = w / s; sv = h / s; }
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
}

export function buildLevel(scene) {
  const L = { colliders: [], surfaces: [], hideZones: [], rooms: [], items: [], tapes: [], sockets: [], doors: {}, time: 0, onDoorOpen: null };

  const wallMat = new THREE.MeshLambertMaterial({ map: concrete(100, 104, 106, 40) });
  const floorTex = concrete(70, 72, 72, 30); floorTex.repeat.set(20, 45);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0x2a2c2e });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x4a3524 });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x3b4044 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x15171a });
  const bedMat = new THREE.MeshLambertMaterial({ color: 0x3a4a3a });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x33ff66 });

  const addBox = (x1, y1, z1, x2, y2, z2, mat, opt = {}) => {
    const w = x2 - x1, h = y2 - y1, d = z2 - z1;
    const g = new THREE.BoxGeometry(w, h, d); tileUV(g, w, h, d);
    const m = new THREE.Mesh(g, mat);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    scene.add(m);
    let col = null;
    if (opt.collide) {
      col = { x1, z1, x2, z2, y2, name: opt.name || '' };
      L.colliders.push(col);
      if (opt.surface) L.surfaces.push(col);
    }
    return { mesh: m, col };
  };
  const wall = (x1, z1, x2, z2) => {
    const t = 0.1;
    if (z1 === z2) addBox(Math.min(x1, x2) - t, 0, z1 - t, Math.max(x1, x2) + t, 3, z1 + t, wallMat, { collide: true });
    else addBox(x1 - t, 0, Math.min(z1, z2) - t, x1 + t, 3, Math.max(z1, z2) + t, wallMat, { collide: true });
  };
  const prop = (x1, y2, z1, x2, z2, mat, surface = false, h0 = 0) => addBox(x1, h0, z1, x2, y2, z2, mat, { collide: true, surface });

  // --- свет: 6 физических ламп-«слотов» всегда в сцене, их назначают на ближайшие точки (число ламп не меняется → нет перекомпиляции шейдеров)
  const SLOTS = 6, cand = [], slots = [], slotC = new Array(SLOTS).fill(null);
  for (let i = 0; i < SLOTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 14, 1.8); l.position.set(0, -50, 0); scene.add(l); slots.push(l);
  }
  const light = (x, z, color, intensity, dist, flick = false) => {
    cand.push({ x, y: 2.9, z, color: new THREE.Color(color), intensity, distance: dist, flick, slot: -1, d: 0 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.15), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, 2.95, z); scene.add(m);
  };
  L.assignLights = (hx, hz) => {
    cand.forEach(c => { c.d = Math.hypot(c.x - hx, c.z - hz); });
    const top = [...cand].sort((a, b) => a.d - b.d).slice(0, SLOTS);
    const keep = new Set(top);
    for (let i = 0; i < SLOTS; i++) if (slotC[i] && !keep.has(slotC[i])) { slotC[i].slot = -1; slotC[i] = null; slots[i].intensity = 0; }
    for (const c of top) {
      if (c.slot >= 0) continue;
      const i = slotC.indexOf(null);
      slotC[i] = c; c.slot = i;
      const l = slots[i]; l.position.set(c.x, c.y, c.z); l.color.copy(c.color); l.distance = c.distance;
    }
  };

  // --- пол и потолок ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 90).rotateX(-Math.PI / 2), floorMat);
  floor.position.set(0, 0, -25); scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 90).rotateX(Math.PI / 2), ceilMat);
  ceil.position.set(0, 3, -25); scene.add(ceil);
  scene.add(new THREE.HemisphereLight(0x334466, 0x080808, 0.6));

  // --- комнаты (для проверки телепорта) ---
  L.rooms = [
    { x1: -4, x2: 4, z1: 0, z2: 8 },        // A
    { x1: -1, x2: 1, z1: -6, z2: 0 },       // коридор
    { x1: -8, x2: 8, z1: -16, z2: -6 },     // B лаборатория
    { x1: -3, x2: 3, z1: -24, z2: -16 },    // шлюз с лифтом
    { x1: -8, x2: 8, z1: -34, z2: -24 },    // C жилой блок
    { x1: -8, x2: 8, z1: -46, z2: -34 },    // D серверная
    { x1: -4, x2: 4, z1: -58, z2: -46 }     // E камера резонанса
  ];
  L.inRooms = (x, z) => L.rooms.some(r => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2);

  // ================= СТЕНЫ =================
  // A
  wall(-4, 8, 4, 8); wall(-4, 0, -4, 8); wall(4, 0, 4, 8); wall(-4, 0, -1, 0); wall(1, 0, 4, 0);
  // коридор
  wall(-1, -6, -1, 0); wall(1, -6, 1, 0);
  // B
  wall(-8, -6, -1, -6); wall(1, -6, 8, -6); wall(-8, -16, -8, -6); wall(8, -16, 8, -6);
  wall(-8, -16, -1, -16); wall(1, -16, 8, -16);
  // шлюз
  wall(-3, -24, -3, -16); wall(3, -24, 3, -16);
  // C
  wall(-8, -24, -1, -24); wall(1, -24, 8, -24);
  wall(-8, -34, -8, -24); wall(8, -34, 8, -24);
  wall(-8, -34, -1, -34); wall(1, -34, 8, -34);
  wall(-4, -34, -4, -31); wall(-4, -29, -4, -26); wall(4, -34, 4, -31); wall(4, -29, 4, -26);
  wall(-8, -26, -4, -26); wall(4, -26, 8, -26);
  // D
  wall(-8, -46, -8, -34); wall(8, -46, 8, -34);
  wall(-8, -46, -1, -46); wall(1, -46, 8, -46);
  // E
  wall(-4, -58, -4, -46); wall(4, -58, 4, -46); wall(-4, -58, 4, -58);

  // ================= ЗОНА A =================
  addBox(-3.6, 0.85, 0.8, -1.8, 0.9, 1.6, woodMat);
  [-3.55, -1.85].forEach(x => [0.85, 1.55].forEach(z => addBox(x - 0.03, 0, z - 0.03, x + 0.03, 0.85, z + 0.03, woodMat)));
  const desk = { x1: -3.6, z1: 0.8, x2: -1.8, z2: 1.6, y2: 0.9, name: 'desk' };
  L.colliders.push(desk); L.surfaces.push(desk);
  prop(2.8, 2.0, 6.8, 3.9, 7.9, metalMat);

  // ================= ЗОНА B =================
  const shelf = (x1, z1, x2, z2) => prop(x1, 2.0, z1, x2, z2, metalMat);
  shelf(-6, -9.3, -3, -8.7); shelf(3, -9.3, 6, -8.7); shelf(-6, -13.3, -3, -12.7); shelf(3, -13.3, 6, -12.7);
  prop(-1, 0.9, -11.5, 1, -10.5, woodMat, true);
  prop(6.1, 0.6, -15.0, 6.9, -14.2, woodMat, true);

  // ================= ШЛЮЗ + лифт (скрытая концовка «Запись») =================
  addBox(-2.88, 0, -21, -2.78, 2.5, -19, metalMat);
  const elamp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0x44ff88 }));
  elamp.position.set(-2.76, 2.7, -20); scene.add(elamp);
  L.elevatorZone = { x1: -2.8, x2: -1.6, z1: -21.2, z2: -18.8 };

  // ================= ЗОНА C: жилой блок =================
  const bed = (x1, z1, x2, z2) => prop(x1, 0.6, z1, x2, z2, bedMat, true);
  bed(-7.8, -33.5, -6.2, -31.5); bed(-7.8, -31.0, -6.2, -29.5);       // западная комната
  prop(-7.8, 2.0, -28.5, -7.0, -27.5, metalMat);                        // шкафчик
  prop(-6, 0.8, -33.6, -5, -32.8, woodMat, true);                       // столик с плёнкой №2
  bed(6.2, -33.5, 7.8, -31.5); bed(6.2, -31.0, 7.8, -29.5);            // восточная комната (ключ-карта)
  prop(-1, 1.0, -29.5, 1, -28.5, woodMat, true);                        // стол в холле

  // ================= ЗОНА D: серверная (змейка из стоек) =================
  const rack = (x1, z1, x2, z2) => {
    prop(x1, 2.2, z1, x2, z2, darkMat);
    for (let x = x1 + 0.4; x < x2 - 0.2; x += 0.9) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), ledMat); led.position.set(x, 1.4 + Math.sin(x) * 0.3, z2 + 0.011); scene.add(led); }
  };
  rack(-7, -37.3, -2, -36.7); rack(2, -40.3, 7, -39.7); rack(-7, -43.3, -2, -42.7);
  prop(6.1, 0.6, -44.9, 6.9, -44.1, woodMat, true);                     // ящик с пластиной данных
  prop(-7.8, 0.8, -45.8, -6.8, -44.6, woodMat, true);                   // стол с плёнкой №3

  // ================= ЗОНА E: камера резонанса =================
  prop(-3.0, 3, -52.3, -2.4, -51.7, metalMat);                          // колонны (укрытия)
  prop(2.4, 3, -52.3, 3.0, -51.7, metalMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8844ff, fog: false }));
  ring.position.set(0, 0.06, -52); scene.add(ring);
  prop(-1, 1.1, -57.5, 1, -57.0, darkMat);                              // консоль
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshBasicMaterial({ color: 0x220044 }));
  screen.position.set(0, 1.9, -57.85); scene.add(screen);
  L.console = { pos: new THREE.Vector3(0, 1.15, -57.1), screen };

  // ================= ДВЕРИ =================
  const makeDoor = (name, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2.9, 0.2), metalMat);
    mesh.position.set(0, 1.45, z); scene.add(mesh);
    const col = { x1: -1, z1: z - 0.1, x2: 1, z2: z + 0.1, y2: 3, name };
    L.colliders.push(col);
    L.doors[name] = { mesh, col, opening: false, t: 0 };
  };
  makeDoor('d2', -16); makeDoor('d3', -34);
  L.openDoor = (name, audio) => {
    const d = L.doors[name]; if (!d || d.opening) return;
    d.opening = true; d.col.disabled = true;
    audio?.creak({ x: 0, y: 1.5, z: d.mesh.position.z });
    L.onDoorOpen?.();
  };

  // ================= РОЗЕТКИ (предохранитель, ключ-карта, пластина) =================
  const socket = (id, accepts, pos, w, h, nz) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), metalMat);
    panel.position.copy(pos); panel.position.z += nz; scene.add(panel);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xaa2200 }));
    slot.position.copy(pos); slot.position.z += nz * 0.2; scene.add(slot);
    L.sockets.push({ id, accepts, pos, slot, done: false });
  };
  socket('fuse', 'fuse', new THREE.Vector3(-4, 1.4, -15.75), 0.5, 0.6, -0.12);
  socket('keycard', 'keycard', new THREE.Vector3(-2, 1.4, -33.75), 0.3, 0.4, -0.12);
  const ps = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.1), new THREE.MeshBasicMaterial({ color: 0xaa2200 }));
  ps.position.copy(L.console.pos); scene.add(ps);
  L.sockets.push({ id: 'plate', accepts: 'plate', pos: L.console.pos, slot: ps, done: false });

  // ================= ПЛЁНКИ =================
  const makeTape = (id, x, y, z, dur, lines) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.2), darkMat));
    const reelMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const reels = [-0.07, 0.07].map(dx => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), reelMat); r.position.set(dx, 0.05, 0); g.add(r); return r; });
    scene.add(g);
    L.tapes.push({ id, pos: new THREE.Vector3(x, y + 0.03, z), reels, dur, lines, playing: false, used: false });
  };
  makeTape(1, -2.3, 0.92, 1.2, 8, [
    [1, 'ЗАПИСЬ 14: «…оно реагирует на звук.»'],
    [4.2, 'ЗАПИСЬ 14: «Не шумите. Оно слышит… даже…»']]);
  makeTape(2, -5.5, 0.83, -33.2, 9, [
    [1, 'ЗАПИСЬ 22: «Руководитель проекта М. Орлова запустила резонатор без разрешения.»'],
    [5, 'ЗАПИСЬ 22: «Она знала, что оно проснётся. Она хотела услышать его голос.»']]);
  makeTape(3, -7.3, 0.83, -45.2, 9, [
    [1, 'ЗАПИСЬ 31: «Частота семнадцать герц усыпляет Слушателя…»'],
    [5, 'ЗАПИСЬ 31: «…но только в полной тишине. Любой звук разрушит резонанс.»']]);

  // ================= ПРЕДМЕТЫ =================
  const addItem = (props) => { const it = { vel: new THREE.Vector3(), sleep: true, held: null, lastImpact: 0, inserted: false, ...props }; L.items.push(it); return it; };
  const canMat = new THREE.MeshLambertMaterial({ color: 0x7a4a2a });
  const can = (x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10), canMat);
    m.position.set(x, y, z); scene.add(m);
    addItem({ type: 'can', mesh: m, halfH: 0.06, radius: 0.05, loud: 1.0 });
  };
  [[2, 6], [3, 3], [-2, 5], [-7, -7], [7, -7], [0, -26.5], [-1.5, -38], [7, -41], [-2, -44.5], [-3, -48], [2, -50]]
    .forEach(([x, z]) => can(x, 0.06, z));
  can(0, 0.96, -11); can(0, 1.06, -29);

  // фонарик
  const fg = new THREE.Group();
  fg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.18, 10).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x222222 })));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.02, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x888866 }));
  lens.position.z = -0.095; fg.add(lens);
  const spot = new THREE.SpotLight(0xfff2cc, 0, 16, 0.45, 0.5, 1.5);
  spot.position.set(0, 0, -0.1); spot.target.position.set(0, 0, -3);
  fg.add(spot, spot.target);
  fg.position.set(-2.9, 0.935, 1.2); fg.rotation.y = 0.4; scene.add(fg);
  L.flash = addItem({ type: 'flashlight', mesh: fg, halfH: 0.04, radius: 0.06, loud: 0.5, spot, on: false });

  const boxItem = (type, color, emissive, sx, sy, sz, x, y, z, loud) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color, emissive }));
    m.position.set(x, y, z); scene.add(m);
    return addItem({ type, mesh: m, halfH: sy / 2, radius: 0.07, loud });
  };
  L.fuse = boxItem('fuse', 0xff8800, 0x331500, 0.12, 0.05, 0.05, 6.5, 0.625, -14.6, 0.4);
  L.keycard = boxItem('keycard', 0x2255cc, 0x001133, 0.09, 0.012, 0.06, 7.0, 0.606, -32.5, 0.2);
  L.plate = boxItem('plate', 0x22ccaa, 0x053322, 0.1, 0.014, 0.07, 6.5, 0.607, -44.5, 0.3);

  // ================= УКРЫТИЯ (присел + внутри = шум ×0.4) =================
  L.hideZones = [
    { x1: -6, x2: -3, z1: -8.7, z2: -7.7 }, { x1: 3, x2: 6, z1: -12.6, z2: -11.6 }, { x1: -6, x2: -3, z1: -14.2, z2: -13.4 },
    { x1: -3.6, x2: -1.8, z1: 1.6, z2: 2.4 },
    { x1: -7.8, x2: -4.2, z1: -25.8, z2: -24.2 }, { x1: 4.2, x2: 7.8, z1: -25.8, z2: -24.2 },
    { x1: -7.8, x2: -5, z1: -27.4, z2: -26.2 },
    { x1: -7, x2: -2, z1: -36.6, z2: -35.6 }, { x1: 2, x2: 7, z1: -39.6, z2: -38.6 }, { x1: -7, x2: -2, z1: -42.6, z2: -41.6 },
    { x1: -3.5, x2: -2.0, z1: -51.6, z2: -50.4 }, { x1: 2.0, x2: 3.5, z1: -51.6, z2: -50.4 }
  ];

  // ================= СВЕТ =================
  light(0, 4, 0xffcc88, 18, 14);
  light(0, -3, 0xddeeff, 6, 8, true);
  light(-6, -10, 0xff2200, 10, 12); light(6, -10, 0xff2200, 10, 12); light(0, -14, 0xff2200, 10, 12);
  light(0, -20, 0x44ff88, 6, 9);
  light(-6, -30, 0xffaa55, 8, 10); light(6, -30, 0xffaa55, 8, 10); light(0, -29, 0xaabbff, 6, 10, true);
  light(-5, -38, 0xff2200, 9, 12); light(5, -41, 0xff2200, 9, 12); light(0, -44, 0xff2200, 9, 12);
  light(0, -52, 0x8844ff, 12, 12);
  L.assignLights(0, 6.5);

  // ================= ТОЧКИ ПАТРУЛЯ ПО ЗОНАМ =================
  L.wpLab = [
    { x: -6.5, z: -7.2 }, { x: 0, z: -7.2 }, { x: 6.5, z: -7.2 },
    { x: 6.5, z: -10.8 }, { x: 0, z: -14.5 }, { x: -6.5, z: -14.5 }, { x: -6.5, z: -10.8 }
  ];
  L.wpSluice = [{ x: 0, z: -20 }];
  L.wpC = [{ x: 0, z: -26.5 }, { x: -5.2, z: -30 }, { x: 0, z: -32 }, { x: 5.2, z: -30 }];
  L.wpD = [{ x: 3, z: -36 }, { x: -3, z: -38.5 }, { x: 4, z: -41.5 }, { x: -4, z: -44.5 }];
  L.waypoints = L.wpLab;

  // ================= ОБНОВЛЕНИЕ =================
  let lightT = 0;
  L.update = (dt, head) => {
    L.time += dt;
    lightT -= dt;
    if (head && lightT <= 0) { lightT = 0.25; L.assignLights(head.x, head.z); }
    for (let i = 0; i < SLOTS; i++) {
      const c = slotC[i]; if (!c) continue;
      slots[i].intensity = c.intensity * (c.flick ? (Math.random() > 0.96 ? 0.15 : 0.85 + 0.15 * Math.sin(L.time * 9)) : 1);
    }
    for (const d of Object.values(L.doors)) {
      if (d.opening && d.t < 1) { d.t = Math.min(1, d.t + dt / 3); d.mesh.position.y = 1.45 + d.t * 3.0; }
    }
    for (const t of L.tapes) if (t.playing) t.reels.forEach(r => (r.rotation.y += dt * 6));
  };

  return L;
}

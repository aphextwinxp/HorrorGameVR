// Точка входа: сцена, рендерер, WebXR, главный цикл.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildLevel } from './level.js';
import { AudioSystem } from './audio.js';
import { NoiseSystem } from './noise.js';
import { NavGrid } from './nav.js';
import { Monster } from './monster.js';
import { Player } from './player.js';
import { Interaction } from './interact.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Mic } from './mic.js';
import { CFG } from './config.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFoveation?.(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020203);
scene.fog = new THREE.FogExp2(0x020203, 0.07);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);

const listener = new THREE.AudioListener(); camera.add(listener);
const audio = new AudioSystem(listener);
const noise = new NoiseSystem();
const level = buildLevel(scene);
const nav = new NavGrid(-9, -60, 9, 9, 0.5); nav.rebuild(level.colliders);
const ui = new UI(camera);
const game = new Game();
const player = new Player({ renderer, scene, camera, level, audio, noise });
const monster = new Monster({ scene, nav, audio, level, game });
const interaction = new Interaction({ scene, level, audio, noise, game });
const mic = new Mic(listener.context, noise, player);
game.init({ player, monster, audio, noise, ui, level, nav, interaction });
noise.onNoise((ev) => monster.hear(ev));
level.onDoorOpen = () => nav.rebuild(level.colliders); // двери открылись — существо должно видеть проход

player.onConnected = (hand) => { if (hand.handed === 'left') ui.attachWrist(hand.obj); };
player.onToggleMute = () => game.toggleMute();
player.onToggleLite = () => game.toggleLite();

// --- старт ---
const overlay = document.getElementById('overlay');
const vrBtn = VRButton.createButton(renderer);
document.body.appendChild(vrBtn);

async function begin() {
  audio.resume();
  if (document.getElementById('mic').checked) {
    const ok = await mic.enable();
    if (!ok) alert('Не удалось включить микрофон — игра продолжится без него.');
  }
  overlay.style.display = 'none';
  game.start();
}
document.getElementById('desk').addEventListener('click', async () => {
  vrBtn.style.display = 'none';
  await begin();
  player.requestLock();
});
renderer.xr.addEventListener('sessionstart', () => { begin(); });
renderer.xr.addEventListener('sessionend', () => { overlay.style.display = 'flex'; });
renderer.domElement.addEventListener('click', () => { if (game.running && !player.xr && !player.locked) player.requestLock(); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- главный цикл ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = clock.elapsedTime;
  level.update(dt, player.headPos);
  if (game.running) {
    player.update(dt);
    interaction.update(dt, player.hands, now);
    const pl = { x: player.headPos.x, z: player.headPos.z, hidden: player.hidden };
    if (!game.busy) monster.update(dt, pl); else monster.update(0, pl);
    mic.update(now);
    noise.update(dt);
    audio.update(dt, game.busy ? 0 : monster.threat(pl.x, pl.z), player.headPos);
    game.update(dt);
    ui.update(dt, {
      vu: noise.level,
      battery: interaction.flash.held ? interaction.flash.battery / CFG.flashlight.battery : null,
      mode: player.xr ? (player.smooth ? 'плавно' : 'телепорт') : 'ПК',
      desktop: !player.xr,
      vignette: player.comfort
    });
  }
  renderer.render(scene, camera);
});

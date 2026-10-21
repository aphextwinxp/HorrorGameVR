// Сюжет v0.2: Акт I (фонарик → плёнка → предохранитель) → Акт II (жилой блок → ключ-карта → серверная → пластина)
// → Акт III (камера резонанса: 25 секунд полной тишины). Три концовки: «Тишина», «Эхо», «Запись».
import { CFG } from './config.js';
import { segmentBlocked } from './physics.js';

const ENDINGS = {
  silence: ['Концовка «Тишина»', 'Слушатель уснул. Станция снова молчит.'],
  echo: ['Концовка «Эхо»', 'Он услышал тебя. Станция запомнила ещё один звук.'],
  record: ['Концовка «Запись»', 'Ты забрал частоту с собой. Она всё ещё звучит…']
};

export class Game {
  constructor() {
    this.running = false; this.busy = false; this.ended = false;
    this.timers = []; this.muted = false; this.lite = false;
    this.caughtCount = 0; this.flags = {};
    this.phase = 'A';             // A → C → D → finale
    this.checkpoint = { ...CFG.checkpoint };
    this.finale = false; this.finaleT = 0; this.pulseT = 0; this.lastSec = -1;
  }

  init(ctx) { Object.assign(this, ctx); }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  start() {
    if (this.running) return;
    this.running = true;
    this.player.setPosition(CFG.start.x, CFG.start.z, CFG.start.yaw);
    this.ui.setObjective('Найти фонарик на столе (хват — взять)');
    this.after(2.5, () => this.say('Марта: Алекс, ты спустился? Связь плохая. На столе слева должен быть фонарик.', 7));
  }

  toggleMute() {
    this.muted = !this.muted;
    this.ui.setLine(this.muted ? 'Рация приглушена (шум от неё не создаётся)' : 'Рация включена', 3);
  }
  toggleLite() {
    this.lite = !this.lite;
    this.ui.setLine(this.lite ? 'Лёгкий режим: существо медленнее и хуже чует' : 'Обычный режим', 3);
  }

  // Голос Марты — тоже шум. В финале она молчит.
  say(text, secs = 6) {
    this.ui.setLine(text, secs);
    if (!this.muted && !this.finale) {
      this.audio.radioBlip();
      this.noise.emit(this.player.headPos, 0.12, 'radio');
    }
  }

  // ---------- предметы ----------
  onItemGrabbed(it) {
    if (it.type === 'flashlight' && !this.flags.flash) {
      this.flags.flash = true;
      this.ui.setObjective('Включить магнитофон на столе (курок рядом с ним)');
      this.after(1.5, () => this.say('Марта: Хорошо. Теперь запусти магнитофон — нам нужна запись. Курок рядом с ним.', 8));
    } else if (it.type === 'keycard' && !this.flags.keycard) {
      this.flags.keycard = true;
      this.ui.setObjective('Вставить ключ-карту в считыватель у северной двери');
    } else if (it.type === 'plate' && !this.flags.plate) {
      this.flags.plate = true;
      this.ui.setObjective('Вставить пластину в консоль на севере — или вернуться к лифту в шлюзе');
      this.after(1.2, () => this.say('Марта: Плата у тебя? Возвращайся к лифту, Алекс. Консоль не трогай. Пожалуйста.', 8));
    }
  }

  onSocket(id) {
    const L = this.level, m = this.monster;
    if (id === 'fuse') {
      this.phase = 'C';
      L.openDoor('d2', this.audio);
      this.noise.emit(L.sockets[0].pos, 0.5, 'door');
      m.setWaypoints([...L.wpLab, ...L.wpSluice, ...L.wpC]);
      this.checkpoint = { x: 0, z: -19, yaw: 0 };
      this.ui.setObjective('Идти на север — в жилой блок. Искать ключ-карту.');
      this.after(1, () => this.say('Марта: Получилось! Дверь открылась. Дальше жилой блок — только тихо!', 6));
    } else if (id === 'keycard') {
      this.phase = 'D';
      L.openDoor('d3', this.audio);
      this.noise.emit(L.sockets[1].pos, 0.5, 'door');
      m.setWaypoints([...L.wpC, ...L.wpD]);
      this.checkpoint = { x: 0, z: -32.5, yaw: 0 };
      this.ui.setObjective('Найти пластину данных в серверной');
      this.after(1, () => this.say('Марта: Серверная… Пластина должна быть в дальнем конце. Двигайся змейкой между стойками.', 7));
    } else if (id === 'plate') {
      this.startFinale();
    }
  }

  // ---------- плёнки ----------
  playTape(t) {
    if (t.used) return;
    t.used = true; t.playing = true;
    this.audio.tape(t.dur);
    this.ui.setObjective('Слушать запись…');
    t.lines.forEach(([at, text]) => this.after(at, () => this.ui.setLine(text, 3.6)));
    this.after(t.dur, () => { t.playing = false; this._tapeDone(t.id); });
  }

  _tapeDone(id) {
    const L = this.level, m = this.monster;
    if (id === 1) {
      m.reset(L.wpLab[5]);
      this.audio.scare();
      this.ui.setObjective('Найти предохранитель в лаборатории (дальше по коридору)');
      this.after(1.5, () => this.say('Марта: Алекс… оно проснулось. Не двигайся резко. Предохранитель в лаборатории — иди тихо. Бросай предметы, чтобы отвлечь.', 9));
    } else if (id === 2) {
      this.ui.setObjective(this.flags.keycard ? 'Вставить ключ-карту в считыватель' : 'Найти ключ-карту (комнаты слева и справа)');
      this.after(0.8, () => this.say('Марта: Алекс… Это была я. Марта Орлова. Я не успела сказать. Прости. Мне нужна пластина из серверной.', 10));
    } else if (id === 3) {
      this.ui.setObjective(this.flags.plate ? 'Вставить пластину в консоль — или вернуться к лифту' : 'Найти пластину данных');
      this.after(0.8, () => this.say('Марта: Семнадцать герц… Да. Всё верно. Только тишина, Алекс. Только тишина.', 8));
    }
  }

  onChase() {
    if (this.flags.chase) return;
    this.flags.chase = true;
    this.after(0.5, () => this.say('Марта: Он тебя слышит! Присядь за стеллажом и замри!', 5));
  }

  // ---------- финал ----------
  startFinale() {
    this.phase = 'finale'; this.finale = true; this.finaleT = 25; this.pulseT = 3; this.lastSec = -1;
    const L = this.level;
    L.console.screen.material.color.set(0xaa66ff);
    this.audio.hum(25);
    this.ui.setLine('', 0);
    this.monster.setWaypoints(L.wpD);
    this.monster.spawn(L.wpD[3].x, L.wpD[3].z);
  }

  caught() {
    if (this.busy || this.ended) return;
    if (this.finale) { this.finish('echo'); return; }
    this.busy = true; this.caughtCount++;
    this.audio.scare();
    this.ui.fadeTo(1, 0.4);
    this.ui.centerText('Слушатель нашёл тебя');
    this.after(3.5, () => {
      this.player.setPosition(this.checkpoint.x, this.checkpoint.z, this.checkpoint.yaw);
      const L = this.level;
      const spawn = this.phase === 'A' ? L.wpLab[5] : this.phase === 'C' ? L.wpLab[6] : L.wpC[1];
      this.monster.reset(spawn);
      this.ui.centerText('');
      this.ui.fadeTo(0, 1.2);
      this.busy = false;
    });
  }

  finish(kind) {
    if (this.ended) return;
    this.ended = true; this.busy = true;
    const [title, text] = ENDINGS[kind];
    this.audio.scare && kind === 'echo' && this.audio.scare();
    this.ui.setObjective('');
    this.ui.fadeTo(1, kind === 'echo' ? 0.6 : 3);
    this.after(kind === 'echo' ? 1.5 : 3, () => this.ui.centerText(`${title}. ${text}`));
    this.after(10, () => this.ui.centerText('Спасибо за игру! Обнови страницу (F5), чтобы сыграть снова.'));
  }

  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]; t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    if (!this.running || this.ended) return;
    const p = this.player.headPos, L = this.level, m = this.monster;

    // лифт в шлюзе
    const e = L.elevatorZone;
    if (!this.busy && p.x >= e.x1 && p.x <= e.x2 && p.z >= e.z1 && p.z <= e.z2) {
      if (this.flags.plate && !L.plate.inserted) this.finish('record');
      else if (!this.flags.liftMsg) { this.flags.liftMsg = true; this.say('Лифт обесточен. Нужно идти дальше.', 4); }
    }

    // финал: 25 секунд тишины
    if (this.finale) {
      this.finaleT -= dt; this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = 5;
        this.audio.pulse(L.console.pos);
        this.noise.emit(L.console.pos, 0.65, 'machine'); // машина сама шумит и приманивает существо
      }
      const sec = Math.max(0, Math.ceil(this.finaleT));
      if (sec !== this.lastSec) { this.lastSec = sec; this.ui.setObjective(`Резонанс: ${sec} с — замри и молчи!`); }
      if (this.finaleT <= 0) { m.sleep(); this.audio.sleepSound(); this.finish('silence'); }
      return;
    }

    // первый раз увидел существо
    if (m.active && !this.flags.seen) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      const f = this.player.forward;
      const dot = (f.x * dx + f.z * dz) / (Math.hypot(f.x, f.z) * d + 1e-6);
      if (d < 10 && dot > 0.75 && !segmentBlocked(p.x, p.z, m.x, m.z, L.colliders)) {
        this.flags.seen = true;
        this.say('Марта: Это оно… Слепое. Оно ищет звук. Не дыши громко.', 5);
      }
    }
  }
}

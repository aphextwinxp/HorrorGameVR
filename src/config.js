// Все настройки баланса в одном месте.
export const CFG = {
  player: {
    radius: 0.3,          // радиус коллизии, м
    walk: 1.7,            // скорость ходьбы, м/с
    sneak: 0.7,           // скорость при лёгком отклонении стика / Shift
    snapAngle: Math.PI / 6, // шаг поворота 30°
    crouchEye: 1.05,      // ниже этой высоты головы = присел
    stepLen: 0.75         // длина шага для шума
  },
  monster: {
    hearRadius: 20,       // радиус слышимости при громкости 1.0, м
    patrolSpeed: 1.0,
    suspectSpeed: 1.5,
    searchSpeed: 1.1,
    chaseSpeed: 2.3,
    catchDist: 0.8,
    smellDist: 1.4,       // вплотную замечает, даже если игрок молчит
    loseTime: 4.5         // сколько секунд без звуков до потери следа
  },
  flashlight: { battery: 240, intensity: 40 },
  start: { x: 0, z: 6.5, yaw: 0 },
  checkpoint: { x: 0, z: -3.5, yaw: 0 }
};

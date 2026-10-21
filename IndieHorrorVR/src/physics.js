// Простая 2D-физика: круг против AABB (в плоскости XZ) + пересечение отрезка с коробкой.

export function resolveCircle(pos, r, boxes, y = 0) {
  for (const b of boxes) {
    if (b.disabled) continue;
    if (y >= b.y2 - 0.02) continue; // объект выше верха коробки
    const cx = Math.max(b.x1, Math.min(pos.x, b.x2));
    const cz = Math.max(b.z1, Math.min(pos.z, b.z2));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        const l = pos.x - b.x1, rr = b.x2 - pos.x, t = pos.z - b.z1, bt = b.z2 - pos.z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) pos.x = b.x1 - r;
        else if (m === rr) pos.x = b.x2 + r;
        else if (m === t) pos.z = b.z1 - r;
        else pos.z = b.z2 + r;
      }
    }
  }
}

// Liang–Barsky
export function segmentHitsBox(ax, az, bx, bz, b) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const P = [-dx, dx, -dz, dz];
  const Q = [ax - b.x1, b.x2 - ax, az - b.z1, b.z2 - az];
  for (let i = 0; i < 4; i++) {
    const p = P[i], q = Q[i];
    if (p === 0) { if (q < 0) return false; }
    else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

// Перекрыт ли отрезок высокой преградой (стены, двери).
export function segmentBlocked(ax, az, bx, bz, boxes) {
  for (const b of boxes) {
    if (b.disabled || b.y2 < 1.5) continue;
    if (segmentHitsBox(ax, az, bx, bz, b)) return true;
  }
  return false;
}

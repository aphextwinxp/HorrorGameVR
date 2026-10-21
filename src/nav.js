// Навигационная сетка + A* (без зависимостей). Сетка перестраивается при открытии дверей.

export class NavGrid {
  constructor(minX, minZ, maxX, maxZ, cell = 0.5) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
  }

  rebuild(boxes, margin = 0.3) {
    this.blocked.fill(0);
    for (const b of boxes) {
      if (b.disabled) continue;
      const x1 = Math.floor((b.x1 - margin - this.minX) / this.cell);
      const x2 = Math.floor((b.x2 + margin - this.minX) / this.cell);
      const z1 = Math.floor((b.z1 - margin - this.minZ) / this.cell);
      const z2 = Math.floor((b.z2 + margin - this.minZ) / this.cell);
      for (let z = Math.max(0, z1); z <= Math.min(this.h - 1, z2); z++)
        for (let x = Math.max(0, x1); x <= Math.min(this.w - 1, x2); x++)
          this.blocked[z * this.w + x] = 1;
    }
  }

  toCell(x, z) { return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)]; }
  toWorld(cx, cz) { return { x: this.minX + (cx + 0.5) * this.cell, z: this.minZ + (cz + 0.5) * this.cell }; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }
  free(cx, cz) { return this.inside(cx, cz) && !this.blocked[cz * this.w + cx]; }

  nearestFree(cx, cz, maxR = 8) {
    if (this.free(cx, cz)) return [cx, cz];
    for (let r = 1; r <= maxR; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.free(cx + dx, cz + dz)) return [cx + dx, cz + dz];
    return null;
  }

  lineFree(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const n = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const [cx, cz] = this.toCell(a.x + dx * t, a.z + dz * t);
      if (!this.free(cx, cz)) return false;
    }
    return true;
  }

  // Возвращает массив точек {x,z} (без стартовой) или null.
  findPath(sx, sz, tx, tz) {
    const s = this.nearestFree(...this.toCell(sx, sz));
    const g = this.nearestFree(...this.toCell(tx, tz));
    if (!s || !g) return null;
    const W = this.w, N = this.w * this.h;
    const gs = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]]; k = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          let l = 2 * k + 1, r = l + 1, m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
        }
      }
      return top;
    };
    const h = (x, z) => {
      const dx = Math.abs(x - g[0]), dz = Math.abs(z - g[1]);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    const si = s[1] * W + s[0], gi = g[1] * W + g[0];
    gs[si] = 0; push(h(s[0], s[1]), si);
    const D = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let found = false;
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === gi) { found = true; break; }
      const cx = i % W, cz = (i / W) | 0;
      for (const [dx, dz] of D) {
        const nx = cx + dx, nz = cz + dz;
        if (!this.free(nx, nz)) continue;
        if (dx && dz && (!this.free(cx + dx, cz) || !this.free(cx, cz + dz))) continue;
        const ni = nz * W + nx;
        const ng = gs[i] + (dx && dz ? Math.SQRT2 : 1);
        if (ng < gs[ni]) { gs[ni] = ng; came[ni] = i; push(ng + h(nx, nz), ni); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = gi; i !== -1; i = came[i]) cells.push(this.toWorld(i % W, (i / W) | 0));
    cells.reverse();
    // сглаживание по прямой видимости
    const out = [];
    let a = cells[0], idx = 0;
    while (idx < cells.length - 1) {
      let far = idx + 1;
      for (let j = cells.length - 1; j > idx + 1; j--) if (this.lineFree(a, cells[j])) { far = j; break; }
      out.push(cells[far]); a = cells[far]; idx = far;
    }
    return out;
  }
}

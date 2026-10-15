// Finite-volume Saint-Venant flow, HLL flux and hydrostatic reconstruction.
// Screen pixels measure horizontal distance; depth is in scene height units.
export const PHYSICS_DT = 1 / 60;
export const GRAVITY = 900;
export const REST_DEPTH = 18;
export const DRY_DEPTH = .025;
const SURF_AMPLITUDE = 1.1;
export const MOUSE_WAVE = Object.freeze({ maxAmplitude: 1.25, minAmplitude: .25, radius: 32, momentum: 3 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Slow, incommensurate modulation avoids a visibly looping wave pattern.
function incomingAmplitude(time, y, span) {
  const amplitude = SURF_AMPLITUDE + .12 * Math.sin(time * .37) + .03 * Math.sin(y / 220 + time * .23);
  const center = span * (.50 + .27 * Math.sin(time * .13));
  const second = span * (.48 + .33 * Math.sin(time * .19 + 1.7));
  const reach = Math.max(80, span * .22);
  const envelope = .55 + .45 * Math.min(1, Math.exp(-(((y - center) / reach) ** 2))
    + .7 * Math.exp(-(((y - second) / (reach * .8)) ** 2)));
  return amplitude * envelope * clamp(time / 1.2, 0, 1);
}
export function incomingWave(time, y, mobile = false, span = 900) {
  const phase = 2 * Math.PI * (time / 2.35 + .055 * Math.sin(time * .61))
    + .85 * Math.sin(y / 240 + time * .11) + .28 * Math.sin(y / 90 - time * .17)
    - (mobile ? y * .0024 : y * .0006);
  return incomingAmplitude(time, y, span) * Math.sin(phase);
}
export class Water {
  constructor(cols, rows, cell = 12, { terrain = null, originX = 0, boundaries = 'closed', waves = true, friction = true } = {}) {
    Object.assign(this, { cols, rows, cell, terrain, originX, boundaries, waves, friction, time: 0, substeps: 0 });
    const n = cols * rows;
    for (const name of ['depth', 'bed', 'height', 'mx', 'my', 'flowX', 'flowY', 'foam', 'wetSand', 'pressure', 'breaking', 'nextDepth', 'nextMx', 'nextMy', 'nextFoam', 'slope', 'slopeN', 'slopeT', 'stageDepth', 'stageMx', 'stageMy', 'disturbance', 'nextDisturbance', 'previousFlowX', 'previousFlowY', 'vortexDye', 'nextVortexDye']) this[name] = new Float64Array(n);
    this.wet = new Uint8Array(n);
    this.flux = new Float64Array(5);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      this.bed[i] = terrain ? terrain.bed(originX + (x + .5) * cell, (y + .5) * cell) : -REST_DEPTH;
      this.depth[i] = Math.max(0, -this.bed[i]);
    }
    this.refresh();
  }
  initializeSurf(time = 20) {
    this.time = time;
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const i = y * this.cols + x, px = this.originX + (x + .5) * this.cell, py = (y + .5) * this.cell;
      const d = this.terrain.distance(px, py), base = Math.max(0, -this.bed[i]);
      const extraTravel = d < 110 ? 2 * (Math.sqrt(110) - Math.sqrt(Math.max(1, d))) * Math.sqrt(110 / (GRAVITY * REST_DEPTH)) - (110 - Math.max(0, d)) / Math.sqrt(GRAVITY * REST_DEPTH) : 0;
      const age = (this.terrain.width - px) / Math.sqrt(GRAVITY * REST_DEPTH) + extraTravel;
      const wave = incomingWave(time - age, py, this.terrain.mobile, this.terrain.height);
      const eta = d < 0 ? Math.max(.05, wave * .75) : wave * Math.min(1.35, (REST_DEPTH / Math.max(2, base)) ** .25);
      this.depth[i] = Math.max(0, eta - this.bed[i]);
      if (d < -80) this.depth[i] = 0;
      this.mx[i] = this.depth[i] * (d < 0 ? -wave * 9 : -2 * (Math.sqrt(GRAVITY * this.depth[i]) - Math.sqrt(GRAVITY * base)));
      this.my[i] = this.depth[i] * Math.sin(py / 200 + time * .2) * 1.4;
      if (this.depth[i] < DRY_DEPTH) this.mx[i] = this.my[i] = 0;
      this.foam[i] = d < 40 && this.depth[i] > .15 && wave > .2 ? .35 + .25 * Math.sin(py / 110) ** 2 : 0;
      this.wetSand[i] = d < 0 && d > -65 ? 1 : 0;
    }
    this.refresh();
  }
  sampleArray(field, width, height, x, y) {
    x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    return field[y0 * width + x0] * (1 - fx) * (1 - fy)
      + field[y0 * width + Math.min(x0 + 1, width - 1)] * fx * (1 - fy)
      + field[Math.min(y0 + 1, height - 1) * width + x0] * (1 - fx) * fy
      + field[Math.min(y0 + 1, height - 1) * width + Math.min(x0 + 1, width - 1)] * fx * fy;
  }
  sample(field, px, py) { return this.sampleArray(field, this.cols, this.rows, (px - this.originX) / this.cell - .5, py / this.cell - .5); }
  velocity(px, py) { return [this.sample(this.flowX, px, py), this.sample(this.flowY, px, py)]; }
  flowAcceleration(px, py, transportX = null, transportY = null) {
    // Acceleration of the actual current along the sampling path, including
    // pressure, advection and the vortex source. A separate pressure-only
    // approximation made the boat turn away from the current in curved flow.
    const dt = this.lastDt || PHYSICS_DT, d = this.cell;
    const flow = this.velocity(px, py);
    const u = transportX ?? flow[0], v = transportY ?? flow[1];
    const derivative = (field, x, y) => (this.sample(field, px + x, py + y) - this.sample(field, px - x, py - y)) / d;
    return [(flow[0] - this.sample(this.previousFlowX, px, py)) / dt + u * derivative(this.flowX, d / 2, 0) + v * derivative(this.flowX, 0, d / 2),
      (flow[1] - this.sample(this.previousFlowY, px, py)) / dt + u * derivative(this.flowY, d / 2, 0) + v * derivative(this.flowY, 0, d / 2)];
  }
  pressureAcceleration(px, py) {
    const d = this.cell;
    const eta = (x, y) => this.sample(this.height, x, y) + this.sample(this.pressure, x, y);
    return [-GRAVITY * (eta(px + d / 2, py) - eta(px - d / 2, py)) / d,
      -GRAVITY * (eta(px, py + d / 2) - eta(px, py - d / 2)) / d];
  }
  refresh() {
    for (let i = 0; i < this.depth.length; i++) {
      const h = this.depth[i]; this.wet[i] = h > DRY_DEPTH ? 1 : 0;
      this.height[i] = h > DRY_DEPTH ? h + this.bed[i] : Math.max(0, this.bed[i]);
      this.flowX[i] = h > DRY_DEPTH ? this.mx[i] / h : 0;
      this.flowY[i] = h > DRY_DEPTH ? this.my[i] / h : 0;
    }
  }
  // Flux[0..2] is shared; [3..4] are the left/right bed source corrections.
  face(hL, qL, tL, zL, hR, qR, tR, zR) {
    const z = Math.max(zL, zR), a = Math.max(0, hL + zL - z), b = Math.max(0, hR + zR - z);
    const uL = hL > DRY_DEPTH ? qL / hL : 0, uR = hR > DRY_DEPTH ? qR / hR : 0;
    const vL = hL > DRY_DEPTH ? tL / hL : 0, vR = hR > DRY_DEPTH ? tR / hR : 0;
    const cL = Math.sqrt(GRAVITY * a), cR = Math.sqrt(GRAVITY * b);
    const sL = Math.min(0, uL - cL, uR - cR), sR = Math.max(0, uL + cL, uR + cR);
    const f = this.flux, inv = sR > sL ? 1 / (sR - sL) : 0;
    f[0] = (sR * a * uL - sL * b * uR + sL * sR * (b - a)) * inv;
    f[1] = (sR * (a * uL * uL + .5 * GRAVITY * a * a) - sL * (b * uR * uR + .5 * GRAVITY * b * b) + sL * sR * (b * uR - a * uL)) * inv;
    f[2] = (sR * a * uL * vL - sL * b * uR * vR + sL * sR * (b * vR - a * vL)) * inv;
    f[3] = .5 * GRAVITY * (hL * hL - a * a);
    f[4] = .5 * GRAVITY * (hR * hR - b * b);
    return f;
  }
  sweep(axis, dt) {
    const { cols: w, rows: h, depth: H, mx, my, bed, pressure } = this;
    const normal = axis === 0 ? mx : my, tangent = axis === 0 ? my : mx;
    const nextN = axis === 0 ? this.nextMx : this.nextMy, nextT = axis === 0 ? this.nextMy : this.nextMx;
    this.nextDepth.set(H); nextN.set(normal); nextT.set(tangent);
    // Limited free-surface reconstruction reduces diffusion of the incoming
    // trains. Depth-limited slopes prevent an initially dry cell emitting water.
    const stride = axis === 0 ? 1 : w;
    this.slope.fill(0); this.slopeN.fill(0); this.slopeT.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (axis === 0 ? x === 0 || x === w - 1 : y === 0 || y === h - 1) continue;
      const i = y * w + x, eta = H[i] + bed[i] + pressure[i];
      const a = eta - H[i - stride] - bed[i - stride] - pressure[i - stride];
      const b = H[i + stride] + bed[i + stride] + pressure[i + stride] - eta;
      this.slope[i] = H[i - stride] > DRY_DEPTH && H[i + stride] > DRY_DEPTH && H[i] > 2 * Math.max(Math.abs(bed[i] - bed[i - stride]), Math.abs(bed[i + stride] - bed[i])) && a * b > 0 ? Math.sign(a) * Math.min(Math.abs(a), Math.abs(b), 2 * H[i]) * .5 : 0;
      if (H[i - stride] > DRY_DEPTH && H[i] > DRY_DEPTH && H[i + stride] > DRY_DEPTH) {
        const limited = field => {
          const v = field[i] / H[i], l = v - field[i - stride] / H[i - stride], r = field[i + stride] / H[i + stride] - v;
          return l * r > 0 ? .5 * Math.sign(l) * Math.min(Math.abs(l), Math.abs(r)) : 0;
        };
        this.slopeN[i] = limited(normal); this.slopeT[i] = limited(tangent);
      }
    }
    const span = axis === 0 ? w : h, lines = axis === 0 ? h : w, r = dt / this.cell;
    for (let line = 0; line < lines; line++) for (let face = 0; face <= span; face++) {
      const left = face > 0 ? (axis === 0 ? line * w + face - 1 : (face - 1) * w + line) : -1;
      const right = face < span ? (axis === 0 ? line * w + face : face * w + line) : -1;
      const inside = left >= 0 ? left : right;
      let hL = H[left >= 0 ? left : inside], hR = H[right >= 0 ? right : inside];
      let qL = normal[left >= 0 ? left : inside], qR = normal[right >= 0 ? right : inside];
      const tL = tangent[left >= 0 ? left : inside], tR = tangent[right >= 0 ? right : inside];
      const zL = bed[left >= 0 ? left : inside] + pressure[left >= 0 ? left : inside];
      const zR = bed[right >= 0 ? right : inside] + pressure[right >= 0 ? right : inside];
      if (left < 0 || right < 0) {
        // Continue the coast beyond the top/bottom with no cross-edge
        // transport. Extrapolated side flow drained the recessed lower beach;
        // incoming and outgoing ocean waves still use the open right edge.
        if (this.boundaries === 'closed' || axis === 1 || left < 0) {
          if (left < 0) qL = -qR; else qR = -qL;
        } else if (axis === 0 && right < 0) {
          // Outgoing characteristic comes from inside; only the incoming one
          // is driven. Thus returning waves can leave through the right edge.
          const base = Math.sqrt(GRAVITY * Math.max(.1, -bed[inside]));
          const y = (line + .5) * this.cell;
          const span = this.terrain?.height || this.rows * this.cell;
          const eta = this.waves ? incomingWave(this.time, y, this.terrain?.mobile, span) : 0;
          const amplitude = this.waves ? incomingAmplitude(this.time, y, span) : 0;
          const outgoing = qL / Math.max(hL, .1) + 2 * Math.sqrt(GRAVITY * hL);
          // Balance the local wave energy, including the front envelope. Using
          // a full-strength offset on weak fronts steadily drained the coast.
          const incoming = -2 * base - 2 * GRAVITY / base * eta + base * amplitude ** 2 / Math.max(1, -bed[inside]) ** 2;
          const speed = (outgoing + incoming) / 2, c = Math.max(0, (outgoing - incoming) / 4);
          hR = c * c / GRAVITY; qR = hR * speed;
        }
      }
      const reconstructedL = left >= 0 ? Math.max(0, hL + this.slope[left]) : hL;
      const reconstructedR = right >= 0 ? Math.max(0, hR - this.slope[right]) : hR;
      const f = this.face(reconstructedL, hL > DRY_DEPTH ? (qL / hL + (left >= 0 ? this.slopeN[left] : 0)) * reconstructedL : 0, hL > DRY_DEPTH ? (tL / hL + (left >= 0 ? this.slopeT[left] : 0)) * reconstructedL : 0, zL,
        reconstructedR, hR > DRY_DEPTH ? (qR / hR - (right >= 0 ? this.slopeN[right] : 0)) * reconstructedR : 0, hR > DRY_DEPTH ? (tR / hR - (right >= 0 ? this.slopeT[right] : 0)) * reconstructedR : 0, zR);
      if (left >= 0) { this.nextDepth[left] -= r * f[0]; nextN[left] -= r * (f[1] + f[3]); nextT[left] -= r * f[2]; }
      if (right >= 0) { this.nextDepth[right] += r * f[0]; nextN[right] += r * (f[1] + f[4]); nextT[right] += r * f[2]; }
    }
    [this.depth, this.nextDepth] = [this.nextDepth, this.depth];
    [this.mx, this.nextMx] = [this.nextMx, this.mx]; [this.my, this.nextMy] = [this.nextMy, this.my];
  }
  rkSweep(axis, dt) {
    this.stageDepth.set(this.depth); this.stageMx.set(this.mx); this.stageMy.set(this.my);
    this.sweep(axis, dt); this.sweep(axis, dt);
    for (let i = 0; i < this.depth.length; i++) {
      this.depth[i] = .5 * (this.depth[i] + this.stageDepth[i]);
      this.mx[i] = .5 * (this.mx[i] + this.stageMx[i]); this.my[i] = .5 * (this.my[i] + this.stageMy[i]);
    }
  }
  vortexForce(px, py, vx, vy, vortex) {
    if (!vortex?.strength) return [0, 0];
    const dx = px - vortex.x, dy = py - vortex.y, r = Math.hypot(dx, dy);
    if (r < .001) return [0, 0];
    const core = vortex.core || 100, q = r / core;
    const envelope = Math.exp(-((r / vortex.reach) ** 4));
    const target = 120 * q / (1 + q * q) * vortex.strength * envelope;
    const tangent = (-dy * vx + dx * vy) / r;
    const force = (target - tangent) * 1.6 * envelope;
    // Supply the curvature of the forced circulation directly. Tangential
    // forcing alone made the free surface carve a deep basin to provide it,
    // blocking small surf and leaving a large uniform patch of glyphs.
    const radialVelocity = (dx * vx + dy * vy) / r;
    const curvature = (tangent * tangent / r * vortex.strength + radialVelocity * .6) * envelope;
    return [-dy / r * force - dx / r * curvature, dx / r * force - dy / r * curvature];
  }
  step(dt = PHYSICS_DT, vortex = null) {
    this.previousFlowX.set(this.flowX); this.previousFlowY.set(this.flowY); this.lastDt = dt;
    let remaining = dt;
    while (remaining > 1e-9) {
      let speed = 1;
      for (let i = 0; i < this.depth.length; i++) {
        const h = this.depth[i];
        speed = Math.max(speed, Math.sqrt(GRAVITY * h) + (h > DRY_DEPTH ? Math.max(Math.abs(this.mx[i]), Math.abs(this.my[i])) / h : 0));
      }
      const sub = Math.min(remaining, .28 * this.cell / speed);
      this.time += sub; this.rkSweep(0, sub); this.rkSweep(1, sub);
      for (let i = 0; i < this.depth.length; i++) {
        // The CFL bound and hydrostatic HLL flux preserve depth positivity.
        // Only floating-point roundoff may be clipped; never discard dry films.
        this.depth[i] = Math.max(0, this.depth[i]);
        if (this.depth[i] <= DRY_DEPTH) this.mx[i] = this.my[i] = 0;
        else {
          if (vortex?.strength && this.depth[i] > 2) {
            const x = i % this.cols, y = Math.floor(i / this.cols), h = this.depth[i];
            const [ax, ay] = this.vortexForce(this.originX + (x + .5) * this.cell, (y + .5) * this.cell, this.mx[i] / h, this.my[i] / h, vortex);
            this.mx[i] += h * ax * sub; this.my[i] += h * ay * sub;
          }
          if (this.friction) {
          const drag = Math.exp(-sub * (.025 + .16 / (this.depth[i] + .2)));
          this.mx[i] *= drag; this.my[i] *= drag;
          }
        }
      }
      remaining -= sub; this.substeps++;
    }
    this.refresh();
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const i = y * this.cols + x, h = this.depth[i];
      const px = this.originX + (x + .5) * this.cell, py = (y + .5) * this.cell;
      const ux = this.flowX[i], uy = this.flowY[i];
      const compression = Math.max(0, -(this.flowX[y * this.cols + Math.min(this.cols - 1, x + 1)] - this.flowX[y * this.cols + Math.max(0, x - 1)]
        + this.flowY[Math.min(this.rows - 1, y + 1) * this.cols + x] - this.flowY[Math.max(0, y - 1) * this.cols + x]) / (2 * this.cell));
      const froude = Math.hypot(ux, uy) / Math.sqrt(GRAVITY * Math.max(h, .1));
      let breaking = 0;
      if (h > DRY_DEPTH && this.bed[i] > -8) {
        const [nx, ny] = this.terrain ? this.terrain.normal(px, py) : [1, 0];
        const shoreward = Math.max(0, -ux * nx - uy * ny);
        // Shallow advancing fronts foam before they become a steep bore.
        // A vortex depression over a deep bed is not a beach breaker.
        breaking = clamp(compression * 3 + Math.max(0, froude - .12) * 1.1
          + (h < 2 ? Math.max(0, shoreward - .15) * .18 : 0), 0, 1);
      }
      this.breaking[i] = breaking;
      const advected = this.sample(this.foam, px - ux * dt, py - uy * dt);
      let dye = this.sample(this.vortexDye, px - ux * dt, py - uy * dt) * Math.exp(-dt * .8);
      if (vortex?.strength && h > 2) {
        const dx = px - vortex.x, dy = py - vortex.y, r = Math.hypot(dx, dy);
        const phase = Math.atan2(dy, dx) * 2 - 3.4 * Math.log1p(r / 40) - this.time * .35;
        const arm = Math.max(0, Math.cos(phase)) ** 3;
        dye = Math.min(1, dye + dt * vortex.strength * 1.8 * Math.exp(-((r / (vortex.reach * .7)) ** 2)) * arm);
      }
      this.nextVortexDye[i] = dye;
      this.nextDisturbance[i] = this.sample(this.disturbance, px - ux * dt, py - uy * dt) * Math.exp(-dt * .5);
      this.nextFoam[i] = Math.max(advected * Math.exp(-dt * .9), breaking);
      // Track sand by terrain, including the submerged lower foreshore.
      const sand = this.bed[i] >= 0 || (this.terrain && this.terrain.distance(px, py) < 0);
      this.wetSand[i] = sand && h > .08 ? 1 : this.wetSand[i] * Math.exp(-dt * .012);
    }
    [this.foam, this.nextFoam] = [this.nextFoam, this.foam];
    [this.disturbance, this.nextDisturbance] = [this.nextDisturbance, this.disturbance];
    [this.vortexDye, this.nextVortexDye] = [this.nextVortexDye, this.vortexDye];
  }
  splash(px, py, amplitude = 1.2, radius = 30, dx = 0, dy = 0) {
    if (this.sample(this.depth, px, py) < .15) return;
    const cells = []; let sum = 0, weights = 0;
    for (let y = Math.max(0, Math.floor((py - radius * 3) / this.cell)); y < Math.min(this.rows, Math.ceil((py + radius * 3) / this.cell)); y++) {
      for (let x = Math.max(0, Math.floor((px - this.originX - radius * 3) / this.cell)); x < Math.min(this.cols, Math.ceil((px - this.originX + radius * 3) / this.cell)); x++) {
        const i = y * this.cols + x; if (this.depth[i] < .08) continue;
        const r2 = ((this.originX + (x + .5) * this.cell - px) ** 2 + ((y + .5) * this.cell - py) ** 2) / radius ** 2;
        // Thin films participate in proportion to their water depth, so a
        // shallow tail cannot suppress the entire offshore impulse.
        const weight = Math.exp(-r2 / 2) * Math.min(1, this.depth[i] / 2), value = (1 - r2 / 2) * weight;
        cells.push([i, weight, value]); sum += value; weights += weight;
      }
    }
    let scale = 1;
    for (const [i, weight, value] of cells) { const d = amplitude * (value - sum / weights * weight); if (d < 0) scale = Math.min(scale, .8 * this.depth[i] / -d); if (d > 0) scale = Math.min(scale, Math.max(0, Math.max(6, 1.8 * Math.max(1, -this.bed[i])) - this.depth[i]) / d); }
    for (const [i, weight, value] of cells) {
      this.depth[i] += amplitude * scale * (value - sum / weights * weight);
      this.disturbance[i] = Math.min(1, this.disturbance[i] + weight * .8);
      const ox = (this.originX + (i % this.cols + .5) * this.cell - px) / radius;
      const oy = ((Math.floor(i / this.cols) + .5) * this.cell - py) / radius;
      // A splash launches outward water motion as well as a crest. This is
      // water momentum, sampled by the boat, rather than a kick to the hull.
      const radial = amplitude * scale * 8;
      this.mx[i] = this.depth[i] * clamp(this.mx[i] / this.depth[i] + (dx * .5 + radial * ox) * weight, -120, 120);
      this.my[i] = this.depth[i] * clamp(this.my[i] / this.depth[i] + (dy * .5 + radial * oy) * weight, -120, 120);
    }
    this.refresh();
  }
  push(px, py, du, dv, foam = 0) {
    const gx = (px - this.originX) / this.cell - .5, gy = py / this.cell - .5;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) continue;
      const i = y * this.cols + x; if (!this.wet[i]) continue;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      this.mx[i] += this.depth[i] * du * weight; this.my[i] += this.depth[i] * dv * weight;
      this.foam[i] = Math.min(1, this.foam[i] + foam * weight);
    }
  }
  loadHull(px, py, facing, tilt, draft = .6) {
    this.pressure.fill(0);
    for (let y = Math.max(0, Math.floor((py - 36) / this.cell)); y < Math.min(this.rows, Math.ceil((py + 36) / this.cell)); y++) {
      for (let x = Math.max(0, Math.floor((px - this.originX - 50) / this.cell)); x < Math.min(this.cols, Math.ceil((px - this.originX + 50) / this.cell)); x++) {
        const ox = this.originX + (x + .5) * this.cell - px, oy = (y + .5) * this.cell - py;
        const lx = ox * Math.cos(tilt) + oy * Math.sin(tilt), ly = -ox * Math.sin(tilt) + oy * Math.cos(tilt);
        this.pressure[y * this.cols + x] = draft * Math.exp(-lx * lx / 420 - ly * ly / 125);
      }
    }
  }
}

function hullClear(boat, water, x, y) {
  for (const dx of [-26, -13, 0, 13, 26]) {
    const px = x + dx * Math.cos(boat.tilt), py = y + 12 + dx * Math.sin(boat.tilt);
    if (water.terrain.bed(px, py) > -7 || water.terrain.bed(x + dx, y + 12) > -7 || water.sample(water.depth, px, py) <= DRY_DEPTH) return false;
  }
  return true;
}
export function boatLimits(water, bounds = null) {
  return { minX: Math.max(28, bounds?.minX ?? 28), maxX: Math.min(water.terrain.width - 28, bounds?.maxX ?? Infinity),
    minY: Math.max(30, bounds?.minY ?? 30), maxY: Math.min(water.terrain.height - 30, bounds?.maxY ?? Infinity) };
}
export function placeBoat(boat, water, x, y, bounds = null) {
  const limit = boatLimits(water, bounds);
  if (x < limit.minX || x > limit.maxX || y < limit.minY || y > limit.maxY || !hullClear(boat, water, x, y)) return false;
  boat.x = x; boat.y = y; boat.vx = boat.vy = 0; boat.bounceTime = 0;
  boat.heave = -water.sample(water.height, x, y + 12) * 3.2;
  boat.heaveVelocity = boat.tiltVelocity = 0;
  return true;
}
function bounce(boat, nx, ny) {
  const toward = boat.vx * nx + boat.vy * ny;
  if (toward >= 0) return;
  const outward = Math.max(18, -toward * .72);
  boat.vx += (outward - toward) * nx; boat.vy += (outward - toward) * ny;
  boat.bounceX = nx; boat.bounceY = ny; boat.bounceTime = .5;
}
export function constrainBoat(boat, water, bounds = null) {
  const terrain = water.terrain;
  if (!terrain) return;
  for (let k = 0; k < 20; k++) {
    let contact = null;
    for (const dx of [-26, -13, 0, 13, 26]) {
      let px = boat.x + dx * Math.cos(boat.tilt), py = boat.y + 12 + dx * Math.sin(boat.tilt);
      if (terrain.bed(boat.x + dx, boat.y + 12) > terrain.bed(px, py)) { px = boat.x + dx; py = boat.y + 12; }
      const bed = terrain.bed(px, py);
      // Only solid terrain can ground the hull. A vortex or passing trough
      // can lower offshore water temporarily; it is not a shoreline obstacle.
      if (bed > -7) {
        const [nx, ny] = terrain.normal(px, py);
        contact = [nx, ny, Math.max(2, (bed + 7) / (REST_DEPTH / terrain.shallows) + 2)]; break;
      }
    }
    if (!contact) break;
    const [nx, ny, dist] = contact; boat.x += nx * dist; boat.y += ny * dist; bounce(boat, nx, ny);
  }
  const limit = boatLimits(water, bounds);
  if (boat.x <= limit.minX) { boat.x = limit.minX; bounce(boat, 1, 0); }
  if (boat.x >= limit.maxX) { boat.x = limit.maxX; bounce(boat, -1, 0); }
  if (boat.y <= limit.minY) { boat.y = limit.minY; bounce(boat, 0, 1); }
  if (boat.y >= limit.maxY) { boat.y = limit.maxY; bounce(boat, 0, -1); }
}

export function stepBoat(boat, water, dt, bounds = null) {
  const points = [-18, -6, 6, 18], rate = (1 - Math.exp(-8.5 * dt)) / dt;
  boat.bounceTime = Math.max(0, (boat.bounceTime ?? 0) - dt);
  let fx = 0, fy = 0, mean = 0, slope = 0, meanFlowX = 0;
  for (const dx of points) {
    const px = boat.x + dx * boat.facing * Math.cos(boat.tilt), py = boat.y + 12 + dx * boat.facing * Math.sin(boat.tilt);
    let [ux, uy] = water.velocity(px, py);
    // Different hull samples share one rigid translation. Following each
    // sample's separate streamline made curved flow slowly pull the hull in.
    let [rawAx, rawAy] = water.flowAcceleration(px, py, boat.vx, boat.vy);
    if (boat.bounceTime > 0) {
      const nx = boat.bounceX, ny = boat.bounceY;
      const inwardFlow = Math.min(0, ux * nx + uy * ny), inwardAcceleration = Math.min(0, rawAx * nx + rawAy * ny);
      ux -= inwardFlow * nx; uy -= inwardFlow * ny;
      rawAx -= inwardAcceleration * nx; rawAy -= inwardAcceleration * ny;
    }
    const limit = Math.max(1, Math.hypot(rawAx, rawAy) / 240), ax = rawAx / limit, ay = rawAy / limit;
    meanFlowX += ux / points.length;
    let dragX = (ux - boat.vx) * rate / 4, dragY = (uy - boat.vy) * rate / 4;
    if (boat.bounceTime > 0) {
      // Let the reflected normal velocity escape the boundary briefly, while
      // the tangential component remains responsive to the current.
      const normalDrag = dragX * boat.bounceX + dragY * boat.bounceY;
      const escapeRate = (1 - Math.exp(-2 * dt)) / dt;
      dragX += normalDrag * (escapeRate / rate - 1) * boat.bounceX;
      dragY += normalDrag * (escapeRate / rate - 1) * boat.bounceY;
    }
    fx += dragX + ax / 4; fy += dragY + ay / 4;
    const eta = water.sample(water.height, px, py); mean += eta / 4; slope += eta * dx / 720;
    water.push(px, py, -dragX * dt * .15, -dragY * dt * .15, Math.max(0, Math.hypot(ux - boat.vx, uy - boat.vy) - 10) * .012 * dt);
  }
  // Use the mean velocity over the step. Moving by the already-updated
  // velocity biased curved trajectories inward and tightened every orbit.
  const previousVx = boat.vx, previousVy = boat.vy;
  boat.vx += fx * dt; boat.vy += fy * dt;
  boat.x += (previousVx + boat.vx) * .5 * dt; boat.y += (previousVy + boat.vy) * .5 * dt;
  boat.heaveVelocity += ((-mean * 3.2 - boat.heave) * 48 - boat.heaveVelocity * 12) * dt;
  boat.heave += boat.heaveVelocity * dt;
  boat.tiltVelocity += ((-slope * 3.2 * boat.facing - boat.tilt) * 40 - boat.tiltVelocity * 11) * dt;
  boat.tilt = clamp(boat.tilt + boat.tiltVelocity * dt, -.35, .35);
  constrainBoat(boat, water, bounds);
  // Turn toward sustained current, rather than flipping on each wave crest.
  boat.headingFlowX = (boat.headingFlowX ?? 0) + (meanFlowX - (boat.headingFlowX ?? 0)) * (1 - Math.exp(-dt / .65));
  if (boat.headingFlowX > 8) boat.facing = 1; else if (boat.headingFlowX < -8) boat.facing = -1;
  boat.renderFacing = (boat.renderFacing ?? boat.facing) + (boat.facing - (boat.renderFacing ?? boat.facing)) * (1 - Math.exp(-dt * 8));
  water.loadHull(boat.x, boat.y + 12, boat.facing, boat.tilt, clamp(.6 + (boat.heave + mean * 3.2) * .08, .2, 1.2));
}

// Depth-averaged shallow water on a staggered grid. Distances are screen pixels,
// height is displacement from an 18px rest depth, and velocity is pixels/second.
// ASCII is only a renderer: dye never contributes to surface forces.
export const PHYSICS_DT = 1 / 60;
export const GRAVITY = 900;
export const REST_DEPTH = 18;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Water {
  constructor(cols, rows, cell = 18) {
    this.cols = cols; this.rows = rows; this.cell = cell;
    const count = cols * rows;
    this.height = new Float32Array(count);
    this.nextHeight = new Float32Array(count);
    this.u = new Float32Array((cols + 1) * rows);
    this.v = new Float32Array(cols * (rows + 1));
    this.nextU = new Float32Array(this.u.length);
    this.nextV = new Float32Array(this.v.length);
    this.flowX = new Float32Array(count); this.flowY = new Float32Array(count);
    this.red = new Float32Array(count); this.blue = new Float32Array(count);
    this.foam = new Float32Array(count);
    this.nextRed = new Float32Array(count); this.nextBlue = new Float32Array(count);
    this.nextFoam = new Float32Array(count);
    this.solid = new Uint8Array(count);
    this.pressure = new Float32Array(count);
    this.time = 0;
  }

  sampleArray(field, width, height, x, y, mask = null) {
    x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    let total = 0, sum = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = Math.min(height - 1, y0 + dy) * width + Math.min(width - 1, x0 + dx);
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      if (mask?.[i]) continue;
      total += field[i] * weight; sum += weight;
    }
    return sum ? total / sum : 0;
  }

  sample(field, px, py) {
    return this.sampleArray(field, this.cols, this.rows,
      px / this.cell - .5, py / this.cell - .5, this.solid);
  }

  velocity(px, py) {
    return [this.sampleArray(this.u, this.cols + 1, this.rows, px / this.cell, py / this.cell - .5),
      this.sampleArray(this.v, this.cols, this.rows + 1, px / this.cell - .5, py / this.cell)];
  }

  // Sample the same staggered pressure gradient used by the water's momentum
  // equation. Including hull pressure cancels its own equilibrium depression;
  // closed faces contribute no acceleration across a wall.
  pressureAcceleration(px, py) {
    const { cols: w, rows: h, cell, height, pressure, solid } = this;
    const sampleFace = horizontal => {
      const width = horizontal ? w + 1 : w, rows = horizontal ? h : h + 1;
      const gx = clamp(px / cell - (horizontal ? 0 : .5), 0, width - 1);
      const gy = clamp(py / cell - (horizontal ? .5 : 0), 0, rows - 1);
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      let acceleration = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = Math.min(width - 1, x0 + dx), y = Math.min(rows - 1, y0 + dy);
        if (horizontal ? x === 0 || x === w : y === 0 || y === h) continue;
        const right = y * w + x, left = right - (horizontal ? 1 : w);
        if (solid[left] || solid[right]) continue;
        const weight = (dx ? gx - x0 : 1 - gx + x0) * (dy ? gy - y0 : 1 - gy + y0);
        acceleration -= GRAVITY * (height[right] + pressure[right]
          - height[left] - pressure[left]) / cell * weight;
      }
      return acceleration;
    };
    return [sampleFace(true), sampleFace(false)];
  }

  setObstacles(mask) {
    this.solid.set(mask);
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      this.height[i] = this.red[i] = this.blue[i] = this.foam[i] = 0;
    }
    this.closeFaces();
  }

  closeFaces() {
    const { cols: w, rows: h, solid } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x <= w; x++) {
      if (x === 0 || x === w || solid[y * w + x - 1] || solid[y * w + x]) this.u[y * (w + 1) + x] = 0;
    }
    for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) {
      if (y === 0 || y === h || solid[(y - 1) * w + x] || solid[y * w + x]) this.v[y * w + x] = 0;
    }
  }

  // Compact crest/trough pair: injects wave energy without adding net water.
  splash(px, py, amplitude = 2, radius = 34, dx = 0, dy = 0, tint = 'red') {
    const { cols: w, rows: h, cell, solid } = this;
    const cells = [];
    let sum = 0, weights = 0;
    const reach = radius * 3;
    for (let y = Math.max(0, Math.floor((py - reach) / cell)); y < Math.min(h, Math.ceil((py + reach) / cell)); y++) {
      for (let x = Math.max(0, Math.floor((px - reach) / cell)); x < Math.min(w, Math.ceil((px + reach) / cell)); x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        const r2 = (((x + .5) * cell - px) ** 2 + ((y + .5) * cell - py) ** 2) / (radius * radius);
        const weight = Math.exp(-r2 * .5), value = (1 - r2 * .5) * weight;
        cells.push([i, weight, value]); sum += value; weights += weight;
      }
    }
    const offset = weights ? sum / weights : 0;
    // Limit the impulse as a whole when splashes overlap. This keeps positive
    // depth without clipping individual cells (which would change water volume).
    let scale = 1;
    const limit = REST_DEPTH * .65;
    for (const [i, weight, value] of cells) {
      const delta = amplitude * (value - offset * weight);
      if (delta > 0) scale = Math.min(scale, Math.max(0, (limit - this.height[i]) / delta));
      if (delta < 0) scale = Math.min(scale, Math.max(0, (-limit - this.height[i]) / delta));
    }
    for (const [i, weight, value] of cells) {
      this.height[i] += scale * amplitude * (value - offset * weight);
      if (tint) this[tint][i] = Math.min(1, this[tint][i] + weight * .6);
      const x = i % w, y = Math.floor(i / w);
      // Saturate external pointer forcing, so event frequency cannot violate
      // the wave solver's Courant limit during rapid repeated gestures.
      const ul = y * (w + 1) + x, ur = ul + 1, vt = y * w + x, vb = vt + w;
      this.u[ul] = clamp(this.u[ul] + dx * weight * .5, -120, 120);
      this.u[ur] = clamp(this.u[ur] + dx * weight * .5, -120, 120);
      this.v[vt] = clamp(this.v[vt] + dy * weight * .5, -120, 120);
      this.v[vb] = clamp(this.v[vb] + dy * weight * .5, -120, 120);
    }
    this.closeFaces();
  }

  // Reaction to hull drag, distributed onto neighboring open faces.
  push(px, py, du, dv, foam = 0) {
    const x = clamp(Math.floor(px / this.cell), 0, this.cols - 1);
    const y = clamp(Math.floor(py / this.cell), 0, this.rows - 1), i = y * this.cols + x;
    if (this.solid[i]) return;
    this.u[y * (this.cols + 1) + x] += du * .5;
    this.u[y * (this.cols + 1) + x + 1] += du * .5;
    this.v[i] += dv * .5; this.v[i + this.cols] += dv * .5;
    this.foam[i] = Math.min(1, this.foam[i] + foam);
  }

  // A moving hull is a surface pressure load; its gradient displaces water and
  // generates bow/stern waves through the same equations as every other wave.
  loadHull(px, py, facing, tilt, draft = 1.6) {
    this.pressure.fill(0);
    const { cols: w, rows: h, cell } = this;
    for (let y = Math.max(0, Math.floor((py - 45) / cell)); y < Math.min(h, Math.ceil((py + 45) / cell)); y++) {
      for (let x = Math.max(0, Math.floor((px - 55) / cell)); x < Math.min(w, Math.ceil((px + 55) / cell)); x++) {
        const ox = (x + .5) * cell - px, oy = (y + .5) * cell - py;
        const lx = (ox * Math.cos(tilt) + oy * Math.sin(tilt)) * facing;
        const ly = -ox * Math.sin(tilt) + oy * Math.cos(tilt);
        this.pressure[y * w + x] = draft * Math.exp(-lx * lx / 420 - ly * ly / 125);
      }
    }
  }

  vortexForce(px, py, vx, vy, vortex) {
    if (!vortex?.strength) return [0, 0];
    const dx = px - vortex.x, dy = py - vortex.y, r = Math.hypot(dx, dy);
    if (r < .001) return [0, 0];
    const q = r / 100, envelope = Math.exp(-((r / vortex.reach) ** 4));
    const target = 160 * q / (1 + q * q) * vortex.strength;
    const tangentSpeed = (-dy * vx + dx * vy) / r;
    const force = (target - tangentSpeed) * 1.6 * envelope;
    // Only tangential forcing. No radial attraction and no boat targeting.
    return [-dy / r * force, dx / r * force];
  }

  step(dt = PHYSICS_DT, vortex = null) {
    const { cols: w, rows: h, cell, height, pressure, solid, u, v, nextU, nextV } = this;
    this.time += dt;
    const damping = Math.exp(-.12 * dt);
    for (let y = 0; y < h; y++) for (let x = 0; x <= w; x++) {
      const i = y * (w + 1) + x, left = y * w + x - 1, right = left + 1;
      if (x === 0 || x === w || solid[left] || solid[right]) { nextU[i] = 0; continue; }
      const px = x * cell, py = (y + .5) * cell, [vx, vy] = this.velocity(px, py);
      const advected = this.sampleArray(u, w + 1, h, x - vx * dt / cell, y - vy * dt / cell);
      const force = this.vortexForce(px, py, vx, vy, vortex)[0];
      nextU[i] = (advected + dt * (force - GRAVITY *
        (height[right] + pressure[right] - height[left] - pressure[left]) / cell)) * damping;
    }
    for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, above = i - w, below = i;
      if (y === 0 || y === h || solid[above] || solid[below]) { nextV[i] = 0; continue; }
      const px = (x + .5) * cell, py = y * cell, [vx, vy] = this.velocity(px, py);
      const advected = this.sampleArray(v, w, h + 1, x - vx * dt / cell, y - vy * dt / cell);
      const force = this.vortexForce(px, py, vx, vy, vortex)[1];
      nextV[i] = (advected + dt * (force - GRAVITY *
        (height[below] + pressure[below] - height[above] - pressure[above]) / cell)) * damping;
    }
    // Upwind depth flux on each shared face preserves volume and carries crests
    // with the current. Closed faces reflect waves at text and viewport edges.
    const depth = i => REST_DEPTH + height[i];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) { this.nextHeight[i] = 0; continue; }
      const ul = nextU[y * (w + 1) + x], ur = nextU[y * (w + 1) + x + 1];
      const vt = nextV[i], vb = nextV[i + w];
      const fl = ul * depth(ul > 0 && x > 0 ? i - 1 : i);
      const fr = ur * depth(ur < 0 && x < w - 1 ? i + 1 : i);
      const ft = vt * depth(vt > 0 && y > 0 ? i - w : i);
      const fb = vb * depth(vb < 0 && y < h - 1 ? i + w : i);
      this.nextHeight[i] = height[i] - dt / cell * (fr - fl + fb - ft);
      this.flowX[i] = (ul + ur) * .5; this.flowY[i] = (vt + vb) * .5;
      let bx = clamp(x - this.flowX[i] * dt / cell, 0, w - 1);
      let by = clamp(y - this.flowY[i] * dt / cell, 0, h - 1);
      // Stop dye backtraces at a solid cell rather than leaking across text.
      const segments = Math.max(1, Math.ceil(Math.hypot(bx - x, by - y) * 2));
      for (let k = 1; k <= segments; k++) {
        const sx = clamp(Math.round(x + (bx - x) * k / segments), 0, w - 1);
        const sy = clamp(Math.round(y + (by - y) * k / segments), 0, h - 1);
        if (solid[sy * w + sx]) { bx = x; by = y; break; }
      }
      this.nextRed[i] = this.sampleArray(this.red, w, h, bx, by, solid) * Math.exp(-.7 * dt);
      this.nextBlue[i] = this.sampleArray(this.blue, w, h, bx, by, solid) * Math.exp(-.55 * dt);
      this.nextFoam[i] = this.sampleArray(this.foam, w, h, bx, by, solid) * Math.exp(-1.3 * dt);
      if (vortex?.strength) {
        const dx = (x + .5) * cell - vortex.x, dy = (y + .5) * cell - vortex.y;
        const r = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
        const arm = Math.max(0, Math.sin(angle * 2 - r / 32 - this.time * .7));
        this.nextBlue[i] = Math.min(1, this.nextBlue[i] + dt * .75 * vortex.strength *
          Math.exp(-((r / 145) ** 2)) * (.15 + arm * arm));
      }
    }
    [this.height, this.nextHeight] = [this.nextHeight, this.height];
    [this.u, this.nextU] = [nextU, u]; [this.v, this.nextV] = [nextV, v];
    [this.red, this.nextRed] = [this.nextRed, this.red];
    [this.blue, this.nextBlue] = [this.nextBlue, this.blue];
    [this.foam, this.nextFoam] = [this.nextFoam, this.foam];
    for (let i = 0; i < solid.length; i++) if (solid[i]) this.red[i] = this.blue[i] = this.foam[i] = 0;
  }
}

// Inertia and drag at four hull samples. These coordinates are the water plane;
// screen-space heave is applied only when drawing/colliding the ASCII sprite.
export function stepBoat(boat, water, dt) {
  const points = [-18, -6, 6, 18];
  const surfaceScale = 3.2;
  // 0.31s response time to relative flow; exponential drag is timestep-stable.
  const dragRate = (1 - Math.exp(-3.2 * dt)) / dt;
  let forceX = 0, forceY = 0, meanHeight = 0, slope = 0;
  const contacts = [];
  for (const localX of points) {
    const px = boat.x + localX * boat.facing * Math.cos(boat.tilt);
    const py = boat.y + 12 + localX * boat.facing * Math.sin(boat.tilt);
    const [ux, uy] = water.velocity(px, py);
    const fx = (ux - boat.vx) * dragRate / points.length;
    const fy = (uy - boat.vy) * dragRate / points.length;
    const [ax, ay] = water.pressureAcceleration(px, py);
    // Waves and curved currents accelerate the hull as well as the water.
    // Drag handles relative motion; pressure acceleration supplies the wave
    // response and centripetal acceleration missing from drag alone.
    forceX += fx + ax / points.length;
    forceY += fy + ay / points.length;
    const height = water.sample(water.height, px, py);
    meanHeight += height / points.length; slope += height * localX / 720;
    contacts.push([px, py, fx, fy, Math.hypot(ux - boat.vx, uy - boat.vy)]);
  }
  boat.vx += forceX * dt; boat.vy += forceY * dt;
  boat.x += boat.vx * dt; boat.y += boat.vy * dt;
  boat.heaveVelocity += (-meanHeight * surfaceScale - boat.heave) * 50 * dt - boat.heaveVelocity * 5 * dt;
  boat.heave += boat.heaveVelocity * dt;
  boat.tiltVelocity += (-slope * surfaceScale * boat.facing - boat.tilt) * 42 * dt - boat.tiltVelocity * 4.5 * dt;
  boat.tilt = clamp(boat.tilt + boat.tiltVelocity * dt, -.35, .35);
  for (const [px, py, fx, fy, slip] of contacts) {
    // Boat mass / cell water mass ≈ .5. Equal opposite drag impulse.
    water.push(px, py, -fx * dt * .5, -fy * dt * .5,
      Math.max(0, slip - 10) * .012 * dt);
  }
  water.closeFaces();
  const draft = clamp(1.6 + (boat.heave + meanHeight * surfaceScale) * .18, .4, 3.5);
  water.loadHull(boat.x, boat.y + 12, boat.facing, boat.tilt, draft);
}

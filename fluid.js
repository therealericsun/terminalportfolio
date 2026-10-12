// Textmode fluid: grayscale ambient flow, red splashes and blue whirlpool dye that cool to gray.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.querySelector('#fluid');
  const boatCanvas = document.querySelector('#boat');
  const vortexHandle = document.querySelector('#vortex-handle');
  const ctx = canvas?.getContext('2d', { alpha: true });
  const boatCtx = boatCanvas?.getContext('2d', { alpha: true });
  if (!ctx) return;

  const cell = 18;
  const vortexStrength = .58;
  const glyphs = ' .:-=+*#%@';
  let cols = 0, rows = 0, density, nextDensity, red, nextRed, blue, nextBlue;
  let ambientSurface, ambientWarm, ambientCool;
  let flowX, nextFlowX, flowY, nextFlowY, phase = 0, raf = 0, last = 0;
  let ambientClock = .2, ambientPositive = true;
  const ambientWaves = [];
  let vortexAt = Infinity, vortexStart = Infinity, twistBloom = 0;
  const pointer = { x: -100, y: -100, seen: false };
  const boat = { x: 0, y: 0, vx: 6, vy: 2, facing: 1, visible: false,
    heave: 0, heaveVelocity: 0, tilt: 0, tiltVelocity: 0, popStart: Infinity };
  const vortex = { x: 0, y: 0 };
  let dragPointerId = null, dragOffsetX = 0, dragOffsetY = 0;
  let viewportWidth = 0, viewportHeight = 0;
  let textVisible = false;
  const textBuckets = new Map();
  const textBucketSize = 48;
  const boatContactPoints = [
    [-12, 12, 3.5], [-4, 12, 3.5], [4, 12, 3.5], [12, 12, 3.5], [20, 12, 3.5],
    [-5, -12, 3], [2, -9, 3], [-5, 0, 3], [3, 0, 3], [11, 0, 3],
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setVortexPosition(x, y) {
    vortex.x = clamp(x, 22, innerWidth - 22);
    vortex.y = clamp(y, 22, innerHeight - 22);
    if (vortexHandle) {
      vortexHandle.style.left = `${vortex.x}px`;
      vortexHandle.style.top = `${vortex.y}px`;
    }
  }

  function resetVortex() {
    if (dragPointerId !== null && vortexHandle?.hasPointerCapture(dragPointerId))
      vortexHandle.releasePointerCapture(dragPointerId);
    setVortexPosition(innerWidth * .72, innerHeight * .54);
    dragPointerId = null;
    if (vortexHandle) {
      vortexHandle.hidden = true;
      vortexHandle.classList.remove('visible', 'dragging');
    }
  }

  function resetBoat() {
    boat.x = innerWidth * .5;
    boat.y = innerHeight * .5;
    boat.vx = 6;
    boat.vy = 2;
    boat.facing = 1;
    boat.visible = false;
    boat.heave = boat.heaveVelocity = boat.tilt = boat.tiltVelocity = 0;
    boat.popStart = Infinity;
    boatCtx?.clearRect(0, 0, innerWidth, innerHeight);
  }

  function index(x, y) {
    return Math.max(0, Math.min(rows - 1, y)) * cols
      + Math.max(0, Math.min(cols - 1, x));
  }

  function sample(field, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    return field[index(x0, y0)] * (1 - fx) * (1 - fy)
      + field[index(x0 + 1, y0)] * fx * (1 - fy)
      + field[index(x0, y0 + 1)] * (1 - fx) * fy
      + field[index(x0 + 1, y0 + 1)] * fx * fy;
  }

  // Range fragments follow the actual wrapped lines, including inline links.
  function measureTextLines() {
    if (innerWidth <= 650) { textBuckets.clear(); return; }
    const main = document.querySelector('main');
    if (!main) return;
    const fragments = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || node.parentElement.closest('[hidden],script,style')) continue;
      const fontSize = parseFloat(getComputedStyle(node.parentElement).fontSize) || 13;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        const top = rect.top + (rect.height - fontSize) / 2 + fontSize * .12;
        fragments.push({ left: rect.left, right: rect.right, top, bottom: top + fontSize * .9 });
      }
    }
    range.detach();
    fragments.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const fragment of fragments) {
      const line = lines.findLast(candidate => Math.abs(candidate.top - fragment.top) < 2
        && Math.abs(candidate.bottom - fragment.bottom) < 2
        && fragment.left <= candidate.right + 12 && fragment.right >= candidate.left - 12);
      if (line) {
        line.left = Math.min(line.left, fragment.left);
        line.right = Math.max(line.right, fragment.right);
      } else lines.push({ ...fragment });
    }
    textBuckets.clear();
    for (const line of lines) {
      for (let y = Math.floor(line.top / textBucketSize); y <= Math.floor(line.bottom / textBucketSize); y++) {
        for (let x = Math.floor(line.left / textBucketSize); x <= Math.floor(line.right / textBucketSize); x++) {
          const key = `${x},${y}`;
          if (!textBuckets.has(key)) textBuckets.set(key, []);
          textBuckets.get(key).push(line);
        }
      }
    }
  }

  function bounceFromText() {
    if (!textVisible || !textBuckets.size) return;
    const cosine = Math.cos(boat.tilt), sine = Math.sin(boat.tilt);
    for (let pass = 0; pass < 3; pass++) {
      let contact = null;
      for (const [localX, localY, radius] of boatContactPoints) {
        const px = boat.x + localX * boat.facing * cosine - localY * sine;
        const py = boat.y + boat.heave + localX * boat.facing * sine + localY * cosine;
        const candidates = new Set();
        for (let y = Math.floor((py - radius) / textBucketSize); y <= Math.floor((py + radius) / textBucketSize); y++) {
          for (let x = Math.floor((px - radius) / textBucketSize); x <= Math.floor((px + radius) / textBucketSize); x++) {
            for (const line of textBuckets.get(`${x},${y}`) || []) candidates.add(line);
          }
        }
        for (const line of candidates) {
          let dx = px - clamp(px, line.left, line.right);
          let dy = py - clamp(py, line.top, line.bottom);
          let distance = Math.hypot(dx, dy), penetration;
          if (distance >= radius) continue;
          if (distance > .0001) {
            dx /= distance; dy /= distance;
            penetration = radius - distance;
          } else {
            const faces = [
              { distance: px - line.left, x: -1, y: 0 },
              { distance: line.right - px, x: 1, y: 0 },
              { distance: py - line.top, x: 0, y: -1 },
              { distance: line.bottom - py, x: 0, y: 1 },
            ];
            const face = faces.reduce((best, next) => next.distance < best.distance ? next : best);
            dx = face.x; dy = face.y;
            penetration = radius + face.distance;
          }
          if (!contact || penetration > contact.penetration) contact = { dx, dy, penetration };
        }
      }
      if (!contact) break;
      boat.x += contact.dx * (contact.penetration + .5);
      boat.y += contact.dy * (contact.penetration + .5);
      const toward = boat.vx * contact.dx + boat.vy * contact.dy;
      if (toward < 0) {
        boat.vx -= 1.82 * toward * contact.dx;
        boat.vy -= 1.82 * toward * contact.dy;
      }
    }
  }

  // Project several curved wavefronts toward a quiet vanishing line.
  function seaPattern(x, y, time) {
    const depth = (y - rows * .5) / (rows * .5);
    if (depth <= 0) return 0;
    const perspective = .12 + depth;
    const worldX = (x - cols * .5) / (2 + perspective * cols * .12);
    const worldZ = 1 / (depth + .08);
    const swell = Math.sin(worldZ * 3.8 + worldX * 2.1 - time * .5);
    const cross = Math.sin(worldZ * 2.4 - worldX * 1.5 + time * .32);
    const crest = Math.max(0, swell * .68 + cross * .32) ** 3;
    return (.025 + .055 * depth) + .24 * Math.sqrt(depth) * crest;
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const oldWidth = viewportWidth, oldHeight = viewportHeight;
    viewportWidth = innerWidth;
    viewportHeight = innerHeight;
    if (oldWidth && oldHeight) {
      boat.x = clamp(boat.x / oldWidth * innerWidth, 30, innerWidth - 30);
      boat.y = clamp(boat.y / oldHeight * innerHeight, 36, innerHeight - 36);
      setVortexPosition(vortex.x / oldWidth * innerWidth,
        vortex.y / oldHeight * innerHeight);
    } else {
      resetBoat();
      resetVortex();
    }
    if (boatCtx) {
      boatCanvas.width = Math.round(innerWidth * ratio);
      boatCanvas.height = Math.round(innerHeight * ratio);
      boatCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    cols = Math.ceil(innerWidth / cell);
    rows = Math.ceil(innerHeight / cell);
    const size = cols * rows;
    density = new Float32Array(size);
    nextDensity = new Float32Array(size);
    red = new Float32Array(size);
    nextRed = new Float32Array(size);
    blue = new Float32Array(size);
    nextBlue = new Float32Array(size);
    ambientSurface = new Float32Array(size);
    ambientWarm = new Float32Array(size);
    ambientCool = new Float32Array(size);
    flowX = new Float32Array(size);
    nextFlowX = new Float32Array(size);
    flowY = new Float32Array(size);
    nextFlowY = new Float32Array(size);
    twistBloom = 0;
    ambientWaves.length = 0;
    ambientClock = .2;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      density[y * cols + x] = seaPattern(x, y, 0);
    }
  }

  // Dye, density, and momentum all scale with the disturbance strength.
  function stir(x, y, dx, dy, strength = 1, spread = 1, turbulence = 1) {
    const reach = Math.round(6 * strength * spread);
    for (let iy = Math.max(0, Math.floor(y - reach)); iy < Math.min(rows, Math.ceil(y + reach)); iy++) {
      for (let ix = Math.max(0, Math.floor(x - reach)); ix < Math.min(cols, Math.ceil(x + reach)); ix++) {
        const ox = ix - x, oy = iy - y;
        const weight = Math.exp(-(ox * ox + oy * oy) / (11 * strength * spread * spread));
        if (weight < .01) continue;
        const i = iy * cols + ix;
        density[i] = Math.min(1.2, density[i] + weight * .26 * strength);
        red[i] = Math.min(1, red[i] + weight * .55 * strength);
        flowX[i] += (dx * .21 - oy * .075) * weight * strength * turbulence;
        flowY[i] += (dy * .21 + ox * .075) * weight * strength * turbulence;
      }
    }
  }

  // Trace drifting crests over several seconds instead of dropping round pulses.
  function seedSeaNoise() {
    const radius = 2.5 + Math.random() * 9;
    ambientWaves.push({
      x: Math.random() * cols,
      y: Math.random() * rows,
      angle: Math.random() * Math.PI * 2,
      radius, strength: .55 + Math.random() * 1.15,
      aspect: .35 + Math.random() * .55, rotation: .08 + Math.random() * .2,
      age: 0, life: 6 + radius * .25 + Math.random() * 2.5,
      positive: ambientPositive, spiral: Math.random() < .45,
    });
    ambientPositive = !ambientPositive;
  }

  function advanceSeaNoise(dt) {
    ambientSurface.fill(0);
    ambientWarm.fill(0);
    ambientCool.fill(0);
    ambientClock += dt;
    while (ambientClock >= .35) {
      ambientClock -= .35;
      seedSeaNoise();
    }
    for (let n = ambientWaves.length - 1; n >= 0; n--) {
      const wave = ambientWaves[n];
      wave.age += dt;
      if (wave.age >= wave.life) { ambientWaves.splice(n, 1); continue; }
      const envelope = Math.sin(Math.PI * wave.age / wave.life) ** 2;
      const sign = wave.positive ? 1 : -1;
      const transportX = .28 * Math.sin(wave.y * .13 + phase) + sample(flowX, wave.x, wave.y);
      const transportY = .28 * Math.cos(wave.x * .12 - phase) + sample(flowY, wave.x, wave.y);
      wave.x += transportX * .58 * dt * 20;
      wave.y = clamp(wave.y + transportY * .58 * dt * 20, 0, rows - 1);
      const segments = Math.max(20, Math.ceil(wave.radius * 5));
      for (let k = 0; k <= segments; k++) {
        const u = k / segments;
        const angle = wave.angle + sign * wave.age * wave.rotation
          + (wave.spiral ? u * 4.6 : (u - .5) * 2.2);
        const radius = wave.spiral ? .6 + u * wave.radius
          : wave.radius + wave.age * .22;
        const x = wave.x + Math.cos(angle) * radius;
        const y = wave.y + Math.sin(angle) * radius * wave.aspect;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const crest = envelope * Math.sin(Math.PI * u) * wave.strength * dt * 20;
        // Bilinear deposits keep the thin moving curve continuous on the glyph grid.
        for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
          const ix = x0 + ox, iy = y0 + oy;
          if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) continue;
          const weight = crest * (ox ? x - x0 : 1 - x + x0)
            * (oy ? y - y0 : 1 - y + y0);
          const i = iy * cols + ix;
          ambientSurface[i] += weight * .12;
          if (wave.positive) ambientWarm[i] += weight * .16;
          else ambientCool[i] += weight * .16;
          // Leave a faint transported wake while the visible crest stays narrow.
          density[i] = Math.min(1.1, density[i] + weight * .002);
          if (wave.positive) red[i] = Math.min(1, red[i] + weight * .004);
          else blue[i] = Math.min(1, blue[i] + weight * .004);
          flowX[i] += (-Math.sin(angle) * .004 + Math.cos(angle) * sign * .002) * weight;
          flowY[i] += (Math.cos(angle) * .004 + Math.sin(angle) * sign * .002) * weight * wave.aspect;
        }
      }
    }
  }

  // Add the spiral in small increments as the second beat gathers strength.
  function growTwist(amount) {
    amount *= vortexStrength;
    const centerX = vortex.x / cell, centerY = vortex.y / cell;
    const radius = Math.max(7, rows * .43);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const ox = x - centerX, oy = y - centerY;
      const distance = Math.hypot(ox, oy);
      const weight = Math.exp(-distance * distance / (radius * radius * .42));
      if (weight < .012) continue;
      const angle = Math.atan2(oy, ox);
      const arm = Math.pow(Math.max(0, Math.sin(angle * 2.4 - distance * .22)), 2);
      const i = y * cols + x;
      density[i] = Math.min(1.2, density[i] + weight * (.22 + arm * .54) * amount);
      blue[i] = Math.min(1, blue[i] + weight * (.2 + arm * .66) * amount);
      // The entrance curls inward instead of throwing the surface outward.
      flowX[i] += (-oy * .72 - ox * .28) / (distance + 2) * weight * 3.8 * amount;
      flowY[i] += (ox * .72 - oy * .28) / (distance + 2) * weight * 3.8 * amount;
    }
  }

  function drawBoat(dt, time) {
    if (!boatCtx || innerWidth <= 650) return;
    boatCtx.clearRect(0, 0, innerWidth, innerHeight);
    if (!boat.visible) return;

    const x = boat.x / cell, y = boat.y / cell;
    const center = sample(density, x, y);
    const left = sample(density, x - 1.2, y);
    const right = sample(density, x + 1.2, y);
    const above = sample(density, x, y - 1.2);
    const below = sample(density, x, y + 1.2);
    const currentX = sample(flowX, x, y);
    const currentY = sample(flowY, x, y);
    if (dt > 0) {
      // Gather into a circling lane. Splashes still shove the boat away from it.
      const orbitRamp = vortexStart === Infinity ? 0
        : clamp((time - vortexStart) / 520, 0, 1);
      const fromCenterX = boat.x - vortex.x;
      const fromCenterY = boat.y - vortex.y;
      const distance = Math.max(1, Math.hypot(fromCenterX, fromCenterY));
      const orbitReach = Math.min(265, innerHeight * .37, innerWidth * .56);
      const orbit = orbitRamp * clamp((orbitReach - distance) / (orbitReach * .22), 0, 1);
      const radialX = fromCenterX / distance, radialY = fromCenterY / distance;
      const orbitRadius = Math.min(112, innerWidth * .14, innerHeight * .18);
      const eyeRadius = Math.min(24, orbitRadius * .28);
      const radialSpeed = distance < eyeRadius
        ? Math.min(10, (eyeRadius - distance) * .5)
        : -Math.min(52, (distance - eyeRadius) * .22);
      const orbitalSpeed = Math.min(72, Math.max(42, orbitRadius * .65));
      const targetX = radialX * radialSpeed - radialY * orbitalSpeed;
      const targetY = radialY * radialSpeed + radialX * orbitalSpeed;
      boat.vx += ((boat.facing * 12 - boat.vx) * .35 * (1 - orbit)
        + (targetX - boat.vx) * 2 * orbit
        + currentX * (100 - 65 * orbit) - (right - left) * 180) * dt;
      boat.vy += ((Math.sign(boat.vy || 1) * 5 - boat.vy) * .3 * (1 - orbit)
        + (targetY - boat.vy) * 2 * orbit
        + currentY * (90 - 58 * orbit) - (below - above) * 155) * dt;
      boat.vx = clamp(boat.vx, -100, 100);
      boat.vy = clamp(boat.vy, -85, 85);
      const steps = Math.max(1, Math.ceil(Math.hypot(boat.vx, boat.vy) * dt / 3));
      for (let step = 0; step < steps; step++) {
        boat.x += boat.vx * dt / steps;
        boat.y += boat.vy * dt / steps;
        bounceFromText();
      }
      if (boat.x <= 30 || boat.x >= innerWidth - 30) {
        boat.x = clamp(boat.x, 30, innerWidth - 30);
        boat.vx = (boat.x === 30 ? 1 : -1) * Math.max(24, Math.abs(boat.vx) * .82);
      }
      if (boat.y <= 36 || boat.y >= innerHeight - 36) {
        boat.y = clamp(boat.y, 36, innerHeight - 36);
        boat.vy = (boat.y === 36 ? 1 : -1) * Math.max(12, Math.abs(boat.vy) * .82);
      }
      if (boat.vx > 2) boat.facing = 1;
      else if (boat.vx < -2) boat.facing = -1;

      const targetHeave = -Math.min(14, center * 14);
      boat.heaveVelocity = (boat.heaveVelocity + (targetHeave - boat.heave) * 55 * dt)
        * Math.exp(-7 * dt);
      boat.heave += boat.heaveVelocity * dt;
      const targetTilt = clamp((right - left) * .34 + currentY * .04, -.21, .21);
      boat.tiltVelocity = (boat.tiltVelocity + (targetTilt - boat.tilt) * 45 * dt)
        * Math.exp(-7 * dt);
      boat.tilt = clamp(boat.tilt + boat.tiltVelocity * dt, -.21, .21);
    }

    const pop = clamp((time - boat.popStart) / 850, 0, 1);
    const rise = 1 - (1 - pop) ** 3;
    boatCtx.save();
    boatCtx.globalAlpha = Math.min(1, pop * 2.4);
    boatCtx.translate(boat.x, boat.y + boat.heave + (1 - rise) * 28
      - Math.sin(pop * Math.PI) * 20);
    boatCtx.rotate(boat.tilt);
    boatCtx.scale(boat.facing * (.65 + rise * .35), .65 + rise * .35);
    boatCtx.font = '13px Menlo, Monaco, Consolas, monospace';
    boatCtx.textAlign = 'left';
    boatCtx.textBaseline = 'middle';
    boatCtx.fillStyle = 'rgba(235,235,235,.92)';
    const sail = [['  |\\', -12], ['  |_\\', 0]];
    for (const [line, y] of sail) boatCtx.fillText(line, -23, y);
    boatCtx.fillText(' \\___/', -23, 12);
    boatCtx.restore();
  }

  function draw(time) {
    raf = requestAnimationFrame(draw);
    if (time - last < 48) return;
    const dt = Math.min(.07, Math.max(0, (time - last) / 1000));
    last = time;
    advanceSeaNoise(dt);
    phase += .035;
    const t = phase;
    if (time >= vortexAt && vortexStart === Infinity) {
      vortexStart = time;
      if (vortexHandle) {
        vortexHandle.hidden = false;
        vortexHandle.classList.add('visible');
      }
    }
    const vortexAge = time - vortexStart;
    const rampProgress = vortexStart === Infinity ? 0
      : Math.min(1, Math.max(0, vortexAge / 520));
    const vortexRamp = rampProgress * rampProgress * (3 - 2 * rampProgress);
    if (vortexRamp > twistBloom) {
      growTwist(vortexRamp - twistBloom);
      twistBloom = vortexRamp;
    }
    const twistSurge = vortexStart === Infinity ? 0 : Math.exp(-vortexAge / 850);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Existing flow keeps its position; the handle only steers fresh emission.
    const anchorX = vortex.x / cell, anchorY = vortex.y / cell;
    const sourceX = anchorX + cols * .035 * Math.sin(t * 1.25);
    const sourceY = anchorY + rows * .07 * Math.cos(t * 1.05);
    const source2X = anchorX + cols * .05 * Math.cos(t * 1.5);
    const source2Y = anchorY + rows * .06 * Math.sin(t * 1.3);
    const densityDecay = .986;
    const dyeDecay = .92;
    const momentumDecay = .96;

    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const vx = .28 * Math.sin(y * .13 + t) + flowX[i];
      const vy = .28 * Math.cos(x * .12 - t) + flowY[i];
      const backX = x - vx * .58, backY = y - vy * .58;
      const sx = x - sourceX, sy = y - sourceY;
      const sx2 = x - source2X, sy2 = y - source2Y;
      const coreX = x - anchorX, coreY = y - anchorY;
      const radius = Math.hypot(coreX, coreY);
      const arm = Math.max(0, Math.sin(Math.atan2(coreY, coreX) * 2
        - radius * .42 - t * 1.7));
      const source = Math.exp(-(sx * sx + sy * sy) / 12) * .085
        + Math.exp(-(sx2 * sx2 + sy2 * sy2) / 9) * .065
        + Math.exp(-radius * radius / 14) * .025
        + Math.exp(-radius * radius / (rows * rows * .175 * .175))
          * arm * arm * .012;
      const seaSource = seaPattern(x, y, t) * .014;
      const d = Math.min(1.1, sample(density, backX, backY) * densityDecay
        + seaSource + source * vortexRamp * 1.3 * vortexStrength);
      const sourceDye = source * .8;
      const r = Math.min(1, sample(red, backX, backY) * dyeDecay);
      const b = Math.min(1, sample(blue, backX, backY) * dyeDecay
        + sourceDye * vortexRamp * 1.3 * vortexStrength);
      nextDensity[i] = d;
      nextRed[i] = r;
      nextBlue[i] = b;
      const reach = Math.exp(-radius * radius / (rows * rows * .2 * .2))
        * vortexRamp * vortexStrength;
      const localSpin = reach * (.008 + twistSurge * .004);
      const localPull = reach * (.0038 + twistSurge * .0012);
      nextFlowX[i] = sample(flowX, backX, backY) * momentumDecay
        - coreY * localSpin - coreX * localPull;
      nextFlowY[i] = sample(flowY, backX, backY) * momentumDecay
        + coreX * localSpin - coreY * localPull;

      const interference = Math.sin(x * .21 + y * .15 - t * .46)
        * Math.cos(y * .29 - x * .11 + t * .31);
      const texture = .72 + .2 * interference
        + .08 * Math.sin(x * .33 - y * .26 + t * .32);
      const surface = d + ambientSurface[i];
      const warmDye = r + ambientWarm[i], coolDye = b + ambientCool[i];
      const brightness = Math.min(1, surface * 1.08 * texture + Math.max(warmDye, coolDye) * .5);
      const level = Math.min(glyphs.length - 1, Math.floor(brightness * glyphs.length));
      if (level === 0) continue;
      const warm = Math.min(1, warmDye * 1.9), cool = Math.min(1, coolDye * 1.9);
      const tint = Math.min(1, warm + cool);
      const share = warm + cool || 1;
      const redChannel = Math.round(230 + ((210 * warm + 84 * cool) / share - 230) * tint);
      const greenChannel = Math.round(230 + ((48 * warm + 132 * cool) / share - 230) * tint);
      const blueChannel = Math.round(230 + ((48 * warm + 196 * cool) / share - 230) * tint);
      const alpha = Math.min(.88, .2 + surface * .5 + tint * .18);
      ctx.fillStyle = `rgba(${redChannel},${greenChannel},${blueChannel},${alpha.toFixed(2)})`;
      ctx.fillText(glyphs[level], x * cell + cell / 2, y * cell + cell / 2);
    }
    [density, nextDensity] = [nextDensity, density];
    [red, nextRed] = [nextRed, red];
    [blue, nextBlue] = [nextBlue, blue];
    [flowX, nextFlowX] = [nextFlowX, flowX];
    [flowY, nextFlowY] = [nextFlowY, flowY];
    drawBoat(dt, time);
  }

  addEventListener('portfolio:boat-pop', () => {
    boat.visible = true;
    boat.popStart = performance.now();
    const x = boat.x / cell, y = (boat.y + 12) / cell;
    for (let iy = Math.max(0, Math.floor(y - 5)); iy < Math.min(rows, Math.ceil(y + 5)); iy++) {
      for (let ix = Math.max(0, Math.floor(x - 5)); ix < Math.min(cols, Math.ceil(x + 5)); ix++) {
        const ox = ix - x, oy = iy - y;
        const weight = Math.exp(-(ox * ox + oy * oy) / 7);
        const i = iy * cols + ix;
        density[i] = Math.min(1.1, density[i] + weight * .22);
        red[i] = Math.min(1, red[i] + weight * .7);
        flowX[i] += -oy * weight * .055;
        flowY[i] += ox * weight * .055 - weight * .18;
      }
    }
  });
  addEventListener('portfolio:text-start', () => {
    textVisible = true;
    measureTextLines();
  });
  addEventListener('portfolio:intro-text-complete', () => {
    textVisible = true;
    measureTextLines();
    vortexAt = performance.now() + 450;
  });

  addEventListener('portfolio:text-glitch', e => {
    for (const point of e.detail) {
      stir(point.x / cell, point.y / cell,
        Math.sin(point.y * .03) * 2, Math.cos(point.x * .02) * 1.8,
        point.strength * .8, 1.3, 1.65);
    }
  });

  function pointerSplash(x, y, dx, dy, strength) {
    const power = strength * 1.7;
    stir(x, y, dx, dy, power, .52, 1.25);
    if (!boat.visible) return;
    const ox = boat.x / cell - x, oy = boat.y / cell - y;
    const distance = Math.hypot(ox, oy);
    const influence = Math.exp(-distance * distance / (2 * 3.1 * 3.1));
    if (influence < .03) return;
    const impulse = Math.min(28, power * 9) * influence;
    boat.vx = clamp(boat.vx + ox / (distance + .5) * impulse + dx * influence * 2, -100, 100);
    boat.vy = clamp(boat.vy + oy / (distance + .5) * impulse + dy * influence * 2, -85, 85);
  }

  if (vortexHandle) {
    vortexHandle.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragPointerId = event.pointerId;
      dragOffsetX = vortex.x - event.clientX;
      dragOffsetY = vortex.y - event.clientY;
      pointer.seen = false;
      vortexHandle.setPointerCapture(event.pointerId);
      vortexHandle.classList.add('dragging');
    });
    vortexHandle.addEventListener('pointermove', event => {
      if (event.pointerId !== dragPointerId) return;
      event.stopPropagation();
      setVortexPosition(event.clientX + dragOffsetX,
        event.clientY + dragOffsetY);
    });
    const endDrag = event => {
      if (event.pointerId !== dragPointerId) return;
      event.stopPropagation();
      dragPointerId = null;
      pointer.seen = false;
      vortexHandle.classList.remove('dragging');
      if (vortexHandle.hasPointerCapture(event.pointerId))
        vortexHandle.releasePointerCapture(event.pointerId);
    };
    vortexHandle.addEventListener('pointerup', endDrag);
    vortexHandle.addEventListener('pointercancel', endDrag);
    vortexHandle.addEventListener('lostpointercapture', () => {
      dragPointerId = null;
      vortexHandle.classList.remove('dragging');
    });
    vortexHandle.addEventListener('keydown', event => {
      const delta = event.shiftKey ? 54 : 18;
      const step = {
        ArrowLeft: [-delta, 0], ArrowRight: [delta, 0],
        ArrowUp: [0, -delta], ArrowDown: [0, delta],
      }[event.key];
      if (!step) return;
      event.preventDefault();
      setVortexPosition(vortex.x + step[0], vortex.y + step[1]);
    });
  }

  addEventListener('pointermove', e => {
    if (dragPointerId !== null) return;
    const x = e.clientX / cell, y = e.clientY / cell;
    const dx = pointer.seen ? Math.max(-6, Math.min(6, x - pointer.x)) : 0;
    const dy = pointer.seen ? Math.max(-6, Math.min(6, y - pointer.y)) : 0;
    const motion = Math.hypot(dx, dy);
    if (!pointer.seen || motion > .15)
      pointerSplash(x, y, dx, dy, Math.min(1.6, .5 + motion * .25));
    pointer.x = x; pointer.y = y; pointer.seen = true;
  }, { passive: true });
  addEventListener('pointerdown', e => {
    if (dragPointerId === null) pointerSplash(e.clientX / cell, e.clientY / cell, 0, 0, 1.3);
  }, { passive: true });
  addEventListener('pointerleave', () => { pointer.seen = false; });
  addEventListener('resize', () => {
    resize();
    requestAnimationFrame(measureTextLines);
  }, { passive: true });
  addEventListener('scroll', measureTextLines, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(draw);
  });
  resize();
  document.fonts?.ready.then(measureTextLines);
  raf = requestAnimationFrame(draw);
})();

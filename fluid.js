import { Water, PHYSICS_DT, stepBoat } from './water.js';
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
  const glyphs = ' .:-=+*#%@';
  const surfaceCutoff = .2;
  const boatWake = [];
  let wakeClock = 0;
  let cols = 0, rows = 0, water;
  let textSolid;
  let raf = 0, last = null, accumulator = 0, lastRender = -Infinity;
  let ambientClock = 0, ambientWarm = true;
  let textLines = [];
  let vortexAt = Infinity, vortexStart = Infinity;
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
    boat.x = vortex.x;
    boat.y = innerHeight * .42;
    boat.vx = 6;
    boat.vy = 2;
    boat.facing = 1;
    boat.visible = false;
    boat.heave = boat.heaveVelocity = boat.tilt = boat.tiltVelocity = 0;
    boat.popStart = Infinity;
    boatWake.length = 0; wakeClock = 0;
    boatCtx?.clearRect(0, 0, innerWidth, innerHeight);
  }

  // Range fragments follow the actual wrapped lines, including inline links.
  function measureTextLines() {
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
    textLines = lines;
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
    rebuildTextFlow();
  }

  function lineAt(x, y, margin = 0) {
    if (!textVisible) return null;
    for (const line of textBuckets.get(`${Math.floor(x / textBucketSize)},${Math.floor(y / textBucketSize)}`) || []) {
      if (x >= line.left - margin && x <= line.right + margin
        && y >= line.top - margin && y <= line.bottom + margin) return line;
    }
    return null;
  }

  function rebuildTextFlow() {
    if (!water) return;
    textSolid.fill(0);
    // Each text line is a wall on the physics grid, with open gaps between lines.
    for (const line of textLines) {
      const minX = Math.max(0, Math.ceil(line.left / cell - .5));
      const maxX = Math.min(cols - 1, Math.floor(line.right / cell - .5));
      const minY = Math.max(0, Math.ceil(line.top / cell - .5));
      const maxY = Math.min(rows - 1, Math.floor(line.bottom / cell - .5));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        textSolid[y * cols + x] = 1;
      }
    }
    water.setObstacles(textVisible ? textSolid : new Uint8Array(cols * rows));
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
      resetVortex();
      resetBoat();
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
    water = new Water(cols, rows, cell);
    textSolid = new Uint8Array(size);
    rebuildTextFlow();
    // Two small initial swells. Subsequent ambient disturbances are
    // physical impulses, rather than independently drawn moving curves.
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (water.solid[i]) continue;
      water.height[i] = .75 * Math.sin(x * .17 + y * .25)
        + .35 * Math.sin(x * -.24 + y * .14);
    }
    water.closeFaces();
    ambientClock = 0;
    for (let i = 0; i < 3; i++) seedPassiveWave();
    accumulator = 0; last = null;
    boatWake.length = 0; wakeClock = 0;
  }

  function stir(x, y, dx, dy, strength = 1, spread = 1, turbulence = 1) {
    water.splash(x * cell, y * cell, Math.min(4, strength * 1.4),
      Math.max(22, 32 * spread), dx * 10 * turbulence, dy * 10 * turbulence);
  }

  function seedPassiveWave() {
    const x = innerWidth * (.08 + Math.random() * .84);
    const y = innerHeight * (.08 + Math.random() * .84);
    const radius = 28 + Math.random() * 34;
    const angle = Math.random() * Math.PI * 2;
    // Balanced physical crest/trough packets propagate, reflect, and move the
    // hull. Their sparse sources keep the higher blank-cell cutoff meaningful.
    water.splash(x, y, 1.6 + Math.random(), radius,
      Math.cos(angle) * 5, Math.sin(angle) * 5, null);
    const dye = ambientWarm ? water.red : water.blue;
    ambientWarm = !ambientWarm;
    const reach = radius * 2;
    for (let iy = Math.max(0, Math.floor((y - reach) / cell)); iy < Math.min(rows, Math.ceil((y + reach) / cell)); iy++) {
      for (let ix = Math.max(0, Math.floor((x - reach) / cell)); ix < Math.min(cols, Math.ceil((x + reach) / cell)); ix++) {
        const i = iy * cols + ix;
        if (water.solid[i]) continue;
        const distance2 = ((ix + .5) * cell - x) ** 2 + ((iy + .5) * cell - y) ** 2;
        dye[i] = Math.min(1, dye[i] + .25 * Math.exp(-distance2 / (radius * radius)));
      }
    }
  }

  function advanceBoatWake(dt, now) {
    for (let i = boatWake.length - 1; i >= 0; i--) {
      const point = boatWake[i];
      point.age += dt;
      const [vx, vy] = water.velocity(point.x, point.y);
      // Keep a short visible trail while local currents curl its older crests.
      point.x += vx * .28 * dt;
      point.y += vy * .28 * dt;
      const surface = -water.sample(water.height, point.x, point.y) * 3.2;
      point.heave += (surface - point.heave) * (1 - Math.exp(-dt * 3));
      if (point.age >= 1.4 || point.x < 0 || point.x > innerWidth
        || point.y < 0 || point.y > innerHeight
        || lineAt(point.x, point.y + point.heave, 3)) boatWake.splice(i, 1);
    }
    const speed = Math.hypot(boat.vx, boat.vy);
    if (!boat.visible || innerWidth <= 650 || now - boat.popStart < 850 || speed < 8) {
      wakeClock = 0; return;
    }
    wakeClock += dt;
    if (wakeClock < .07) return;
    wakeClock -= .07;
    const cosine = Math.cos(boat.tilt), sine = Math.sin(boat.tilt);
    const sternX = -28 * boat.facing, sternY = 12;
    const x = boat.x + sternX * cosine - sternY * sine;
    const y = boat.y + sternX * sine + sternY * cosine;
    const [vx, vy] = water.velocity(x, y);
    const slip = Math.hypot(boat.vx - vx, boat.vy - vy);
    if (lineAt(x, y + boat.heave, 3)) return;
    boatWake.push({ x, y, heave: boat.heave, age: 0,
      strength: clamp(.3 + speed / 140 + slip / 100, .35, .95) });
  }

  function drawGridWake() {
    // Rasterize the drifting trail onto exactly the same cells as the sea.
    // Merge overlapping samples so each cell contains one white tilde.
    const cells = new Map();
    for (const point of boatWake) {
      const x = Math.floor(point.x / cell), y = Math.floor((point.y + point.heave) / cell);
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const i = y * cols + x;
      if (water.solid[i]) continue;
      const alpha = point.strength * (1 - point.age / 1.4) ** 1.4;
      if (alpha < .025) continue;
      cells.set(i, Math.max(cells.get(i) || 0, alpha));
    }
    boatCtx.save();
    boatCtx.font = '10px Menlo, Monaco, Consolas, monospace';
    boatCtx.textAlign = 'center'; boatCtx.textBaseline = 'middle';
    for (const [i, alpha] of cells) {
      const x = (i % cols + .5) * cell, y = (Math.floor(i / cols) + .5) * cell;
      if (lineAt(x, y, 3)) continue;
      boatCtx.fillStyle = `rgba(235,235,235,${alpha.toFixed(2)})`;
      boatCtx.fillText('~', x, y);
    }
    boatCtx.restore();
  }

  function advancePhysics(dt, now) {
    ambientClock += dt;
    if (ambientClock >= 1.6) {
      ambientClock -= 1.6;
      seedPassiveWave();
    }
    if (now >= vortexAt && vortexStart === Infinity) {
      vortexStart = now;
      if (vortexHandle) {
        vortexHandle.hidden = false;
        vortexHandle.classList.add('visible');
      }
    }
    const ramp = vortexStart === Infinity ? 0 : clamp((now - vortexStart) / 1000, 0, 1);
    water.step(dt, { ...vortex, strength: ramp * ramp * (3 - 2 * ramp),
      reach: Math.min(480, innerHeight * .68) });
    if (boat.visible && innerWidth > 650) {
      stepBoat(boat, water, dt);
      bounceFromText();
      if (boat.x < 30 || boat.x > innerWidth - 30) {
        boat.x = clamp(boat.x, 30, innerWidth - 30); boat.vx *= -.65;
      }
      if (boat.y < 36 || boat.y > innerHeight - 36) {
        boat.y = clamp(boat.y, 36, innerHeight - 36); boat.vy *= -.65;
      }
      if (boat.vx > 3) boat.facing = 1;
      else if (boat.vx < -3) boat.facing = -1;
    } else water.pressure.fill(0);
    advanceBoatWake(dt, now);
  }

  function drawWater() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (water.solid[i]) continue;
      const height = water.height[i];
      const left = water.height[y * cols + Math.max(0, x - 1)];
      const right = water.height[y * cols + Math.min(cols - 1, x + 1)];
      const above = water.height[Math.max(0, y - 1) * cols + x];
      const below = water.height[Math.min(rows - 1, y + 1) * cols + x];
      const slope = Math.hypot(right - left, below - above);
      const warm = water.red[i], cool = water.blue[i], foam = water.foam[i];
      // Crests, troughs, and slopes all come from the same surface the hull reads.
      const light = clamp(.065 + Math.max(0, height) * .14 + slope * .24
        + Math.max(0, -height) * .035 + foam * .4, 0, .95);
      // Reserve the low end for blank cells; dye from active disturbances may
      // still reveal a faint glyph below the surface threshold.
      const visibleLight = clamp((light - surfaceCutoff) / (1 - surfaceCutoff), 0, 1);
      const level = Math.min(glyphs.length - 1, Math.floor(visibleLight * glyphs.length));
      if (!level && warm + cool < .16) continue;
      const tint = Math.min(1, (warm + cool) * 1.6), share = warm + cool || 1;
      const r = Math.round(230 + ((210 * warm + 84 * cool) / share - 230) * tint);
      const g = Math.round(230 + ((48 * warm + 132 * cool) / share - 230) * tint);
      const b = Math.round(230 + ((48 * warm + 196 * cool) / share - 230) * tint);
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(.88, .23 + light * .55 + tint * .2).toFixed(2)})`;
      ctx.fillText(foam > .08 ? '~' : glyphs[Math.max(1, level)], x * cell + cell / 2, y * cell + cell / 2);
    }
  }

  function drawBoat(time) {
    if (!boatCtx) return;
    boatCtx.clearRect(0, 0, innerWidth, innerHeight);
    if (!boat.visible || innerWidth <= 650) return;
    drawGridWake();
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
    if (last === null) last = time;
    accumulator += Math.min(.1, Math.max(0, (time - last) / 1000));
    last = time;
    while (accumulator >= PHYSICS_DT) {
      advancePhysics(PHYSICS_DT, time - accumulator * 1000);
      accumulator -= PHYSICS_DT;
    }
    if (time - lastRender >= 48) { drawWater(); lastRender = time; }
    drawBoat(time);
  }

  addEventListener('portfolio:boat-pop', () => {
    boat.visible = true;
    boat.popStart = performance.now();
    water.splash(boat.x, boat.y + 12, 3, 38, 0, 0, 'red');
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
    stir(x, y, dx, dy, strength, .85, .8);
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
    cancelAnimationFrame(raf);
    last = null; accumulator = 0; pointer.seen = false;
    if (!document.hidden) raf = requestAnimationFrame(draw);
  });
  resize();
  document.fonts?.ready.then(measureTextLines);
  raf = requestAnimationFrame(draw);
})();

import { Entrance } from './intro.js';
import { Terrain } from './terrain.js';
import { Water, PHYSICS_DT, stepBoat, constrainBoat, placeBoat, MOUSE_WAVE } from './water.js';

const scene = document.querySelector('#beach-scene');
const canvas = document.querySelector('#fluid'), boatCanvas = document.querySelector('#boat');
const ctx = canvas?.getContext('2d'), boatCtx = boatCanvas?.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const entrance = new Entrance(document.querySelector('main'), motion.matches);
const boatHandle = document.querySelector('#boat-handle');
const vortexHandle = document.querySelector('#vortex-handle');
const vortex = { x: 0, y: 0, reach: 150, core: 90, strength: 0 };
let dragId = null, boatDragId = null, boatOffsetX = 0, boatOffsetY = 0;
const CELL = 18, PHYSICS_CELL = 12, GLYPHS = ' .:-=+*#%@';
let width, height, minCoast, terrain, water, boat, mobile, raf = 0, last = null, accumulator = 0, lastRender = 0;
const wake = [], pointer = { x: 0, y: 0, time: 0 }, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const noise = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };

function textProfile() {
  const range = document.createRange(), walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT), bands = new Map();
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent.trim()) continue;
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      const top = rect.top + scrollY, bottom = rect.bottom + scrollY, band = Math.floor(top / 36);
      const p = bands.get(band) || { top, bottom, right: 0 };
      p.top = Math.min(p.top, top); p.bottom = Math.max(p.bottom, bottom); p.right = Math.max(p.right, rect.right); bands.set(band, p);
    }
  }
  return [...bands.values()];
}
function resize() {
  const nextMobile = innerWidth <= 900;
  if (width === scene.clientWidth && height === scene.clientHeight && mobile === nextMobile) return;
  width = scene.clientWidth; height = scene.clientHeight; mobile = nextMobile;
  const wasInitialized = Boolean(water);
  if (wasInitialized) { releaseBoatDrag(); entrance.finish(); }
  const ratio = Math.min(devicePixelRatio || 1, 2);
  for (const [c, context] of [[canvas, ctx], [boatCanvas, boatCtx]]) {
    c.width = Math.round(width * ratio); c.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  terrain = new Terrain(width, height, { mobile, profile: mobile ? [] : textProfile() });
  if (!mobile) {
    const edge = [];
    for (let y = height; y > 0; y -= CELL) edge.push(`${Math.max(0, terrain.coastline(y) - 98)}px ${y}px`);
    edge.push(`${Math.max(0, terrain.coastline(0) - 98)}px 0px`);
    scene.style.clipPath = `polygon(100% 0,100% 100%,${edge.join(',')})`;
  } else scene.style.clipPath = 'none';
  minCoast = Math.min(...Array.from({ length: Math.ceil(height / 18) }, (_, y) => terrain.coastline(y * 18)));
  // Omit the permanently elevated inland plateau from the physics domain.
  const originX = Math.max(0, Math.floor((minCoast - 108) / PHYSICS_CELL) * PHYSICS_CELL);
  water = new Water(Math.ceil((width - originX) / PHYSICS_CELL), Math.ceil(height / PHYSICS_CELL), PHYSICS_CELL,
    { terrain, originX, boundaries: 'open' });
  water.initializeSurf();
  const viewHeight = Math.min(height, innerHeight), startY = viewHeight * .34;
  const localShore = terrain.coastline(startY);
  boat = { x: localShore + (width - localShore) * .54, y: startY, vx: 0, vy: 0, facing: 1, headingFlowX: 0, renderFacing: 1,
    heave: 0, heaveVelocity: 0, tilt: 0, tiltVelocity: 0 };
  // Begin at the local current and waterline instead of an imposed launch speed.
  [boat.vx, boat.vy] = water.velocity(boat.x, boat.y + 12);
  boat.heave = -water.sample(water.height, boat.x, boat.y + 12) * 3.2;
  boat.tilt = clamp(-(water.sample(water.height, boat.x + 18, boat.y + 12) - water.sample(water.height, boat.x - 18, boat.y + 12)) / 36 * 3.2, -.28, .28);
  const vortexY = viewHeight * .55, vortexShore = terrain.coastline(vortexY);
  setVortexPosition(vortexShore + (width - vortexShore) * .52, vortexY);
  constrainBoat(boat, water, boatBounds());
  wake.length = 0; last = null; accumulator = 0;
  drawScene(); drawBoat();
}
function boatBounds() {
  const rect = scene.getBoundingClientRect();
  return { minX: 32, maxX: width - 32,
    minY: Math.max(30, -rect.top + 36 - boat.heave),
    maxY: Math.min(height - 30, innerHeight - rect.top - 36 - boat.heave) };
}
function glyph(text, x, y, color) { ctx.fillStyle = color; ctx.fillText(text, x, y); }
function seaColor(light, warm, cool, foam = 0, swirl = 0) {
  const surf = clamp((foam - .15) / .85, 0, 1), gray = 190 + surf * 25;
  const coolTint = clamp(cool * 1.6 + swirl * 1.5, 0, 1), warmTint = clamp(warm * 1.5, 0, 1);
  const channel = (blue, red) => {
    const base = gray + (blue - gray) * coolTint;
    return Math.round(base + (red - base) * warmTint);
  };
  const ambientAlpha = Math.min(.9, .16 + light * .45 + coolTint * .35 + surf * .14 + swirl * .35);
  const alpha = ambientAlpha + (Math.min(.98, .85 + light * .15) - ambientAlpha) * warmTint;
  return `rgba(${channel(70, 245)},${channel(150, 72)},${channel(245, 72)},${alpha})`;
}
function drawScene() {
  ctx.clearRect(0, 0, width, height);
  // Keep the canvas transparent under the HTML text; black comes from CSS.
  // A stepped sand silhouette remains visible even between waves.
  for (let y = 0; y < height; y += CELL) {
    const shore = terrain.coastline(y + CELL / 2);
    ctx.fillStyle = '#080808'; ctx.fillRect(Math.round((shore - 80) / CELL) * CELL, y, 80, CELL);
    ctx.fillStyle = '#000'; ctx.fillRect(Math.round(shore / CELL) * CELL, y, width - shore + CELL, CELL);
  }
  ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let maxRunup = 0;
  for (let y = CELL / 2; y < height; y += CELL) for (let x = Math.max(CELL / 2, Math.floor((minCoast - 90) / CELL) * CELL + CELL / 2); x < width; x += CELL) {
    const d = terrain.distance(x, y), n = noise(x, y);
    const h = water.sample(water.depth, x, y), eta = water.sample(water.height, x, y);
    const foam = water.sample(water.foam, x, y), breaker = water.sample(water.breaking, x, y), wet = water.sample(water.wetSand, x, y);
    if (d < -80) continue;
    // Thin films read as darker wet sand; visible wash is real water depth.
    if (d < 0 && h < .28) {
      ctx.fillStyle = wet > .15 ? '#121212' : '#080808'; ctx.fillRect(x - 9, y - 9, 18, 18);
      if (h > .05 && foam > .1) {
        const color = seaColor(.3 + foam * .35, water.sample(water.disturbance, x, y), 0, foam);
        glyph('~', x, y, color);
        if (breaker > .12 && n > .65) glyph(n > .86 ? "'" : '.', x - 6, y - 11, color);
      }
      continue;
    }
    if (h > .08) {
      if (d < 0) {
        maxRunup = Math.max(maxRunup, -d);
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 9, y - 9, 18, 18);
      }
      // Use the deployed renderer's height/slope lighting and full glyph ramp.
      const slope = Math.hypot(water.sample(water.height, x + 18, y) - water.sample(water.height, x - 18, y),
        water.sample(water.height, x, y + 18) - water.sample(water.height, x, y - 18));
      const swirl = water.sample(water.vortexDye, x, y);
      const freshness = eta > .15 ? Math.exp(-(width - x) / 260) * clamp(eta / 1.2, 0, 1) : 0;
      const light = clamp(freshness * .2 + swirl * .6 + .065 + Math.max(0, eta) * .14 + slope * .24 + Math.max(0, -eta) * .035 + foam * .4, 0, .95);
      const visible = clamp((light - .2) / .8, 0, 1), level = Math.min(GLYPHS.length - 1, Math.floor(visible * GLYPHS.length));
      const pointerTint = water.sample(water.disturbance, x, y);
      // Fresh offshore crests cool to monochrome as they move away from the
      // source. Color reads actual solver crests; it adds no drawn wave shape.
      const warm = pointerTint, cool = freshness * .9;
      if (!level && warm + cool + swirl < .12 && !(d < 25 && h > .28 && foam > .14)) continue;
      const color = seaColor(light, warm, cool, d < 45 ? foam : 0, swirl);
      glyph(foam > .12 ? '~' : GLYPHS[Math.max(1, level)], x, y, color);
      if (breaker > .12 && d < 45 && n > .65) glyph(n > .86 ? "'" : '.', x - 6, y - 11, color);
    }
  }
  canvas.dataset.intro = entrance.elapsed < 2.6 ? 'arriving' : 'complete';
  canvas.dataset.simulationTime = water.time.toFixed(3);
  canvas.dataset.runup = maxRunup.toFixed(1);
  canvas.dataset.motion = motion.matches ? 'static' : document.hidden ? 'paused' : 'running';
}
function drawBoat() {
  boatCtx.clearRect(0, 0, width, height);
  boatCanvas.dataset.x = boat.x.toFixed(3); boatCanvas.dataset.y = boat.y.toFixed(3);
  boatCanvas.dataset.vx = boat.vx.toFixed(3); boatCanvas.dataset.vy = boat.vy.toFixed(3);
  const [flowX, flowY] = water.velocity(boat.x, boat.y + 12);
  boatCanvas.dataset.flowX = flowX.toFixed(3); boatCanvas.dataset.flowY = flowY.toFixed(3);
  boatCanvas.dataset.facing = boat.facing;
  if (boatHandle) {
    const rect = scene.getBoundingClientRect();
    boatHandle.hidden = mobile || entrance.boatProgress < .6;
    boatHandle.style.left = `${rect.left + scrollX + boat.x}px`;
    boatHandle.style.top = `${rect.top + scrollY + boat.y + boat.heave}px`;
    boatCanvas.dataset.dragging = boatDragId !== null ? 'true' : 'false';
    const bounds = boatBounds(); boatCanvas.dataset.minY = bounds.minY.toFixed(3); boatCanvas.dataset.maxY = bounds.maxY.toFixed(3);
  }
  if (mobile) return;
  boatCtx.font = '12px Menlo, Monaco, Consolas, monospace'; boatCtx.textAlign = 'center'; boatCtx.textBaseline = 'middle';
  const cells = new Map();
  for (const p of wake) {
    const x = Math.floor(p.x / CELL), y = Math.floor((p.y + p.heave) / CELL), key = y * Math.ceil(width / CELL) + x;
    if (water.sample(water.depth, p.x, p.y) < 2) continue;
    const alpha = (1 - p.age / 1.4) * p.strength;
    if (!cells.has(key) || cells.get(key).alpha < alpha) cells.set(key, { x, y, alpha });
  }
  for (const p of cells.values()) {
    boatCtx.fillStyle = `rgba(240,240,240,${p.alpha})`; boatCtx.fillText('~', (p.x + .5) * CELL, (p.y + .5) * CELL);
  }
  const arrival = entrance.boatProgress;
  boatCtx.save(); boatCtx.globalAlpha = Math.min(1, arrival * 2);
  boatCtx.translate(boat.x, boat.y + boat.heave + (1 - arrival) * 22 - Math.sin(arrival * Math.PI) * 6); boatCtx.rotate(boat.tilt); boatCtx.scale(boat.renderFacing * (.82 + arrival * .18), .82 + arrival * .18);
  boatCtx.textAlign = 'left'; boatCtx.font = '13px Menlo, Monaco, Consolas, monospace'; boatCtx.fillStyle = '#fff';
  boatCtx.strokeStyle = '#000'; boatCtx.lineWidth = 2.5; boatCtx.lineJoin = 'round';
  for (const [text, y] of [['  |\\', -12], ['  |_\\', 0], [' \\___/', 12]]) {
    boatCtx.strokeText(text, -23, y); boatCtx.fillText(text, -23, y);
  }
  boatCtx.restore();
}
let wakeClock = 0;
function advance(dt) {
  if (entrance.update(dt) && !mobile) water.splash(boat.x, boat.y + 12, 1.8, 34);
  vortex.strength = mobile ? 0 : entrance.vortexProgress;
  if (vortexHandle) {
    vortexHandle.hidden = mobile || motion.matches || entrance.vortexProgress <= .02;
    if (!vortexHandle.hidden) vortexHandle.classList.add('visible');
  }
  water.step(dt, vortex);
  if (!mobile) {
    if (boatDragId === null) stepBoat(boat, water, dt, boatBounds());
    else water.loadHull(boat.x, boat.y + 12, boat.facing, boat.tilt);
    for (let i = wake.length - 1; i >= 0; i--) {
      const p = wake[i], [ux, uy] = water.velocity(p.x, p.y);
      p.age += dt; p.x += ux * .28 * dt; p.y += uy * .28 * dt;
      p.heave += (-water.sample(water.height, p.x, p.y) * 3.2 - p.heave) * (1 - Math.exp(-dt * 3));
      if (p.age >= 1.4) wake.splice(i, 1);
    }
    wakeClock += dt;
    if (wakeClock >= .075 && Math.hypot(boat.vx, boat.vy) > 6) {
      wakeClock = 0;
      const speed = Math.hypot(boat.vx, boat.vy);
      wake.push({ x: boat.x - boat.vx / speed * 28, y: boat.y + 12 - boat.vy / speed * 18, heave: boat.heave, age: 0, strength: .65 });
    }
  }
}
function frame(time) {
  if (motion.matches || document.hidden) return;
  if (last === null) last = time;
  accumulator += Math.min(.08, (time - last) / 1000); last = time;
  while (accumulator >= PHYSICS_DT) { advance(PHYSICS_DT); accumulator -= PHYSICS_DT; }
  if (time - lastRender >= 50) { drawScene(); lastRender = time; }
  drawBoat(); raf = requestAnimationFrame(frame);
}
function resume() {
  if (motion.matches || document.hidden) { releaseBoatDrag(); entrance.finish(); }
  if (vortexHandle) vortexHandle.hidden = mobile || motion.matches || entrance.vortexProgress <= .02;
  cancelAnimationFrame(raf); last = null; accumulator = 0; pointer.time = 0;
  drawScene(); drawBoat();
  if (!motion.matches && !document.hidden) raf = requestAnimationFrame(frame);
}
function stir(e, click = false) {
  if (motion.matches || document.hidden || e.target.closest('a,#vortex-handle,#boat-handle') || dragId !== null || boatDragId !== null) return;
  const rect = canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (x < 0 || x > width || y < 0 || y > height || water.sample(water.depth, x, y) < .15) { pointer.time = 0; return; }
  // Limit gesture energy across high-frequency mouse events. Clicks stay immediate.
  const time = performance.now();
  if (!click && pointer.time && time - pointer.time < 40) return;
  const dx = pointer.time ? clamp((x - pointer.x) / CELL, -6, 6) : 0, dy = pointer.time ? clamp((y - pointer.y) / CELL, -6, 6) : 0;
  const speed = Math.hypot(dx, dy);
  if (click || (pointer.time && speed > .15)) {
    water.splash(x, y, click ? MOUSE_WAVE.maxAmplitude : Math.min(MOUSE_WAVE.maxAmplitude, MOUSE_WAVE.minAmplitude + speed * .12),
      MOUSE_WAVE.radius, dx * MOUSE_WAVE.momentum, dy * MOUSE_WAVE.momentum);
    // Feedback renders on the input event, without waiting for the 20Hz sea draw.
    drawScene();
  }
  Object.assign(pointer, { x, y, time });
}
function setVortexPosition(x, y) {
  // Keep the forcing center offshore; its circulation never targets the boat.
  y = clamp(y, 90, Math.max(90, height - 90));
  const edge = terrain.coastline(y), space = width - edge;
  const minX = Math.min(width - 60, edge + Math.min(145, space * .35));
  vortex.x = clamp(x, minX, width - 60); vortex.y = y;
  const clearance = Math.min(vortex.x - edge, width - vortex.x, vortex.y, height - vortex.y);
  vortex.reach = clamp(clearance * 1.15, 75, 180); vortex.core = clamp(clearance * .38, 45, 75);
  if (vortexHandle) { vortexHandle.style.left = `${vortex.x}px`; vortexHandle.style.top = `${vortex.y}px`; }
}
function releaseBoatDrag() {
  if (boatDragId === null) return;
  const id = boatDragId; boatDragId = null; pointer.time = 0;
  boatHandle.classList.remove('dragging');
  // Use the current's velocity, rather than converting mouse speed to a throw.
  [boat.vx, boat.vy] = water.velocity(boat.x, boat.y + 12);
  if (boatHandle.hasPointerCapture(id)) boatHandle.releasePointerCapture(id);
  drawBoat();
}
if (boatHandle) {
  boatHandle.addEventListener('pointerdown', e => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || dragId !== null) return;
    e.preventDefault(); e.stopPropagation(); entrance.finish();
    const rect = scene.getBoundingClientRect();
    boatOffsetX = boat.x - (e.clientX - rect.left); boatOffsetY = boat.y - (e.clientY - rect.top);
    boatDragId = e.pointerId; pointer.time = 0; boat.vx = boat.vy = 0; boat.bounceTime = 0;
    boatHandle.setPointerCapture(e.pointerId); boatHandle.classList.add('dragging'); drawBoat();
  });
  boatHandle.addEventListener('pointermove', e => {
    if (boatDragId !== e.pointerId) return;
    const rect = scene.getBoundingClientRect();
    if (placeBoat(boat, water, e.clientX - rect.left + boatOffsetX, e.clientY - rect.top + boatOffsetY, boatBounds())) {
      water.loadHull(boat.x, boat.y + 12, boat.facing, boat.tilt);
      wake.length = 0; drawBoat();
    }
  });
  const endBoatDrag = e => { if (boatDragId === e.pointerId) releaseBoatDrag(); };
  boatHandle.addEventListener('pointerup', endBoatDrag); boatHandle.addEventListener('pointercancel', endBoatDrag);
  boatHandle.addEventListener('lostpointercapture', endBoatDrag);
  boatHandle.addEventListener('keydown', e => {
    const step = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }[e.key];
    if (!step) return;
    e.preventDefault(); entrance.finish(); const delta = e.shiftKey ? 36 : 12;
    if (placeBoat(boat, water, boat.x + step[0] * delta, boat.y + step[1] * delta, boatBounds())) {
      [boat.vx, boat.vy] = water.velocity(boat.x, boat.y + 12); drawBoat();
    }
  });
}
if (vortexHandle) {
  vortexHandle.addEventListener('pointerdown', e => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || boatDragId !== null) return;
    e.preventDefault(); dragId = e.pointerId; pointer.time = 0;
    vortexHandle.setPointerCapture(e.pointerId); vortexHandle.classList.add('dragging');
  });
  vortexHandle.addEventListener('pointermove', e => {
    if (dragId !== e.pointerId) return;
    const rect = scene.getBoundingClientRect(); setVortexPosition(e.clientX - rect.left, e.clientY - rect.top);
  });
  const endDrag = e => {
    if (e.pointerId !== dragId) return;
    dragId = null; pointer.time = 0; vortexHandle.classList.remove('dragging');
    if (vortexHandle.hasPointerCapture(e.pointerId)) vortexHandle.releasePointerCapture(e.pointerId);
  };
  vortexHandle.addEventListener('pointerup', endDrag); vortexHandle.addEventListener('pointercancel', endDrag);
  vortexHandle.addEventListener('lostpointercapture', () => { dragId = null; vortexHandle.classList.remove('dragging'); });
  vortexHandle.addEventListener('keydown', e => {
    const step = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] }[e.key];
    if (!step) return;
    e.preventDefault(); const delta = e.shiftKey ? 54 : 18;
    setVortexPosition(vortex.x + step[0] * delta, vortex.y + step[1] * delta);
  });
}
if (ctx && boatCtx) {
  resize(); resume();
  addEventListener('resize', () => { resize(); resume(); }, { passive: true });
  addEventListener('pointermove', e => stir(e), { passive: true });
  addEventListener('pointerdown', e => stir(e, true), { passive: true });
  addEventListener('pointerleave', () => { pointer.time = 0; });
  document.addEventListener('visibilitychange', resume); motion.addEventListener('change', resume);
}

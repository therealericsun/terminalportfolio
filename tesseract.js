import { projectOrientation, rotationPlanes, initialOrientation, advanceOrientation, wrapAngle, sub, cross, unit, illumination, camera } from './tesseract-math.js';
import { generatePolytope } from './polytope.js';
import { createAsciiPalette, asciiColorIndex } from './ascii-theme.js';
import { Entrance } from './intro.js';
import { initAsciiName } from './ascii-name.js';

const canvas = document.querySelector('#tesseract');
const ctx = canvas.getContext('2d', { alpha: false });
const scene = document.querySelector('#tesseract-scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const setNameFontSize = initAsciiName();
const entrance = new Entrance(document.querySelector('.page'), reduced.matches);
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const noise = index => ((index * 73 + 19) % 127) / 127;
const assemblyDuration = 2.6;
const assemblyTempo = 1 / 1.6;
const ramp = ' .,:;!i><+r?/tfx%S&#@';
const faceRamp = ' .,:;+=*';
// The text and simulation share the same CSS color tokens. Interpolate the
// reference's ember → orange → gold → cream ramp using geometric brightness.
const theme = getComputedStyle(document.documentElement);
const background = theme.getPropertyValue('--bg').trim();
const palette = createAsciiPalette(theme);
// Rebase the slider: 1× is the previous 2× rotation rate.
const rotationSpeed = 4;
const orientation = initialOrientation();
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
const initialSeed = randomSeed();
const settings = { speed: 1, depth: 5, detail: .5, edgeWidth: 1, followMouse: true, seed: initialSeed };
let shape = generatePolytope(settings.seed);
const seedInput = document.querySelector('#shape-seed');
seedInput.value = settings.seed;
const followMouseToggle = document.querySelector('#mouse-follow');
const extraPlanes = ['xw', 'yw', 'zw'];
const drawer = document.querySelector('#settings-drawer');
const finishDrawerEntrance = () => drawer.classList.remove('is-entering');
drawer.addEventListener('animationend', finishDrawerEntrance, { once: true });
drawer.addEventListener('focusin', finishDrawerEntrance, { once: true });
if (reduced.matches) finishDrawerEntrance();
else drawer.classList.add('is-entering');
const drawerToggle = document.querySelector('#drawer-toggle');
const drawerContent = document.querySelector('#drawer-content');
const sliders = [...drawer.querySelectorAll('input[type="range"]')];
const autoRotateToggle = document.querySelector('#auto-rotate');
let width = 0, height = 0, cols = 0, rows = 0, cellW = 0, cellH = 0;
let edgeDepth, edgeLight, edgeGlyph, surfaceDepth, surfaceLight, surfaceHatch;
let time = 0, frame = 0, previous = 0, accumulator = 0, activeControl = null;
let assemblyTime = reduced.matches ? assemblyDuration : 0;
let paused = reduced.matches, dragging = null, visible = false;
let lastMouse = null, lastMouseMovement = -Infinity;

function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width; height = bounds.height;
  if (!width || !height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const typography = getComputedStyle(document.body);
  const fontSize = clamp(width / 92, 8, 11);
  canvas.dataset.fontSize = fontSize.toFixed(2);
  setNameFontSize(fontSize);
  ctx.font = `${typography.fontWeight} ${fontSize}px ${typography.fontFamily}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  cellW = ctx.measureText('M').width;
  cellH = fontSize * 1.22;
  cols = Math.floor(width / cellW); rows = Math.floor(height / cellH);
  const size = cols * rows;
  edgeDepth = new Float32Array(size); edgeLight = new Float32Array(size);
  edgeGlyph = new Uint8Array(size);
  surfaceDepth = new Float32Array(size); surfaceLight = new Float32Array(size);
  surfaceHatch = new Uint8Array(size);
  draw();
}
function putEdge(p, light, glyph = 0) {
  const x = Math.floor(p[0]), y = Math.floor(p[1]);
  if (x < 0 || x >= cols || y < 0 || y >= rows) return;
  const i = x + y * cols;
  if (p[2] > edgeDepth[i]) {
    edgeDepth[i] = p[2]; edgeLight[i] = light; edgeGlyph[i] = glyph;
  }
}
// Perspective-correct face rasterizer. Faces are translucent so the internal
// edges remain visible, but nearer struts still occlude farther struts.
function triangle(points, uv, light) {
  const [a, b, c] = points;
  const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(area) < .001) return;
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(cols - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(rows - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + .5, py = y + .5;
    const u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / area;
    const v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / area;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const q = [u / (7.8 - a[2]), v / (7.8 - b[2]), w / (7.8 - c[2])];
    const sum = q[0] + q[1] + q[2], z = 7.8 - 1 / sum;
    const i = x + y * cols;
    if (z <= surfaceDepth[i]) continue;
    const s = (q[0] * uv[0][0] + q[1] * uv[1][0] + q[2] * uv[2][0]) / sum;
    const t = (q[0] * uv[0][1] + q[1] * uv[1][1] + q[2] * uv[2][1]) / sum;
    // A few fine diagonal bands follow each face through the projection.
    // Open space between them keeps the internal structure legible.
    const stripe = (s + t) * 4;
    const hatch = Math.abs(stripe - Math.round(stripe)) < .07;
    surfaceDepth[i] = z;
    surfaceLight[i] = light * (hatch ? .34 : .23);
    surfaceHatch[i] = Number(hatch);
  }
}
function draw() {
  if (!cols || !rows) return;
  edgeDepth.fill(-Infinity); edgeLight.fill(0); edgeGlyph.fill(0);
  surfaceDepth.fill(-Infinity); surfaceLight.fill(0); surfaceHatch.fill(0);
  const assembling = assemblyTime < assemblyDuration;
  // The structure gently unfolds to full size while its vertices connect.
  // This clock advances only while the scene is visible, independently of the
  // faster simulation clock, and is never reset by resizing or font loading.
  const unfold = assembling ? .82 + .18 * smooth(assemblyTime / 1.2) : 1;
  const points = projectOrientation(orientation, settings.depth, shape.vertices).map(p => p.map(v => v * unfold));
  const project = p => camera(p, cols, rows, cellW / cellH, settings.depth);
  const projected = points.map(project);
  if (settings.detail > 0) for (const face of shape.faces) {
    const p = face.map(i => points[i]);
    const normal = unit(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    const center = p[0].map((_, axis) => p.reduce((sum, v) => sum + v[axis], 0) / p.length);
    const light = illumination(normal, center, true);
    triangle(face.map(i => projected[i]), [[0, 0], [1, 0], [.5, 1]], light);
  }
  // Cylindrical struts: radial normals drive Lambert diffuse + Blinn specular.
  // Every sample has actual 3-D depth; crossings do not depend on draw order.
  for (const [index, [a, b]] of shape.edges.entries()) {
    const progress = assembling ? smooth((assemblyTime - .3 - noise(index) * .28) / .85) : 1;
    if (progress === 0) continue;
    const start = points[a], delta = sub(points[b], start), axis = unit(delta);
    const tangent = unit(cross(axis, Math.abs(axis[1]) < .9 ? [0, 1, 0] : [1, 0, 0]));
    const bitangent = cross(axis, tangent);
    const length = Math.hypot(projected[b][0] - projected[a][0], projected[b][1] - projected[a][1]);
    const steps = Math.max(8, Math.ceil(length * 2.2));
    const angle = Math.atan2(projected[b][1] - projected[a][1], (projected[b][0] - projected[a][0]) * cellW / cellH);
    const direction = Math.abs(Math.sin(angle)) < .35 ? 1 : Math.abs(Math.cos(angle)) < .35 ? 2 : Math.sin(angle) * Math.cos(angle) > 0 ? 3 : 4;
    for (let ring = 0; ring < 14; ring++) {
      const theta = ring * Math.PI * 2 / 14;
      const normal = tangent.map((v, i) => v * Math.cos(theta) + bitangent[i] * Math.sin(theta));
      for (let step = 0; step <= steps; step++) {
        const fraction = step / steps;
        const distanceFromEnd = Math.min(fraction, 1 - fraction);
        // Two bright trace heads grow from the endpoints and meet midway.
        if (distanceFromEnd > progress * .5) continue;
        const p = start.map((v, i) => v + delta[i] * fraction + normal[i] * .043 * settings.edgeWidth);
        const trace = assembling && progress < .99 && Math.abs(distanceFromEnd - progress * .5) < .022;
        const light = Math.max(illumination(normal, p), trace ? .98 : 0);
        putEdge(project(p), light, light < .45 ? direction : 0);
      }
    }
  }
  // Spherical joints finish the strut ends and mark the polytope's vertices.
  for (const [index, vertex] of points.entries()) {
    const reveal = assembling ? smooth((assemblyTime - .04 - noise(index) * .22) / .28) : 1;
    if (reveal === 0) continue;
    for (let lat = 1; lat < 8; lat++) for (let lon = 0; lon < 14; lon++) {
      const phi = lat * Math.PI / 8, theta = lon * Math.PI / 7;
      const normal = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      const p = vertex.map((v, i) => v + normal[i] * .061 * settings.edgeWidth);
      const spark = assembling ? (1 - smooth((assemblyTime - .4) / .65)) * reveal : 0;
      putEdge(project(p), Math.max(illumination(normal, p) * reveal, spark));
    }
  }
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  const batches = Array.from({ length: palette.length }, () => []);
  for (let i = 0; i < cols * rows; i++) {
    const hasEdge = edgeDepth[i] !== -Infinity;
    if (!hasEdge && surfaceDepth[i] === -Infinity) continue;
    const x = i % cols, y = Math.floor(i / cols);
    // A little more grain than the dot-only version, with small gaps between
    // the surface characters and continuous, lightly accented hatching.
    if (!hasEdge && (settings.detail === 0 ||
      (!surfaceHatch[i] && (x % 2 * 2 + y % 2) / 4 >= .25 + .75 * settings.detail))) continue;
    const sweepPosition = x / cols * .55 + (1 - y / rows) * .45;
    const sweep = (assemblyTime - .95) / 1.05;
    const faceReveal = assembling ? smooth((sweep - sweepPosition) * 5) : 1;
    // Fixed spatial thresholds reveal characters without random flicker.
    if (!hasEdge && (faceReveal === 0 || faceReveal < noise(i))) continue;
    let light = hasEdge ? edgeLight[i] : surfaceLight[i] * (.55 + .45 * settings.detail / .65);
    if (hasEdge) {
      light *= clamp(.78 + edgeDepth[i] * .085, .46, 1.08);
      if (edgeDepth[i] < surfaceDepth[i] - .09) light *= 1 - .18 * faceReveal * settings.detail / .65;
    }
    let char = hasEdge
      ? light < .32 && edgeGlyph[i] ? ['', '─', '│', '╲', '╱'][edgeGlyph[i]] : ramp[clamp(Math.round(light * (ramp.length - 1)), 1, ramp.length - 1)]
      : faceRamp[clamp(Math.round(light * 17), 1, faceRamp.length - 1)];
    if (assembling && !hasEdge && faceReveal > 0 && faceReveal < 1) {
      const shimmer = Math.max(0, 1 - Math.abs(sweep - sweepPosition - .1) * 13);
      light += shimmer * .12;
      const symbols = '.·:+';
      char = symbols[(i * 11 + Math.floor(assemblyTime * 18)) % symbols.length];
    }
    const color = asciiColorIndex(light, palette.length);
    batches[color].push([char, (i % cols + .5) * cellW, (Math.floor(i / cols) + .5) * cellH]);
  }
  for (let color = 0; color < batches.length; color++) {
    ctx.fillStyle = palette[color];
    for (const [char, x, y] of batches[color]) ctx.fillText(char, x, y);
  }
  canvas.dataset.seed = settings.seed;
  canvas.dataset.vertices = String(shape.vertices.length);
  canvas.dataset.edges = String(shape.edges.length);
  canvas.dataset.faces = String(shape.faces.length);
  canvas.dataset.time = time.toFixed(3);
  canvas.dataset.angles = rotationPlanes.map(plane => (orientation[plane] * 180 / Math.PI).toFixed(1)).join(',');
  canvas.dataset.introTime = assemblyTime.toFixed(3);
  canvas.dataset.intro = !assembling ? 'complete' : assemblyTime < .3 ? 'vertices' : assemblyTime < 1.05 ? 'edges' : 'surfaces';
  canvas.dataset.motion = paused || settings.speed === 0 ? 'paused' : document.hidden || !visible ? 'suspended' : 'running';
  syncControls();
}
function syncControls() {
  for (const slider of sliders) {
    const plane = slider.dataset.plane;
    const value = plane ? orientation[plane] * 180 / Math.PI
      : slider.id === 'rotation-speed' ? settings.speed
      : slider.id === 'projection-depth' ? settings.depth
      : slider.id === 'edge-width' ? settings.edgeWidth : settings.detail * 100;
    slider.value = value.toFixed(1);
    slider.style.setProperty('--fill', `${(value - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100}%`);
    const output = slider.parentElement.querySelector('output');
    const text = plane ? `${Math.round(value)}°`
      : slider.id === 'rotation-speed' || slider.id === 'edge-width' ? `${value.toFixed(1)}×`
      : slider.id === 'projection-depth' ? value.toFixed(1) : `${Math.round(value)}%`;
    output.value = text;
    slider.setAttribute('aria-valuetext', text);
  }
  followMouseToggle.checked = settings.followMouse;
  canvas.classList.toggle('is-following-mouse', settings.followMouse);
  autoRotateToggle.checked = !paused;
}
function tick(now) {
  frame = 0;
  if (document.hidden || (!visible && entrance.finished)) { previous = 0; return; }
  const dt = previous ? Math.min((now - previous) / 1000, .1) : 0;
  previous = now; accumulator += dt;
  if (!entrance.finished) entrance.update(dt);
  const canAnimate = !activeControl && (!dragging || settings.followMouse);
  if (visible && canAnimate) {
    if (!reduced.matches) assemblyTime = Math.min(assemblyDuration, assemblyTime + dt * assemblyTempo);
    if (!paused) {
      const delta = dt * rotationSpeed * settings.speed * smooth((assemblyTime - .5) / 1.3);
      time += delta;
      // Pointer control owns the spatial angles while the fourth dimension keeps turning.
      const pointerTurning = settings.followMouse && (dragging || now - lastMouseMovement < 200);
      advanceOrientation(orientation, delta, pointerTurning ? extraPlanes : rotationPlanes);
    }
  }
  const needsFinalFrame = assemblyTime >= assemblyDuration && canvas.dataset.intro !== 'complete';
  if (visible && (accumulator >= 1 / 30 || needsFinalFrame)) { draw(); accumulator %= 1 / 30; }
  if ((visible && canAnimate && ((!paused && settings.speed > 0) || assemblyTime < assemblyDuration)) || !entrance.finished) frame = requestAnimationFrame(tick);
  else previous = 0;
}
function start() {
  if (!frame && !document.hidden && (visible || !entrance.finished)) frame = requestAnimationFrame(tick);
}
reduced.addEventListener('change', () => {
  paused = reduced.matches; assemblyTime = assemblyDuration;
  entrance.finish(); finishDrawerEntrance(); draw(); start();
});
document.addEventListener('visibilitychange', () => { previous = 0; lastMouse = null; start(); });
function setDrawerOpen(open) {
  finishDrawerEntrance();
  if (!open && drawerContent.contains(document.activeElement)) drawerToggle.focus();
  drawer.classList.toggle('is-open', open);
  drawerToggle.setAttribute('aria-expanded', String(open));
  drawerToggle.querySelector('.drawer-hint').textContent = open ? 'close' : 'open';
  drawerToggle.querySelector('.drawer-arrow').textContent = open ? '↓' : '↑';
  drawerContent.inert = !open;
  drawerContent.setAttribute('aria-hidden', String(!open));
  document.body.style.setProperty('--open-drawer-height', `${drawer.getBoundingClientRect().height}px`);
  document.body.classList.toggle('settings-open', open);
  if (open && matchMedia('(max-width: 900px)').matches) {
    const area = innerHeight - drawer.getBoundingClientRect().height;
    const bounds = scene.getBoundingClientRect();
    window.scrollTo({
      top: Math.max(0, scrollY + bounds.top - Math.max(12, (area - bounds.height) / 2)),
      behavior: reduced.matches ? 'auto' : 'smooth',
    });
  }
}
new ResizeObserver(() => {
  if (drawer.classList.contains('is-open')) document.body.style.setProperty('--open-drawer-height', `${drawer.getBoundingClientRect().height}px`);
}).observe(drawer);
drawerToggle.addEventListener('click', () => setDrawerOpen(!drawer.classList.contains('is-open')));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && drawer.classList.contains('is-open')) setDrawerOpen(false);
});
window.addEventListener('blur', () => {
  activeControl = null; dragging = null; previous = 0; lastMouse = null;
  canvas.classList.remove('is-dragging'); start();
});
for (const slider of sliders) {
  slider.addEventListener('input', () => {
    assemblyTime = assemblyDuration;
    const value = Number(slider.value);
    if (slider.dataset.plane) orientation[slider.dataset.plane] = value * Math.PI / 180;
    else if (slider.id === 'rotation-speed') settings.speed = value;
    else if (slider.id === 'projection-depth') settings.depth = value;
    else if (slider.id === 'edge-width') settings.edgeWidth = value;
    else settings.detail = value / 100;
    draw(); start();
  });
  slider.addEventListener('pointerdown', event => {
    activeControl = slider; assemblyTime = assemblyDuration;
    slider.setPointerCapture(event.pointerId);
  });
  const release = () => { if (activeControl === slider) activeControl = null; previous = 0; start(); };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) slider.addEventListener(event, release);
  slider.addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) {
      activeControl = slider; assemblyTime = assemblyDuration;
    }
  });
  slider.addEventListener('keyup', release);
}
autoRotateToggle.addEventListener('change', () => { paused = !autoRotateToggle.checked; draw(); start(); });
document.querySelector('#rotation-reset').addEventListener('click', () => {
  Object.assign(orientation, initialOrientation());
  Object.assign(settings, { speed: 1, depth: 5, detail: .5, edgeWidth: 1, followMouse: true, seed: initialSeed });
  shape = generatePolytope(settings.seed); seedInput.value = settings.seed;
  lastMouse = null; lastMouseMovement = -Infinity;
  time = 0; assemblyTime = reduced.matches ? assemblyDuration : 0; draw(); start();
});
document.querySelector('#shape-form').addEventListener('submit', event => {
  event.preventDefault();
  const requested = seedInput.value.trim();
  let seed = requested;
  if (!seed || seed === settings.seed) do { seed = randomSeed(); } while (seed === settings.seed);
  settings.seed = seed; shape = generatePolytope(seed); seedInput.value = seed;
  assemblyTime = reduced.matches ? assemblyDuration : 0;
  draw(); start();
});
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  assemblyTime = assemblyDuration;
  dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
});
function turnFromPointer(dx, dy, shift) {
  const sensitivity = settings.followMouse ? .003 : .008;
  const horizontal = shift ? 'xw' : 'xz';
  const vertical = shift ? 'yw' : 'yz';
  orientation[horizontal] = wrapAngle(orientation[horizontal] + dx * sensitivity);
  orientation[vertical] = wrapAngle(orientation[vertical] + dy * sensitivity);
  lastMouseMovement = performance.now();
}
canvas.addEventListener('pointermove', event => {
  if (!dragging || event.pointerId !== dragging.id) return;
  turnFromPointer(event.clientX - dragging.x, event.clientY - dragging.y, event.shiftKey);
  dragging.x = event.clientX; dragging.y = event.clientY; draw();
});
followMouseToggle.addEventListener('change', () => {
  settings.followMouse = followMouseToggle.checked;
  lastMouse = null; lastMouseMovement = -Infinity;
  draw(); start();
});
window.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !event.isPrimary) return;
  const previousMouse = lastMouse;
  lastMouse = { x: event.clientX, y: event.clientY };
  // Keep controls steady while editing, and avoid counting held drags twice.
  if (!settings.followMouse || !previousMouse || dragging || activeControl ||
      event.buttons || drawer.contains(event.target) || !visible || document.hidden) return;
  turnFromPointer(event.clientX - previousMouse.x, event.clientY - previousMouse.y, event.shiftKey);
  if (!frame) draw();
  start();
});
window.addEventListener('pointerout', event => { if (!event.relatedTarget) lastMouse = null; });
function endDrag() { dragging = null; canvas.classList.remove('is-dragging'); start(); }
canvas.addEventListener('lostpointercapture', endDrag);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
new ResizeObserver(resize).observe(canvas);
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; previous = 0; start(); }).observe(scene);
syncControls(); resize(); document.fonts.ready.then(resize); start();
// Name geometry, canvas sizes and entrance states are ready for the first paint.
document.documentElement.classList.remove('is-loading');

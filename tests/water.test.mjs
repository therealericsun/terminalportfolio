import test from 'node:test';
import assert from 'node:assert/strict';
import { Water, PHYSICS_DT, REST_DEPTH, stepBoat } from '../water.js';
const sum = a => a.reduce((s, v) => s + v, 0);
const boatAt = (x, y, vx = 0, vy = 0) => ({ x, y, vx, vy, facing: 1,
  heave: 0, heaveVelocity: 0, tilt: 0, tiltVelocity: 0 });
const advance = (water, steps, vortex) => { for (let i = 0; i < steps; i++) water.step(PHYSICS_DT, vortex); };

test('a splash travels beyond its source while preserving water volume', () => {
  const w = new Water(60, 40);
  w.splash(360, 360, 3, 26);
  const initial = w.sample(w.height, 520, 360), volume = sum(w.height);
  advance(w, 75);
  assert.ok(Math.abs(w.sample(w.height, 520, 360) - initial) > .04);
  assert.ok(Math.abs(sum(w.height) - volume) < .001);
});

test('closed text faces isolate waves and dye and reflect an incident pulse', () => {
  const w = new Water(40, 30), mask = new Uint8Array(1200);
  for (let y = 0; y < 30; y++) mask[y * 40 + 20] = 1;
  w.setObstacles(mask); w.splash(270, 270, 3, 24, 12, 0);
  advance(w, 150);
  let far = 0, near = 0;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) {
    const i = y * 40 + x;
    if (x > 20) far += Math.abs(w.height[i]) + w.red[i];
    if (x < 20) near += Math.abs(w.height[i]);
  }
  assert.equal(far, 0); assert.ok(near > 1);
  for (let y = 0; y < 30; y++) {
    assert.equal(w.u[y * 41 + 20], 0); assert.equal(w.u[y * 41 + 21], 0);
  }
});

test('dye does not change surface height, currents, or buoyancy', () => {
  const plain = new Water(20, 20), colored = new Water(20, 20);
  colored.red.fill(1); colored.blue.fill(.7);
  advance(plain, 120); advance(colored, 120);
  assert.deepEqual(plain.height, colored.height); assert.deepEqual(plain.u, colored.u);
  const a = boatAt(180, 180), b = boatAt(180, 180);
  stepBoat(a, plain, PHYSICS_DT); stepBoat(b, colored, PHYSICS_DT);
  assert.deepEqual(a, b);
});

test('a boat accelerates toward the local current and returns drag momentum', () => {
  const w = new Water(50, 40); w.u.fill(24); w.closeFaces();
  const b = boatAt(360, 300), momentum = sum(w.u);
  stepBoat(b, w, PHYSICS_DT);
  assert.ok(b.vx > 0 && b.vx < 24); assert.ok(Math.abs(b.vy) < 1e-6);
  assert.ok(sum(w.u) < momentum);
  assert.ok(w.pressure.some(v => v > .1));
});

test('a matching current leaves no drag foam; relative motion does', () => {
  const w = new Water(50, 40); w.u.fill(24); w.closeFaces();
  stepBoat(boatAt(360, 300, 24), w, PHYSICS_DT);
  assert.equal(sum(w.foam), 0);
  stepBoat(boatAt(360, 300, -24), w, PHYSICS_DT);
  assert.ok(sum(w.foam) > 0);
});

test('a moving hull launches waves into the surrounding surface', () => {
  const w = new Water(60, 40), b = boatAt(360, 300, 60);
  for (let i = 0; i < 120; i++) { w.step(PHYSICS_DT); stepBoat(b, w, PHYSICS_DT); }
  assert.ok(w.height.some(v => v > .03)); assert.ok(w.height.some(v => v < -.1));
  assert.ok(Math.abs(b.heave) > .1);
});

test('vortex forcing has no radial attraction and cannot target a boat', () => {
  const w = new Water(60, 40), vortex = { x: 600, y: 360, strength: 1, reach: 300 };
  const [fx, fy] = w.vortexForce(720, 430, 0, 0, vortex);
  assert.ok(Math.abs(fx * 120 + fy * 70) < 1e-8);
  assert.ok(-fx * 70 + fy * 120 > 0);
  const b = boatAt(360, 300); stepBoat(b, w, PHYSICS_DT);
  assert.equal(b.vx, 0); assert.equal(b.vy, 0);
});

test('60 seconds of vortex, hull motion, and repeated splashes remain finite', () => {
  const w = new Water(60, 40), b = boatAt(540, 350, 12);
  for (let i = 0; i < 3600; i++) {
    if (i % 15 === 0) w.splash(420 + 110 * Math.sin(i), 300 + 100 * Math.cos(i), 3, 30, 20, -12);
    w.step(PHYSICS_DT, { x: 700 + 100 * Math.sin(i / 400), y: 360, strength: 1, reach: 300 });
    stepBoat(b, w, PHYSICS_DT);
    b.x = Math.max(40, Math.min(1040, b.x)); b.y = Math.max(40, Math.min(680, b.y));
  }
  assert.ok([...w.height, ...w.u, ...w.v, ...Object.values(b)].every(Number.isFinite));
  assert.ok(Math.min(...w.height) > -REST_DEPTH);
  assert.ok(Math.max(...w.height) < 15);
});

test('a distant splash reaches the boat after a propagation delay', () => {
  const w = new Water(60, 40), b = boatAt(620, 350);
  w.splash(360, 362, 3, 24);
  stepBoat(b, w, PHYSICS_DT);
  assert.ok(Math.abs(b.vx) + Math.abs(b.vy) < .001);
  // Measure the passing wave, rather than one arbitrary phase after its crest.
  // Hold hull pressure disabled to isolate the incoming disturbance.
  let peakHeave = 0, peakSpeed = 0;
  for (let i = 0; i < 140; i++) {
    w.pressure.fill(0); w.step(PHYSICS_DT); stepBoat(b, w, PHYSICS_DT);
    peakHeave = Math.max(peakHeave, Math.abs(b.heave));
    peakSpeed = Math.max(peakSpeed, Math.hypot(b.vx, b.vy));
  }
  assert.ok(peakHeave > .01);
  assert.ok(peakSpeed > .01);
});

test('overlapping impulses retain positive depth without adding water volume', () => {
  const w = new Water(40, 30), initial = sum(w.height);
  for (let i = 0; i < 100; i++) w.splash(330, 270, 4, 28);
  assert.ok(Math.min(...w.height) > -REST_DEPTH);
  assert.ok(Math.abs(sum(w.height) - initial) < .001);
  advance(w, 600);
  assert.ok(w.height.every(Number.isFinite));
});

test('rapid pointer forcing stays finite and preserves positive water depth', () => {
  const w = new Water(50, 40);
  for (let i = 0; i < 600; i++) {
    for (let j = 0; j < 10; j++) w.splash(450, 350, 3, 27, 48, 48);
    w.step(PHYSICS_DT);
  }
  assert.ok([...w.height, ...w.u, ...w.v].every(Number.isFinite));
  assert.ok(Math.min(...w.height) > -REST_DEPTH);
});

test('the boat reverses promptly with an opposing current rather than coasting', () => {
  const w = new Water(80, 50), b = boatAt(720, 400, 60);
  for (let i = 0; i < 30; i++) {
    w.u.fill(-30); w.height.fill(0); w.pressure.fill(0);
    stepBoat(b, w, PHYSICS_DT);
  }
  assert.ok(b.vx < 0, 'the boat should reverse within half a second');
  for (let i = 0; i < 42; i++) {
    w.u.fill(-30); w.height.fill(0); w.pressure.fill(0);
    stepBoat(b, w, PHYSICS_DT);
  }
  assert.ok(Math.abs(b.vx + 30) < 3, 'the boat should approach the new current speed');
});

test('a traveling wave transfers most of its horizontal motion to the hull', () => {
  const w = new Water(100, 60), b = boatAt(720, 438);
  const c = Math.sqrt(900 * REST_DEPTH), k = 2 * Math.PI / 144;
  let peakWater = 0, peakBoat = 0;
  for (let n = 0; n < 360; n++) {
    const t = n * PHYSICS_DT;
    for (let y = 0; y < w.rows; y++) for (let x = 0; x < w.cols; x++) {
      w.height[y * w.cols + x] = 1.5 * Math.cos(k * (x + .5) * w.cell - c * k * t);
    }
    for (let y = 0; y < w.rows; y++) for (let x = 0; x <= w.cols; x++) {
      w.u[y * (w.cols + 1) + x] = 1.5 * c / REST_DEPTH * Math.cos(k * x * w.cell - c * k * t);
    }
    w.pressure.fill(0); stepBoat(b, w, PHYSICS_DT);
    if (n > 180) {
      peakWater = Math.max(peakWater, Math.abs(w.velocity(b.x, b.y + 12)[0]));
      peakBoat = Math.max(peakBoat, Math.abs(b.vx));
    }
  }
  assert.ok(peakBoat > peakWater * .7);
  assert.ok(peakBoat < peakWater * 1.2, 'wave response should not run away');
});

test('the hull follows a curved vortex current without inertial escape', () => {
  const w = new Water(100, 60), b = boatAt(950, 450);
  const vortex = { x: 1050, y: 450, strength: 1, reach: 480 };
  advance(w, 600, vortex);
  [b.vx, b.vy] = w.velocity(b.x, b.y + 12);
  const radius = Math.hypot(b.x - vortex.x, b.y - vortex.y);
  for (let i = 0; i < 600; i++) { w.step(PHYSICS_DT, vortex); stepBoat(b, w, PHYSICS_DT); }
  const finalRadius = Math.hypot(b.x - vortex.x, b.y - vortex.y);
  assert.ok(Math.abs(finalRadius - radius) < 15);
  assert.ok(Math.hypot(b.vx, b.vy) > 40);
});

test('an equilibrated hull depression does not propel its own boat', () => {
  const w = new Water(50, 40), b = boatAt(360, 300);
  w.loadHull(b.x, b.y + 12, b.facing, b.tilt);
  for (let i = 0; i < w.height.length; i++) w.height[i] = -w.pressure[i];
  stepBoat(b, w, PHYSICS_DT);
  assert.equal(b.vx, 0); assert.equal(b.vy, 0);
});

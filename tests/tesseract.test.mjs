import test from 'node:test';
import assert from 'node:assert/strict';
import { vertices, edges, faces, rotate, projectVertices, camera, illumination } from '../tesseract-math.js';

test('tesseract topology has 16 vertices, 32 edges and 24 square faces', () => {
  assert.equal(new Set(vertices.map(v => v.join(','))).size, 16);
  assert.equal(edges.length, 32);
  assert.equal(faces.length, 24);
  assert.equal(new Set(edges.map(e => [...e].sort((a,b) => a-b).join(','))).size, 32);
  assert.equal(new Set(faces.map(f => [...f].sort((a,b) => a-b).join(','))).size, 24);
  for (const i of vertices.keys()) assert.equal(edges.filter(e => e.includes(i)).length, 4);
  for (const [a, b] of edges) {
    assert.equal(vertices[a].filter((x, axis) => x !== vertices[b][axis]).length, 1);
    // Exactly three square faces meet at each edge of a tesseract.
    assert.equal(faces.filter(f => f.includes(a) && f.includes(b)).length, 3);
  }
  for (const f of faces) for (let i = 0; i < 4; i++) {
    assert.ok(edges.some(e => e.includes(f[i]) && e.includes(f[(i + 1) % 4])));
  }
});

test('four-dimensional rotations preserve lengths and are reversible', () => {
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    for (const vertex of vertices) {
      const turned = rotate(vertex, a, b, 1.234);
      assert.ok(Math.abs(Math.hypot(...turned) - 2) < 1e-12);
      const restored = rotate(turned, a, b, -1.234);
      restored.forEach((x, i) => assert.ok(Math.abs(x - vertex[i]) < 1e-12));
    }
  }
});

test('ten minutes of rotation stay finite and inside wide, square and tall canvases', () => {
  for (let t = 0; t < 600; t += .25) for (const p of projectVertices(t)) {
    assert.ok(p.every(Number.isFinite));
    for (const [cols, rows] of [[150, 75], [100, 90], [180, 45]]) {
      const q = camera(p, cols, rows, .5);
      assert.ok(q[0] > 1 && q[0] < cols - 1 && q[1] > 1 && q[1] < rows - 1, `clipping at ${t}`);
    }
  }
});

test('a fixed directional light distinguishes lit and unlit normals', () => {
  assert.ok(illumination([-3, -4, 6], [0, 0, 0]) > illumination([3, 4, -6], [0, 0, 0]) + .5);
  for (const normal of [[0,0,1], [0,0,-1], [1,0,0], [0,1,0]]) {
    const light = illumination(normal, [1, 1, 1]);
    assert.ok(light >= .12 && light <= 1);
  }
  assert.equal(illumination([0,0,1], [0,0,0], true), illumination([0,0,-1], [0,0,0], true));
});

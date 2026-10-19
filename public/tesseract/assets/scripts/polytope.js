// Small seeded convex polytopes in genuine four-dimensional space.
// Enumerating supporting tetrahedra is inexpensive for these 12–16 vertices.
export const defaultSeed = '1729';
function randomFor(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.codePointAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const determinant = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1])
  - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
function normal4(a, b, c) {
  const normal = [0, 1, 2, 3].map(axis => (axis % 2 ? -1 : 1) * determinant(
    a.filter((_, i) => i !== axis), b.filter((_, i) => i !== axis), c.filter((_, i) => i !== axis)));
  const length = Math.hypot(...normal);
  return length < 1e-12 ? null : normal.map(v => v / length);
}
export function generatePolytope(seed = defaultSeed) {
  const random = randomFor(seed), count = 12 + Math.floor(random() * 5);
  const stretch = Array.from({ length: 4 }, () => .72 + random() * .28);
  let vertices = Array.from({ length: count }, () => {
    const point = [];
    for (let pair = 0; pair < 2; pair++) {
      const radius = Math.sqrt(-2 * Math.log(1 - random())), angle = random() * Math.PI * 2;
      point.push(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    const length = Math.hypot(...point);
    return point.map((v, axis) => v / length * stretch[axis]);
  });
  const center = stretch.map((_, axis) => vertices.reduce((sum, p) => sum + p[axis], 0) / count);
  vertices = vertices.map(p => subtract(p, center));
  const radius = Math.max(...vertices.map(p => Math.hypot(...p)));
  vertices = vertices.map(p => p.map(v => v * 2 / radius));
  const cells = [];
  for (let a = 0; a < count - 3; a++) for (let b = a + 1; b < count - 2; b++)
    for (let c = b + 1; c < count - 1; c++) for (let d = c + 1; d < count; d++) {
      const normal = normal4(subtract(vertices[b], vertices[a]), subtract(vertices[c], vertices[a]), subtract(vertices[d], vertices[a]));
      if (!normal) continue;
      let positive = false, negative = false;
      for (let i = 0; i < count; i++) {
        const side = dot(normal, subtract(vertices[i], vertices[a]));
        positive ||= side > 1e-9; negative ||= side < -1e-9;
        if (positive && negative) break;
      }
      // A supporting hyperplane leaves the entire shape on one side.
      if (!(positive && negative)) cells.push([a, b, c, d]);
    }
  const faceMap = new Map(), edgeMap = new Map();
  for (const cell of cells) for (let omit = 0; omit < 4; omit++) {
    const face = cell.filter((_, i) => i !== omit);
    faceMap.set(face.join(','), face);
    for (let a = 0; a < 2; a++) for (let b = a + 1; b < 3; b++) {
      const edge = [face[a], face[b]];
      edgeMap.set(edge.join(','), edge);
    }
  }
  return { vertices, edges: [...edgeMap.values()], faces: [...faceMap.values()], cells };
}

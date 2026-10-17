// One vertex for each sign combination of four coordinates.
export const vertices = Array.from({ length: 16 }, (_, i) =>
  Array.from({ length: 4 }, (_, axis) => i & (1 << axis) ? 1 : -1));
export const edges = vertices.flatMap((_, i) =>
  [0, 1, 2, 3].filter(axis => !(i & (1 << axis))).map(axis => [i, i | (1 << axis)]));
export const faces = [];
for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
  for (let i = 0; i < 16; i++) if (!(i & (1 << a)) && !(i & (1 << b))) {
    faces.push([i, i | (1 << a), i | (1 << a) | (1 << b), i | (1 << b)]);
  }
}
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = v => { const length = Math.hypot(...v) || 1; return v.map(x => x / length); };
export function rotate(point, a, b, angle) {
  const result = [...point], c = Math.cos(angle), s = Math.sin(angle);
  result[a] = point[a] * c - point[b] * s;
  result[b] = point[a] * s + point[b] * c;
  return result;
}
export function projectVertices(time, yaw = 0, pitch = 0) {
  return vertices.map(vertex => {
    let p = rotate(vertex, 0, 3, time * .12);
    p = rotate(p, 1, 3, time * .07);
    p = rotate(p, 2, 3, time * .05);
    // The 4-D eye stays outside the radius-2 hypersphere.
    const scale = 3.8 / (3.8 - p[3]);
    p = p.slice(0, 3).map(v => v * scale);
    p = rotate(p, 0, 2, time * .08 + .46 + yaw);
    return rotate(p, 1, 2, .36 + Math.sin(time * .11) * .13 + pitch);
  });
}
const light = unit([-3, -4, 6]);
export function illumination(normal, position, twoSided = false) {
  const eye = unit(sub([0, 0, 8], position));
  let n = unit(normal);
  if (twoSided && dot(n, eye) < 0) n = n.map(v => -v);
  const diffuse = Math.max(0, dot(n, light));
  const half = unit(light.map((v, i) => v + eye[i]));
  const specular = Math.pow(Math.max(0, dot(n, half)), 28);
  return Math.min(1, .12 + .7 * diffuse + .35 * specular);
}
export function camera(point, width, height, cellAspect) {
  const perspective = 7.8 / (7.8 - point[2]);
  // A fixed scale avoids breathing as the tesseract turns.
  const scale = Math.min(width * cellAspect, height) / 5.2;
  return [width / 2 + point[0] * perspective * scale / cellAspect,
    height / 2 + point[1] * perspective * scale, point[2]];
}

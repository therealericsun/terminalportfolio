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
  return projectOrientation({ xy: 0, xz: time * .08 + .46 + yaw,
    yz: .36 + Math.sin(time * .11) * .13 + pitch,
    xw: time * .12, yw: time * .07, zw: time * .05 });
}
export const rotationPlanes = ['xy', 'xz', 'yz', 'xw', 'yw', 'zw'];
export const initialOrientation = () => ({ xy: 0, xz: .46, yz: .36, xw: 0, yw: 0, zw: 0 });
export const wrapAngle = angle => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
export function advanceOrientation(orientation, dt, planes = rotationPlanes) {
  const rates = { xy: .025, xz: .08, yz: .02, xw: .12, yw: .07, zw: .05 };
  for (const plane of planes) orientation[plane] = wrapAngle(orientation[plane] + dt * rates[plane]);
}
export function projectOrientation(orientation, distance = 3.8) {
  return vertices.map(vertex => {
    let p = rotate(vertex, 0, 3, orientation.xw);
    p = rotate(p, 1, 3, orientation.yw);
    p = rotate(p, 2, 3, orientation.zw);
    // The 4-D eye stays outside the radius-2 hypersphere.
    const scale = distance / (distance - p[3]);
    p = p.slice(0, 3).map(v => v * scale);
    p = rotate(p, 0, 1, orientation.xy);
    p = rotate(p, 0, 2, orientation.xz);
    return rotate(p, 1, 2, orientation.yz);
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
const screenRadiusFor = distance => {
  const radius = 2 * distance / Math.sqrt(distance * distance - 4);
  return 7.8 * radius / Math.sqrt(7.8 * 7.8 - radius * radius);
};
const projectionFits = new Map([[3.8, 1]]);
export function camera(point, width, height, cellAspect, distance = 3.8) {
  const perspective = 7.8 / (7.8 - point[2]);
  // A fixed scale avoids breathing as the tesseract turns.
  // Changing 4-D perspective changes the nested cubes' proportions. Compensate
  // for their bounding sphere so every slider combination stays in frame.
  if (!projectionFits.has(distance)) projectionFits.set(distance, screenRadiusFor(3.8) / screenRadiusFor(distance));
  const fit = projectionFits.get(distance);
  const scale = Math.min(width * cellAspect, height) / 5.8 * fit;
  return [width / 2 + point[0] * perspective * scale / cellAspect,
    height / 2 + point[1] * perspective * scale, point[2]];
}

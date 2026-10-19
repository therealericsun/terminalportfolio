import { createAsciiPalette, asciiColorIndex } from './ascii-theme.js';

// Render the name with the same small monospace glyphs as the simulation.
// A raster text mask supplies the silhouette; its bevel and offset extrusion
// supply the character density, retaining an accessible HTML heading.
export function initAsciiName() {
  const canvas = document.querySelector('#ascii-name-canvas');
  if (!canvas) return () => {};
  const heading = canvas.closest('h1');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  canvas.hidden = false;
  heading.classList.add('name-ready');
  const mask = document.createElement('canvas');
  const ink = mask.getContext('2d', { willReadFrequently: true });
  const palette = createAsciiPalette();
  const glyphs = ' .,:;=+x%#@';
  let glyphSize = 8;
  function draw() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const typography = getComputedStyle(document.body);
    const theme = getComputedStyle(document.documentElement);
    const ember = theme.getPropertyValue('--scene-ember').trim();
    mask.width = Math.ceil(width); mask.height = Math.ceil(height);
    const size = height * 1.12;
    ink.font = `800 ${size}px ${typography.fontFamily}`;
    ink.fillStyle = '#fff'; ink.textBaseline = 'alphabetic';
    // Fit the letter shapes horizontally without shrinking their height or
    // the shared ASCII glyph size on narrow screens.
    const metrics = ink.measureText('ERIC SUN');
    const fit = Math.min(1, (width - 12) / metrics.width);
    const capHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const baseline = (height - capHeight - 6) / 2 + metrics.actualBoundingBoxAscent;
    ink.save(); ink.scale(fit, 1);
    ink.fillText('ERIC', 0, baseline);
    const wordGap = ink.measureText(' ').width * .8;
    ink.fillText('SUN', ink.measureText('ERIC').width + wordGap, baseline);
    ink.restore();
    const pixels = ink.getImageData(0, 0, mask.width, mask.height).data;
    const sample = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      return x < 0 || y < 0 || x >= mask.width || y >= mask.height ? 0 : pixels[(x + y * mask.width) * 4 + 3] / 255;
    };
    const fontSize = glyphSize;
    ctx.font = `400 ${fontSize}px ${typography.fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cellW = ctx.measureText('M').width, cellH = fontSize * 1.22;
    canvas.dataset.fontSize = fontSize.toFixed(2);
    for (let y = cellH / 2; y < height; y += cellH) for (let x = cellW / 2; x < width; x += cellW) {
      const coverage = (sample(x, y) + sample(x - 1, y - 1) + sample(x + 1, y + 1)) / 3;
      const shadow = sample(x - cellW, y - cellH * .65);
      if (coverage < .08 && shadow < .1) continue;
      if (coverage < .08) {
        ctx.fillStyle = ember;
        ctx.fillText(':', x, y);
        continue;
      }
      const bevel = (sample(x + cellW, y) - sample(x - cellW, y)
        + sample(x, y + cellH * .65) - sample(x, y - cellH * .65)) * .12;
      const grain = (Math.floor(x / cellW) * 17 + Math.floor(y / cellH) * 29) % 11 / 11;
      const light = Math.max(.2, Math.min(1, .66 + bevel + grain * .16 - y / height * .12));
      const char = glyphs[Math.max(1, Math.round(light * coverage * (glyphs.length - 1)))];
      // The same ramp and light direction as the rendered struts: orange fronts,
      // gold/cream bevels facing upper-left, and ember on the offset extrusion.
      const tone = .39 + bevel * 1.4 + grain * .025 - y / height * .035;
      ctx.fillStyle = palette[asciiColorIndex(tone, palette.length)];
      ctx.fillText(char, x, y);
    }
    document.dispatchEvent(new CustomEvent('crt:frame', { detail:{ graphics:true } }));
  }
  new ResizeObserver(draw).observe(canvas);
  document.fonts.ready.then(draw);
  draw();
  return fontSize => {
    if (glyphSize === fontSize) return;
    glyphSize = fontSize; draw();
  };
}

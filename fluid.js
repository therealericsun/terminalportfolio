// Textmode fluid: grayscale ambient flow, with configurable color disturbances that cool to gray.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const controls = document.querySelector('.fluid-controls');
  const toggle = document.querySelector('#fluid-toggle');
  const reset = document.querySelector('#fluid-reset');
  const speedInput = document.querySelector('#fluid-speed');
  const stirInput = document.querySelector('#fluid-stir');
  const paletteToggle = document.querySelector('#fluid-palette-toggle');
  const palette = document.querySelector('#fluid-palette');
  const hexOutput = document.querySelector('#fluid-hex');
  const canvas = document.querySelector('#fluid');
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!ctx) {
    if (controls) controls.hidden = true;
    return;
  }

  const cell = 18;
  const glyphs = ' .:-=+*#%@';
  let cols = 0, rows = 0, density, nextDensity, red, nextRed;
  let flowX, nextFlowX, flowY, nextFlowY, phase = 0, raf = 0, last = 0;
  let paused = false;
  let flowSpeed = 1, stirPower = 1;
  let vortexPulseAt = performance.now() + 140, vortexPulsePending = true;
  let dyeRgb = [210, 48, 48];
  const pointer = { x: -100, y: -100, seen: false };

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

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
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
    flowX = new Float32Array(size);
    nextFlowX = new Float32Array(size);
    flowY = new Float32Array(size);
    nextFlowY = new Float32Array(size);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const dx = x - cols * .76, dy = y - rows * .49;
      const dx2 = x - cols * .56, dy2 = y - rows * .68;
      const ring = Math.abs(Math.hypot(dx * 1.05, dy * .9) - rows * .26);
      const innerRing = Math.abs(Math.hypot(dx2 * .9, dy2 * 1.2) - rows * .18);
      const sweep = y - rows * (.61 + .11 * Math.sin(x * .17));
      const gate = Math.max(0, Math.min(1, (x - cols * .35) / (cols * .2)));
      density[y * cols + x] = Math.min(.8,
        .48 * Math.exp(-ring * ring * .1)
        + .34 * Math.exp(-innerRing * innerRing * .16)
        + .18 * gate * Math.exp(-sweep * sweep * .38));
    }
  }

  // Dye, density, and momentum all scale with the disturbance strength.
  function stir(x, y, dx, dy, strength = 1, spread = 1, turbulence = 1) {
    strength *= stirPower;
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

  function draw(time) {
    if (!paused) raf = requestAnimationFrame(draw);
    if (time - last < 48) return;
    last = time;
    if (!paused) phase += .035 * flowSpeed;
    const t = phase;
    if (vortexPulsePending && time >= vortexPulseAt) {
      vortexPulsePending = false;
      stir(cols * .72, rows * .6, 2.4, -2, 1.65, 1.5, 2.1);
    }
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.font = '15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const c1x = cols * (.72 + .06 * Math.sin(t * .27));
    const c1y = rows * (.48 + .12 * Math.cos(t * .31));
    const c2x = cols * (.82 + .07 * Math.cos(t * .23));
    const c2y = rows * (.37 + .16 * Math.sin(t * .29));
    const c3x = cols * (.55 + .035 * Math.sin(t * .37));
    const c3y = rows * (.66 + .08 * Math.cos(t * .28));
    const sourceX = cols * (.7 + .08 * Math.sin(t * .54));
    const sourceY = rows * (.51 + .19 * Math.cos(t * .41));
    const source2X = cols * (.86 + .055 * Math.cos(t * .61));
    const source2Y = rows * (.57 + .14 * Math.sin(t * .5));
    const densityDecay = Math.pow(.986, flowSpeed);
    const dyeDecay = Math.pow(.92, flowSpeed);
    const momentumDecay = Math.pow(.92, flowSpeed);

    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const ax = x - c1x, ay = y - c1y;
      const bx = x - c2x, by = y - c2y;
      const cx = x - c3x, cy = y - c3y;
      const af = .065 * Math.exp(-(ax * ax + ay * ay) / (rows * rows * .38 * .38));
      const bf = -.085 * Math.exp(-(bx * bx + by * by) / (rows * rows * .3 * .3));
      const cf = .052 * Math.exp(-(cx * cx + cy * cy) / (rows * rows * .34 * .34));
      const vx = -ay * af - by * bf - cy * cf + .28 * Math.sin(y * .13 + t) + flowX[i];
      const vy = ax * af + bx * bf + cx * cf + .28 * Math.cos(x * .12 - t) + flowY[i];
      const backX = x - vx * .58 * flowSpeed, backY = y - vy * .58 * flowSpeed;
      const sx = x - sourceX, sy = y - sourceY;
      const sx2 = x - source2X, sy2 = y - source2Y;
      const filamentY = rows * (.59 + .11 * Math.sin(x * .15 + t * .38)
        + .035 * Math.sin(x * .31 - t * .62));
      const filamentDistance = y - filamentY;
      const crossY = rows * (.42 + .09 * Math.cos(x * .18 - t * .32));
      const crossDistance = y - crossY;
      const filamentGate = Math.max(0, Math.min(1, (x - cols * .34) / (cols * .22)));
      const source = Math.exp(-(sx * sx + sy * sy) / 16) * .07
        + Math.exp(-(sx2 * sx2 + sy2 * sy2) / 10) * .055
        + Math.exp(-(cx * cx + cy * cy) / 13) * .022
        + filamentGate * Math.exp(-filamentDistance * filamentDistance / 2.8)
          * (.006 + .002 * Math.sin(x * .35 - t * .6))
        + filamentGate * Math.exp(-crossDistance * crossDistance / 2.5) * .004;
      const d = Math.min(1.1, sample(density, backX, backY) * densityDecay + source * flowSpeed);
      const sourceDye = source * filamentGate * .8;
      const r = Math.min(1, sample(red, backX, backY) * dyeDecay + sourceDye * flowSpeed);
      nextDensity[i] = d;
      nextRed[i] = r;
      nextFlowX[i] = sample(flowX, backX, backY) * momentumDecay;
      nextFlowY[i] = sample(flowY, backX, backY) * momentumDecay;

      const spiral = Math.sin(Math.hypot(ax, ay) * .68 - Math.atan2(ay, ax) * 2.2 - t * .55);
      const interference = Math.sin(x * .28 + y * .17 + t * .72)
        * Math.sin(y * .31 - x * .1 - t * .29);
      const texture = .65 + .3 * spiral + .12 * interference;
      const brightness = Math.min(1, d * 1.08 * texture + r * .5);
      const level = Math.min(glyphs.length - 1, Math.floor(brightness * glyphs.length));
      if (level === 0) continue;
      const tint = Math.min(1, r * 1.9);
      const redChannel = Math.round(230 + (dyeRgb[0] - 230) * tint);
      const greenChannel = Math.round(230 + (dyeRgb[1] - 230) * tint);
      const blueChannel = Math.round(230 + (dyeRgb[2] - 230) * tint);
      const alpha = Math.min(.88, .2 + d * .5 + tint * .18);
      ctx.fillStyle = `rgba(${redChannel},${greenChannel},${blueChannel},${alpha.toFixed(2)})`;
      ctx.fillText(glyphs[level], x * cell + cell / 2, y * cell + cell / 2);
    }
    [density, nextDensity] = [nextDensity, density];
    [red, nextRed] = [nextRed, red];
    [flowX, nextFlowX] = [nextFlowX, flowX];
    [flowY, nextFlowY] = [nextFlowY, flowY];
  }

  addEventListener('portfolio:text-glitch', e => {
    for (const point of e.detail) {
      stir(point.x / cell, point.y / cell,
        Math.sin(point.y * .03) * 2, Math.cos(point.x * .02) * 1.8,
        point.strength, 1.55, 1.9);
    }
  });

  addEventListener('pointermove', e => {
    const x = e.clientX / cell, y = e.clientY / cell;
    const dx = pointer.seen ? Math.max(-6, Math.min(6, x - pointer.x)) : 0;
    const dy = pointer.seen ? Math.max(-6, Math.min(6, y - pointer.y)) : 0;
    const motion = Math.hypot(dx, dy);
    if (!pointer.seen || motion > .15) stir(x, y, dx, dy, Math.min(1.6, .5 + motion * .25));
    pointer.x = x; pointer.y = y; pointer.seen = true;
  }, { passive: true });
  addEventListener('pointerdown', e => stir(e.clientX / cell, e.clientY / cell, 0, 0, 1.3), { passive: true });
  addEventListener('pointerleave', () => { pointer.seen = false; });
  addEventListener('resize', () => {
    resize();
    if (paused) { last = -Infinity; draw(performance.now()); }
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!paused) raf = requestAnimationFrame(draw);
  });
  function syncSlider(input) {
    const value = Number(input.value);
    const progress = (value - Number(input.min)) / (Number(input.max) - Number(input.min));
    input.style.setProperty('--progress', `${progress * 100}%`);
    input.setAttribute('aria-valuetext', `${value.toFixed(2)}×`);
    return value;
  }
  if (speedInput) {
    flowSpeed = syncSlider(speedInput);
    speedInput.addEventListener('input', () => { flowSpeed = syncSlider(speedInput); });
  }
  if (stirInput) {
    stirPower = syncSlider(stirInput);
    stirInput.addEventListener('input', () => { stirPower = syncSlider(stirInput); });
  }
  function setDyeColor(hex) {
    dyeRgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    if (hexOutput) hexOutput.textContent = hex.toUpperCase();
    paletteToggle?.style.setProperty('--dye-color', hex);
    palette?.querySelectorAll('button[data-hex]').forEach(tile =>
      tile.setAttribute('aria-pressed', String(tile.dataset.hex === hex)));
    if (paused) { last = -Infinity; draw(performance.now()); }
  }
  function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100, l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const huePart = hue / 60;
    const second = chroma * (1 - Math.abs(huePart % 2 - 1));
    const values = huePart < 1 ? [chroma, second, 0]
      : huePart < 2 ? [second, chroma, 0]
      : huePart < 3 ? [0, chroma, second]
      : huePart < 4 ? [0, second, chroma]
      : huePart < 5 ? [second, 0, chroma] : [chroma, 0, second];
    const offset = l - chroma / 2;
    return '#' + values.map(value => Math.round((value + offset) * 255).toString(16).padStart(2, '0')).join('');
  }
  if (palette && paletteToggle) {
    const radius = 3, size = 8;
    const width = (3 * radius + 2) * size;
    const height = Math.sqrt(3) * (2 * radius + 1) * size;
    palette.style.width = `${width}px`;
    palette.style.height = `${height}px`;
    for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) > radius) continue;
      const x = width / 2 + 1.5 * size * q;
      const y = height / 2 + Math.sqrt(3) * size * (r + q / 2);
      const distance = Math.min(1, Math.hypot(x - width / 2, y - height / 2) / (Math.sqrt(3) * radius * size));
      const angle = Math.atan2(y - height / 2, x - width / 2) * 180 / Math.PI;
      const hue = (300 + angle * .78 + 360) % 360;
      const hex = q === 1 && r === 2 ? '#d23030'
        : hslToHex(hue, Math.min(100, distance * 145), 96 - distance * 62);
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.tabIndex = q === 1 && r === 2 ? 0 : -1;
      tile.dataset.q = q;
      tile.dataset.r = r;
      tile.dataset.hex = hex;
      tile.setAttribute('aria-pressed', String(hex === '#d23030'));
      tile.setAttribute('aria-label', `Choose ${hex.toUpperCase()}`);
      tile.style.cssText = `left:${x}px;top:${y}px;width:${2 * size}px;height:${Math.sqrt(3) * size}px;background:${hex}`;
      palette.appendChild(tile);
    }
    const closePalette = () => {
      palette.hidden = true;
      paletteToggle.setAttribute('aria-expanded', 'false');
    };
    function centerPalette() {
      const triggerBox = paletteToggle.getBoundingClientRect();
      const pickerBox = palette.parentElement.getBoundingClientRect();
      palette.style.left = `${triggerBox.left - pickerBox.left + triggerBox.width / 2 - palette.offsetWidth / 2}px`;
    }
    paletteToggle.addEventListener('click', () => {
      palette.hidden = !palette.hidden;
      paletteToggle.setAttribute('aria-expanded', String(!palette.hidden));
      if (!palette.hidden) centerPalette();
    });
    addEventListener('resize', () => { if (!palette.hidden) centerPalette(); }, { passive: true });
    palette.addEventListener('keydown', event => {
      if (!event.key.startsWith('Arrow')) return;
      const current = event.target.closest('button[data-hex]');
      if (!current) return;
      const q = Number(current.dataset.q), r = Number(current.dataset.r);
      const steps = {
        ArrowLeft: [[q - 1, r], [q - 1, r + 1]],
        ArrowRight: [[q + 1, r], [q + 1, r - 1]],
        ArrowUp: [[q, r - 1]], ArrowDown: [[q, r + 1]],
      };
      const next = steps[event.key].map(([nq, nr]) =>
        palette.querySelector(`button[data-q="${nq}"][data-r="${nr}"]`)).find(Boolean);
      if (!next) return;
      event.preventDefault();
      current.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    });
    palette.addEventListener('click', event => {
      const tile = event.target.closest('button[data-hex]');
      if (!tile) return;
      setDyeColor(tile.dataset.hex);
      closePalette();
      paletteToggle.focus();
    });
    document.addEventListener('pointerdown', event => {
      if (!palette.hidden && !event.target.closest('.fluid-color-picker')) closePalette();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !palette.hidden) { closePalette(); paletteToggle.focus(); }
    });
  }
  toggle?.addEventListener('click', () => {
    paused = !paused;
    toggle.textContent = paused ? 'play' : 'pause';
    toggle.setAttribute('aria-pressed', String(paused));
    if (paused) cancelAnimationFrame(raf);
    else if (!document.hidden) raf = requestAnimationFrame(draw);
  });
  reset?.addEventListener('click', () => {
    resize();
    phase = 0;
    if (speedInput) { speedInput.value = '1'; flowSpeed = syncSlider(speedInput); }
    if (stirInput) { stirInput.value = '1'; stirPower = syncSlider(stirInput); }
    pointer.seen = false;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (paused) {
      paused = false;
      if (toggle) { toggle.textContent = 'pause'; toggle.setAttribute('aria-pressed', 'false'); }
      if (!document.hidden) raf = requestAnimationFrame(draw);
    }
    last = -Infinity;
    dispatchEvent(new Event('portfolio:reset-intro'));
    vortexPulseAt = performance.now() + 140;
    vortexPulsePending = true;
  });
  resize();
  raf = requestAnimationFrame(draw);
})();

import { createCRT, createWebGLCRT } from '../vendor/crt-effect/crt-effect.js?v=1.1.6';

const checkbox = document.querySelector('#crt-effect');
const displayControls = [...document.querySelectorAll('input[data-crt-option]')];
const displaySettings = Object.fromEntries(displayControls.map(input => [input.dataset.crtOption, Number(input.value) / 100]));
let canvasEffect;
const graphicsEffects = [];
const screen = document.querySelector('#screen-viewport');
screen.style.setProperty('--crt-glow', displaySettings.glow);
for (const input of displayControls) {
  const sync = () => {
    const value = Number(input.value);
    const text = `${Number(value.toFixed(1))}%`;
    input.parentElement.querySelector('output').value = text;
    input.setAttribute('aria-valuetext', text);
    input.style.setProperty('--fill', `${(value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
  };
  sync();
  input.addEventListener('input', () => {
    if (input.disabled) return;
    sync();
    const key = input.dataset.crtOption;
    displaySettings[key] = Number(input.value) / 100;
    if (key === 'glow') {
      screen.style.setProperty('--crt-glow', displaySettings.glow);
      for (const effect of graphicsEffects) effect.update({ glow:displaySettings.glow });
    } else canvasEffect?.update({ [key]:displaySettings[key] });
  });
}
const storageKey = 'tesseract:crt-effect';
let enabled = !matchMedia('(max-width: 900px)').matches;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved === 'true' || saved === 'false') enabled = saved === 'true';
} catch { /* Keep the viewport default when storage is unavailable. */ }
checkbox.checked = enabled;
document.body.classList.toggle('crt-disabled', !enabled);
function syncDisplayEnabled() {
  for (const input of displayControls) input.disabled = !checkbox.checked || checkbox.disabled;
}
syncDisplayEnabled();

const effects = [];
const detailLayers = [];
function initializeCRT() {
  try {
    const curvature = parseFloat(getComputedStyle(screen).getPropertyValue('--crt-curvature')) || 0;
    const crt = createWebGLCRT(screen, {
      aperture: true,
      sources: [document.querySelector('#render-backdrop'), document.querySelector('#tesseract')],
      curvature, ...displaySettings, scanlines: 0, vignette: .45,
      enabled,
    });
    canvasEffect = crt;
    graphicsEffects.push(crt);
    effects.push(crt);
    const detail = (id, zIndex, sources) => {
      const layer = document.createElement('div');
      layer.id = id; layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
      layer.style.cssText = `position:absolute;inset:0;z-index:${zIndex};pointer-events:none`;
      screen.append(layer); detailLayers.push(layer);
      const gpu = createWebGLCRT(layer, { sources, enabled, curvature,
        grain:0, scanlines:0, mask:0, vignette:0, glow:displaySettings.glow });
      graphicsEffects.push(gpu);
      effects.push(gpu); return gpu;
    };
    const frames = [...document.querySelectorAll('canvas[data-crt-frame]')];
    const pageDetails = detail('screen-page-details', 3, [document.querySelector('#ascii-name-canvas'),
      ...frames.filter(canvas => !canvas.closest('#settings-drawer'))]);
    const menuDetails = detail('screen-menu-details', 6, frames.filter(canvas => canvas.closest('#settings-drawer')));
    const uiOptions = { enabled, grain:0, scanlines:0, mask:0, vignette:0, glow:0, protect:'', curvature, alignControls:false };
    // Safari cannot flatten accelerated scrolling descendants into one SVG
    // source. Crop the same screen-wide field to each native surface instead.
    for (const selector of ['.portfolio-window', '.orientation-indicator', 'footer', '#settings-surface']) {
      effects.push(createCRT(document.querySelector(selector), { ...uiOptions, viewport:screen }));
    }
    screen.dataset.crtGeometry = 'shared-viewport';
    screen.dataset.crtRenderer = crt.renderer;
    let pendingFrame = 0;
    let detailsChanged = true;
    const render = () => {
      cancelAnimationFrame(pendingFrame); pendingFrame = 0;
      crt.render();
      if (detailsChanged) { pageDetails.render(); menuDetails.render(); detailsChanged = false; }
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('crt:frame', event => {
      // The native drawer has already moved. Place its cached frame in this
      // paint, rather than uploading every static canvas on the next rAF.
      if (event.detail?.menuLayout) { menuDetails.render(false); return; }
      // Several frame/name painters can update during one tick. Upload once.
      detailsChanged ||= Boolean(event.detail?.graphics);
      if (document.hidden || reduced.matches) render();
      else if (!pendingFrame) pendingFrame = requestAnimationFrame(render);
    });
    // ResizeObserver/rAF may be suspended in a background Safari tab.
    document.addEventListener('crt:layout', () => {
      for (const effect of effects) effect.refresh();
      // The aperture must leave its opening-line geometry even if rAF pauses.
      detailsChanged = true;
      render();
    });
    checkbox.addEventListener('change', () => {
      document.body.classList.toggle('crt-disabled', !checkbox.checked);
      for (const effect of effects) effect.setEnabled(checkbox.checked);
      syncDisplayEnabled();
      try { localStorage.setItem(storageKey, String(checkbox.checked)); } catch { /* Preference remains active for this visit. */ }
    });
  } catch (error) {
    canvasEffect = undefined;
    graphicsEffects.length = 0;
    for (const effect of effects.reverse()) effect.destroy();
    for (const layer of detailLayers) layer.remove();
    checkbox.checked = false;
    checkbox.disabled = true;
    syncDisplayEnabled();
    document.body.classList.add('crt-disabled');
    console.warn('CRT effect could not initialize.', error);
  }
}
if (document.documentElement.classList.contains('is-loading')) document.addEventListener('crt:ready', initializeCRT, { once:true });
else initializeCRT();

import { createCRT, createWebGLCRT } from '../vendor/crt-effect/crt-effect.js?v=1.1.0-shared-2';

const checkbox = document.querySelector('#crt-effect');
const storageKey = 'tesseract:crt-effect';
let enabled = !matchMedia('(max-width: 900px)').matches;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved === 'true' || saved === 'false') enabled = saved === 'true';
} catch { /* Keep the viewport default when storage is unavailable. */ }
checkbox.checked = enabled;
document.body.classList.toggle('crt-disabled', !enabled);

const effects = [];
const detailLayers = [];
function initializeCRT() {
  try {
    const screen = document.querySelector('#crt-screen');
    const curvature = parseFloat(getComputedStyle(screen).getPropertyValue('--crt-curvature')) || 0;
    const crt = createWebGLCRT(screen, {
      aperture: true,
      sources: [document.querySelector('#render-backdrop'), document.querySelector('#tesseract')],
      curvature, grain: .012, scanlines: .055, mask: .015, vignette: .45, glow: .035,
      enabled,
    });
    effects.push(crt);
    const detail = (id, zIndex, sources) => {
      const layer = document.createElement('div');
      layer.id = id; layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
      layer.style.cssText = `position:absolute;inset:0;z-index:${zIndex};pointer-events:none`;
      screen.append(layer); detailLayers.push(layer);
      const gpu = createWebGLCRT(layer, { sources, enabled, curvature,
        grain:0, scanlines:0, mask:0, vignette:0, glow:0 });
      effects.push(gpu); return gpu;
    };
    const frames = [...document.querySelectorAll('canvas[data-crt-frame]')];
    const pageDetails = detail('crt-page-details', 3, [document.querySelector('#ascii-name-canvas'),
      ...frames.filter(canvas => !canvas.closest('#settings-drawer'))]);
    const menuDetails = detail('crt-menu-details', 6, frames.filter(canvas => canvas.closest('#settings-drawer')));
    const uiOptions = { enabled, grain:0, scanlines:0, mask:0, vignette:0, glow:0, protect:'', curvature, alignControls:false };
    // Safari cannot flatten accelerated scrolling descendants into one SVG
    // source. Crop the same screen-wide field to each native surface instead.
    for (const selector of ['.portfolio-window', '.orientation-indicator', 'footer', '#settings-surface']) {
      effects.push(createCRT(document.querySelector(selector), { ...uiOptions, viewport:screen }));
    }
    screen.dataset.crtGeometry = 'shared-viewport';
    screen.dataset.crtRenderer = crt.renderer;
    let pendingFrame = 0;
    const render = () => {
      cancelAnimationFrame(pendingFrame); pendingFrame = 0;
      crt.render(); pageDetails.render(); menuDetails.render();
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('crt:frame', () => {
      // Several frame/name painters can update during one tick. Upload once.
      if (document.hidden || reduced.matches) render();
      else if (!pendingFrame) pendingFrame = requestAnimationFrame(render);
    });
    // ResizeObserver/rAF may be suspended in a background Safari tab.
    document.addEventListener('crt:layout', () => {
      for (const effect of effects) effect.refresh();
      // The aperture must leave its opening-line geometry even if rAF pauses.
      render();
    });
    checkbox.addEventListener('change', () => {
      document.body.classList.toggle('crt-disabled', !checkbox.checked);
      for (const effect of effects) effect.setEnabled(checkbox.checked);
      try { localStorage.setItem(storageKey, String(checkbox.checked)); } catch { /* Preference remains active for this visit. */ }
    });
  } catch (error) {
    for (const effect of effects.reverse()) effect.destroy();
    for (const layer of detailLayers) layer.remove();
    checkbox.checked = false;
    checkbox.disabled = true;
    document.body.classList.add('crt-disabled');
    console.warn('CRT effect could not initialize.', error);
  }
}
if (document.documentElement.classList.contains('is-loading')) document.addEventListener('crt:ready', initializeCRT, { once:true });
else initializeCRT();

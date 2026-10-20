import { createCRT, createWebGLCRT } from '../vendor/crt-effect/crt-effect.js?v=1.1.6';

const checkbox = document.querySelector('#crt-effect');
const displayControls = [...document.querySelectorAll('input[data-crt-option]')];
const displaySettings = Object.fromEntries(displayControls.map(input => [input.dataset.crtOption, Number(input.value) / 100]));
let canvasEffect;
const graphicsEffects = [];
const screen = document.querySelector('#screen-viewport');
screen.style.setProperty('--crt-glow', displaySettings.glow);
function syncDisplayControl(input) {
  const value = Number(input.value);
  const text = `${Number(value.toFixed(1))}%`;
  input.parentElement.querySelector('output').value = text;
  input.setAttribute('aria-valuetext', text);
  input.style.setProperty('--fill', `${(value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
}
function updateDisplaySetting(input) {
  syncDisplayControl(input);
  const key = input.dataset.crtOption;
  displaySettings[key] = Number(input.value) / 100;
  if (key === 'glow') {
    screen.style.setProperty('--crt-glow', displaySettings.glow);
    for (const effect of graphicsEffects) effect.update({ glow:displaySettings.glow });
  } else canvasEffect?.update({ [key]:displaySettings[key] });
}
for (const input of displayControls) {
  syncDisplayControl(input);
  input.addEventListener('input', () => {
    if (!input.disabled) updateDisplaySetting(input);
  });
}
const storageKey = 'tesseract:crt-effect';
const defaultEnabled = () => !matchMedia('(max-width: 900px)').matches;
let enabled = defaultEnabled();
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
const pageEffects = [];
const detailLayers = [];
let syncPageRendering = () => {};
function applyEnabled() {
  enabled = checkbox.checked;
  document.body.classList.toggle('crt-disabled', !checkbox.checked);
  for (const effect of effects) effect.setEnabled(checkbox.checked);
  syncPageRendering();
  syncDisplayEnabled();
}
document.querySelector('#rotation-reset').addEventListener('click', () => {
  for (const input of displayControls) {
    input.value = input.defaultValue;
    updateDisplaySetting(input);
  }
  if (!checkbox.disabled) {
    checkbox.checked = defaultEnabled();
    applyEnabled();
    try { localStorage.removeItem(storageKey); } catch { /* Defaults still apply for this visit. */ }
  }
});
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
    const detail = (id, zIndex, sources, conditional = false) => {
      const layer = document.createElement('div');
      layer.id = id; layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
      layer.style.cssText = `position:absolute;inset:0;z-index:${zIndex};pointer-events:none`;
      screen.append(layer); detailLayers.push(layer);
      const gpu = createWebGLCRT(layer, { sources, enabled:enabled && !conditional, curvature,
        grain:0, scanlines:0, mask:0, vignette:0, glow:displaySettings.glow });
      graphicsEffects.push(gpu);
      (conditional ? pageEffects : effects).push(gpu); return gpu;
    };
    const frames = [...document.querySelectorAll('canvas[data-crt-frame]')];
    const pageScroll = document.querySelector('#page-scroll');
    const pageDetails = detail('screen-page-details', 3, [document.querySelector('#ascii-name-canvas'),
      ...frames.filter(canvas => !canvas.closest('#settings-drawer'))], true);
    const menuDetails = detail('screen-menu-details', 6, frames.filter(canvas => canvas.closest('#settings-drawer')));
    const uiOptions = { enabled, grain:0, scanlines:0, mask:0, vignette:0, glow:0, protect:'', curvature, alignControls:false };
    for (const selector of ['.orientation-indicator', '#settings-surface']) {
      effects.push(createCRT(document.querySelector(selector), { ...uiOptions, viewport:screen }));
    }
    const nativePage = createCRT(pageScroll, { ...uiOptions, viewport:screen, enabled:false });
    const panel = createCRT(document.querySelector('.portfolio-window'), { ...uiOptions, viewport:screen, enabled:false });
    const footer = createCRT(document.querySelector('footer'), { ...uiOptions, viewport:screen, enabled:false });
    pageEffects.push(nativePage, panel, footer);
    let scrollingPage = false;
    const enable = (effect, value) => { if (effect.enabled !== value) effect.setEnabled(value); };
    syncPageRendering = () => {
      scrollingPage = pageScroll.scrollHeight > pageScroll.clientHeight + 1;
      // Overflowing pages must scroll as one native surface. When everything
      // fits, keep the smaller filtered surfaces and cached GPU graphics.
      enable(nativePage, enabled && scrollingPage);
      enable(panel, enabled && !scrollingPage);
      enable(footer, enabled && !scrollingPage);
      enable(pageDetails, enabled && !scrollingPage);
      screen.dataset.crtScroll = scrollingPage ? 'native' : 'gpu';
    };
    syncPageRendering();
    const pageObserver = new ResizeObserver(syncPageRendering);
    pageObserver.observe(pageScroll);
    pageObserver.observe(document.querySelector('.page'));
    screen.dataset.crtGeometry = 'shared-viewport';
    screen.dataset.crtRenderer = crt.renderer;
    let pendingFrame = 0;
    let sceneChanged = true, pageChanged = true, menuChanged = true;
    const render = () => {
      cancelAnimationFrame(pendingFrame); pendingFrame = 0;
      if (sceneChanged) crt.render();
      if (pageChanged) pageDetails.render();
      if (menuChanged) menuDetails.render();
      sceneChanged = pageChanged = menuChanged = false;
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('crt:frame', event => {
      // The native drawer has already moved. Place its cached frame in this
      // paint, rather than uploading every static canvas on the next rAF.
      if (event.detail?.menuLayout) { menuDetails.render(false); return; }
      // Upload only the changed layer. Tracing a menu border must not also
      // upload the full scene, name and unrelated page frames.
      if (event.detail?.graphics) {
        const source = event.detail.source;
        if (!source) sceneChanged = pageChanged = menuChanged = true;
        else if (scrollingPage && pageScroll.contains(source)) return;
        else if (source.closest('#settings-drawer')) menuChanged = true;
        else pageChanged = true;
      } else sceneChanged = true;
      if (document.hidden || reduced.matches) render();
      else if (!pendingFrame) pendingFrame = requestAnimationFrame(render);
    });
    // ResizeObserver/rAF may be suspended in a background Safari tab.
    document.addEventListener('crt:layout', () => {
      syncPageRendering();
      for (const effect of [...effects, ...pageEffects]) effect.refresh();
      // The aperture must leave its opening-line geometry even if rAF pauses.
      sceneChanged = pageChanged = menuChanged = true;
      render();
    });
    checkbox.addEventListener('change', () => {
      applyEnabled();
      try { localStorage.setItem(storageKey, String(checkbox.checked)); } catch { /* Preference remains active for this visit. */ }
    });
  } catch (error) {
    canvasEffect = undefined;
    graphicsEffects.length = 0;
    for (const effect of [...effects, ...pageEffects].reverse()) effect.destroy();
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

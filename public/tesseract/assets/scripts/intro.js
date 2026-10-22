// One presentation clock preserves the original Firefox reveal sequence.
export const loadingTimeScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--loading-time-scale')) || 1;

let started = false, epoch = 0, pausedAt = null;
function startClock() {
  if (started) return;
  started = true; epoch = performance.now();
  if (document.hidden) pausedAt = epoch;
}
export function entranceTime() {
  return started ? Math.max(0, ((pausedAt ?? performance.now()) - epoch) / 1000) : 0;
}
document.addEventListener('crt:contentstart', startClock, { once:true });
if (!document.documentElement.classList.contains('content-hold')) startClock();
document.addEventListener('visibilitychange', () => {
  if (!started) return;
  if (document.hidden) pausedAt ??= performance.now();
  else if (pausedAt !== null) { epoch += performance.now() - pausedAt; pausedAt = null; }
});
const revealDuration = .01 * loadingTimeScale;
const framePause = .22;
function visiblePanelHeight(panel, height) {
  const viewport = panel.matches('.settings-drawer') && panel.closest('#screen-viewport');
  return viewport ? Math.min(height, Math.max(0,
    viewport.getBoundingClientRect().bottom - panel.getBoundingClientRect().top - panel.clientTop)) : height;
}
function rasterDepth(elapsed, sequence, height, cellHeight) {
  const extent = sequence?.direction === 'down' ? height : height / 2;
  if (!sequence || !Number.isFinite(elapsed)) return extent;
  const { duration, delay } = sequence;
  const progress = Math.max(0, Math.min(1, (elapsed - delay - duration * .12) / (duration * .54)));
  const row = Math.max(2, Math.min(cellHeight, height / 24));
  return progress === 1 ? extent : Math.floor(extent * progress / row) * row;
}
const contentPhase = group => group.matches('.intro') ? .43 : group.matches('.experience') ? .52
  : group.matches('.education-group') ? .59 : group.matches('.skills') ? .64
  : group.matches('.orientation-readout') ? .56 : .46;

// Paint ASCII frames once per presentation step. The GPU applies the same
// screen-wide curve to every frame and the name, independent of DOM compositing.
export class AsciiFrame {
  constructor(panel) {
    this.panel = panel;
    this.element = document.createElement('canvas');
    this.element.className = 'ascii-frame';
    this.element.dataset.crtFrame = '';
    this.element.setAttribute('aria-hidden', 'true');
    panel.append(this.element);
    this.context = this.element.getContext('2d');
    this.resize = () => {
      const typography = getComputedStyle(this.element);
      const font = `${typography.fontWeight} ${typography.fontSize} ${typography.fontFamily}`;
      this.context.font = font;
      const cellWidth = this.context.measureText('-').width;
      const cellHeight = parseFloat(typography.lineHeight);
      const width = panel.clientWidth, height = panel.clientHeight;
      const density = Math.min(devicePixelRatio || 1, 2);
      this.element.width = Math.max(1, Math.round(width * density));
      this.element.height = Math.max(1, Math.round(height * density));
      this.context.setTransform(density, 0, 0, density, 0, 0);
      // Keep the background overhang at four pixels on every outer edge.
      const left = 4, right = width - 4, top = 4;
      const columns = Math.max(2, Math.floor((right - left) / cellWidth));
      const columnWidth = (right - left) / columns;
      const bottom = Math.max(top, height - 4);
      const titlebar = panel.querySelector('.window-titlebar');
      const header = titlebar?.offsetHeight ? titlebar : null;
      const headerY = header ? Math.min(bottom, header.offsetHeight) : null;
      this.points = [];
      const glyph = (text, x, y, phase, corner = false) => this.points.push({ text, x, y, phase, corner });
      const fromEnds = progress => Math.min(progress, 1 - progress) * 2;
      const traceStep = (progress, travel) => progress * travel;
      const sidePhase = y => .09 + traceStep(fromEnds((y - top) / Math.max(1, bottom - top)), .36);
      const horizontal = (y, startPhase = .09, travel = .36) => {
        for (let column = 1; column < columns; column++) {
          glyph('-', left + column * columnWidth, y, startPhase + traceStep(fromEnds(column / columns), travel));
        }
      };
      const vertical = x => {
        const stops = header ? [top, headerY, bottom] : [top, bottom];
        for (let section = 0; section < stops.length - 1; section++) {
          const start = stops[section], end = stops[section + 1];
          const rows = header && section === 0 ? 2 : Math.max(1, Math.round((end - start) / cellHeight));
          for (let row = 1; row < rows; row++) {
            const y = start + (end - start) * row / rows;
            glyph('|', x, y, sidePhase(y));
          }
        }
      };
      horizontal(top); vertical(right); horizontal(bottom); vertical(left);
      if (header) horizontal(headerY, sidePhase(headerY), .18);
      for (const [x, y] of [[left, top], [right, top], [right, bottom], [left, bottom]]) glyph('+', x, y, 0, true);
      if (header) { glyph('+', left, headerY, sidePhase(headerY)); glyph('+', right, headerY, sidePhase(headerY)); }
      this.geometry = { width, height, font, family:typography.fontFamily, left, cellWidth, cellHeight,
        headerHeight:panel.matches('.window-titlebar') ? height : headerY || 0, titleY:(top + (headerY ?? bottom)) / 2 };
      this.reveals = [];
      for (const group of panel.querySelectorAll('.intro,.experience,.education-group,.skills,.orientation-diagram,.orientation-readout')) {
        const blocks = [...group.querySelectorAll('h1,h2,h3,p')];
        if (!blocks.length) blocks.push(group);
        blocks.forEach((block, i) => {
          block.classList.add('terminal-reveal');
          this.reveals.push({ node:block, phase:contentPhase(group) + (blocks.length > 1 ? i / (blocks.length - 1) * .24 : 0) });
        });
      }
      if (panel.matches('.portfolio-window')) {
        const footer = panel.ownerDocument.querySelector('footer');
        if (footer) {
          footer.classList.add('terminal-reveal');
          this.reveals.push({ node:footer, phase:.43 });
        }
      }
      this.header = panel.matches('.drawer-toggle') ? panel.querySelector('.window-title') : titlebar;
      this.paintKey = ''; this.canvasKey = ''; this.paint(this.elapsed ?? Infinity);
    };
    this.resize();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(panel);
  }
  paint(elapsed = Infinity) {
    if (!this.geometry) return;
    this.elapsed = elapsed;
    const key = Number.isFinite(elapsed) ? Math.floor(elapsed * 60) : 'settled';
    if (key === this.paintKey) return;
    this.paintKey = key;
    const { width, height, font, family, left, cellWidth, cellHeight, titleY, headerHeight } = this.geometry;
    const style = getComputedStyle(document.documentElement);
    const palette = ['--cream','--gold','--accent','--scene-ember','--rule'].map(name => style.getPropertyValue(name).trim());
    const { duration = 1, delay = 0 } = this.sequence || {};
    const animated = Number.isFinite(elapsed) && this.sequence;
    const textStart = delay + duration * .70 + framePause;
    this.panel.dataset.frame = !animated || elapsed >= delay + duration * .70 ? 'complete' : 'tracing';
    let visibilityChanged = false;
    for (const reveal of this.reveals) {
      const visible = !animated || elapsed >= textStart + duration * (reveal.phase - .43) + revealDuration;
      const value = visible ? 'visible' : 'hidden';
      if (reveal.node.style.visibility !== value) { reveal.node.style.visibility = value; visibilityChanged = true; }
    }
    const headerVisible = !animated || elapsed >= textStart;
    if (this.header) this.header.style.visibility = headerVisible ? 'visible' : 'hidden';
    const canvasKey = !animated ? 'settled' : this.panel.dataset.frame === 'tracing' ? key : headerVisible ? 'settled-title' : 'settled-frame';
    if (canvasKey === this.canvasKey) {
      if (visibilityChanged) document.dispatchEvent(new CustomEvent('crt:frame', { detail:{ graphics:true, source:this.element } }));
      return;
    }
    this.canvasKey = canvasKey;
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = style.getPropertyValue('--window-titlebar-bg').trim();
    const backgroundHeight = visiblePanelHeight(this.panel, height);
    const depth = rasterDepth(elapsed, this.sequence, backgroundHeight, cellHeight);
    ctx.fillRect(0, 0, width, Math.min(headerHeight, depth));
    const bottomStart = backgroundHeight - depth;
    if (this.sequence?.direction !== 'down' && bottomStart < headerHeight) ctx.fillRect(0, bottomStart, width, headerHeight - bottomStart);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const point of this.points) {
      const phase = this.sequence?.direction === 'down'
        ? point.y <= 4 ? (point.corner ? 0 : .09) : .12 + .54 * point.y / backgroundHeight
        : point.phase;
      const time = elapsed - delay - duration * phase;
      if (animated && time < 0) continue;
      ctx.globalAlpha = animated ? Math.min(1, time / (duration * .04)) : 1;
      const colorDuration = this.sequence?.direction === 'down' ? .04 : point.corner ? .38 : .24;
      ctx.fillStyle = animated ? palette[Math.min(4, Math.floor(time / (duration * colorDuration) * 4))] : palette[4];
      ctx.fillText(point.text, point.x, point.y);
    }
    ctx.globalAlpha = 1;
    const title = this.panel.querySelector('.window-title');
    if (title && headerVisible) {
      ctx.font = `10px ${family}`; ctx.textAlign = 'left';
      ctx.fillStyle = style.getPropertyValue('--muted').trim();
      ctx.fillText(title.textContent.trim(), left + cellWidth * 2, titleY);
    }
    document.dispatchEvent(new CustomEvent('crt:frame', { detail:{ graphics:true, source:this.element } }));
  }
  remove() {
    this.observer.disconnect(); this.element.remove();
    this.header?.style.removeProperty('visibility');
    document.dispatchEvent(new CustomEvent('crt:frame', { detail:{ graphics:true } }));
  }
}

export class Entrance {
  constructor(target, reduced = false, { duration = 1.95, delay = 0 } = {}) {
    duration *= loadingTimeScale; delay *= loadingTimeScale;
    this.duration = delay + duration * 1.25 + framePause;
    this.sequence = { duration, delay };
    this.finished = false;
    this.panel = target?.matches('.portfolio-window,.orientation-indicator,.settings-drawer') ? target : target?.querySelector('.portfolio-window');
    if (!this.panel) { this.finish(); return; }
    this.originalInert = this.panel.inert;
    if (this.panel.matches('.settings-drawer')) {
      this.sequence.direction = 'down';
      this.duration = delay + duration * .70 + framePause + revealDuration;
    }
    this.backgroundHost = this.panel;
    this.backgroundStyles = ['background-color', 'background-image', 'background-size', 'background-repeat', 'background-position']
      .map(property => [property, this.backgroundHost.style.getPropertyValue(property), this.backgroundHost.style.getPropertyPriority(property)]);
    this.ascii = new AsciiFrame(this.panel);
    this.frame = this.ascii.element;
    if (reduced) { this.finish(); return; }
    this.panel.inert = true;
    this.ascii.sequence = this.sequence;
    this.frame.classList.add('assembly-frame');
    this.panel.classList.add('is-assembling');
    this.panel.dataset.entrance = 'opening';
    // Off-screen drawers reveal downward; fully visible boxes fill inward.
    Object.assign(this.backgroundHost.style, {
      backgroundColor:'transparent', backgroundImage:Array(this.sequence.direction === 'down' ? 1 : 2)
        .fill('linear-gradient(var(--window-bg),var(--window-bg))').join(','),
      backgroundRepeat:'no-repeat',
    });
    this.paint(0);
  }
  paint(elapsed) {
    const { height: panelHeight, cellHeight } = this.ascii.geometry;
    const height = visiblePanelHeight(this.panel, panelHeight);
    const depth = rasterDepth(elapsed, this.sequence, height, cellHeight);
    const size = `100% ${depth}px`;
    if (this.backgroundHost.style.backgroundSize !== size) this.backgroundHost.style.backgroundSize = size;
    const position = this.sequence.direction === 'down' ? 'left top' : `left top, left ${height - depth}px`;
    if (this.backgroundHost.style.backgroundPosition !== position) this.backgroundHost.style.backgroundPosition = position;
    this.ascii.paint(elapsed);
  }
  update() {
    if (this.finished) return;
    const elapsed = entranceTime();
    this.paint(elapsed);
    if (elapsed >= this.duration) this.finish();
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.frame?.classList.remove('assembly-frame'); this.ascii?.paint(Infinity);
    if (this.panel) {
      for (const [property, value, priority] of this.backgroundStyles) {
        if (value) this.backgroundHost.style.setProperty(property, value, priority);
        else this.backgroundHost.style.removeProperty(property);
      }
      this.panel.classList.remove('is-assembling');
      this.panel.setAttribute('data-entrance', 'complete');
      this.panel.inert = this.originalInert;
    }
  }
}

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
      const columns = Math.max(2, Math.floor((width - 6) / cellWidth));
      const left = (width - columns * cellWidth) / 2;
      const right = width - left, top = 4;
      const bottom = Math.max(top, panel.matches('.drawer-toggle') ? height - 1 : height - 4);
      const titlebar = panel.querySelector('.window-titlebar');
      const header = titlebar?.offsetHeight ? titlebar : null;
      const headerY = header ? Math.min(bottom, header.offsetHeight) : null;
      this.points = [];
      const glyph = (text, x, y, phase, corner = false) => this.points.push({ text, x, y, phase, corner });
      const fromEnds = progress => Math.min(progress, 1 - progress) * 2;
      const traceStep = (progress, travel) => Math.ceil(progress * travel / .045 - 1e-9) * .045;
      const sidePhase = y => .09 + traceStep(fromEnds((y - top) / Math.max(1, bottom - top)), .36);
      const horizontal = (y, startPhase = .09, travel = .36) => {
        for (let column = 1; column < columns; column++) {
          glyph('-', left + column * cellWidth, y, startPhase + traceStep(fromEnds(column / columns), travel));
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
      this.geometry = { width, height, font, family:typography.fontFamily, left, cellWidth,
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
      this.header = panel.matches('.drawer-toggle') ? panel.querySelector('.window-title') : titlebar;
      this.paintKey = ''; this.paint(this.elapsed ?? Infinity);
    };
    this.resize();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(panel);
  }
  paint(elapsed = Infinity) {
    if (!this.geometry) return;
    this.elapsed = elapsed;
    const key = Number.isFinite(elapsed) ? Math.floor(elapsed * 30) : 'settled';
    if (key === this.paintKey) return;
    this.paintKey = key;
    const { width, height, font, family, left, cellWidth, titleY, headerHeight } = this.geometry;
    const style = getComputedStyle(document.documentElement);
    const palette = ['--cream','--gold','--accent','--scene-ember','--rule'].map(name => style.getPropertyValue(name).trim());
    const { duration = 1, delay = 0 } = this.sequence || {};
    const animated = Number.isFinite(elapsed) && this.sequence;
    for (const reveal of this.reveals) {
      const visible = !animated || elapsed >= delay + duration * reveal.phase + revealDuration;
      const value = visible ? 'visible' : 'hidden';
      if (reveal.node.style.visibility !== value) reveal.node.style.visibility = value;
    }
    const headerVisible = !animated || elapsed >= delay + duration * .35 + revealDuration;
    if (this.header) this.header.style.visibility = headerVisible ? 'visible' : 'hidden';
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    if (headerVisible) {
      ctx.fillStyle = style.getPropertyValue('--window-titlebar-bg').trim();
      ctx.fillRect(0, 0, width, headerHeight);
    }
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const point of this.points) {
      const time = elapsed - delay - duration * point.phase;
      if (animated && time < 0) continue;
      ctx.fillStyle = animated ? palette[Math.min(4, Math.floor(time / (duration * (point.corner ? .38 : .24)) * 4))] : palette[4];
      ctx.fillText(point.text, point.x, point.y);
    }
    const title = this.panel.querySelector('.window-title');
    if (title && headerVisible) {
      ctx.font = `10px ${family}`; ctx.textAlign = 'left';
      ctx.fillStyle = style.getPropertyValue('--muted').trim();
      ctx.fillText(title.textContent.trim(), left + cellWidth * 2, titleY);
    }
    document.dispatchEvent(new Event('crt:frame'));
  }
  remove() {
    this.observer.disconnect(); this.element.remove();
    this.header?.style.removeProperty('visibility');
  }
}

export class Entrance {
  constructor(target, reduced = false, { duration = 1.95, delay = 0, temporary = false } = {}) {
    duration *= loadingTimeScale; delay *= loadingTimeScale;
    this.duration = duration + delay;
    this.sequence = { duration, delay };
    this.temporary = temporary; this.finished = false;
    this.panel = target?.matches('.portfolio-window,.orientation-indicator,.drawer-toggle') ? target : target?.querySelector('.portfolio-window');
    this.onFocus = () => this.finish();
    if (!this.panel) { this.finish(); return; }
    this.originalBackground = this.panel.style.backgroundColor;
    this.ascii = new AsciiFrame(this.panel);
    this.frame = this.ascii.element;
    if (reduced) { this.finish(); return; }
    this.ascii.sequence = this.sequence;
    this.frame.classList.add('assembly-frame');
    this.panel.classList.add('is-assembling');
    this.panel.dataset.entrance = 'opening';
    this.paint(0);
    this.panel.addEventListener('focusin', this.onFocus, { once:true });
  }
  paint(elapsed) {
    const { duration, delay } = this.sequence;
    this.panel.style.backgroundColor = elapsed < delay + duration * .35 ? 'transparent' : 'var(--window-bg)';
    this.ascii.paint(elapsed);
  }
  update() {
    if (this.finished) return;
    const elapsed = entranceTime();
    this.paint(elapsed);
    if (elapsed >= this.duration) this.finish();
  }
  finish() {
    this.finished = true;
    if (this.temporary) this.ascii?.remove();
    else { this.frame?.classList.remove('assembly-frame'); this.ascii?.paint(Infinity); }
    if (this.panel) {
      this.panel.style.backgroundColor = this.originalBackground || '';
      this.panel.classList.remove('is-assembling');
      this.panel.setAttribute('data-entrance', 'complete');
      this.panel.removeEventListener('focusin', this.onFocus);
    }
  }
}

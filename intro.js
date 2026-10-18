// Keep canvas and CSS loading sequences on the same clock.
export const loadingTimeScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--loading-time-scale')) || 1;

// Use the same character frame for the settled window and its assembly.
export class AsciiFrame {
  constructor(panel) {
    this.panel = panel;
    this.element = document.createElement('div');
    this.element.className = 'ascii-frame';
    this.element.setAttribute('aria-hidden', 'true');
    panel.append(this.element);
    const measure = document.createElement('canvas').getContext('2d');
    this.resize = () => {
      const typography = getComputedStyle(this.element);
      measure.font = typography.font;
      const cellWidth = measure.measureText('-').width;
      const cellHeight = parseFloat(typography.lineHeight);
      const width = panel.clientWidth, height = panel.clientHeight;
      const columns = Math.max(2, Math.floor((width - 6) / cellWidth));
      const left = (width - columns * cellWidth) / 2;
      const right = width - left, top = 4;
      const bottom = Math.max(top, panel.matches('.drawer-toggle') ? panel.offsetHeight : height - 4);
      const titlebar = panel.querySelector('.window-titlebar');
      const header = titlebar?.offsetHeight ? titlebar : null;
      const headerY = header ? Math.min(bottom, header.offsetHeight) : null;
      panel.style.setProperty('--frame-left', `${left}px`);
      panel.style.setProperty('--frame-cell', `${cellWidth}px`);
      panel.style.setProperty('--frame-title-y', `${(top + (headerY ?? bottom)) / 2}px`);
      const fragment = document.createDocumentFragment();
      const glyph = (text, x, y, className, phase) => {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        span.style.left = `${x}px`; span.style.top = `${y}px`;
        span.style.width = `${cellWidth}px`;
        span.style.setProperty('--glyph-phase', phase);
        return span;
      };
      // Trace inward from both ends, so all four corners launch together.
      const fromEnds = progress => Math.min(progress, 1 - progress) * 2;
      // Advance in discrete character batches instead of a continuous sweep.
      const traceStep = (progress, travel) => Math.ceil(progress * travel / .045 - 1e-9) * .045;
      const sidePhase = y => .09 + traceStep(fromEnds((y - top) / Math.max(1, bottom - top)), .36);
      const horizontal = (y, startPhase = .09, travel = .36) => {
        const edge = document.createElement('div');
        edge.className = 'assembly-edge';
        for (let column = 1; column < columns; column++) {
          const progress = fromEnds(column / columns);
          edge.append(glyph('-', left + column * cellWidth, y, 'frame-glyph', startPhase + traceStep(progress, travel)));
        }
        fragment.append(edge);
      };
      const vertical = x => {
        const edge = document.createElement('div');
        edge.className = 'assembly-edge';
        const stops = header ? [top, headerY, bottom] : [top, bottom];
        for (let section = 0; section < stops.length - 1; section++) {
          const start = stops[section], end = stops[section + 1];
          const rows = header && section === 0 ? 2 : Math.max(1, Math.round((end - start) / cellHeight));
          for (let row = 1; row < rows; row++) {
            const y = start + (end - start) * row / rows;
            edge.append(glyph('|', x, y, 'frame-glyph', sidePhase(y)));
          }
        }
        fragment.append(edge);
      };
      horizontal(top); vertical(right);
      horizontal(bottom); vertical(left);
      if (header) horizontal(headerY, sidePhase(headerY), .18);
      [[left, top], [right, top], [right, bottom], [left, bottom]].forEach(([x, y]) => {
        fragment.append(glyph('+', x, y, 'assembly-corner', 0));
      });
      if (header) fragment.append(glyph('+', left, headerY, 'frame-junction', sidePhase(headerY)), glyph('+', right, headerY, 'frame-junction', sidePhase(headerY)));
      this.element.replaceChildren(fragment);
      for (const group of panel.querySelectorAll('.intro,.experience,.education-group,.skills,.orientation-diagram,.orientation-readout')) {
        const blocks = [...group.querySelectorAll('h1,h2,h3,p')];
        if (!blocks.length) blocks.push(group);
        blocks.forEach((block, i) => {
          block.classList.add('terminal-reveal');
          block.style.setProperty('--text-phase', blocks.length > 1 ? i / (blocks.length - 1) * .24 : 0);
        });
      }
    };
    this.resize();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(panel);
  }
  remove() { this.observer.disconnect(); this.element.remove(); }
}

export class Entrance {
  constructor(target, reduced = false, { duration = 1.95, delay = 0, temporary = false } = {}) {
    duration *= loadingTimeScale;
    delay *= loadingTimeScale;
    this.elapsed = 0;
    this.duration = duration + delay;
    this.temporary = temporary;
    this.finished = false;
    this.panel = target?.matches('.portfolio-window,.orientation-indicator,.drawer-toggle') ? target : target?.querySelector('.portfolio-window');
    this.onFocus = () => this.finish();
    this.onAnimationEnd = event => {
      if (event.target === this.panel && event.animationName === 'wireframe-shell') this.finish();
    };
    if (!this.panel) { this.finish(); return; }
    this.ascii = new AsciiFrame(this.panel);
    this.frame = this.ascii.element;
    if (reduced) { this.finish(); return; }
    this.panel.style.setProperty('--assembly-duration', `${duration}s`);
    this.panel.style.setProperty('--assembly-delay', `${delay}s`);
    this.frame.classList.add('assembly-frame');
    this.panel.classList.add('is-assembling');
    this.panel.dataset.entrance = 'opening';
    this.panel.addEventListener('focusin', this.onFocus, { once: true });
    this.panel.addEventListener('animationend', this.onAnimationEnd);
  }
  update(dt) {
    this.elapsed += dt;
    if (!this.finished && this.elapsed >= this.duration + .1) this.finish();
  }
  finish() {
    this.finished = true;
    if (this.temporary) this.ascii?.remove();
    else this.frame?.classList.remove('assembly-frame');
    this.panel?.classList.remove('is-assembling');
    this.panel?.setAttribute('data-entrance', 'complete');
    this.panel?.removeEventListener('focusin', this.onFocus);
    this.panel?.removeEventListener('animationend', this.onAnimationEnd);
  }
}

// Assemble a terminal frame while preserving the panel's final layout.
// CSS draws the frame; focus, reduced motion and the render clock can finish it.
export class Entrance {
  constructor(target, reduced = false, { duration = 1.95, delay = 0 } = {}) {
    this.elapsed = 0;
    this.duration = duration + delay;
    this.finished = false;
    this.panel = target?.matches('.portfolio-window,.orientation-indicator,.drawer-toggle') ? target : target?.querySelector('.portfolio-window');
    this.onFocus = () => this.finish();
    this.onAnimationEnd = event => {
      if (event.target === this.panel && event.animationName === 'wireframe-shell') this.finish();
    };
    if (!this.panel || reduced) { this.finish(); return; }
    this.panel.style.setProperty('--assembly-duration', `${duration}s`);
    this.panel.style.setProperty('--assembly-delay', `${delay}s`);
    this.panel.style.setProperty('--assembly-border', getComputedStyle(this.panel).borderColor);
    this.frame = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.frame.classList.add('assembly-frame');
    this.frame.setAttribute('aria-hidden', 'true');
    const edgeCount = this.panel.matches('.drawer-toggle') ? 4 : 5;
    this.frame.innerHTML = Array.from({ length: edgeCount }, (_, i) => `<path class="assembly-edge" pathLength="1" style="--trace-phase:${i * .055}"/>`).join('')
      + [0, 1, 2, 3].map(i => `<path class="assembly-corner" style="--spark-phase:${i * .025}"/>`).join('');
    this.panel.append(this.frame);
    const resize = () => {
      const bounds = this.panel.getBoundingClientRect(), style = getComputedStyle(this.panel);
      const width = bounds.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
      const height = bounds.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
      this.frame.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const x = width - .5, y = height - .5;
      const headerHeight = this.panel.querySelector('.window-titlebar')?.getBoundingClientRect().height || 0;
      const paths = [`M.5 .5H${x}`, `M${x} ${y}V.5`, `M${x} ${y}H.5`, `M.5 .5V${y}`, `M.5 ${headerHeight}H${x}`];
      this.frame.querySelectorAll('.assembly-edge').forEach((path, i) => path.setAttribute('d', paths[i]));
      const corners = [[.5, .5], [x, .5], [x, y], [.5, y]];
      this.frame.querySelectorAll('.assembly-corner').forEach((marker, i) => {
        const [cx, cy] = corners[i];
        marker.setAttribute('d', `M${cx - 3} ${cy}h6M${cx} ${cy - 3}v6`);
      });
    };
    resize();
    this.observer = new ResizeObserver(resize);
    this.observer.observe(this.panel);
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
    this.observer?.disconnect();
    this.frame?.remove();
    this.panel?.classList.remove('is-assembling');
    this.panel?.setAttribute('data-entrance', 'complete');
    this.panel?.removeEventListener('focusin', this.onFocus);
    this.panel?.removeEventListener('animationend', this.onAnimationEnd);
  }
}

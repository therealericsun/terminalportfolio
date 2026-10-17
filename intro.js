// Open the terminal panel without changing, scrambling or hiding its HTML text.
// Its final dimensions are reserved from the start, so the layout stays still.
export class Entrance {
  constructor(main, reduced = false) {
    this.elapsed = 0;
    this.finished = false;
    this.panel = main?.querySelector('.portfolio-window');
    this.onFocus = () => this.finish();
    if (!this.panel || reduced) this.finish();
    else {
      this.panel.style.setProperty('--opening-offset', `${this.panel.clientHeight / 2 - .5}px`);
      this.panel.classList.add('is-opening');
      this.panel.dataset.entrance = 'opening';
      // Keyboard navigation should never land in content still being revealed.
      this.panel.addEventListener('focusin', this.onFocus, { once: true });
    }
  }
  update(dt) {
    this.elapsed += dt;
    if (!this.finished && this.elapsed >= 1) this.finish();
  }
  finish() {
    this.finished = true;
    this.panel?.classList.remove('is-opening');
    this.panel?.setAttribute('data-entrance', 'complete');
    this.panel?.removeEventListener('focusin', this.onFocus);
  }
}

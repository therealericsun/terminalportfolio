// Stagger the scramble across the whole portfolio without hiding the HTML,
// replacing elements, changing link targets, or disturbing the text layout.
const symbols = './\\|_-=+*#%@;:<>[]{}0123456789';
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const clamp = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
export class Entrance {
  constructor(main, reduced = false) {
    this.elapsed = 0; this.finished = false; this.lastFrame = -1; this.nodes = [];
    if (main) {
      const root = main.getBoundingClientRect(), range = document.createRange();
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      let index = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode, original = node.textContent;
        if (!original.trim()) continue;
        const ascii = Boolean(node.parentElement.closest('.ascii-name'));
        const chars = [...original], delays = []; let offset = 0;
        for (const char of chars) {
          range.setStart(node, offset); offset += char.length; range.setEnd(node, offset);
          const box = range.getBoundingClientRect();
          delays.push(.10 + clamp((box.top - root.top) / root.height) * .45
            + clamp((box.left - root.left) / root.width) * .25 + (index++ % 7) * .008);
        }
        this.nodes.push({ node, original, chars, delays, ascii, index });
      }
    }
    if (reduced) this.finish();
  }
  get boatProgress() { return smooth((this.elapsed - .16) / .85); }
  get vortexProgress() { return smooth((this.elapsed - 1.0) / 1.6); }
  update(dt) {
    const before = this.elapsed; this.elapsed += dt;
    const launch = before < .26 && this.elapsed >= .26;
    if (!this.finished && this.elapsed - this.lastFrame > 1 / 24) {
      this.lastFrame = this.elapsed;
      for (const entry of this.nodes) {
        const glyphs = entry.ascii ? symbols : letters;
        entry.node.textContent = entry.chars.map((char, n) => {
          // Keep punctuation and whitespace in prose, preserving word wrapping.
          if ((entry.ascii ? /\s/.test(char) : !/[A-Za-z0-9]/.test(char)) || this.elapsed >= entry.delays[n] + .24) return char;
          return glyphs[(Math.floor(this.elapsed * 28) + n * 7 + entry.index * 11) % glyphs.length];
        }).join('');
      }
      if (this.elapsed >= 1.2) this.finishText();
    }
    return launch;
  }
  finishText() { for (const n of this.nodes) n.node.textContent = n.original; this.finished = true; }
  finish() { this.elapsed = 3; this.finishText(); }
}

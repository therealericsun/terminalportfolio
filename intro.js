// Staggered text scramble inspired by the entrance on ertdfgcvb.xyz.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const main = document.querySelector('main');
  const targets = document.querySelectorAll('.intro-main, .directory, footer');
  const glyphs = './\\|_-=+*#%@;:<>[]{}0123456789';
  let priorNodes = [];
  let raf = 0;
  const scramble = () => glyphs[Math.floor(Math.random() * glyphs.length)];

  function playIntro() {
    cancelAnimationFrame(raf);
    for (const entry of priorNodes) entry.node.textContent = entry.original;

    const nodes = [];
    const pulses = [];
    const range = document.createRange();
    let glyphCount = 0, latestReveal = 0;
    for (const target of targets) {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const original = node.textContent;
        if (!original.trim()) continue;
        const chars = Array.from(original);
        const revealAt = chars.map((char, index) => {
          if (/\s/.test(char)) return 0;
          range.setStart(node, index);
          range.setEnd(node, index + char.length);
          const box = range.getBoundingClientRect();
          const parent = node.parentElement.getBoundingClientRect();
          const x = box.width ? box.left : parent.left;
          const y = box.height ? box.top : parent.top;
          const delay = 120 + Math.random() * 820;
          latestReveal = Math.max(latestReveal, delay);
          glyphCount++;
          if (box.width && (index === Math.floor(chars.length / 2) || glyphCount % 14 === 0)) {
            const heading = node.parentElement.closest('h1, h2, h3');
            pulses.push({ at: delay, x: x + box.width / 2, y: y + box.height / 2,
              strength: heading ? 1.75 : 1.45 });
          }
          return delay;
        });
        nodes.push({ node, original, chars, revealAt });
      }
    }
    range.detach();
    priorNodes = nodes;
    if (!nodes.length) return;
    pulses.sort((a, b) => a.at - b.at);
    let nextPulse = 0, lastFrame = -Infinity;
    main.setAttribute('aria-busy', 'true');
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      if (elapsed - lastFrame >= 42 || elapsed >= latestReveal) {
        lastFrame = elapsed;
        for (const entry of nodes) {
          if (elapsed >= latestReveal) {
            entry.node.textContent = entry.original;
            continue;
          }
          entry.node.textContent = entry.chars.map((char, i) =>
            elapsed >= entry.revealAt[i] ? char : /\s/.test(char) ? char : scramble()
          ).join('');
        }
        const settled = [];
        while (nextPulse < pulses.length && pulses[nextPulse].at <= elapsed) {
          settled.push(pulses[nextPulse++]);
        }
        if (settled.length) dispatchEvent(new CustomEvent('portfolio:text-glitch', { detail: settled }));
      }
      if (elapsed < latestReveal) raf = requestAnimationFrame(frame);
      else {
        raf = 0;
        main.removeAttribute('aria-busy');
        dispatchEvent(new Event('portfolio:intro-text-complete'));
      }
    }
    frame(start);
  }

  addEventListener('portfolio:reset-intro', playIntro);
  playIntro();
})();

import assert from 'node:assert/strict';

// Optional development tool; serving and building the site need no packages.
const { chromium, firefox, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.CRT_TEST_URL || 'http://127.0.0.1:4321';

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        deviceScaleFactor: mobile ? 2 : 1,
      });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        // EasyList treats styled crt-* divs as Criteo ads. Keep this rule active
        // throughout startup, resizing and CRT toggling to catch regressions.
        const hiding = document.createElement('style');
        hiding.textContent = 'div[id^="crt-"][style]{display:none!important}';
        const attach = () => {
          if (!document.documentElement) return;
          document.documentElement.append(hiding); observer.disconnect();
        };
        const observer = new MutationObserver(attach);
        observer.observe(document, { childList:true, subtree:true }); attach();
        window.startup = { reveals: [] };
        let booting = false;
        new MutationObserver(() => {
          const active = document.documentElement.classList.contains('crt-booting');
          if (booting && !active) window.startup.opened = performance.now();
          booting = active;
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
        document.addEventListener('crt:contentstart', () => {
          window.startup.content = performance.now();
          const nodes = [...document.querySelectorAll('.portfolio-window .terminal-reveal')];
          const seen = new Set();
          function sample() {
            if (!window.startup.frame && document.querySelector('.portfolio-window')?.dataset.frame === 'complete') {
              window.startup.frame = performance.now() - window.startup.content;
            }
            for (const [i, node] of nodes.entries()) {
              if (!seen.has(node) && getComputedStyle(node).visibility === 'visible') {
                seen.add(node);
                window.startup.reveals.push({ i, ms: performance.now() - window.startup.content });
              }
            }
            if (seen.size < nodes.length) requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        }, { once: true });
      });
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('.portfolio-window')?.dataset.entrance === 'complete');
      const screen = await page.locator('#screen-viewport').boundingBox();
      assert.ok(screen?.width > 300 && screen?.height > 500, 'ad-block cosmetic rules must not collapse the viewport');
      assert.equal(await page.getByRole('link', { name:'GitHub', exact:true }).isVisible(), true);
      const startup = await page.evaluate(() => window.startup);
      assert.ok(startup.content - startup.opened >= 980, 'one-second pause after screen opening');
      const reveal = i => startup.reveals.find(item => item.i === i)?.ms ?? Infinity;
      // Preserve Firefox’s sequence; a slow display frame may reveal adjacent steps together.
      assert.ok(reveal(0) - startup.frame >= 180, 'pause between the completed frame and text');
      assert.ok(reveal(0) < 2800 && reveal(0) <= reveal(3) && reveal(3) <= reveal(1), `Text reveal order: ${JSON.stringify(startup.reveals)}`);
      assert.equal(startup.reveals.length, 21, 'all text reveals individually');
      assert.ok(startup.reveals.every(item => item.ms < 3900), 'text reveals after the frame without waiting for panel teardown');
      for (const selector of ['.portfolio-window', '.orientation-indicator']) {
        assert.equal(await page.locator(`${selector}>canvas[data-crt-frame]`).count(), 1);
        assert.equal(await page.locator(selector).evaluate(e => getComputedStyle(e).backgroundImage), 'none');
      }
      assert.equal(await page.locator('#crt-effect').isChecked(), !mobile, 'CRT defaults off in the mobile layout');
      assert.equal(await page.locator('body').evaluate(e => e.classList.contains('crt-disabled')), mobile);
      assert.equal(await page.locator('#screen-page-details canvas[data-crt-renderer]').count(), 1);
      assert.equal(await page.locator('#screen-menu-details canvas[data-crt-renderer]').count(), 1);
      await page.keyboard.press('Tab');
      await page.locator('#drawer-toggle').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(280);
      if (mobile) {
        await page.locator('#crt-effect').focus();
        await page.keyboard.press('Space');
      }
      assert.equal(await page.locator('#ascii-name-canvas').evaluate(e => getComputedStyle(e).opacity), '0');
      assert.notEqual(await page.locator('#settings-surface').evaluate(e => getComputedStyle(e).filter), 'none');
      const repo = page.getByRole('link', { name: 'See Repo', exact: true });
      assert.equal(await repo.getAttribute('href'), 'https://github.com/therealericsun/crt-effect');
      await page.locator('#projection-depth').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#projection-depth').inputValue(), '5.1');
      const slider = page.locator('#projection-depth');
      const bounds = await slider.boundingBox();
      await slider.evaluate(e => {
        window.dragValues = [];
        e.addEventListener('input', () => window.dragValues.push(Number(e.value)));
      });
      await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .85, bounds.y + bounds.height / 2, { steps: 10 });
      await page.mouse.up();
      const dragValues = await page.evaluate(() => window.dragValues);
      assert.ok(dragValues.length >= 4, `continuous slider drag (${name}, ${mobile ? 'phone' : 'desktop'}): ${JSON.stringify(dragValues)}`);
      assert.ok(Number(await slider.inputValue()) > 6, 'drag reaches the higher value');
      for (let i = 0; i < 4; i++) {
        await page.locator('#crt-effect').focus();
        await page.keyboard.press('Space');
      }
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#drawer-toggle').evaluate(e => e === document.activeElement), true);
      assert.deepEqual(errors, []);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await page.waitForFunction(() => !document.documentElement.classList.contains('is-loading'));
      assert.equal(await page.locator('#crt-effect').isChecked(), true, 'saved opt-in survives reload');
      await page.evaluate(() => localStorage.setItem('tesseract:crt-effect', 'false'));
      await page.reload();
      await page.waitForFunction(() => !document.documentElement.classList.contains('is-loading'));
      assert.equal(await page.locator('#crt-effect').isChecked(), false, 'saved opt-out survives reload');
      console.log(`${name} ${mobile ? 'phone 2×' : 'desktop'}: startup, order, frame, slider dragging and repo link pass`);
      await page.close();
    }
    for (const module of ['screen-intro', 'tesseract']) {
      const page = await browser.newPage({ reducedMotion: 'reduce' });
      await page.route(`**/${module}.js*`, route => route.abort());
      await page.goto(url);
      await page.waitForFunction(() => !document.documentElement.matches('.is-loading,.crt-booting,.crt-powering,.content-hold'));
      assert.equal(await page.getByRole('link', { name: 'GitHub', exact: true }).isVisible(), true, `${module} failure must reveal the page`);
      await page.close();
    }
    const stalled = await browser.newPage({ reducedMotion: 'reduce' });
    await stalled.clock.install();
    await stalled.route('**/screen-intro.js*', route => route.fulfill({ contentType: 'text/javascript', body: '// Simulate an unfinished startup.' }));
    await stalled.goto(url);
    await stalled.clock.fastForward(11000);
    assert.equal(await stalled.getByRole('link', { name: 'GitHub', exact: true }).isVisible(), true, 'startup deadline reveals a stalled page');
    await stalled.close();
    const noStorage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await noStorage.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
    await noStorage.goto(url);
    await noStorage.waitForFunction(() => !document.documentElement.classList.contains('is-loading'));
    assert.equal(await noStorage.locator('#crt-effect').isChecked(), false, 'mobile fallback without storage');
    await noStorage.close();
    console.log(`${name}: blocked/stalled startup recovery and unavailable storage pass`);
  } finally {
    await browser.close();
  }
}

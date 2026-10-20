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
        window.startup = { reveals: [], fills: [], openingHeights: [], drawer: [] };
        let booting = false;
        new MutationObserver(() => {
          const active = document.documentElement.classList.contains('crt-booting');
          if (document.documentElement.classList.contains('crt-powering') && !window.startup.samplingOpening) {
            window.startup.samplingOpening = true;
            const sampleOpening = () => {
              window.startup.openingHeights.push(document.querySelector('#screen-viewport').getBoundingClientRect().height);
              if (document.documentElement.classList.contains('crt-powering')) requestAnimationFrame(sampleOpening);
            };
            requestAnimationFrame(sampleOpening);
          }
          if (booting && !active) window.startup.opened = performance.now();
          booting = active;
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
        document.addEventListener('crt:contentstart', () => {
          window.startup.content = performance.now();
          const drawerCanvas = document.querySelector('#settings-drawer>canvas[data-crt-frame]');
          const nodes = [...document.querySelectorAll('.portfolio-window .terminal-reveal')];
          const seen = new Set();
          function sample() {
            const drawer = document.querySelector('#settings-drawer');
            const toggle = document.querySelector('#drawer-toggle');
            if (drawer?.dataset.entrance === 'opening') {
              if (!window.startup.triedDrawer) {
                window.startup.triedDrawer = true;
                toggle.focus();
                toggle.dispatchEvent(new PointerEvent('pointerenter', { pointerType:'mouse' }));
                toggle.click();
              }
              window.startup.drawer.push({ top:drawer.offsetTop, inert:drawer.inert,
                open:drawer.classList.contains('is-open'), focused:drawer.contains(document.activeElement),
                sameCanvas:drawer.querySelector('canvas[data-crt-frame]') === drawerCanvas,
                canvases:drawer.querySelectorAll('canvas[data-crt-frame]').length,
                shadow:getComputedStyle(drawer).boxShadow,
                fill:parseFloat(drawer.style.backgroundSize.split(' ')[1]),
                layers:drawer.style.backgroundImage.split('linear-gradient').length - 1,
                origin:getComputedStyle(drawer).backgroundPositionY,
                visibleHeight:document.querySelector('#screen-viewport').getBoundingClientRect().bottom - drawer.getBoundingClientRect().top - drawer.clientTop });
              if (drawer.dataset.frame === 'complete' && window.startup.drawerSides === undefined) {
                const scale = drawerCanvas.width / drawer.clientWidth;
                const top = Math.ceil((toggle.offsetHeight + 3) * scale);
                const height = Math.max(1, Math.floor((window.startup.drawer.at(-1).visibleHeight - toggle.offsetHeight - 3) * scale));
                const pixels = drawerCanvas.getContext('2d').getImageData(0, top, Math.ceil(8 * scale), height).data;
                window.startup.drawerSides = pixels.some((value, i) => i % 4 === 3 && value > 0);
              }
            } else if (drawer?.dataset.entrance === 'complete') {
              window.startup.drawerReady = !drawer.inert;
              window.startup.drawerCanvasSame = drawer.querySelector('canvas[data-crt-frame]') === drawerCanvas;
              window.startup.drawerSettledTop = drawer.offsetTop;
            }
            const panel = document.querySelector('.portfolio-window');
            if (panel?.style.backgroundSize) {
              const height = parseFloat(panel.style.backgroundSize.split(' ')[1]);
              if (height !== window.startup.fills.at(-1)?.height) {
                const bottom = parseFloat(panel.style.backgroundPosition.split(',')[1]?.match(/[\d.]+px/)?.[0]);
                window.startup.fills.push({ height, bottom, panelHeight:panel.clientHeight,
                  layers:panel.style.backgroundImage.split('linear-gradient').length - 1, opacity:getComputedStyle(panel).opacity });
              }
            }
            if (!window.startup.frame && document.querySelector('.portfolio-window')?.dataset.frame === 'complete') {
              window.startup.frame = performance.now() - window.startup.content;
            }
            for (const [i, node] of nodes.entries()) {
              if (!seen.has(node) && getComputedStyle(node).visibility === 'visible') {
                seen.add(node);
                window.startup.reveals.push({ i, ms: performance.now() - window.startup.content });
              }
            }
            if (seen.size < nodes.length || !window.startup.drawerReady) requestAnimationFrame(sample);
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
      assert.ok(startup.drawer.length > 8, 'settings frame assembles across multiple frames');
      assert.ok(startup.drawer.every(state => state.top === startup.drawer[0].top), 'settings handle stays in its final position throughout startup');
      assert.ok(startup.drawer.every(state => state.inert && !state.open && !state.focused), 'hover, click and focus cannot interrupt the settings entrance');
      assert.ok(startup.drawer.every(state => state.sameCanvas && state.canvases === 1) && startup.drawerCanvasSame, 'the complete drawer frame persists from tracing through interaction');
      assert.equal(startup.drawerSides, true, 'the entrance includes ASCII sides below the header');
      assert.equal(startup.drawerSettledTop, startup.drawer.at(-1).top, 'unlocking the drawer does not shift its position');
      assert.ok(startup.drawer.every(state => state.shadow === 'none'), 'settings cast no shadow before they render');
      assert.ok(startup.drawer.every((state, i) => state.layers === 1 && state.origin === '0%' && (!i || state.fill >= startup.drawer[i - 1].fill)), 'settings background advances downward from its top edge');
      assert.ok(Math.abs(startup.drawer.at(-1).fill - startup.drawer.at(-1).visibleHeight) < .02, 'settings background covers the full visible drawer before completing');
      assert.equal(startup.drawerReady, true, 'settings become interactive after their entrance completes');
      assert.ok(startup.openingHeights.length > 10, 'opening reveal spans multiple display frames');
      assert.ok(Math.max(...startup.openingHeights) - Math.min(...startup.openingHeights) < 1, 'opening reveals a stable CRT picture without rescaling its geometry');
      assert.ok(startup.fills.length > 8, 'panel background fills in multiple terminal rows');
      assert.ok(startup.fills.every((fill, i) => fill.opacity === '1' && (!i || fill.height >= startup.fills[i - 1].height)), 'row fill advances without fading');
      assert.ok(startup.fills.every(fill => fill.layers === 2 && Math.abs(fill.bottom + fill.height - fill.panelHeight) < .01), 'equal background bands advance from both edges');
      assert.ok(Math.abs(startup.fills.at(-1).height * 2 - startup.fills.at(-1).panelHeight) < .01, 'both bands meet at the center before text appears');
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
      assert.equal(await page.locator('input[data-crt-option]:disabled').count(), mobile ? 3 : 0, 'CRT sliders follow the initial enabled state');
      assert.equal(await page.locator('body').evaluate(e => e.classList.contains('crt-disabled')), mobile);
      assert.equal(await page.locator('#screen-page-details canvas[data-crt-renderer]').count(), 1);
      assert.equal(await page.locator('#screen-menu-details canvas[data-crt-renderer]').count(), 1);
      await page.evaluate(() => {
        window.drawerChecks = { frames:0, maxDrift:0, uploads:0, layers:{} };
        for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
          for (const name of ['texImage2D', 'texSubImage2D']) {
            const original = C.prototype[name];
            C.prototype[name] = function(...args) {
              const host = this.canvas.parentElement?.id;
              window.drawerChecks.layers[host] = (window.drawerChecks.layers[host] || 0) + 1;
              if (this.canvas.parentElement?.id === 'screen-menu-details' || this.canvas.parentElement?.id === 'screen-page-details') window.drawerChecks.uploads++;
              return original.apply(this, args);
            };
          }
        }
        document.addEventListener('crt:frame', event => {
          if (!event.detail?.menuLayout || document.body.classList.contains('crt-disabled')) return;
          const output = document.querySelector('#screen-menu-details canvas[data-crt-renderer]');
          const gl = output.getContext(output.dataset.crtRenderer), program = gl.getParameter(gl.CURRENT_PROGRAM);
          const rect = gl.getUniform(program, gl.getUniformLocation(program, 'uRect0'));
          const host = output.parentElement.getBoundingClientRect();
          const source = document.querySelector('#settings-drawer>canvas[data-crt-frame]').getBoundingClientRect();
          const expected = (source.top - host.top) / (host.height / output.parentElement.clientHeight);
          window.drawerChecks.frames++;
          window.drawerChecks.maxDrift = Math.max(window.drawerChecks.maxDrift, Math.abs(rect[1] - expected));
        });
      });
      await page.keyboard.press('Tab');
      await page.locator('#drawer-toggle').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(280);
      if (!mobile) {
        const checks = await page.evaluate(() => window.drawerChecks);
        assert.ok(checks.frames > 2, 'drawer moves through multiple curved frames');
        assert.ok(checks.maxDrift < .01, 'GPU frame follows the background in the same paint');
        assert.equal(checks.uploads, 0, 'moving the drawer reuses cached menu and page textures');
      }
      if (mobile) {
        await page.locator('#crt-effect').focus();
        await page.keyboard.press('Space');
      }
      assert.equal(await page.locator('#ascii-name-canvas').evaluate(e => getComputedStyle(e).opacity), mobile ? '1' : '0', 'overflowing pages keep the name in their native scroll surface');
      assert.equal(await page.locator('#page-scroll').evaluate(e => getComputedStyle(e).filter === 'none'), !mobile, 'the shared scroll filter is used only when the page overflows');
      assert.notEqual(await page.locator('#settings-surface').evaluate(e => getComputedStyle(e).filter), 'none');
      const repo = page.getByRole('link', { name: 'see repo', exact: true });
      assert.equal(await repo.getAttribute('href'), 'https://github.com/therealericsun/crt-effect');
      assert.equal(await page.locator('#display-heading').textContent(), 'display');
      assert.equal(await page.locator('.settings-section>.panel-heading #crt-effect').count(), 1, 'CRT toggle sits in the display heading');
      assert.equal(await page.locator('.display-controls input[type=range]').count(), 6, 'display has three pairs of sliders');
      assert.deepEqual(await page.locator('input[data-crt-option]').evaluateAll(inputs => inputs.map(input => Number(input.max))), [10,40,40], 'CRT ranges allow useful adjustments without excessive sensitivity');
      assert.ok(await page.evaluate(() => Number(getComputedStyle(document.querySelector('#screen-viewport>[data-crt-generated="webgl-overlay"]')).zIndex) > Number(getComputedStyle(document.querySelector('#settings-surface')).zIndex)), 'texture overlay covers the native panels');
      assert.equal(await page.locator('input[data-crt-option]:disabled').count(), 0, 'enabled CRT exposes its controls');
      const headingX = (await page.locator('#crt-effect').boundingBox()).x;
      assert.ok(Math.abs(headingX - (await page.locator('#display-grain').boundingBox()).x) < 1, 'CRT checkbox aligns above the CRT slider column');
      const grid = await page.locator('.display-controls input').evaluateAll(inputs => inputs.map(input => ({ x:input.getBoundingClientRect().x, y:input.getBoundingClientRect().y })));
      for (let i = 0; i < 6; i += 2) assert.ok(Math.abs(grid[i].y - grid[i + 1].y) < 1 && grid[i].x < grid[i + 1].x, 'display sliders form aligned rows');
      const effectUniforms = () => page.evaluate(() => {
        const canvas = document.querySelector('#screen-viewport>canvas[data-crt-renderer]');
        const gl = canvas.getContext(canvas.dataset.crtRenderer), program = gl.getParameter(gl.CURRENT_PROGRAM);
        return {
          ...Object.fromEntries(['Glow','Curvature'].map(name => [name, gl.getUniform(program, gl.getUniformLocation(program, 'u' + name))])),
          Grain:Number(document.querySelector('#screen-viewport>[data-crt-generated="webgl-overlay"] [data-crt-grain]').style.opacity),
          Mask:Number(document.querySelector('#screen-viewport>[data-crt-generated="webgl-overlay"]').children[1].style.opacity),
          Scanlines:Number(document.querySelector('#screen-viewport>[data-crt-generated="webgl-overlay"] [data-crt-scanlines]').style.opacity),
        };
      });
      const beforeEffects = await effectUniforms();
      assert.equal(beforeEffects.Scanlines, 0, 'phosphor mask replaces scanlines');
      for (const [key, value] of Object.entries({Grain:.025, Mask:.2, Glow:.1})) {
        assert.ok(Math.abs(beforeEffects[key] - value) < .00001, `${key} uses its requested default`);
      }
      for (const [id, uniform] of [['display-grain','Grain'], ['display-mask','Mask'], ['display-glow','Glow']]) {
        const control = page.locator('#' + id);
        const initial = Number(await control.inputValue());
        await control.focus(); await page.keyboard.press('ArrowRight');
        const value = Number(await control.inputValue());
        assert.ok(value > initial, 'CRT setting responds to keyboard input');
        assert.ok(Math.abs((await effectUniforms())[uniform] - value / 100) < .00001, 'CRT slider updates the GPU setting');
      }
      assert.equal(Number(await page.locator('#face-detail').inputValue()), 60, 'CRT sliders do not alter face texture');
      assert.equal((await effectUniforms()).Curvature, beforeEffects.Curvature, 'CRT controls keep curvature fixed');
      assert.notEqual(await page.locator('.tagline').evaluate(e => getComputedStyle(e).textShadow), 'none', 'HTML text shares the glow treatment');
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
      assert.equal(await slider.evaluate(e => getComputedStyle(e).outlineStyle), 'none', 'pointer dragging has no yellow outline');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await slider.evaluate(e => getComputedStyle(e).outlineStyle), 'none', 'keyboard focus has no box');
      assert.equal(await slider.evaluate(e => getComputedStyle(e.parentElement.querySelector('.setting-heading>span')).textDecorationLine), 'none', 'slider focus does not underline its label');
      for (let i = 0; i < 4; i++) {
        await page.locator('#crt-effect').focus();
        await page.keyboard.press('Space');
        assert.equal(await page.locator('input[data-crt-option]:disabled').count(), (await page.locator('#crt-effect').isChecked()) ? 0 : 3, 'CRT toggle enables and disables its three sliders');
        assert.equal(await page.locator('#face-detail').isEnabled(), true, 'scene controls stay enabled');
      }
      // Toggling CRT changes viewport insets and resizes the frame canvases.
      // Let those resize uploads settle before measuring drawer-only motion.
      await page.waitForTimeout(300);
      await page.evaluate(() => Object.assign(window.drawerChecks, { frames:0, maxDrift:0, uploads:0 }));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(280);
      const closing = await page.evaluate(() => window.drawerChecks);
      assert.ok(closing.frames > 2 && closing.maxDrift < .01, 'closing frame stays aligned with its curved background');
      // Mobile closing also resizes/repositions the page artwork; resized frame
      // canvases need fresh pixels, unlike the stationary desktop layout.
      if (!mobile) assert.equal(closing.uploads, 0, 'closing also reuses static textures');
      assert.equal(await page.locator('#drawer-toggle').evaluate(e => e === document.activeElement), true);
      assert.deepEqual(errors, []);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(100);
      for (const [selector, expected] of [['#settings-drawer>canvas[data-crt-frame]', ['screen-menu-details']], ['.orientation-indicator>canvas[data-crt-frame]', mobile ? [] : ['screen-page-details']], ['.portfolio-window>canvas[data-crt-frame]', mobile ? [] : ['screen-page-details']]]) {
        await page.evaluate(selector => {
          window.drawerChecks.layers = {};
          document.dispatchEvent(new CustomEvent('crt:frame', { detail:{ graphics:true, source:document.querySelector(selector) } }));
        }, selector);
        const layers = await page.evaluate(() => window.drawerChecks.layers);
        assert.deepEqual(Object.keys(layers), expected, 'native page frames need no GPU copy; independent frames upload only their own layer');
      }
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
    for (const mobile of [false, true]) {
      const page = await browser.newPage({viewport:mobile ? {width:390,height:844} : {width:1440,height:1000}, reducedMotion:'reduce'});
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('.portfolio-window')?.dataset.entrance === 'complete');
      await page.keyboard.press('Tab'); await page.locator('#drawer-toggle').focus(); await page.keyboard.press('Enter');
      for (const reducedMotion of ['reduce', 'no-preference']) {
        await page.emulateMedia({reducedMotion});
        // WebKit applies emulated media preferences on a later presentation frame.
        await page.waitForFunction(reduce => matchMedia('(prefers-reduced-motion:reduce)').matches === reduce
          && document.querySelector('#auto-rotate').checked === !reduce, reducedMotion === 'reduce');
        const state = await page.evaluate(() => {
          const toggle = (id, checked) => { const e=document.querySelector('#'+id); e.checked=checked; e.dispatchEvent(new Event('change',{bubbles:true})); };
          toggle('crt-effect', true);
          for (const input of document.querySelectorAll('#settings-drawer input[type=range]')) {
            input.value=Number(input.min)+(Number(input.max)-Number(input.min))*.7;
            input.dispatchEvent(new Event('input',{bubbles:true}));
          }
          toggle('auto-rotate', matchMedia('(prefers-reduced-motion:reduce)').matches);
          toggle('mouse-follow', false);
          document.querySelector('#shape-seed').value='reset-check'; document.querySelector('#shape-form').requestSubmit();
          toggle('crt-effect', matchMedia('(max-width:900px)').matches);
          document.querySelector('#rotation-reset').click();
          const scene=document.querySelector('#tesseract');
          return {values:Object.fromEntries([...document.querySelectorAll('#settings-drawer input[type=range]')].map(e=>[e.id,Number(e.value)])),
            crt:document.querySelector('#crt-effect').checked, disabled:document.querySelectorAll('input[data-crt-option]:disabled').length,
            auto:document.querySelector('#auto-rotate').checked, follow:document.querySelector('#mouse-follow').checked,
            seed:document.querySelector('#shape-seed').value, shape:scene.dataset.shape, preference:localStorage.getItem('tesseract:crt-effect'),
            outputs:[...document.querySelectorAll('input[data-crt-option]')].map(e=>e.parentElement.querySelector('output').value)};
        });
        assert.deepEqual(state.values, {'angle-xy':0,'angle-xz':26.4,'angle-yz':20.6,'angle-xw':0,'angle-yw':0,'angle-zw':0,
          'rotation-speed':1,'projection-depth':5,'face-detail':60,'edge-width':1,'display-grain':2.5,'display-mask':20,'display-glow':10}, 'reset restores every slider');
        assert.deepEqual({...state,values:undefined}, {values:undefined,crt:!mobile,disabled:mobile?3:0,auto:reducedMotion==='no-preference',follow:true,seed:'tesseract',shape:'tesseract',preference:null,outputs:['2.5%','20%','10%']}, 'reset restores toggles, seed, CRT preference and outputs');
        await page.evaluate(() => {const e=document.querySelector('#crt-effect'); e.checked=true; e.dispatchEvent(new Event('change',{bubbles:true}));});
        const applied = await page.evaluate(() => {
          const overlay=document.querySelector('#screen-viewport>[data-crt-generated="webgl-overlay"]');
          return {grain:Number(overlay.querySelector('[data-crt-grain]').style.opacity),mask:Number(overlay.querySelector('[data-crt-mask]').style.opacity),
            glow:[...document.querySelectorAll('canvas[data-crt-renderer]')].filter(canvas=>getComputedStyle(canvas).display!=='none').map(canvas=>{const gl=canvas.getContext(canvas.dataset.crtRenderer);return gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),'uGlow'));})};
        });
        assert.equal(applied.grain,.025); assert.equal(applied.mask,.2);
        assert.ok(applied.glow.every(value=>Math.abs(value-.1)<.00001), 'reset reaches every active GPU frame/name layer');
      }
      await page.close();
    }
    console.log(`${name}: all settings reset to defaults on desktop/mobile, with reduced motion respected`);
    for (const viewport of [{width:1024,height:700}, {width:900,height:540}, {width:390,height:844}]) {
      const page = await browser.newPage({viewport, deviceScaleFactor:2, reducedMotion:'reduce'});
      await page.addInitScript(() => localStorage.setItem('tesseract:crt-effect', 'true'));
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('.portfolio-window')?.dataset.entrance === 'complete');
      await page.waitForFunction(() => document.querySelector('#screen-viewport').dataset.crtScroll === 'native');
      const scroll = await page.evaluate(async () => {
        const host = document.querySelector('#page-scroll');
        const panel = document.querySelector('.portfolio-window');
        const frame = panel.querySelector('.ascii-frame');
        const name = panel.querySelector('#ascii-name-canvas');
        const footer = document.querySelector('footer');
        const id = getComputedStyle(host).filter.match(/#([^"\)]+)/)[1];
        const map = document.getElementById(id).querySelector('feImage');
        const initialMap = map.getAttribute('href');
        const maxScroll = host.scrollHeight - host.clientHeight;
        const original = [panel, frame, name].map(el => el.getBoundingClientRect().top);
        let drift = 0;
        for (const fraction of [0, .25, .5, .75, 1, .5, 0]) {
          host.scrollTop = Math.round(maxScroll * fraction);
          await new Promise(requestAnimationFrame);
          const bounds = [panel, frame, name].map(el => el.getBoundingClientRect().top);
          for (let i = 0; i < bounds.length; i++) drift = Math.max(drift, Math.abs(bounds[i] - original[i] + host.scrollTop));
          if (map.getAttribute('href') !== initialMap) throw new Error('Scrolling regenerated the curvature map');
        }
        return {maxScroll, drift, footerGap:footer.getBoundingClientRect().top - panel.getBoundingClientRect().bottom,
          native:[frame,name].every(el => getComputedStyle(el).opacity === '1'),
          nestedFilters:[panel,footer].some(el => getComputedStyle(el).filter !== 'none')};
      });
      assert.ok(scroll.maxScroll > 0, 'compact layouts exercise a scrolling page');
      assert.ok(scroll.drift < .1, 'name, frame and panel follow the same native scroll offset');
      assert.ok(scroll.footerGap >= 16, 'copyright stays below the complete panel');
      assert.equal(scroll.native, true, 'scrolling canvases remain in the native scroll surface');
      assert.equal(scroll.nestedFilters, false, 'page content receives the common curvature exactly once');
      assert.deepEqual(await page.evaluate(() => {
        const host = document.querySelector('#page-scroll');
        host.scrollTop = host.scrollHeight;
        return [getComputedStyle(document.querySelector('#ascii-name-canvas')).opacity, getComputedStyle(document.querySelector('.portfolio-window>.ascii-frame')).opacity];
      }), ['1','1']);
      if (viewport.width === 1024) {
        await page.setViewportSize({width:1440,height:1000});
        await page.waitForFunction(() => document.querySelector('#screen-viewport').dataset.crtScroll === 'gpu');
        assert.equal(await page.locator('#ascii-name-canvas').evaluate(e => getComputedStyle(e).opacity), '0', 'fitting layouts return to cached GPU graphics');
        assert.ok(await page.locator('#screen-page-details canvas[data-crt-renderer]').evaluate(canvas => {
          const gl = canvas.getContext(canvas.dataset.crtRenderer), program = gl.getParameter(gl.CURRENT_PROGRAM);
          return Math.abs(gl.getUniform(program, gl.getUniformLocation(program, 'uGlow')) - .1) < .00001;
        }), 'reenabling cached GPU graphics applies the current glow setting');
        await page.setViewportSize(viewport);
        await page.waitForFunction(() => document.querySelector('#screen-viewport').dataset.crtScroll === 'native');
        assert.equal(await page.locator('#ascii-name-canvas').evaluate(e => getComputedStyle(e).opacity), '1', 'resizing back restores one native scroll surface');
      }
      await page.close();
    }
    console.log(`${name}: compact desktop, landscape and phone scrolling share one curvature map; copyright remains below the panel`);
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

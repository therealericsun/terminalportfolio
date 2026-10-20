# Tesseract page

Plain HTML, CSS and JavaScript. Page assets live in `public/tesseract/assets/`. Run `npm run dev` from the repository root, then open <http://localhost:4321>.

- Drag the shape, follow the pointer, or use the settings drawer to change rotation, speed, perspective and shading.
- Display pairs the scene controls with CRT grain (2.5%), phosphor mask (20%) and glow (10%) sliders; curvature stays fixed. Reset restores every scene/display setting and the default CRT toggle for the current layout.
- One texture overlay covers the artwork and native panels; its phosphor mask follows the screen curvature.
- Enter a seed to reproduce a shape; `tesseract` restores the default.
- CRT defaults off in the mobile layout (900px and narrower); a saved toggle preference takes priority. Reduced motion skips the startup and freezes animation.
- `tesseract.js` renders the scene, `tesseract-math.js` handles projection, and `polytope.js` generates seeded shapes.
- Startup reveals the screen outward from its center without rescaling the CRT, waits one second, traces each frame while opaque background rows fill inward from the top and bottom, then pauses 220ms before revealing its text. The settings drawer extends below the screen, so its full visible frame and background reveal downward instead; it becomes interactive when that entrance finishes.
- The drawer uses a stationary filter sized to its expanded height; its GPU frame moves with the background using cached textures.
- When the page overflows, the portfolio, its ASCII frame and name, and the copyright share one stationary native curvature filter on `#page-scroll`. They move together in the browser's scroll surface, with no separately positioned GPU copy. Fitting layouts retain the smaller filtered surfaces and cached GPU graphics; resizing switches automatically. The copyright follows the panel in normal flow with at least 16px of separation.
- `crt-init.js` applies the vendored CRT library independently of the renderer.
- The scene, page and menu graphics track changes separately, so repainting one frame does not upload unrelated textures. Native portfolio/name updates in scrolling layouts do not require a GPU upload. Strut lighting runs only for depth-visible samples; projection and face interpolation use scalar arithmetic in their inner loops. Joint normals are reused, and control labels are written only when their displayed values change.

Run `npm run check`, `npm test`, and `npm run build` before publishing. Update the CRT distribution with `npm run sync:crt` after building the sibling library.

Optional browser checks: with the dev server running, install Playwright using `npm install --no-save --package-lock=false playwright@1.64.1`, run `npx playwright install`, then `npm run test:browser`.

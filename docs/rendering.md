# Tesseract page

Plain HTML, CSS and JavaScript. Page assets live in `public/tesseract/assets/`. Run `npm run dev` from the repository root, then open <http://localhost:4321>.

- Drag the shape, follow the pointer, or use the settings drawer to change rotation, speed, perspective and shading.
- Display pairs the scene controls with CRT grain (2.5%), phosphor mask (20%) and glow (10%) sliders; curvature stays fixed. Reset restores every scene/display setting and the default CRT toggle for the current layout.
- One texture overlay covers the artwork and native panels; its phosphor mask follows the screen curvature. Glow also applies to frame graphics and HTML text.
- Enter a seed to reproduce a shape; `tesseract` restores the default.
- CRT defaults off in the mobile layout (900px and narrower); a saved toggle preference takes priority. Reduced motion skips the startup and freezes animation.
- `tesseract.js` renders the scene, `tesseract-math.js` handles projection, and `polytope.js` generates seeded shapes.
- Startup reveals the screen outward from its center without rescaling the CRT, waits one second, traces each frame while opaque background rows fill inward from the top and bottom, then pauses 220ms before revealing its text.
- The drawer uses a stationary filter sized to its expanded height; its GPU frame moves with the background using cached textures.
- `crt-init.js` applies the vendored CRT library independently of the renderer.

Run `npm run check`, `npm test`, and `npm run build` before publishing. Update the CRT distribution with `npm run sync:crt` after building the sibling library.

Optional browser checks: with the dev server running, install Playwright using `npm install --no-save --package-lock=false playwright@1.64.1`, run `npx playwright install`, then `npm run test:browser`.

# Tesseract page

Plain HTML, CSS and JavaScript. Page assets live in `public/tesseract/assets/`. Run `npm run dev` from the repository root, then open <http://localhost:4321>.

- Drag the shape, follow the pointer, or use the settings drawer to change rotation, speed, perspective and shading.
- Enter a seed to reproduce a shape; `tesseract` restores the default.
- The CRT toggle persists locally. Reduced motion skips the startup and freezes animation.
- `tesseract.js` renders the scene, `tesseract-math.js` handles projection, and `polytope.js` generates seeded shapes.
- `crt-init.js` applies the vendored CRT library independently of the renderer.

Run `npm run check`, `npm test`, and `npm run build` before publishing. Update the CRT distribution with `npm run sync:crt` after building the sibling library.

Optional browser checks: with the dev server running, install Playwright using `npm install --no-save --package-lock=false playwright@1.64.1`, run `npx playwright install`, then `npm run test:browser`.

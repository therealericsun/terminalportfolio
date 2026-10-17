# Eric Sun — ASCII tesseract portfolio

A single-page portfolio with an animated, shaded ASCII tesseract. The portfolio and simulation share a near-black, ember orange, gold and cream palette. The text is visible immediately, even without JavaScript. No additional runtime dependencies.

## Development

```sh
npm run dev
```

Open <http://127.0.0.1:8765/>. The site uses plain HTML, CSS and JavaScript and needs no build step or package installation.

## Rendering and behavior

The geometry has 16 vertices, 32 cylindrical edges and 24 translucent square faces. Independent rotations in the XW, YW and ZW planes produce the changing 4-D perspective projection; the result also rotates in 3-D. A software character rasterizer uses perspective-correct depth, lightly shaded faces with sparse diagonal hatching, depth-tested struts, spherical joints, Lambert diffuse and Blinn specular lighting. Brightness selects both glyph density and a shared ember, orange, gold and cream palette. Shading uses geometric normals and a fixed upper-left light.

On first appearance, a 2.6-second assembly sequence sparks the vertices, traces the edges from both ends, and sweeps shimmering characters across the faces. Rotation eases into its normal speed. The sequence waits until the scene enters the viewport, pauses offscreen, survives resizing without replaying, and is skipped for reduced motion or direct dragging.

The scene is the only visual element beside the portfolio; there are no captions or buttons. Drag it to orbit. On desktop the portfolio content is vertically centered beside the simulation, with the copyright kept at the bottom. On narrow screens the scene follows the portfolio. The default rotation runs at twice the original speed. The animation draws at 30 fps, caps backing-store density at 2×, suspends when hidden or offscreen, and stays static for reduced-motion visitors. Mobile vertical swipes remain available for scrolling.

`tesseract-math.js` owns the geometry/projection and `tesseract.js` owns rendering and interaction. `style.css` contains the variant layout. The renderer shares the body’s font family and weight, with smaller 8–11px characters and compact line spacing for a denser animation.

## Validation

```sh
npm run check
npm test
```

Tests cover topology, rotation invariance, projection bounds and directional lighting, alongside the retained beach simulation tests.

## Deployment

Pushing to `main` runs validation and deploys the homepage and its static assets to GitHub Pages. `CNAME` retains the custom domain. The earlier beach renderer and physics sources remain available in Git history and the repository but are not shipped by the deployment workflow.

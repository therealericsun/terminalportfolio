# Eric Sun — ASCII 4D polytope portfolio

A single-page portfolio with an animated, shaded ASCII 4D polytope. The portfolio and simulation share a near-black, ember orange, gold and cream palette. The HTML text remains readable and available without JavaScript. With motion enabled, the portfolio terminal expands upward and downward from a central horizontal line, carrying its title bar and bottom border outward without scrambling its text. A beveled ASCII name uses the simulation’s fine character scale to unify the two sides of the page. No additional runtime dependencies.

## Development

```sh
npm run dev
```

Open <http://127.0.0.1:8765/>. The site uses plain HTML, CSS and JavaScript and needs no build step or package installation.

## Rendering and behavior

Every page load starts with a fresh random seed, shown in the editable field for reproduction. Each seed deterministically generates an irregular convex 4D polytope with 12–16 vertices. Supporting tetrahedral cells determine its actual edges and triangular faces; points are centered and bounded by a radius-2 hypersphere. Independent rotations in the XW, YW and ZW planes produce the changing 4-D perspective projection; the result also rotates in 3-D. A software character rasterizer uses perspective-correct depth, lightly shaded faces with sparse diagonal hatching, depth-tested struts, spherical joints, Lambert diffuse and Blinn specular lighting. Brightness selects both glyph density and a shared ember, orange, gold and cream palette. Shading uses geometric normals and a fixed upper-left light.

On first appearance, a 4.2-second assembly sequence sparks the vertices, traces the edges from both ends, and sweeps shimmering characters across the faces. Rotation eases into its normal speed. The sequence waits until the scene enters the viewport, pauses offscreen, survives resizing without replaying, and is skipped for reduced motion or direct dragging.

The `~/info` window contains the portfolio, and `~/render/settings` controls the renderer. Six compact sliders expose XY, XZ, YZ, XW, YW and ZW rotation angles. They share the renderer’s orientation state, so animation, direct dragging and slider changes remain synchronized. Drag to adjust XZ/YZ, or Shift-drag to adjust XW/YW. The default-enabled follow mouse checkbox on the rotation side lets mouse movement anywhere on the page turn the polytope without pressing a button; settings controls remain steady while editing. Extra-dimensional rotation continues during mouse control and held drags. Disabling follow mouse restores click-and-drag. Animation yields while a slider is being adjusted, then resumes from that orientation. Every slider also supports native keyboard input. A single bottom drawer contains the six rotation angles and the remaining settings, with a visual divider between the two groups. On page load, its handle rises smoothly from below the viewport without overshooting; reduced motion skips this entrance. The entire panel opens and closes together; Escape closes it and returns focus to the drawer handle. Hidden controls are inert. Speed (including zero), Auto rotate, and Follow mouse sit with the rotation angles. Auto rotate replaces pause/play, and manual mouse interaction still works when it is off. The settings side contains 4-D perspective, face texture, edge width (0.5–1.5×), and a random seed field with Regenerate. An edited seed reproduces its shape; Regenerate rolls a fresh seed when unchanged, and replays assembly while preserving rotation and render settings. Reset restores the current page’s initial seed. With face texture disabled, the shape is a wireframe. Face texture defaults to 50% and 4-D perspective to 5.0. Reset sits above the angles and restores defaults and replays the assembly sequence even while rotation is paused, unless reduced motion is enabled. Perspective uses a bounding-sphere correction to keep arbitrary orientations in frame. On desktop the portfolio content is vertically centered beside the simulation, with the copyright kept at the bottom. On narrow screens the scene follows the portfolio with the copyright beneath it. Phone layouts use consistent gutters, separate company, role and location lines, and evenly spaced education and skills sections. Opening the drawer scales the scene to the remaining viewport so it and the copyright stay above the settings. The speed slider is rebased so its 1× default runs at the previous 2× rate (four times the original rotation speed); all other speeds scale proportionally. The animation draws at 30 fps, caps backing-store density at 2×, suspends when hidden or offscreen, and stays static for reduced-motion visitors. Mobile vertical swipes remain available for scrolling.

`polytope.js` generates the seeded 4D convex hull; `tesseract-math.js` owns the six-angle orientation state and projection; `tesseract.js` owns rendering and interaction. `ascii-name.js` renders the beveled name; `ascii-theme.js` supplies the shared ember-to-cream lighting ramp used by both the name and shape. `style.css` contains the variant layout. The name and simulation share the body’s font family and weight, and use the same responsive 8–11px glyph size and compact line spacing. The compact 12px portfolio and controls sit in matching square terminal-style frames; sliders are rectangular fill meters with native pointer and keyboard interaction.

## Validation

```sh
npm run check
npm test
```

Tests cover seed reproducibility, closed 4D hull topology, supporting facets, bounded seeded projections, rotation invariance, all six rotation planes, continuous angle wrapping, projection bounds at arbitrary orientations and perspective settings, and directional lighting, alongside the retained beach simulation tests.

## Deployment

Pushing to `main` runs validation and deploys the homepage and its static assets to GitHub Pages. `CNAME` retains the custom domain. The earlier beach renderer and physics sources remain available in Git history and the repository but are not shipped by the deployment workflow.

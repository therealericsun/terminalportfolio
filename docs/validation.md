# Verification · 2026-10-18

- Website: syntax/reference checks, 12 geometry/shape tests and the static build pass. Six browser runs cover Chromium 156, Firefox 157 and WebKit 27.2 at desktop and 2× phone sizes.
- CRT library: three geometry tests and 90 browser checks cover SVG/WebGL curvature, shared coordinates, source visibility, native interaction, resizing, scrolling, context recovery and complete teardown.
- Startup uses one JavaScript presentation clock, preserving Firefox’s reveal order across engines. Checks enforce the one-second pause after screen opening and a 220ms pause between completed frames and their text. Reduced motion skips startup; background tabs pause animation. The screen expansion uses eased, monotonic scaling; frame tracing uses 60Hz presentation steps with short glyph fades. The extra colored startup line is removed.
- ASCII artwork, names and frames use shared-screen WebGL passes. Native text and controls use the same viewport displacement on stationary surfaces. The drawer moves in normal flow; its map remains unchanged during expansion. Pixel checks verify curvature during movement and on the name. Frames are painted once, eliminating Safari’s duplicate bottom edges.
- Browser checks cover continuous pointer dragging, native keyboard controls, repeated CRT toggles, Escape focus restoration, the repository link and error-free startup. Production checks also cover scrolling, missing assets and rendering without JavaScript.
- Safari 26.5 was inspected directly for the name, portfolio/orientation frames, and collapsed/expanded settings. Automated WebKit checks exercise motion and slider dragging; they do not replace testing every Safari/device release.
- Firefox measured roughly 26 rendered frames/sec at 1440×1000 with 2× density, versus roughly 11 with the former full-page SVG pass. Hardware affects results. The background copy remains because removing it alone did not resolve the bottleneck.
- Inactive Astro code, models, demos, images and fonts were removed. Assets live under `public/tesseract/assets/`; there are no website npm dependencies. The former Astro build failed on missing `src/scripts/transformer.ts`; the active static build passes.

Blocked startup-module and stalled-startup checks verify that the portfolio becomes visible instead of remaining behind a black gate. The aperture also refreshes synchronously when the opening finishes. Mobile defaults, saved opt-in/opt-out and unavailable storage are covered in all three engines. The live-only Firefox black screen was reproduced with EasyList’s `div[id^="crt-"][style]` cosmetic rule: it hid the entire viewport. Screen containers now use `screen-*` IDs, and the regression suite runs with that rule injected.

Renderer checks cover collapsed hosts, GPU source-size limits and context-loss mask cleanup. Hidden layers skip texture uploads; settled frame canvases are reused while the tesseract animates.

## Firefox performance · 2026-10-19

Measured before/after on the same machine using Playwright Firefox 157, a 1440×1000 viewport at 2× density, CRT enabled, five seconds of settled animation and four drawer toggles. Instrumentation counts requestAnimationFrame callbacks, scene draws and WebGL texture uploads. These short, headless measurements include instrumentation overhead and are comparisons rather than guarantees for other devices.

| Measurement | Before | After |
| --- | ---: | ---: |
| Settled animation callbacks/sec | 29.0 | 40.0 |
| Settled scene draws/sec (30 FPS cap) | 28.4 | 30.0 |
| 95th-percentile callback interval | 41.6 ms | 34.1 ms |
| Callbacks/sec during drawer toggles | 28.5 | 43.7 |
| Scene texture uploads during startup | 470 | 236 |

Foreground struts now use the same visibility-first scalar lighting path as the backdrop. Face interpolation avoids temporary arrays, joint normals are precomputed, glyph batches are flat, and unchanged labels/slider styles skip DOM writes. Frame repaint events identify their source so the compositor uploads only the affected scene/page/menu layer.

The foreground and backdrop canvases match the previous renderer pixel-for-pixel for the static default tesseract and a generated `firefox-perf` shape at the default orientation. Browser regression checks verify isolated page/menu uploads as well as startup, drawer alignment, sliders, saved preferences and reduced motion in Firefox and Chromium on desktop and phone sizes. The SVG-based native-text curvature remains a possible Firefox-specific cost; it was retained to preserve the visual treatment.

## Shared scrolling surface · 2026-10-19

The copyright now follows the full panel in normal flow instead of overlapping its lower edge on compact desktop layouts. When the page overflows, its background, text, ASCII outline and name are rendered inside the same stationary filter on the scroll host. Page canvases stay native rather than being copied into a separately positioned WebGL layer. Fitting layouts retain the smaller filters and cached GPU graphics to avoid the Firefox cost of filtering an entire viewport unnecessarily; resizing switches rendering modes automatically. The settings drawer keeps its independent cached GPU frame.

Chromium, Firefox and WebKit checks cover 1024×700 compact desktop, 900×540 landscape and 390×844 phone layouts with CRT enabled at 2× density. They verify at least 16px of footer clearance, identical native scroll offsets for the panel/name/outline across seven scroll positions, no nested panel/footer curvature, an unchanged displacement image throughout scrolling, and round-trip resizing between native scrolling and cached GPU modes. The existing startup, drawer, slider, reduced-motion, storage and recovery suites also pass in all three engines.

A follow-up Firefox benchmark at 1440×1000 and 2× density retains 30 scene draws/sec. Settled animation callbacks measured 43.3/sec versus 45.6/sec before this change in short five-second samples; the adaptive path preserves the cached rendering used by fitting layouts.

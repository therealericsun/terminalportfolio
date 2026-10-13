# Eric Sun

A minimal, single-page portfolio at [ericsun.net](https://ericsun.net/). Experience, education, skills, contact links, and the resume sit beside an interactive textmode sea. The site uses semantic HTML, CSS, and JavaScript, with no runtime dependencies or build step.

The text directory and character scramble are inspired by [ertdfgcvb.xyz](https://ertdfgcvb.xyz/); the fluid field draws inspiration from [Textmode Overlay](https://extension.textmode.art/). The simulation and boat are original canvas sketches.

The entrance holds on the sea, then an ASCII boat rises with a red splash. Text glitches into place and disturbs the water. A blue whirlpool appears with a draggable ASCII marker. The boat has inertia and follows the local water velocity and surface slopes, with no scripted orbit or attraction to the marker. Four hull samples drive drag, buoyancy, and tilt. Horizontal motion uses the same staggered pressure-gradient acceleration as the water, plus relative-flow drag with a 0.31-second response time. Including the hull pressure in that gradient prevents its own surface depression from acting as a driving force; drag returns momentum to the water, while a moving hull pressure load creates bow/stern disturbances. White foam depends on speed relative to the water, rather than screen speed.

`water.js` evolves surface height and staggered horizontal velocities using a depth-averaged shallow-water approximation. Gravity accelerates water down surface gradients; conservative upwind depth flux changes the surface height. Self-advection and mild damping evolve the currents. Text cells and viewport edges close water faces, reflecting waves. The whirlpool applies only smooth tangential forcing to the water; moving its marker changes new forcing while existing currents and waves continue evolving. Splashes are balanced crest/trough impulses, so they add energy without adding water volume. Overlapping splash amplitudes are limited to keep positive depth.

The ASCII glyphs read the same heights and slopes as the boat. Red splash and blue whirlpool dye are separately transported and fade away; color never contributes to buoyancy. Small ambient impulses generate waves through the solver. Physics runs at a fixed 60 Hz; water glyphs render at about 20 Hz and the boat renders each animation frame. This is a stylized shallow-water model, without overturning waves or deep-water dispersion. There are no simulation settings. Mobile hides the boat and marker. Motion stops in hidden tabs and is disabled for reduced-motion visitors.

## Run locally

```sh
npm run dev
```

Open <http://127.0.0.1:8765/>. Run `npm run check` to validate the JavaScript and `npm test` for propagation, volume, barriers, dye separation, boat coupling, and stability checks. Python 3 and Node.js are needed only for these local commands.

## Deployment

Pushing to `main` runs the [GitHub Pages workflow](.github/workflows/deploy.yml), which publishes the page and assets to [ericsun.net](https://ericsun.net/). The custom domain is configured in [`CNAME`](CNAME).

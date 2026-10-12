# Eric Sun

A minimal, single-page portfolio at [ericsun.net](https://ericsun.net/). Experience, education, skills, contact links, and the resume sit beside an interactive textmode sea. The site uses semantic HTML, CSS, and JavaScript, with no runtime dependencies or build step.

The text directory and character scramble are inspired by [ertdfgcvb.xyz](https://ertdfgcvb.xyz/); the fluid field draws inspiration from [Textmode Overlay](https://extension.textmode.art/). The simulation and boat are original canvas sketches.

The entrance holds on the sea, then a small ASCII boat rises from the center with a red splash and settles onto the water. After a pause, the text glitches into place and stirs the fluid. A second pause introduces a blue whirlpool and its draggable `((@))` marker. The boat follows currents, circles the whirlpool, mirrors when it reverses, and bounces off viewport edges and rendered text lines. At higher speeds, a short white ASCII wake forms behind the stern, follows the fluid grid, and dissolves as the boat slows. Nearby splashes give it a period of freer drift before the whirlpool gradually guides it back. The fluid bends along the actual text lines, flows through the open gaps, and reflects at viewport edges. Moving the marker changes new wave generation; existing waves keep flowing.

Red pointer splashes and blue whirlpool disturbances fade to gray. Curved red and blue wavelets and swirls of varied size, strength, and shape arise throughout the viewport and drift with the current. The interface has no simulation settings. Mobile hides the boat and marker and scales the ASCII name to fit both words on one row. Motion stops in hidden tabs and is disabled for visitors who prefer reduced motion.

## Run locally

```sh
npm run dev
```

Open <http://127.0.0.1:8765/>. Run `npm run check` to validate the JavaScript. Python 3 and Node.js are needed only for these local commands.

## Deployment

Pushing to `main` runs the [GitHub Pages workflow](.github/workflows/deploy.yml), which publishes the page and assets to [ericsun.net](https://ericsun.net/). The custom domain is configured in [`CNAME`](CNAME).

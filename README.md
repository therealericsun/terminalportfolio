# Eric Sun

A minimal, single-page portfolio at [ericsun.net](https://ericsun.net/). Experience, education, and skills sit beside an interactive textmode fluid field. The page uses plain HTML, CSS, and JavaScript, with no build step or runtime dependencies.

The entrance uses a staggered character scramble inspired by [ertdfgcvb.xyz](https://ertdfgcvb.xyz/). Revealing text stirs the initially quiet field. After a short pause, a wide twist brings stronger right-side vortices into view; moving the pointer adds further disturbances. Color briefly marks fresh motion before fading to gray. The fluid controls let you pause, change its speed and stir strength, choose a color from a small honeycomb palette, and replay the full entrance with Reset. Motion is disabled for visitors who prefer reduced motion.

## Run locally

```sh
npm run dev
```

Open <http://127.0.0.1:8765/>. Run `npm run check` to validate the JavaScript files. Python 3 and Node.js are needed only for these local commands; the published site is static.

## Deployment

Pushing to `main` runs the [GitHub Pages workflow](.github/workflows/deploy.yml), which publishes the root page and its assets to [ericsun.net](https://ericsun.net/). The custom domain is set in [`CNAME`](CNAME).

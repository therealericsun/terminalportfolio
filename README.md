# About

See the live website on [ericsun.net](https://ericsun.net/).

A simple and lightweight terminal-style portfolio written in Astro, CSS, and TypeScript. A dark terminal and interactive MNIST network sit over a continuously evolving Conway's Game of Life canvas, with no extra runtime dependencies.

The neural-network view draws six balanced samples from the official MNIST test set: drag one into the input square (or select it with the keyboard) to run it through a trained `28² → 8×6² → 24 → 10` CNN. The view shows all eight convolution channels, the eight strongest dense activations, learned positive and negative contributions, and all ten softmax probabilities. The refresh control generates another set. Game of Life remains a non-interactive ambient background.

The 133 KiB browser bundle includes int8-quantized CNN weights and 120 balanced display samples. The quantized model reaches 97.38% accuracy on the official 10,000-image MNIST test set. Retrain and replace it reproducibly with:

```sh
npm run train:mnist
```

The standalone NumPy training script downloads MNIST into a temporary cache and exports `public/mnist-model.json`; no Python ML framework is required.

The simulation and introduction stay fixed inside the viewport. Only command history
and the input below the tips and divider scroll.
Game of Life advances at eight generations per second, pauses for reduced-motion users, and stops animating in hidden tabs.

Main page:

![Terminal Portfolio Screenshot](public/screenshot.png)

Example response after typing in a command:

![Terminal Portfolio Screenshot 2](public/screenshot2.png)

# Installation

```sh
npm install
```

# Development

```sh
npm run dev
```

Visit `localhost:4321` to view the site locally.

Run `npm test` to check the Life rules, repeating patterns, and board resizing
(Node.js 22.6+ is required for the test runner's TypeScript support).

# Production build

```sh
npm run build
npm run preview
```

The build writes the static site to `dist/`.

Run `npm install` before using the npm scripts. They invoke this project's local
Astro executable explicitly because the unrelated Astronomer CLI also uses the
command name `astro`. For other Astro commands, use `npm run astro -- <command>`.

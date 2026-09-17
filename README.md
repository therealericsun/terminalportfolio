# About

See the live website on [ericsun.net](https://ericsun.net/).

A simple and lightweight terminal-style portfolio written in Astro, CSS, and TypeScript. A dark terminal sits over a faint, interactive Conway's Game of Life background, rendered with Canvas and no extra runtime dependencies.

The simulation and introduction stay fixed inside the viewport. Only command history
and the input below the tips and divider scroll.
Click once to focus the terminal; while its caret is active, ordinary clicks toggle Life cells.
Links, inputs, speed controls, and text-selection drags retain their normal behavior.
The top-right control pauses the simulation or selects ½×, 1×, 2×, or 4× speed (1× is eight generations per second).
Reset restores the starting patterns at the current speed.
Reduced-motion users start paused, and hidden tabs stop animating.
The Life canvas is keyboard accessible: Tab to it, use arrow keys to select a cell,
Space or Enter to toggle it, and Escape to return to typing.

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

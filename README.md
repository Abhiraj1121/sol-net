# SOL-NET — Deep Space Terminal 🛰️

An interactive 3D survey of the Solar System, presented as a declassified
hacker terminal you've just gained uplink to. Built with **Three.js**, vanilla
JS, and a CRT/scanline visual language — no frameworks, no build step.

**[Live Demo →](#)** *(replace with your GitHub Pages URL after deploying)*

![status](https://img.shields.io/badge/status-transmitting-00ff9c?style=flat-square)
![stack](https://img.shields.io/badge/stack-three.js%20%2B%20vanilla%20JS-070d11?style=flat-square)

---

## What's inside

- **A real 3D solar system** — the Sun and all 8 planets plus Pluto, orbiting
  at their correct relative speeds, rendered with Three.js. Drag to orbit,
  scroll/pinch to zoom, tap a planet to lock target.
- **Declassified dossier cards** for every body: distance from the Sun, light
  travel time, orbital period, day length, moon count (with notable moons),
  core/surface temperature, mass, and surface gravity.
- **Swipe navigation** — swipe the viewport or the dossier card left/right
  (or use the ◂ ▸ buttons / arrow keys) to cycle through every target.
- **A formula log** — the actual equations behind every figure on the page:
  light travel time, Kepler's Third Law, orbital velocity, escape velocity,
  surface gravity, and stellar luminosity.
- **A Milky Way galactic survey** — a animated 2D starfield spiral showing our
  solar system's real position in the Orion–Cygnus Arm, plus key galaxy
  stats (diameter, star count, Sagittarius A*, our orbital speed, etc).
- **A boot sequence + CRT shell** — scanlines, flicker, glitch-on-select
  titles, and a typed terminal intro, because exploring space should feel
  like you hacked into something.
- **Fully responsive** — works as a touch-first experience on phones, with a
  pointer-driven experience on desktop.

## Run it locally

No build tools, no dependencies to install. Three.js loads from a CDN at
runtime, so you only need a static file server (browsers block ES module/file
fetches over `file://`):

```bash
# any static server works, e.g.:
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` (or whichever port your server prints).

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   pick your default branch and the `/ (root)` folder.
4. Save — GitHub will publish at `https://<your-username>.github.io/<repo>/`
   within a minute or two.

## File structure

```
.
├── index.html     # page structure & markup
├── style.css      # CRT / terminal visual system, fully responsive
├── data.js        # all planetary + galaxy facts and the formula log
├── script.js      # boot sequence, Three.js scene, swipe/nav logic
└── README.md
```

## Data & accuracy

All figures (distances, periods, temperatures, moon counts, etc.) are
approximate values drawn from public NASA/JPL planetary fact sheets, rounded
for readability. This project is an art/visualization piece first — for
citation-grade precision, always check a primary source like
[NASA's Solar System exploration pages](https://solarsystem.nasa.gov/).

## Credits

Built with [Three.js](https://threejs.org/). Fonts: Share Tech Mono &
JetBrains Mono via Google Fonts. No tracking, no analytics, no dependencies
beyond Three.js itself.

---

*Transmission ends. Stay curious.*

# HEFP: Hot Engines and Fire Prevention

Live thermal simulation of hot-surface ignition risk in an engine exhaust manifold, running client-side in the browser.

**[Live demo →](https://veer-sanghvi.github.io/HEFP/)**

## About

An exhaust manifold runs hot enough that spilled fuel or oil can ignite on contact with no spark required. HEFP models the heat path out of a running engine (gas-side convection → thermal-barrier coating → cast-iron wall → convection and radiation to ambient) to predict whether the outer surface crosses the autoignition point of nearby flammable fluids, and how long that risk window lasts after shutdown.

Every number on the page is computed live from the same equations as the paper, not precomputed. Move a slider and the solver re-converges instantly.

The page covers three things:
1. **Steady-state surface temperature** while the engine is running, comparing a bare wall against a thermal-barrier-coated one.
2. **Post-shutdown heat soak** — a 4th-order Runge-Kutta integration of the full radiative cooling curve, checked against a linearized analytical shortcut.
3. **Sensitivity, uncertainty, and numerical accuracy** — a live Monte Carlo sweep on manufacturing tolerance, and a grid-convergence study confirming the RK4 solver actually converges at the order it's supposed to.

## Paper

Co-authored with Shuaib Ibraheem, Jack McGonagle, and Syed Irtiza Ali Shah at Wentworth Institute of Technology. Submitted to the ASTFE 12th Thermal and Fluids Engineering Conference (TFEC 2027); currently under review.

Full paper: [`HEFP.pdf`](HEFP.pdf)

## Built with

- Vanilla JavaScript (no framework) for the UI and live solver
- [Three.js](https://threejs.org/) for the 3D exhaust manifold viewer
- SVG for the charts, rendered by hand from the live solver output
- [Playwright](https://playwright.dev/) for browser tests

The client-side solver in [`thermal.js`](thermal.js) is a JavaScript reimplementation of [`thermal_model.py`](thermal_model.py). A separate Simulink/Simscape model (`simscape_thermal_model/`) provides an independent physical cross-check of the same results.

## Repo structure

```
index.html                    Page markup and styling
thermal.js                    Client-side thermal solver (steady-state, RK4 soak, convergence sweep)
scene.js / app.js             3D viewer and UI wiring
thermal_model.py              Python reference implementation
simscape_thermal_model/       Simulink/Simscape cross-check model and scripts
models/exhaust_manifold/      3D manifold mesh (CC-BY-4.0, see model license)
tests/hefp.spec.js            Playwright tests
HEFP.pdf                      Full conference paper
```

## Running locally

The page uses ES module import maps, so it needs to be served rather than opened directly as a file:

```sh
npx serve .
# or
python3 -m http.server
```

Then open the printed local URL in a browser.

## Tests

```sh
npm install
npx playwright install --with-deps chromium
npm test
```

Tests run automatically on push/PR via GitHub Actions ([`.github/workflows/tests.yml`](.github/workflows/tests.yml)).

## Attribution

3D exhaust manifold mesh: ["Exhaust Manifold"](https://sketchfab.com/3d-models/exhaust-manifold-ec292e27aa3b4c13ab6c1f0f748b831e) by [AnsysLearn](https://sketchfab.com/AnsysLearn), licensed [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).

## Contact

Veer Sanghvi — [veer-sanghvi.github.io](https://veer-sanghvi.github.io/)

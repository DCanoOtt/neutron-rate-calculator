# Development notes

The page that users open is **one self-contained `index.html`** (no server, no dependencies). It is generated from the files in `src/`;
edit those and rebuild. Node.js is only needed for building and testing, never to use the page.

```
node build.js ../index.html     # (or: npm run build)  writes the single HTML file
npm test                        # builds dist/core.js and runs the unit tests (node:test, Node 20 or newer)
```

## Layout of `src/`

`src/manifest.json` lists the parts in the order in which they are concatenated.

| Part | Content |
|---|---|
| `html/*.html`, `css/styles.css` | page markup and style sheet |
| `js/core/` | **pure code, no DOM and no page state**: ACE reading, numerics, second-collision and multiple-scattering corrections, time-of-flight and resolution function, facility file parsing, the observable state store (`store.js`), the experiment engine (`experiment-core.js`) the vacuum window (`window-core.js`: materials, natural abundances, optical depth) and the ENDF-6 decay data (`decay-core.js`: MF 8 / MT 457 parser, yields, rates, emission spectra and Fermi beta shapes; UI in `js/ui/decay.js`) |
| `js/data/fluences.js` | the default facility fluences |
| `js/ui/` | state object `S`, ACE library (xsdir), compound components and the target layers, charts, nuclide chart, setup files, wiring of the controls |
| `js/io/` | ROOT writer, ASCII/ROOT export, PNG/PDF export |
| `js/experiment/` | experiment window: adapter to the engine (`engine.js`), plots, controls |

## The physics core

Everything under `js/core/` runs in Node as well as in the browser. `node build.js` writes `dist/core.js`, a bundle of those files that
the unit tests load. The experiment engine is a pure function:

```js
exCompute(cfg, m)   // cfg: settings of the run;  m: snapshot of the model, built from the page by exModel() in js/experiment/engine.js
```

`m` holds the facility and its fluence, the resolution parameters, the beam spot, the sample and layers (items, components) and the
energy window. Nothing is read from the page while the engine runs.

`tests/physics.test.js` checks the engine against analytic cases: counts = atoms x sigma x fluence x ln(E2/E1) x time for a thin sample
and a flat spectrum, scaling with time and efficiency, bin partition, the stack factor (1 - T^N)/(1 - T) and the transmission of the
second position, T = exp(-N tau), recovery of the cross section and 1/sqrt(counts) scaling of its uncertainty, reproducibility of the Poisson
simulation, Garwood intervals, time of flight, ZAID and MT names.

## State and views

`S` (js/ui/state-ui.js) is created with `Store.create`. Assigning a property, or changing `S.comps`, `S.layOn`, `S.lay` or `S.stash`,
marks that key as changed; the views registered with `Store.view(name, deps, fn)` (see the end of js/ui/compounds.js) then redraw what
depends on it, once, on the next microtask or immediately with `Store.flush()`. So far the layer structure uses it: the panels shown for the
selected layer, the target drawing and tabs, and the options of the experiment window. The recalculation itself (`update()`) is still
called explicitly, and the other parts of the page still refresh by direct calls; moving them to views is done the same way.

## What the tests do not cover

The numerical tests use synthetic cross sections and fluences. They do not read a real ACE library, a real `xsdir`, or the real
fluence files, and the ROOT file has not been opened in ROOT.

## Decay data (`decay-core.js`, `ui/decay.js`)

`decay-core.js` (pure, tested in `tests/decay.test.js`) parses ENDF-6 MF 8 / MT 457 (`decParse`), derives the particles per decay (`decYields`), the rates (`decRates`), the spectra (`decSpectra`, `decBetaBins` with the relativistic Fermi function, `decHist` with the Gaussian folding), the daughters of a nuclide (`decDaughters`, from RTYP and the isomeric state RFS), the equilibrium activity (`decEquil`) and the chain solution (`decBateman`). `ui/decay.js` loads and indexes the libraries (ENDF/B-VIII.0 folder, JEFF-4.0 single file), builds per source (`decAnalyze`: window + air, layers, target, all targets) the table rows with daughters, and draws the tables and spectra windows. The default time after the preparation is 7 half-lives of the initial isotope (`decAgeAuto`).

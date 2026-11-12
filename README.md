# Neutron Reaction Rate Calculator

A single-file web application that folds the neutron fluence of an irradiation facility with pointwise
cross sections (ACE format) to give **reaction rates and reaction yields as a function of neutron energy**
(or time of flight), including self-shielding, compound samples and the time-of-flight resolution function.

Everything runs in the browser. There is no server, no installation and no upload: the ACE files you choose
are read locally.

> **How to run it:** download `index.html` (or `neutron-rate-calculator.html`) and open it in Chrome or Edge
> (Firefox and Safari also work, but Chrome/Edge are the tested choice). Or use the GitHub Pages link of this repository.

## What it does

- **Facilities (embedded fluences):** n_TOF EAR1, EAR2 and NEAR (CERN), GELINA fast and moderated (JRC Geel),
  NFS (GANIL/SPIRAL-2), and IFMIF-DONES (two configurations). A fluence file with your own energy–flux tables can be loaded for
  other beam lines. Repetition rate, flight path and fluence scale can be changed.
- **Cross sections:** pointwise ACE files, located through an MCNP-style `xsdir` (see below). All reactions in the
  file can be selected by MT number, one or several, or none (an isotope with no reaction selected only shields the sample). The cross section is never broadened by the program.
- **Rates:** reaction rate density per atom or per sample, rate per energy decade, cumulative rate, per
  beam pulse and per second, for the chosen facility and for all facilities side by side.
- **Reaction yield:** a switch replaces the rate by the yield per incident neutron,
  Y(E) = (σ<sub>x</sub>/σ<sub>tot</sub>)·(1 − e<sup>−Nσ<sub>tot</sub>/A</sup>), with N/A the areal density of the sample in atoms/barn. The yield cannot
  exceed 1.
- **Sample:** mass, density, beam-spot radius (default 1 cm), thickness in atoms/barn and µm; optional
  self-shielding with three models to choose from:
  1. *Simple:* first-collision attenuation (a neutron that scatters is lost).
  2. *Second collision (analytic):* adds neutrons that scatter once and then react, for an infinite slab with isotropic
     scattering and no energy change (uses the elastic cross section, MT 2).
  3. *Multiple scattering (Monte Carlo):* follows the neutrons after the first collision with elastic scattering,
     energy change and a free-gas target at the table temperature; runs in the background on an adaptive energy grid.
- **Compounds:** additional isotopes with atoms per primary atom; results per isotope and summed over the
  isotopes and the selected reactions. 
- **Vacuum window + air:** an optional element in front of the target (not part of the target, which is the front layer, the sample and the backing, and is what is repeated when several identical targets are simulated) (Mylar, Be, Kapton, Al, stainless steel 304 or 316L; double-click it to define it). Composition, natural isotopic abundances and density are listed when a material is selected; thickness and density can be changed. A *custom material* can be typed (elements with atoms per formula unit or mass fractions, plus density; natural isotopic composition from NIST). The transmission plot autoscales. An optional *air gap* (cm of dry air: N₂ 78.084 %, O₂ 20.946 %, Ar 0.934 %, CO₂ 0.0412 %; 1.204 mg/cm³ at 20 °C, editable) follows the window with its transmission, total and plot; all tables are taken at one temperature, and a warning with an OK button appears if isotopes would have to be mixed from different temperatures. It only attenuates the fluence (τ(E) = n Σᵢ fᵢ σ_tot,i(E), natural isotopes weighted by atom fraction, all library tables at the same temperature); no rates are computed for it.
- **Target layers (Target definition panel: drawing and tabs; click a layer to switch it on, × to switch it off, double-click a layer or its box to define it in its own window: isotopes, mass, number of atoms, thickness, density):** the target is up to three layers along the beam: *front layer* (for example a container wall), *sample*
  (primary isotope plus its components, one homogeneous mixture) and *sample backing*. The front layer and the backing have their own material (a pure isotope or a compound, independent of the sample) and their own mass, density and thickness: components of these layers are given as atoms per formula unit, and the mass (mg) fixes the number of atoms; the thickness and mass are linked through the density (default: element density for a single element). Setups saved before this change are converted keeping the same atoms. Every layer shields with its own total
  cross sections and is attenuated by the layers in front of it; ticked reactions of any layer are counted (as background in the
  experiment simulation). The multiple-scattering models (analytic second collision, Monte Carlo) work through all layers, including backscatter
  from the backing; they assume infinite slabs and elastic scattering, and neglect interaction between several targets in a stack.
- **Resolution function:** optional folding in time of flight with the n_TOF Monte Carlo resolution functions
  (EAR1, EAR2, NEAR; default for EAR1 and EAR2, while NEAR defaults to a fixed ΔL of 40 cm) or a Gaussian (proton-pulse width, additional width, path-length spread). The widths are given
  as FWHM.
- **Transmission uncertainty:** T = n_in/n_out with relative variance k_in/n_in² + k_out/n_out² (Poisson on the gross counts, background known); σ = −ln T/(N n_P) with error √rv/(N n_P), per primary atom. Only counting statistics are included.
- In the ASCII table, undefined values (a relative uncertainty without net signal, a cross section outside the range of the data) are written as `nan`, as the header says; the *time needed* column appears only when a target precision is entered. The *target precision* (relative uncertainty, %, optional) is the precision wanted per bin: the page then gives the time needed, t x (achieved relative uncertainty)^2 / target^2, as a plot, ASCII column and ROOT histogram. Every settings panel of the experiment window has a collapsible Info.
- In a simulated run the ASCII table and the ROOT file contain the simulated counts of every part (samples, front layer, backing, background) with their lower and upper uncertainties (Garwood intervals below 25 counts), whatever is selected for plotting; in an expected-values run, the sqrt(N) uncertainty of each part.
- The run information (also in the plots, the ASCII file and the ROOT files) describes the beam spot, and the composition, mass, density and thickness of the sample, front layer and backing, with the total target mass.
- **Experiment simulation (own window, computed only on request; counts: a *Targets plotted* pulldown above the plots selects samples, front layer, backing or any combination, plus the stack position (one, several or all), and re-runs with the same seed; the summary and the net-signal statistics follow the selection; the setup JSON stores these choices and its file name includes the front layer and backing):** counting experiments, transmission experiments or both,
  for one target or a stack of N identical targets (a target is the front layer, the sample and the backing) (first-collision model), with measurement time in s, min, h or d, log or
  linear binning in energy or time of flight (default range: the energy range of the selected facility fluence), detection efficiency (constant or table), container/backing layers, flat and uploaded background spectrum,
  statistical uncertainties (√N, or one simulated Poisson measurement with Garwood intervals), net signal with the background
  measured for the same time or known, time needed for a target precision, sample-in/sample-out split (best share reported),
  transmission T and the total cross section derived from it. The plot has its own x/y zoom (optionally linked to the main
  plots) and PNG, PDF, ASCII and ROOT output (with bin errors); the settings are stored in the setup file and link.
- **All facilities** table: collapsed by default and calculated only while open. *Rate by energy decade* and *Rates by reaction* are also collapsed by default (click the title to open).
- **Axes:** energy or time of flight; linear or logarithmic vertical axes; zoom by dragging (energy range) or Shift-dragging a box (energy range and the vertical range of
  the plot where the box is drawn); double-click or *Reset zoom* restores autoscale; the value of the
  vertical axis under the pointer is displayed.
- **Chart of the nuclides:** a Segrè-type chart showing which isotopes have data in the loaded library, decay mode,
  magic numbers, zoom, search box (for example `Fe-56`) and selection of the primary isotope or of an additional component.
  Isomer tables (for example `95642` = Am-242m) are marked by a triangle in the corner of the cell; Alt+click selects them.
- **Saving:** PNG, PDF, ASCII table and CERN ROOT histograms (TH1D in one file). The ASCII table and the ROOT file always
  cover the full energy range (not the zoom), give every quantity against neutron energy and against time of flight, and
  contain both the reaction rates and the reaction yields. When several reactions or components are selected, they hold every
  individual reaction and the sum (and the compound total), whichever curve is displayed.
- **Setup:** save the whole setup (beam line, flight path, isotope and reactions, components, sample, resolution function,
  options) as a small JSON file, load it again, or copy a link that holds the setup in its address (`#setup=...`) so that a
  result can be shared. In Chrome and Edge *Setups folder…* chooses the folder where *Save setup* writes the JSON directly (no download dialog) and where *Load setup* starts; the browser remembers it and asks for write permission once per visit. Other browsers use the normal download. (the link only works from a real address, such as the GitHub Pages site or the local file; from an embedded view copy the link and use *Paste link* on the page, which also accepts only the code after `#setup=`). All links begin with the same text (address and the start of the setup); only the end differs, and the link box is cleared when a setup is loaded. The cross sections themselves are not included, but the file stores the library folder path. In Chrome and Edge, *Choose folder…* keeps the folder in this browser, so loading a setup reloads the library (the page now reloads it as soon as it opens if the browser still allows it; otherwise one click on *Reload saved library*, also shown next to *Load setup*, then Allow; choose *Allow on every visit* in the prompt to make it automatic); elsewhere choose the folder named in the status line. A loaded fluence table and the experiment settings are included. Every saved item carries a
  title or header with the facility, flight path, repetition rate, isotope, reactions, library, sample (radius, mass,
  thickness in atoms/barn) and the resolution function used.

## Loading a cross-section library

0. Download an ACE library, for example ENDF/B-VIII.0 (<https://nucleardata.lanl.gov/ace/lib80x/>) or JEFF-4.0 (<https://data.oecd-nea.org/records/0vhn5-d6t91>).
1. Press **Choose folder** and select the folder that contains the `xsdir` file. The ACE files may be in
   any subfolder; each file is found by the name written in `xsdir`.
2. The page reads the entries of `xsdir` and shows how many isotope tables it found. The **library name** is the
   last folder of the `datapath=` line of `xsdir` (or, without one, the name of the selected folder) and is displayed in the status
   line, in the isotope information, in the chart of the nuclides and in all saved files.
3. Several temperatures are supported. Each table keeps its own temperature (the kT field of `xsdir`), so the
   same isotope can be present several times. If several files share a name, write the directory in front of the
   file name in `xsdir` (for example `lib300/1001.80c`).
4. A single ACE file can also be loaded directly.

**Problems are reported:** an xsdir entry whose file is not in the folder is flagged *file missing* (and not counted as data),
a damaged or truncated ACE table is reported with the reason and flagged *damaged* while the other tables keep working, and a folder
without xsdir shows the progress of the header scan (an xsdir makes it instant).

An absolute `datapath=` (for example `/home/user/JEFF4.0`) cannot be opened by a web page; only its last folder names are
used as a hint when searching the selected folder.

## Decay data, radioactivity and emission spectra

Optional. The decay data are not included in the page: the decay sublibrary has to be downloaded **in ENDF-6 format** from the public sites of the evaluations and kept in a folder of your computer:

- **ENDF/B-VIII.0:** <https://www.nndc.bnl.gov/endf-b8.0/download.html> (the decay sublibrary, one `dec-ZZZ_El_AAA.endf` file per nuclide).
- **JEFF-4.0:** <https://databank.io.oecd-nea.org/data/jeff/40/> (the decay data sublibrary, a single ENDF file).

By default the page looks for the decay data in a folder named `<library>_decay` next to the ACE cross-section library (for example `lib80x_decay`), and the folder is remembered in the setup file. In the *Nuclear data* panel press *Load decay data…* and choose the folder with the ENDF/B-VIII.0 decay sublibrary (`dec-*.endf`) or with the single JEFF-4.0 decay file; the page recognises which one it is.

*Show decay data* (also in the experiment window) opens the radioactivity tables and the spectra buttons per layer (vacuum window + air, front layer, sample, backing), for the whole target and, with several identical targets, for all of them together. Only material that is radioactive is listed, and only the radiations it emits get a spectra button. The tables give, per isotope, atoms, half-life, decay modes, activity and the alpha, beta-, beta+ and gamma particles per second. The spectra windows (alpha, beta, gamma + X ray, conversion electrons) have a bin width, a constant Gaussian energy resolution, a log/linear axis, mouse selection of the energy range, a legend with one curve per isotope (the ten strongest, the rest as *Other*) and the *Total*, which can be hidden or shown by clicking the legend; the spectra and the tables can be saved as PNG, PDF, ASCII or ROOT histograms.

### Daughters and the time after the preparation

The decay-data window has the field *Time since the source was prepared* (number and unit). The default is 7 half-lives of the initial isotope (the radioactive isotope with the highest activity), in the unit of its half-life; the button *7 half-lives* restores it. The daughters are then calculated with the Bateman equations for that time, along the decay chain (up to eight generations, using the branching ratios and the isomeric state of the daughter, for example Cs-137 → Ba-137m), and marked ↳ in the tables. The atoms of the initial isotope are those entered in the page, at the time of the measurement; the daughters start from zero at the preparation, and daughters with less than 10⁻⁶ of the activity of the initial isotope are left out. If the time field is emptied, the short-lived daughters are taken in equilibrium instead: a daughter shorter-lived than its parent and with a half-life up to a limit (automatic: a tenth of the half-life of the initial isotope, at most 30 days; or the value you enter in the *Nuclear data* panel) has the activity A_p × BR × λd/(λd − λp). The option *Include short-lived daughters* of that panel switches daughters off. Time, unit and daughter options are saved in the setup file.

### How the decay quantities are calculated

- **Activity and emission:** A = N ln 2 / T½, and the rate of each radiation is A times its particles per decay from MF 8 / MT 457 (discrete lines times their intensity plus the continuum).
- **Beta spectra:** beta- from the end-point energies and intensities (or from the tabulated continuum when there is one) with the allowed shape and the relativistic Fermi function; no forbidden shape factors and no screening. Beta+ uses the electron-capture / beta+ lines: end-point = Q − 1021.997 keV, with the intensity of the part of the branching that goes through positron emission. The Co-60 mean beta energy (95.8 keV) and the Na-22 beta+ mean (216 keV) agree with the evaluated values.
- **Other radiations:** alpha, gamma + X rays (with the 511 keV annihilation photons listed in the data) and conversion + Auger electrons are lines put into the energy bins.
- **Energy resolution:** the spectra are folded with a constant Gaussian FWHM (lines at their own energy, continua from the bin centres); the area is conserved and the part below zero energy is lost. The resolution used is printed in the plots and in the saved files.
- **Bateman equations:** N_k(t) = N_0 · Π b_i λ_(i−1) · Σ_i exp(−λ_i t) / Π_(j≠i) (λ_j − λ_i) along each chain; equal half-lives are separated by a tiny relative amount to keep the formula finite.
- **Totals:** the sums in the tables are the sums of the columns shown (alpha, beta-, beta+ and gamma). Electron capture, conversion and Auger electrons, X rays and annihilation photons are not in the table totals, but they are in the spectra.
- **What is not included:** the emission is that of the material itself: nothing is absorbed, scattered or self-shielded, and the half-lives, branching ratios and intensities are those of the chosen library.

## Limitations to be aware of

- **NEAR resolution function:** it is an extrapolation from the EAR1 and EAR2 Monte Carlo results in ln L and is only
  indicative. It is not valid below 0.3 eV and is poor near 80 MeV.
- **EAR1 resolution function:** it is narrow compared with typical resonance widths, so its effect on rates is small.
- **Self-shielding** models 2 and 3 assume an infinite slab (no lateral leakage), elastic scattering only (MT 2, isotropic
  in the centre of mass), no delay of scattered neutrons in the time of flight, and no interaction between several targets. Every
  other reaction removes the neutron. Model 3 was checked against an independent Monte Carlo and model 2 against model 3
  for constant cross sections; this is not a replacement for a full transport calculation (MCNP, Geant4, SAMMY).
- The cross-section curves are the tabulated pointwise data. Broadening comes only from the temperature of the table.
- The **chart of the nuclides** counts each isotope once, whatever its number of temperatures; isomer tables are counted separately. A ZAID such as 95642 is read in the MCNP way (A + 300 + 100 m), which can be ambiguous in rare cases.
- Layers are infinite slabs: no lateral leakage and no gaps between layers or targets.
- The **experiment simulation** is a counting-statistics model: no dead time, pile-up, detector response, gaps between stacked targets or neutrons scattered from one target into the next; the stack and the transmission use the first-collision model. The background of a transmission run is a fixed fraction of the open beam.
- **PDF** output contains a raster image of the plots, not vector graphics.
- ROOT files were validated with `uproot` and JSROOT; they have not yet been opened in ROOT itself.
- Fluences are embedded for convenience. Check the original sources before using them in a publication.

## Data and credits

- Fluences of the facilities are taken from the files embedded in the page (`Fluxes01.txt`). Please credit the
  facilities: CERN n_TOF, JRC Geel (GELINA), GANIL/SPIRAL-2 (NFS) and IFMIF-DONES.
- Cross sections are not included. Use your own ACE library. Two libraries in ACE format that work with the page can be downloaded from:
  - **ENDF/B-VIII.0:** <https://nucleardata.lanl.gov/ace/lib80x/>
  - **JEFF-4.0:** <https://data.oecd-nea.org/records/0vhn5-d6t91>

## Development notes

The application is one HTML file with embedded JavaScript and CSS (no build step). The numerical core (resolution
folding, rate integration, ACE and `xsdir` parsing, ROOT writer) is plain JavaScript at the top of the script and was
tested separately with Node and Playwright.

## Author and licence

Daniel Cano Ott, CIEMAT.

Licence: *to be chosen by the author* (for example MIT or CC BY 4.0 for the code; the fluence data keep the
conditions of their original sources).

## For developers

The page is one self-contained `index.html`, generated from the source files in `nrc/` (a `src/` tree, `build.js`, `tests/`). Edit the sources and run `node build.js ../index.html`
(or `npm run build`); `npm test` runs the unit tests of the physics core against analytic cases. Node.js is needed only for that, never to use the page.
See `nrc/DEVELOPMENT.md` for the layout (pure physics core, state store and views, experiment engine) and for what the tests do not cover.

## Desktop application (Windows, macOS, Linux)

The folder `app/` wraps the single `index.html` in an Electron window (`app/main.js`), so the calculator runs as a normal installed program, offline, with its own icon. The cross-section folder picker works as in Chrome.

- **Run it from source:** `cd app && npm install && npm start` (needs Node.js 20 or later).
- **Build an installer on your own machine:** `cd app && npm install && npm run dist` produces, in `app/dist/`, the installer of the operating system you are on (Windows: setup `.exe` and a portable `.exe`; macOS: `.dmg`; Linux: `.AppImage`). Installers are built per operating system, so run it on each system you want to support.
- **Build all three with GitHub Actions:** push the repository to GitHub and run the workflow *Build desktop app* (Actions tab, *Run workflow*, or push a tag such as `v1.0.0`); the Windows, macOS and Linux installers appear as downloadable artifacts of the run.
- The installers are not code-signed: Windows SmartScreen and macOS Gatekeeper warn on first start (macOS: right-click, *Open*). Signing needs a developer certificate.
- After changing the page, rebuild `index.html` (`npm run build` in the repository root) before building the app; `npm start` and `npm run dist` copy the current `index.html` into `app/`.

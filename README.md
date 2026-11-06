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
- **Resolution function:** optional folding in time of flight with the n_TOF Monte Carlo resolution functions
  (EAR1, EAR2, NEAR) or a Gaussian (proton-pulse width, additional width, path-length spread). The widths are given
  as FWHM.
- **Axes:** energy or time of flight; linear or logarithmic vertical axes; zoom by dragging (energy range) or Shift-dragging a box (energy range and the vertical range of
  the plot where the box is drawn); double-click or *Reset zoom* restores autoscale; the value of the
  vertical axis under the pointer is displayed.
- **Chart of the nuclides:** a Segrè-type chart showing which isotopes have data in the loaded library, decay mode,
  magic numbers, zoom, search box (for example `Fe-56`) and selection of the primary isotope or of an additional component.
- **Saving:** PNG, PDF, ASCII table and CERN ROOT histograms (TH1D in one file). When several reactions or components
  are selected, the ASCII table and the ROOT file contain every individual reaction and the sum (and the compound total),
  whichever curve is displayed. Every saved item carries a
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

An absolute `datapath=` (for example `/home/user/JEFF4.0`) cannot be opened by a web page; only its last folder names are
used as a hint when searching the selected folder.

## Limitations to be aware of

- **NEAR resolution function:** it is an extrapolation from the EAR1 and EAR2 Monte Carlo results in ln L and is only
  indicative. It is not valid below 0.3 eV and is poor near 80 MeV.
- **EAR1 resolution function:** it is narrow compared with typical resonance widths, so its effect on rates is small.
- **Self-shielding** models 2 and 3 assume an infinite slab (no lateral leakage), elastic scattering only (MT 2, isotropic
  in the centre of mass), no delay of scattered neutrons in the time of flight, and no sample holder or background. Every
  other reaction removes the neutron. Model 3 was checked against an independent Monte Carlo and model 2 against model 3
  for constant cross sections; this is not a replacement for a full transport calculation (MCNP, Geant4, SAMMY).
- The cross-section curves are the tabulated pointwise data. Broadening comes only from the temperature of the table.
- The **chart of the nuclides** ignores isomer tables and counts each isotope once, whatever its number of temperatures.
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

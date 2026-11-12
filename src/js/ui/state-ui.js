// ---------- UI ----------
const $ = id => document.getElementById(id);
const S = Store.create({
  blob: null, tables: [], tab: null, tabIdx: -1, rx: null,
  dens: NaN, densUser: false, Z: -1, facId: 'fac0', fluxSource: 'Fluxes01.txt', f: 1, L: 1, mass: 1, area: Math.PI, ss: true, nAtB: 0, totXs: null, emin: 1e-8, emax: 100, rateLog: true, rateSample: true, rateKind: 'rate', atoms: 0, zx: null,
  custom: {}, filter: '', res: null, token: 0, ssModel: 'first', msN: 2000, msCache: null, msBusy: null, msTok: 0, msUsed: false, msView: null, comps: [], mpa: 0, shield: [], rxs: [], mts: new Set(), viewAll: false, resOn: false, resW: 0, resK: 'fwhm', pulse: {}, tg: {}, tofAxis: false, extraRes: [], items: [], view: '', decView: 'follow', rxView: null
});
S.tgtSel = 'sample'; S.layOn = { win: false, front: false, back: false }; S.winRun = null; S.winData = null; S.winFlux = null; S.stash = { front: [], back: [] };
S.lay = { win: { mat: 'mylar', temp: 0, thick: 100, dens: NaN, densUser: false, custom: { name: '', text: '', mode: 'atoms' }, air: { cm: 0, dens: NaN, densUser: false }, mix: false }, front: { mass: 1, dens: NaN, densUser: false }, back: { mass: 1, dens: NaN, densUser: false } };   // mass (mg) and density of the front layer and the backing
const facOf = id => FAC.find(f => f.id === id);
const curFac = () => facOf(S.facId);
// Fluence of a facility; with a vacuum window it carries the optical depth of the window (see integrate), so rates and plots are behind the window.
const fluxOf = F => {
  const b = S.custom[F.id] || F.flux;
  if (!S.layOn.win || !S.winRun) return b;
  const c = S.winFlux; if (c && c.b === b && c.w === S.winRun) return c.f;
  const f = { E: b.E, V: b.V, win: S.winRun }; S.winFlux = { b, w: S.winRun, f }; return f;
};

function supNum(n) { const m = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }; return String(n).split('').map(c => m[c]).join(''); }
function p10(k) { return '10' + supNum(k); }
function sci(x, d) {
  d = d || 3;
  if (!isFinite(x)) return '–';
  if (x === 0) return '0';
  const parts = x.toExponential(d - 1).split('e');
  return parts[0] + '<span class="x"> × 10<sup>' + (+parts[1]) + '</sup></span>';
}
function sciTxt(x, d) {
  d = d || 3;
  if (!isFinite(x)) return '–';
  if (x === 0) return '0';
  const parts = x.toExponential(d - 1).split('e');
  return parts[0] + '×10' + supNum(+parts[1]);
}
function g3(x) { return String(parseFloat(x.toPrecision(3))); }
const DENS = {1:8.988e-5,2:1.785e-4,3:0.534,4:1.85,5:2.34,6:2.267,7:1.2506e-3,8:1.429e-3,9:1.696e-3,10:8.999e-4,11:0.968,12:1.738,13:2.70,14:2.33,15:1.82,16:2.067,17:3.214e-3,18:1.7837e-3,19:0.862,20:1.55,21:2.989,22:4.54,23:6.11,24:7.15,25:7.44,26:7.874,27:8.90,28:8.908,29:8.96,30:7.134,31:5.907,32:5.323,33:5.776,34:4.809,35:3.122,36:3.733e-3,37:1.532,38:2.64,39:4.469,40:6.506,41:8.57,42:10.22,43:11.5,44:12.37,45:12.41,46:12.02,47:10.49,48:8.65,49:7.31,50:7.287,51:6.685,52:6.232,53:4.93,54:5.887e-3,55:1.873,56:3.594,57:6.145,58:6.77,59:6.773,60:7.007,61:7.26,62:7.52,63:5.243,64:7.895,65:8.229,66:8.55,67:8.795,68:9.066,69:9.321,70:6.965,71:9.84,72:13.31,73:16.69,74:19.25,75:21.02,76:22.59,77:22.56,78:21.45,79:19.30,80:13.534,81:11.85,82:11.34,83:9.78,84:9.196,86:9.73e-3,88:5.0,89:10.07,90:11.72,91:15.37,92:19.1,93:20.45,94:19.816,95:12.0,96:13.51,97:14.78,98:15.1};
function fmtField(x) { return String(parseFloat(x.toPrecision(5))); }
function syncThick() {
  const t = (S.mass > 0 && S.dens > 0 && S.area > 0) ? S.mass * 1e-3 / (S.dens * S.area) * 1e4 : NaN;
  $('thick').value = isFinite(t) ? fmtField(t) : '';
}
function applyElementDensity() {
  const t = S.tab;
  if (!t) return;
  const Z = Math.floor(parseInt(t.zaid, 10) / 1000);
  const d = DENS[Z];
  if (S.Z !== Z) S.densUser = false;
  S.Z = Z;
  const cmp = S.comps.some(c => c.ratio > 0 && layerOf(c) === 'sample');
  if (!S.densUser) { S.dens = (!cmp && d) ? d : NaN; $('dens').value = (!cmp && d) ? fmtField(d) : ''; syncThick(); }
  layDens();
  const sym = ELEMENTS[Z] || ('Z=' + Z);
  $('densInfo').textContent = cmp
    ? (S.densUser && S.dens > 0 ? 'Compound density: you set ' + g3(S.dens) + ' g/cm³.' : 'Compound sample: enter the density of the mixture to get a thickness.')
    : d
    ? 'Element density of ' + sym + ': ' + g3(d) + ' g/cm³' + (S.densUser && Math.abs(S.dens - d) > 1e-12 ? ' (you set ' + g3(S.dens) + ')' : ' (default)')
    : 'No tabulated density for ' + sym + '. Enter one.';
}

function fmtEnergy(E) {
  if (E >= 1) return g3(E) + ' MeV';
  if (E >= 1e-3) return g3(E * 1e3) + ' keV';
  if (E >= 1e-6) return g3(E * 1e6) + ' eV';
  return g3(E * 1e9) + ' meV';
}
function fmtRep(f) {
  if (f >= 1e6) return g3(f / 1e6) + ' MHz';
  if (f >= 1e3) return g3(f / 1e3) + ' kHz';
  return g3(f) + ' Hz';
}
function fmtTime(t) {
  if (t < 1e-6) return g3(t * 1e9) + ' ns';
  if (t < 1e-3) return g3(t * 1e6) + ' µs';
  if (t < 1) return g3(t * 1e3) + ' ms';
  return g3(t) + ' s';
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function setStatus(id, msg, err) { const el = $(id); el.textContent = msg; el.classList.toggle('err', !!err); }

let pending = false;
function schedule() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; update(); }); }

function initFacilities() {
  $('fac').innerHTML = FAC.map(F => '<option value="' + F.id + '">' + esc(F.name + ' · ' + F.L + ' m · ' + fmtRep(F.f) + (F.cfg ? ' · ' + F.cfg : '')) + '</option>').join('');
  $('fac').value = S.facId;
  applyFacDefaults();
}
function syncWLab() { const u = S.resK === 'sigma' ? 'σ' : 'FWHM'; $('pulseLab').textContent = 'Pulse width (ns, ' + u + ')'; $('resWLab').textContent = 'Added width (ns, ' + u + ')'; }
function syncTgLab() {
  const m = $('tgMode').value, F = curFac(), hasRf = !!rfOf(F);
  $('tgLlab').textContent = 'Path-length spread ΔL (cm)';
  const o = $('tgMode').querySelector('option[value="rf"]'); o.hidden = !hasRf; o.disabled = !hasRf;
  o.textContent = hasRf ? 'Monte Carlo RF (' + rfOf(F).name + ')' : 'Monte Carlo RF';
  $('pulseW').disabled = m === 'rf' && hasRf && rfOf(F).pulseIncluded; $('tgL').disabled = m === 'rf';
}
function applyFacDefaults() {
  const F = curFac();
  S.f = F.f; S.L = F.L;
  $('f').value = F.f; $('L').value = F.L;
  syncWLab(); $('pulseW').value = pulseOf(F);
  { const tg = tgOf(F); $('tgMode').value = tg.mode; $('tgL').value = tg.dL; syncTgLab(); }
  document.documentElement.style.setProperty('--fc', F.color);
  $('fxStatus').textContent = S.custom[F.id] ? 'Using your table (' + S.custom[F.id].E.length + ' points).' : 'Using ' + S.fluxSource + ' (' + F.flux.E.length + ' points).';
}

async function loadLibrary(blob, label) {
  const my = ++S.token;
  S.files = null; S.libName = '';
  S.blob = blob;
  setStatus('aceStatus', 'Indexing ' + label + '…');
  try {
    const tables = await scanAce(blob, p => { if (my === S.token) setStatus('aceStatus', 'Indexing ' + label + '… ' + Math.round(p * 100) + '%'); });
    if (my !== S.token) return;
    if (!tables.length) throw new Error('No ACE tables found in this file');
    S.tables = tables;
    setStatus('aceStatus', label + ': ' + tables.length + ' table' + (tables.length === 1 ? '' : 's') + (tables.some(t => t.truncated) ? ' (last one is cut off)' : ''));
    fillIso(true);
  } catch (e) {
    S.tables = []; S.tab = null; S.rx = null;
    $('iso').innerHTML = ''; $('mt').innerHTML = '';
    setStatus('aceStatus', e.message, true);
    update();
  }
}

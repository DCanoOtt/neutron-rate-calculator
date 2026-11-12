// Unit tests of the pure physics core against analytic cases. Run: node build.js && node --test tests/
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../dist/core.js');
const close = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), (msg || '') + ' got ' + a + ' expected ' + b);
const sum = a => Array.from(a).reduce((p, q) => p + q, 0);

// synthetic target: constant fluence V0 (n/cm2/s per unit ln E) and constant cross section sig (barn) on [E1, E2]
function model({ V0 = 1e4, sig = 10, atoms = 1e18, area = 3, E1 = 1e-3, E2 = 1e3, comps = [] } = {}) {
  const Eg = Float64Array.of(E1 / 2, E2 * 2), flux = { E: Float64Array.of(E1 / 2, E2 * 2), V: Float64Array.of(V0, V0) };
  const rx = { E: Eg, xs: Float64Array.of(sig, sig) };
  const tab = { label: 'X-1', rxs: [{ mt: 1, E: Eg, xs: Float64Array.of(sig, sig) }, { mt: 102, E: Eg, xs: Float64Array.of(sig, sig) }] };
  const res = C.integrate(rx, flux, 1, E1, E2, null, 0, null);
  const m = { F: { L: 20, f: 1 }, flux, LT: 20, RP: null, f: 1, L: 20, area, atoms, emin: E1, emax: E2, tab, items: [{ grp: 'p', sum: true, all: true, ratio: 1, res }], comps, layOn: {}, target: [] };
  m.units = C.exUnitsOf(tab, comps, area, atoms);
  return m;
}
const cfg = (o = {}) => Object.assign({ mode: 'count', n: 1, t: 3600, ax: 'E', bs: 'log', bn: 10, r0: NaN, r1: NaN, eff: 100, bg: 0, bk: 'known', sim: false, seed: 1, share: 50, effT: 100, bgT: 0, tgt: 0, effTab: null, bgTab: null, bgX: 'E', tg: [1], inS: true, inF: false, inB: false }, o);

test('counts = atoms x sigma x phi x ln(E2/E1) x time (thin sample, flat spectrum)', () => {
  const m = model({ atoms: 1e12 });                       // optically thin: tau = 1e12/3 x 1e-24 x 10 ~ 3e-12
  const R = C.exCompute(cfg(), m);
  close(R.cs.mu, 1e12 * 1e-24 * 10 * 1e4 * Math.log(1e6) * 3600, 1e-6);
  close(R.cs.pS, R.cs.mu, 1e-12);
});
test('counts scale with time and efficiency; relative uncertainty with 1/sqrt(t)', () => {
  const m = model({ atoms: 1e12 }), a = C.exCompute(cfg({ t: 100 }), m), b = C.exCompute(cfg({ t: 2400 }), m), e = C.exCompute(cfg({ t: 100, eff: 25 }), m);
  close(b.cs.mu / a.cs.mu, 24, 1e-9); close(e.cs.mu / a.cs.mu, 0.25, 1e-9);
  const i = 20; close(a.c.rel[i] / b.c.rel[i], Math.sqrt(24), 1e-6);
});
test('bins partition the range: log bins per decade', () => {
  const R = C.exCompute(cfg({ bn: 20 }), model());
  assert.equal(R.n, 120);                                   // 6 decades x 20
  close(R.Ehi[R.n - 1], 1e3, 1e-12); close(R.Elo[0], 1e-3, 1e-12);
  for (let i = 1; i < R.n; i++) close(R.Elo[i], R.Ehi[i - 1], 1e-12);
});
test('stack of N samples: factor (1-T^N)/(1-T), N for a thin one, exact for a thick one', () => {
  close(C.stackFactor(1e-12, 5), 5, 1e-9);
  const tau = 0.7, T = Math.exp(-tau);
  close(C.stackFactor(tau, 3), (1 - T ** 3) / (1 - T), 1e-12);
  const m = model({ atoms: 3 * 1e24 / 10 * 0.7 / 1 * 1 }); // tau = atoms/area*1e-24*sig = 0.7 with area 3
  const one = C.exCompute(cfg({ n: 1 }), m), all = C.exCompute(cfg({ n: 3, tg: [1, 2, 3] }), m), p2 = C.exCompute(cfg({ n: 3, tg: [2] }), m), p1 = C.exCompute(cfg({ n: 3, tg: [1] }), m);
  close(all.cs.pS / one.cs.pS, (1 - T ** 3) / (1 - T), 1e-6, 'all positions');
  close(p2.cs.pS / p1.cs.pS, T, 1e-6, 'second position sees T');
  close(p1.cs.pS + p2.cs.pS + C.exCompute(cfg({ n: 3, tg: [3] }), m).cs.pS, all.cs.pS, 1e-9, 'positions add up');
});
test('transmission: T = exp(-N tau), sigma recovered, uncertainty ~ 1/sqrt(counts)', () => {
  const sig = 10, atoms = 0.5e24 * 3 / sig, m = model({ sig, atoms });      // tau = 0.5 per sample
  const R = C.exCompute(cfg({ mode: 'trans', n: 2, t: 1e6 }), m), i = 30;
  close(R.t.Tth[i], Math.exp(-1.0), 1e-6);
  close(R.t.sgTh[i], sig, 1e-6);                                            // total cross section per primary atom
  const R2 = C.exCompute(cfg({ mode: 'trans', n: 2, t: 4e6 }), m);
  close(R.t.sgErr[i] / R2.t.sgErr[i], 2, 1e-6, 'error halves for 4x time');
});
test('simulation: Poisson draws are unbiased and reproducible', () => {
  const m = model({ atoms: 1e12 }), c = cfg({ sim: true, seed: 7, t: 50, bn: 5 });
  const a = C.exCompute(c, m), b = C.exCompute(c, m);
  assert.deepEqual(Array.from(a.c.tot), Array.from(b.c.tot));
  const e = C.exCompute(Object.assign({}, c, { sim: false }), m);
  close(sum(a.c.tot), sum(e.c.tot), 5 / Math.sqrt(sum(e.c.tot)));          // within a few sigma of the expectation
});
test('Poisson interval (Garwood) and gamma function', () => {
  const [lo, hi] = C.poissonInterval(0); assert.equal(lo, 0); close(hi, 1.841, 1e-3);
  const [l9, h9] = C.poissonInterval(9); close(C.gammaP(9, l9), 0.158655254, 1e-6); close(C.gammaP(10, h9), 1 - 0.158655254, 1e-6);
  const [lb, hb] = C.poissonInterval(10000); close(10000 - lb, 100, 0.02); close(hb - 10000, 100, 0.02);
  close(C.gammaP(2, 1), 1 - 2 / Math.E, 1e-12);
});
test('time of flight and energy are inverse; non-relativistic limit', () => {
  const E = 1.234; close(C.tofToE(C.tofNs(E, 185), 185), E, 1e-10);
  close(C.tofNs(1e-6, 100), 100 / (Math.sqrt(2 * 1e-6 / 939.56542052) * 0.299792458), 1e-6);
});
test('ZAID decoding and MT names', () => {
  assert.equal(C.zaidInfo('79197.00c').label, 'Au-197');
  assert.equal(C.zaidInfo('95642.00c').label, 'Am-242m');
  assert.equal(C.mtName(102).sym, '(n,γ)');
});
test('stack position selection', () => {
  assert.deepEqual(C.parseTargets('', 4), [1, 2, 3, 4]); assert.deepEqual(C.parseTargets('1,3', 4), [1, 3]); assert.deepEqual(C.parseTargets('2-3', 4), [2, 3]);
  assert.throws(() => C.parseTargets('7', 4)); assert.equal(C.tgLabel([1, 2, 3], 3), 'all 3 targets'); assert.equal(C.layerOf({ layer: 'front' }), 'front');
});

// ---- vacuum window ----
test('window composition: fractions sum to one, mass and atom fractions are consistent', () => {
  for (const k of Object.keys(C.WIN_MATS)) {
    const c = C.winComposition(k);
    close(c.isos.reduce((a, o) => a + o.f, 0), 1, 1e-12, k);
    close(c.elems.reduce((a, e) => a + e.mass, 0), 1, 1e-12, k);
    close(c.elems.reduce((a, e) => a + e.atom, 0), 1, 1e-12, k);
    assert.ok(c.Abar > 1 && c.Abar < 100);
  }
  const my = C.winComposition('mylar');                     // C10H8O4: 192.17 g/mol per formula unit, 22 atoms
  close(my.Abar, (10 * 12.011 + 8 * 1.008 + 4 * 15.999) / 22, 2e-4);
  close(my.elems.find(e => e.sym === "C").mass, 120.11 / (120.11 + 8.064 + 63.996), 2e-4);
  const ss = C.winComposition('ss304');
  close(ss.elems.find(e => e.sym === 'Fe').mass, 1 - (19 + 9.25 + 1 + 0.375 + 0.05 + 0.04 + 0.0225 + 0.015) / 100, 1e-12);
});
test('window optical depth: sum of natural isotopes weighted by atom fractions, on the union of the grids', () => {
  const a = { E: Float64Array.of(1e-8, 1e-2, 20), xs: Float64Array.of(10, 10, 10), f: 0.25 };
  const b = { E: Float64Array.of(1e-9, 1e-3, 1e-1, 30), xs: Float64Array.of(4, 4, 8, 8), f: 0.75 };
  const m = C.winMerge([a, b]);
  assert.equal(m.E.length, 6 + 1 - 0);                       // 1e-9,1e-8,1e-3,1e-2,1e-1,20,30
  const at = e => { const i = Array.from(m.E).indexOf(e); return m.sig[i]; };
  close(at(1e-3), 0.25 * 10 + 0.75 * 4, 1e-12);
  close(at(1e-1), 0.25 * 10 + 0.75 * 8, 1e-12);
  close(at(1e-8), 0.25 * 10 + 0.75 * 4, 1e-12);
});
test('thinning keeps tau within tolerance of the full grid', () => {
  const N = 4000, E = Float64Array.from({ length: N }, (_, i) => 1e-6 * Math.pow(1e8, i / (N - 1))), sg = Float64Array.from(E, e => 5 + 3 * Math.sin(Math.log(e) * 3) + 40 / (1 + Math.pow((Math.log(e) + 2) * 20, 2)));
  const n = 2e-3, th = C.winThin(E, sg, n);
  assert.ok(th.E.length < N);
  for (let i = 0; i < N; i += 7) close(Math.exp(-C.interpLin(th.E, th.tau, E[i])), Math.exp(-n * sg[i]), 1e-3);
});
test('a window attenuates the fluence: rate x exp(-tau) for a flat fluence and cross section', () => {
  const E1 = 1e-3, E2 = 1e3, sig = 10, V0 = 1e4, n = 5e-4, tw = 3;       // tau_w = n x sigma_w
  const Eg = Float64Array.of(E1 / 2, E2 * 2), flux = { E: Float64Array.of(E1 / 2, E2 * 2), V: Float64Array.of(V0, V0) };
  const rx = { E: Eg, xs: Float64Array.of(sig, sig) };
  const r0 = C.integrate(rx, flux, 1, E1, E2, null, 0, null);
  const fw = { E: flux.E, V: flux.V, win: { E: Float64Array.of(1e-4, 1e4), tau: Float64Array.of(n * tw, n * tw) } };
  const r1 = C.integrate(rx, fw, 1, E1, E2, null, 0, null);
  close(r1.total / r0.total, Math.exp(-n * tw), 1e-9);
  close(r1.phi[5] / r0.phi[5], Math.exp(-n * tw), 1e-9);
});
test('window number density: atoms per barn = rho t N_A / A', () => {
  close(C.winNtot(2.699, 100, 26.9815385), 2.699 * 100e-4 * 6.02214076e23 / 26.9815385 * 1e-24, 1e-12);
  assert.equal(C.winNtot(0, 100, 27), 0);
});
test('window is applied once to the fluence, not repeated with the stacked targets', () => {
  const m0 = model({ atoms: 1e12 }), tw = 0.7;
  const win = { E: Float64Array.of(1e-4, 1e4), tau: Float64Array.of(tw, tw) };
  const m1 = Object.assign({}, m0, { flux: Object.assign({}, m0.flux, { win }) });
  m1.items = [{ grp: 'p', sum: true, all: true, ratio: 1, res: C.integrate(m0.items[0].res && { E: Float64Array.of(5e-4, 2e3), xs: Float64Array.of(10, 10) }, m1.flux, 1, m1.emin, m1.emax, null, 0, null) }];
  for (const N of [1, 3]) {
    const a = C.exCompute(cfg({ n: N, tg: Array.from({ length: N }, (_, i) => i + 1) }), m0), b = C.exCompute(cfg({ n: N, tg: Array.from({ length: N }, (_, i) => i + 1) }), m1);
    close(b.cs.mu / a.cs.mu, Math.exp(-tw), 1e-6, 'N=' + N);          // same factor for one and for three targets
  }
});
test('window merge keeps the groups apart (window and air) and the air composition is dry air', () => {
  const a = { E: Float64Array.of(1e-8, 10), xs: Float64Array.of(10, 10), f: 1, g: 0 }, b = { E: Float64Array.of(1e-9, 1, 50), xs: Float64Array.of(2, 2, 4), f: 0.5, g: 1 };
  const m = C.winMerge([a, b, Object.assign({}, b, { f: 0.5, xs: Float64Array.of(6, 6, 8) })]);
  assert.equal(m.sigs.length, 2);
  const i = Array.from(m.E).indexOf(1);
  close(m.sigs[0][i], 10, 1e-12); close(m.sigs[1][i], 0.5 * 2 + 0.5 * 6, 1e-12);
  const air = C.winComposition('air');
  close(air.Abar, 14.548, 1e-3);                              // 28.965 g/mol per molecule of ~2 atoms
  close(air.elems.find(e => e.sym === 'Ar').mass, 0.01288, 5e-3);
  close(C.winNtot(air.dens, 10 * 1e4, air.Abar), 1.204e-3 * 10 * 6.02214076e23 / air.Abar * 1e-24, 1e-12);
});

test('custom window material: a single element gets the density of the pure element', () => {
  const fe = C.winComposition('custom', { name: '', text: 'Fe', mode: 'atoms' });
  assert.equal(fe.dens, 7.874);
  assert.equal(C.winComposition('custom', { name: '', text: 'Pb 3', mode: 'mass' }).dens, 11.34);
  assert.ok(!(C.winComposition('custom', { name: '', text: 'Fe2 O3', mode: 'atoms' }).dens > 0));
});

test('background: normalisation factor scales the counts and the subtraction uncertainty', () => {
  const m = model({ atoms: 1e12 }), base = { bg: 5, t: 3600 };
  const known = C.exCompute(cfg(Object.assign({}, base, { bk: 'known' })), m), meas = C.exCompute(cfg(Object.assign({}, base, { bk: 'meas' })), m);
  const n1 = C.exCompute(cfg(Object.assign({}, base, { bk: 'norm', bkF: 1 })), m), n3 = C.exCompute(cfg(Object.assign({}, base, { bk: 'norm', bkF: 3 })), m);
  close(n1.cs.B, meas.cs.B, 1e-12, 'f = 1 gives the same background as the measured case');
  close(n1.cs.relInt, meas.cs.relInt, 1e-12, 'f = 1 equals measured for the same time');
  close(n3.cs.B, 3 * known.cs.B, 1e-12, 'background scaled by f');
  assert.ok(n3.cs.relInt > known.cs.relInt && n3.cs.relInt > n1.cs.relInt * 0.99);
  // variance of the subtracted estimate f^2 B_run: expected total variance = mu + f^2 B_run
  const B1 = known.cs.B, v = n3.cs.S + 3 * B1 + 9 * B1;
  close(n3.cs.relInt, Math.sqrt(v) / n3.cs.S, 1e-9, 'relative uncertainty of the net signal');
});

test('uploaded background with uncertainty column', () => {
  assert.equal(C.parseBgTable('1e-3 2\n1 0.5').u, null);
  const t = C.parseBgTable('# E v u\n1e-3 2 0.2\n1 0.5 0.05');
  close(t.u[0], 0.2, 1e-12); close(t.v[1], 0.5, 1e-12);
  assert.throws(() => C.parseBgTable('1 2 0.1\n2 3'));
  assert.throws(() => C.parseBgTable('1 2 -1\n2 3 1'));
  const m = model({ atoms: 1e12 }), tab = '1e-3 2 0.4\n1e3 2 0.4';
  const p = C.exCompute(cfg({ bk: 'meas', bgTab: C.parseBgTable('1e-3 2\n1e3 2'), bgX: 'E' }), m), u = C.exCompute(cfg({ bk: 'meas', bgTab: C.parseBgTable(tab), bgX: 'E' }), m);
  close(u.cs.B, p.cs.B, 1e-9, 'same counts with or without the uncertainty column');
  assert.ok(u.cs.relInt !== p.cs.relInt);
  const k = C.exCompute(cfg({ bk: 'known', bgTab: C.parseBgTable(tab), bgX: 'E' }), m);
  assert.ok(k.cs.relInt < u.cs.relInt);
});

test('background: separate background run of another duration', () => {
  const m = model({ atoms: 1e12 }), base = { bg: 5, t: 3600, bk: 'norm', bkF: 1 };
  const known = C.exCompute(cfg({ bg: 5, t: 3600, bk: 'known' }), m), a = C.exCompute(cfg(Object.assign({}, base, { bkT: 7200 })), m), b = C.exCompute(cfg(Object.assign({}, base, { bkT: 3600 })), m);
  close(a.cs.B, known.cs.B, 1e-12, 'the expected background does not depend on the run length of the background');
  const B = known.cs.B, S = known.cs.S;
  close(a.cs.relInt, Math.sqrt(S + B + 0.25 * 2 * B) / S, 1e-9, 'twice the background time: weight 1/2, counts 2B');
  close(b.cs.relInt, Math.sqrt(S + B + B) / S, 1e-9, 'same time');
});

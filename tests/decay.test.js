// Decay data: ENDF-6 decay records (MF 8 / MT 457), yields, rates and emission spectra. Run: node build.js && node --test tests/
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../dist/core.js');
const close = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), (msg || '') + ' got ' + a + ' expected ' + b);
// ---- builds the lines of a synthetic decay record in ENDF format ----
const fl = x => { const s = x === 0 ? '0.000000+0' : x.toExponential(6).replace('e', ''); return s.padStart(11); };
const it = x => String(x).padStart(11);
// every "line" is given as 6 numbers; integers that must be written as integers are tagged by a string
function mk(mat, rows) {
  return rows.map((r, i) => r.map(v => typeof v === 'string' ? it(parseInt(v, 10)) : fl(v)).join('').padEnd(66) + String(mat).padStart(4) + ' 8457'.padStart(5) + String(i + 1).padStart(5));
}
// Co-60-like: gamma 1173 keV (0.9985) + 1332 keV (0.9998), beta- end-points 318 keV (0.9988) and 1491 keV (0.0012)
function co60() {
  return mk(2725, [
    [27060, 59.9, '0', '0', '0', '2'],
    [1.66342e8, 0, '0', '0', '6', '0'], [0, 0, 0, 0, 0, 0],
    [5, 1, '0', '0', '6', '1'], [1, 0, 2.8e6, 0, 1, 0],
    [0, '0', '0', '0', '6', '2'], [1, 0, 0, 0, 0, 0],
    [1173228, 0, '0', '0', '6', '0'], [1, 0, 0.9985, 0, 0, 0],
    [1332492, 0, '0', '0', '6', '0'], [1, 0, 0.9998, 0, 0, 0],
    [0, '1', '0', '0', '6', '2'], [1, 0, 0, 0, 0, 0],
    [318151.8, 0, '0', '0', '6', '0'], [1, 1, 0.9988, 0, 0, 0],
    [1491392, 0, '0', '0', '6', '0'], [1, 3, 0.0012, 0, 0, 0]
  ]);
}
test('decay record: yields, half-life and rates', () => {
  const d = C.decParse(co60()), y = C.decYields(d);
  close(d.T, 1.66342e8, 1e-5); close(y.g, 1.9983, 1e-6); close(y.bm, 1, 1e-9); assert.equal(y.a, 0); assert.equal(y.bp, 0);
  assert.deepEqual(y.m, [[1, 1, 0]]); assert.equal(C.decModeName(1), 'β⁻'); assert.equal(C.decModeName(2), 'ε/β⁺'); assert.equal(C.decModeName(1.5), 'β⁻n'); assert.equal(C.decModeName(1.55), 'β⁻2n'); assert.equal(C.decModeName(4), 'α');
  const r = C.decRates(y, 1e12);
  close(r.A, Math.LN2 / 1.66342e8 * 1e12, 1e-9); close(r.tot, r.g + r.bm, 1e-9);
  assert.equal(C.decRates(y, 0).tot, 0);
});
test('decay record: beta+ from the absolute intensity RIS, scaled by the EC/beta+ branching', () => {
  // Na-22-like: EC/beta+ (RTYP 2) branching 1; line RI = 0.99944 (JEFF writes percent: 99.944), RIS = 0.8989 (89.89)
  for (const pc of [1, 100]) {
    const L = mk(1, [[11022, 21.9, '0', '0', '0', '1'], [8.2e7, 0, '0', '0', '6', '0'], [0, 0, 0, 0, 0, 0],
      [3, 1, '0', '0', '6', '1'], [2, 0, 2842000, 0, 1, 0],
      [0, '2', '0', '0', '6', '1'], [1, 0, 0, 0, 0, 0],
      [1568443, 0, '0', '0', '6', '0'], [2, 1, 0.99944 * pc, 0, 0.8989 * pc, 0]]);
    const y = C.decYields(C.decParse(L));
    close(y.bp, 0.8989 / 0.99944, 1e-4, 'percent factor ' + pc);
  }
});
test('decay record: stable nuclide, file names, ZAIDs, JEFF index', () => {
  const st = mk(1, [[1001, 1, '0', '0', '1', '0'], [0, 0, '0', '0', '6', '0'], [0, 0, 0, 0, 0, 0]]);
  assert.ok(C.decYields(C.decParse(st)).stable);
  assert.equal(C.decFileName(27, 60, 0, 'Co'), 'dec-027_Co_060.endf'); assert.equal(C.decFileName(95, 242, 1, 'Am'), 'dec-095_Am_242m1.endf');
  assert.deepEqual(C.decZaid(95642), { Z: 95, A: 242, liso: 1 }); assert.deepEqual(C.decZaid(27060), { Z: 27, A: 60, liso: 0 });
  const idx = C.decIndexText(co60().join('\n') + '\n' + st.map(l => l.slice(0, 66) + '   2' + l.slice(70)).join('\n') + '\n');
  assert.ok(idx.has(270600) && idx.has(10010));
});
test('emission spectra: lines, beta end-points, histogram sums and beta mean energy', () => {
  const s = C.decSpectra(C.decParse(co60()));
  assert.equal(s.g.lines.length, 2); close(s.g.lines[0].E, 1173.228, 1e-9); assert.equal(s.bm.br.length, 2); close(s.bm.br[0].Emax, 318.1518, 1e-9); assert.equal(s.bm.br[0].Z, 28);
  const list = [{ s, A: 10 }], hg = C.decHist(list, 'g', 1, 2000);
  close(hg.h.reduce((p, q) => p + q, 0), 10 * 1.9983, 1e-9);
  assert.ok(hg.h[1173] > 9.9 && hg.h[1332] > 9.9);
  const hb = C.decHist(list, 'bm', 1, 1600);
  close(hb.h.reduce((p, q) => p + q, 0), 10 * 1, 1e-4);
  // mean beta- energy of the 318 keV branch of Co-60 is about 96 keV
  const one = [{ s: { bm: { lines: [], br: [s.bm.br[0]] } }, A: 1 }], h1 = C.decHist(one, 'bm', 1, 320);
  let m = 0, t = 0; h1.h.forEach((v, i) => { m += v * (i + 0.5); t += v; });
  close(m / t, 95.8, 0.03);
  close(C.decEmax(list, 'bm'), 1491.392, 1e-9);
});

test('energy resolution: folding keeps the area and gives the requested width', () => {
  const lst = [{ s: { g: { lines: [{ E: 1000, I: 1 }], br: [] } }, A: 10 }];
  const sg = C.decSigma('abs', 5), hf = C.decHist(lst, 'g', 0.5, 4000, sg);
  close(hf.h.reduce((p, q) => p + q, 0), 10, 1e-5);
  let half = 0, mx = 0; hf.h.forEach(v => { if (v > mx) mx = v; }); hf.h.forEach(v => { if (v >= mx / 2) half++; });
  close(half * 0.5, 5, 0.08, 'FWHM');
  close(C.decSigma('rel', 7)(662) * 2.354820045, 0.07 * 662, 1e-9); close(C.decSigma('sqrt', 3)(1000) * 2.354820045, 3, 1e-9); assert.equal(C.decSigma('abs', 0), null);
  const sb = [{ s: { bm: { lines: [], br: [{ Emax: 546, I: 1, Z: 39, A: 90, s: -1 }] } }, A: 1 }], hb = C.decHist(sb, 'bm', 2, 400, C.decSigma('abs', 20));
  close(hb.h.reduce((p, q) => p + q, 0), 1, 0.02);                    // a little is lost below zero energy
  close(C.decErfc(0.5), 0.4795001, 1e-6);
});

test('daughters and equilibrium', () => {
  const C = require('../dist/core.js');
  const y = { T: 9.5e8, stable: false, m: [[1, 0.056, 0], [1, 0.944, 1]] };           // Cs-137: beta- to Ba-137 (ground) and Ba-137m
  const d = C.decDaughters(y, 55, 137);
  assert.deepEqual(d.map(x => [x.Z, x.A, x.liso]).sort(), [[56, 137, 0], [56, 137, 1]]);
  assert.equal(C.decDaughters({ m: [[3, 1, 0]] }, 56, 137)[0].A, 137);                 // IT: same Z and A
  const a = C.decDaughters({ m: [[4, 1, 0]] }, 92, 238)[0]; assert.deepEqual([a.Z, a.A], [90, 234]);
  assert.equal(C.decDaughters({ m: [[6, 1, 0]] }, 98, 252).length, 0);                // spontaneous fission
  const e = C.decDaughters({ m: [[1.5, 1, 0]] }, 36, 90)[0]; assert.deepEqual([e.Z, e.A], [37, 89]);   // beta- n
  const Ap = 1e6, ba = C.decEquil(Ap, 9.5e8, 0.944, 153);
  assert.ok(Math.abs(ba / (Ap * 0.944) - 1) < 1e-6);                                    // secular equilibrium: A = br x Ap
  const tc = C.decEquil(1, 66 * 3600, 1, 6 * 3600), l = Math.LN2; assert.ok(Math.abs(tc - (l / 6) / (l / 6 - l / 66)) < 1e-12);   // transient (Mo-99 -> Tc-99m)
  assert.equal(C.decEquil(1, 100, 1, 1000), 0);                                         // longer-lived daughter: no equilibrium
});

test('Bateman chain', () => {
  const C = require('../dist/core.js'), l1 = Math.LN2 / 66, l2 = Math.LN2 / 6, t = 20, N0 = 1e10;
  const n2 = C.decBateman([l1, l2], [1, 1], N0, t), ref = N0 * l1 / (l2 - l1) * (Math.exp(-l1 * t) - Math.exp(-l2 * t));
  assert.ok(Math.abs(n2 / ref - 1) < 1e-12);
  assert.equal(C.decBateman([l1, l2], [1, 1], N0, 0), 0);                                // no daughters at t = 0
  const eq = C.decBateman([1e-9, 1e-3], [1, 0.944], 1e12, 1e5);                         // long-lived parent, short daughter: secular equilibrium A_d = br A_p
  assert.ok(Math.abs(eq * 1e-3 / (0.944 * 1e-9 * 1e12 * Math.exp(-1e-9 * 1e5)) - 1) < 1e-5);
  const l3 = Math.LN2 / 30, n3 = C.decBateman([l1, l2, l3], [1, 1, 0.5], N0, t);         // three members against numerical integration
  let a = N0, b = 0, c = 0; const dt = 1e-3; for (let s = 0; s < t / dt; s++) { const da = -l1 * a, db = l1 * a - l2 * b, dc = 0.5 * l2 * b - l3 * c; a += da * dt; b += db * dt; c += dc * dt; }
  assert.ok(Math.abs(n3 / c - 1) < 1e-3);
  const eqn = C.decBateman([l1, l1], [1, 1], N0, t); assert.ok(isFinite(eqn) && eqn > 0);   // equal half-lives
});
test('decay record: absolute intensity = FD x RI (RI relative; percent with FD 0.01 gives the same)', () => {
  const g = (fd, ri) => C.decYields(C.decParse(mk(1, [[55137, 1, '0', '0', '0', '1'], [9.5e8, 0, '0', '0', '6', '0'], [0, 0, 0, 0, 0, 0],
    [1, 1, '0', '0', '6', '1'], [1, 0, 1175630, 0, 1, 0],
    [0, '0', '0', '0', '6', '1'], [fd, 0, 0, 0, 0, 0], [661657, 0, '0', '0', '6', '0'], [0, 0, ri, 0, 0, 0]]))).g;
  close(g(1, 0.851), 0.851, 1e-9); close(g(0.01, 85.1), 0.851, 1e-9); close(g(0, 0.851), 0.851, 1e-9);
});

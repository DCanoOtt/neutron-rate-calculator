// ---------- Radioactive decay data: ENDF-6 decay files (MF 8, MT 457) ----------
// Reads the ENDF/B-VIII.0 decay sublibrary (one file per nuclide, dec-ZZZ_El_AAA[mN].endf) and the JEFF-4.0 decay file (all nuclides in one
// file). From the decay data of ONE nuclide it gives the number of alpha, beta-, beta+ and gamma particles emitted per decay and its
// half-life. Daughters are not followed.
// Record layout (ENDF-6 manual, section 8.4): HEAD [ZA, AWR, LIS, LISO, NST, NSP]; LIST [T1/2, dT, 0, 0, NC, 0] with the mean energies;
// LIST [SPI, PAR, 0, 0, 6*NDK, NDK] with the decay modes (RTYP, RFS, Q, dQ, BR, dBR); then NSP spectra, each
//   LIST [0, STYP, LCON, 0, 6, NER] + one LIST (FD, dFD, ER, dER, FC, dFC), NER discrete lines LIST [E, dE, 0, 0, NT, 0] holding
//   (RTYP, TYPE, RI, dRI, RIS, dRIS, ...) and, if LCON is not 0, a TAB1 continuum (+ a covariance LIST when LCOV = 1).
// STYP: 0 gamma, 1 beta-, 2 EC and beta+, 4 alpha, 5 neutron, 6 fission, 7 proton, 8 electrons (conversion, Auger), 9 X rays and annihilation.
// RI is a RELATIVE intensity (ENDF-6 manual, 8.4): the absolute number per decay is FD x RI (ENDF/B-VIII.0: FD = 1 and RI per decay, as a fraction, not percent).
// The continuum RP(E) is normalised to 1 and multiplied by FC. A continuum carries its number of particles per decay in FC. For STYP 2 the beta+ part of
// the intensity is RIS (absolute, per decay); JEFF-4.0 writes RI and RIS of these lines in percent, so they are rescaled so that the sum
// of RI equals the branching ratio of the EC/beta+ decay modes.
function decNum(s) {
  s = s.trim(); if (!s) return 0;
  const v = +s; if (!isNaN(v)) return v;
  const m = /^([+-]?\d*\.?\d*)([+-]\d+)$/.exec(s);                      // 1.234567-3 means 1.234567e-3
  return m ? parseFloat(m[1] + 'e' + m[2]) : NaN;
}
const decSec = l => l.length >= 75 && l.substr(70, 5) === ' 8457';
// lines: the lines of one material. Returns null when the material has no decay record.
function decParse(lines) {
  const sec = lines.filter(decSec); if (sec.length < 3) return null;
  let p = 0;
  const head = () => { const L = sec[p++]; if (L === undefined) throw new Error('truncated decay record'); return [decNum(L.substr(0, 11)), decNum(L.substr(11, 11)), parseInt(L.substr(22, 11), 10) || 0, parseInt(L.substr(33, 11), 10) || 0, parseInt(L.substr(44, 11), 10) || 0, parseInt(L.substr(55, 11), 10) || 0]; };
  const items = n => { const out = []; for (let k = 0; k < Math.ceil(n / 6); k++) { const L = sec[p++]; if (L === undefined) throw new Error('truncated decay record'); for (let i = 0; i < 6; i++) out.push(decNum(L.substr(i * 11, 11))); } return out.slice(0, n); };
  const H = head(), d = { za: Math.round(H[0]), liso: H[3], nst: H[4], T: 0, modes: [], spec: [] };
  const h1 = head(); d.T = h1[0]; items(h1[4]);
  if (d.nst === 1 && H[5] === 0) return d;
  const h2 = head(), it = items(h2[4]);
  for (let k = 0; k < h2[5]; k++) d.modes.push(it.slice(6 * k, 6 * k + 6));
  for (let s = 0; s < H[5]; s++) {
    const hs = head(), sp = { styp: Math.round(hs[1]), lcon: hs[2], FD: 0, FC: 0, lines: [] }, g = items(hs[4]);
    sp.FD = g[0] > 0 ? g[0] : 1; sp.FC = g[4];   // absolute = FD x RI (ENDF-6: RI is a relative intensity); a missing FD (0) would silence the lines, so it counts as 1
    if (hs[2] !== 1) for (let k = 0; k < hs[5]; k++) { const hl = head(); sp.lines.push({ E: hl[0], it: items(hl[4]) }); }
    if (hs[2] !== 0) { const ht = head(); items(2 * ht[4]); const pt = items(2 * ht[5]); sp.tab = { E: [], y: [] }; for (let i = 0; i + 1 < pt.length; i += 2) { sp.tab.E.push(pt[i]); sp.tab.y.push(pt[i + 1]); } if (ht[2] === 1) { const hc = head(); items(hc[4]); } }
    d.spec.push(sp);
  }
  return d;
}
// Particles per decay and half-life (s) of the nuclide described by a parsed decay record.
function decYields(d) {
  const y = { T: d.T, stable: d.nst === 1 || !(d.T > 0), a: 0, bm: 0, bp: 0, g: 0, m: d.modes.filter(m => m[4] > 0).map(m => [m[0], m[4], m[1]]) };   // m: decay modes [RTYP, branching ratio, isomeric state of the daughter]
  let br2 = 0; for (const m of d.modes) if (Math.floor(m[0] + 1e-9) === 2) br2 += m[4];
  for (const sp of d.spec) {
    let ri = 0, ris = 0; for (const l of sp.lines) { ri += l.it[2]; ris += l.it[4]; }
    const n = sp.FD * ri + sp.FC;
    if (sp.styp === 0) y.g += n; else if (sp.styp === 1) y.bm += n; else if (sp.styp === 4) y.a += n;
    else if (sp.styp === 2 && ri > 0 && br2 > 0) y.bp += ris * br2 / ri;
  }
  return y;
}
// Daughters of a nuclide (Z, A) from its decay modes: [{Z, A, liso, br}] (no daughter for spontaneous fission)
function decDaughters(y, Z, A) {
  const D = { 1: [1, 0], 2: [-1, 0], 3: [0, 0], 4: [-2, -4], 5: [0, -1], 7: [-1, -1] }, out = new Map();
  for (const m of (y && y.m) || []) {
    const s = (+m[0]).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''), q = s.split('.'), p = D[q[0]];
    if (!p) continue;
    let z = Z + p[0], a = A + p[1];
    for (const c of (q[1] || '')) { const e = D[c]; if (e && c !== '3') { z += e[0]; a += e[1]; } }
    const liso = Math.max(0, Math.round(m[2] || 0)), key = z * 1e6 + a * 10 + liso, o = out.get(key);
    if (o) o.br += m[1]; else out.set(key, { Z: z, A: a, liso, br: m[1] });
  }
  return Array.from(out.values());
}
// Activity of a daughter in transient (secular when it is much shorter-lived) equilibrium with a parent of activity Ap: Ap br ld / (ld - lp); 0 if it is not shorter-lived.
function decEquil(Ap, Tp, br, Td) {
  if (!(Td > 0) || !(Tp > 0) || !(Td < Tp)) return 0;
  const lp = Math.LN2 / Tp, ld = Math.LN2 / Td;
  return Ap * br * ld / (ld - lp);
}
// Bateman solution along a decay chain: atoms of the k-th nuclide of the chain after a time t, for N0 atoms of the first one at t = 0 and none of the others.
// lams: decay constants of the chain (1/s), brs[i]: branching ratio from nuclide i - 1 to i (brs[0] unused). The stable end of a chain is not part of it.
function decBateman(lams, brs, N0, t) {
  const k = lams.length - 1, L = lams.slice();
  if (k === 0) return N0 * Math.exp(-L[0] * t);
  for (let i = 0; i <= k; i++) for (let j = 0; j < i; j++) if (Math.abs(L[i] - L[j]) <= 1e-7 * Math.max(L[i], L[j])) L[i] = L[j] * (1 + 1e-6 * (i - j));   // equal decay constants: nudge apart
  let pre = N0; for (let i = 1; i <= k; i++) pre *= brs[i] * L[i - 1];
  let sum = 0;
  for (let i = 0; i <= k; i++) { let d = 1; for (let j = 0; j <= k; j++) if (j !== i) d *= L[j] - L[i]; sum += Math.exp(-L[i] * t) / d; }
  return Math.max(0, pre * sum);
}
// Emission rates (per second) of N atoms of a nuclide with yields y.
function decRates(y, N) {
  if (!y || y.stable || !(N > 0)) return { A: 0, a: 0, bm: 0, bp: 0, g: 0, tot: 0 };
  const A = Math.LN2 / y.T * N, r = { A, a: A * y.a, bm: A * y.bm, bp: A * y.bp, g: A * y.g };
  r.tot = r.a + r.bm + r.bp + r.g;
  return r;
}
// Index of a file that holds many materials (JEFF-4.0): Map (ZA * 10 + isomeric state) -> [start, end) offsets in the text.
function decIndexText(text) {
  const idx = new Map(), n = text.length;
  let pos = 0, mat = -1, start = 0, key = null;
  while (pos < n) {
    let e = text.indexOf('\n', pos); if (e < 0) e = n;
    if (e - pos >= 75) {
      const m = parseInt(text.substr(pos + 66, 4), 10);
      if (m > 0) {
        if (m !== mat) { if (key !== null && !idx.has(key)) idx.set(key, [start, pos]); mat = m; start = pos; key = null; }
        if (key === null && text.substr(pos + 70, 5) === ' 8457') key = Math.round(decNum(text.substr(pos, 11))) * 10 + (parseInt(text.substr(pos + 33, 11), 10) || 0);
      }
    }
    pos = e + 1;
  }
  if (key !== null && !idx.has(key)) idx.set(key, [start, n]);
  return idx;
}
// Name of the ENDF/B-VIII.0 file of a nuclide: dec-027_Co_060.endf, dec-095_Am_242m1.endf (the neutron is dec-000_Nn_001.endf).
function decFileName(Z, A, liso, sym) {
  const p3 = v => String(v).padStart(3, '0');
  return 'dec-' + p3(Z) + '_' + (Z === 0 ? 'Nn' : sym) + '_' + p3(A) + (liso > 0 ? 'm' + liso : '') + '.endf';
}
// ACE ZAID number (Z*1000 + A, metastable states as A + 300 + 100*m) -> { Z, A, liso }
function decZaid(za) {
  const Z = Math.floor(za / 1000); let A = za % 1000, liso = 0;
  if (A > 300) for (let m = 1; m <= 4; m++) { const a = A - 300 - 100 * m; if (a >= Z && a <= 3 * Z + 10) { A = a; liso = m; break; } }
  return { Z, A, liso };
}

// ---------- Emission spectra of one nuclide (per decay) ----------
// Result: { a, bm, bp, g, ce } with { lines: [{E, I}] (E in keV, I per decay), cont: [{Emax, I, Z, s}] beta branches or null, tab: {E (keV), y (per decay and keV)} | null }
//   a   alpha lines (STYP 4)          bm  beta-: one branch per line, E = end-point (STYP 1)
//   bp  beta+: lines of STYP 2 above 2 m_e c^2, end-point = E - 1021.997 keV, intensity = RIS scaled as in decYields
//   g   gamma + X rays (STYP 0 and 9; STYP 9 also holds the 511 keV annihilation photons)
//   ce  conversion and Auger electrons (STYP 8)
const DEC_2ME = 1021.997, DEC_ME = 510.99895;
function decSpectra(d) {
  const o = { a: { lines: [], br: [] }, bm: { lines: [], br: [] }, bp: { lines: [], br: [] }, g: { lines: [], br: [] }, ce: { lines: [], br: [] } };
  const Z = Math.floor(d.za / 1000);
  let br2 = 0; for (const m of d.modes) if (Math.floor(m[0] + 1e-9) === 2) br2 += m[4];
  for (const sp of d.spec) {
    const key = { 0: 'g', 9: 'g', 1: 'bm', 2: 'bp', 4: 'a', 8: 'ce' }[sp.styp]; if (!key) continue;
    const t = o[key];
    let ri = 0; for (const l of sp.lines) ri += l.it[2];
    for (const l of sp.lines) {
      const E = l.E / 1000;
      if (sp.styp === 1) { if (E > 0 && l.it[2] > 0) t.br.push({ Emax: E, I: sp.FD * l.it[2], Z: Z + 1, A: d.za % 1000, s: -1 }); }
      else if (sp.styp === 2) { const I = ri > 0 && br2 > 0 ? l.it[4] * br2 / ri : 0; if (I > 0 && E > DEC_2ME) t.br.push({ Emax: E - DEC_2ME, I, Z: Z - 1, A: d.za % 1000, s: 1 }); }
      else if (l.it[2] > 0) t.lines.push({ E, I: sp.FD * l.it[2] });
    }
    if (sp.tab && sp.tab.E.length > 1) {                              // continuum: per decay and keV, normalised to the stated number of particles FC
      const E = sp.tab.E.map(v => v / 1000), y = sp.tab.y.map(v => v * 1000); let a = 0;
      for (let i = 1; i < E.length; i++) a += 0.5 * (y[i] + y[i - 1]) * (E[i] - E[i - 1]);
      if (a > 0) { const f = sp.FC > 0 ? sp.FC / a : 1; t.tab = { E, y: y.map(v => v * f) }; }
    }
  }
  return o;
}
// Allowed beta spectrum shape N(E) ~ p W (W0 - W)^2 F(Z, W) with the relativistic Fermi function
//   F = 2 (1 + g) (2 p R)^(2 (g - 1)) exp(pi eta) |Gamma(g + i eta)|^2 / Gamma(2 g + 1)^2,  g = sqrt(1 - (alpha Z)^2), eta = s alpha Z W / p
// (s = -1 electrons, +1 positrons; Z = charge and A = mass number of the daughter; R = 0.5 alpha A^(1/3) in units of hbar/(m c)).
// Forbidden shape factors and atomic screening are not included. Returns the content of the bins [edges[i], edges[i+1]] for a unit total.
function decLogGammaRe(x, y) {                                           // Re log Gamma(x + i y), Lanczos (g = 7), reflection for x < 0.5
  if (x < 0.5) { const pr = Math.PI * Math.hypot(Math.sin(Math.PI * x) * Math.cosh(Math.PI * y), Math.cos(Math.PI * x) * Math.sinh(Math.PI * y)); return Math.log(Math.PI / pr) - decLogGammaRe(1 - x, -y); }
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1; let re = c[0], im = 0;
  for (let i = 1; i < 9; i++) { const dx = x + i, d = dx * dx + y * y; re += c[i] * dx / d; im -= c[i] * y / d; }
  const tr = x + 7.5, lr = 0.5 * Math.log(tr * tr + y * y), li = Math.atan2(y, tr);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * lr - y * li - tr + Math.log(Math.hypot(re, im));
}
function decBetaBins(Emax, Z, s, edges, A) {
  const W0 = 1 + Emax / DEC_ME, al = 1 / 137.036, aZ = al * Z, g = Math.sqrt(Math.max(1 - aZ * aZ, 1e-6)), R = 0.5 * al * Math.pow(A > 0 ? A : 2.5 * Z, 1 / 3);
  const lg2g = decLogGammaRe(2 * g + 1, 0);
  const f = E => {
    if (!(E > 0) || E >= Emax) return 0;
    const W = 1 + E / DEC_ME, p = Math.sqrt(W * W - 1), eta = -s * aZ * W / p;
    const lnF = Math.log(2 * (1 + g)) + 2 * (g - 1) * Math.log(2 * p * R) + Math.PI * eta + 2 * decLogGammaRe(g, eta) - 2 * lg2g;
    return p * W * (W0 - W) * (W0 - W) * Math.exp(lnF);
  };
  const NN = 2000; let tot = 0; for (let i = 0; i < NN; i++) tot += f((i + 0.5) * Emax / NN) * Emax / NN;
  const out = new Float64Array(edges.length - 1); if (!(tot > 0)) return out;
  for (let i = 0; i < out.length; i++) {
    const a = edges[i], b = Math.min(edges[i + 1], Emax); if (b <= a) continue;
    const m = 6; let v = 0; for (let k = 0; k < m; k++) v += f(a + (k + 0.5) * (b - a) / m) * (b - a) / m;
    out[i] = v / tot;
  }
  return out;
}
// Complementary error function (fractional error < 1.2e-7 everywhere)
function decErfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
// Energy resolution: standard deviation (keV) of the Gaussian response at energy E (keV). mode: 'abs' FWHM = val keV, 'rel' FWHM = val % of E,
// 'sqrt' FWHM = val keV at 1 MeV scaling with sqrt(E); anything else: none (returns null).
const DEC_FWHM = 2.354820045;
function decSigma(mode, val) {
  if (!(val > 0)) return null;
  if (mode === 'abs') return () => val / DEC_FWHM;
  if (mode === 'rel') return E => val / 100 * E / DEC_FWHM;
  if (mode === 'sqrt') return E => val * Math.sqrt(Math.max(E, 0) / 1000) / DEC_FWHM;
  return null;
}
// Probability that a Gaussian of mean e and standard deviation sg falls into [a, b]
function decGaussBin(e, sg, a, b) {
  const za = (a - e) / (sg * Math.SQRT2), zb = (b - e) / (sg * Math.SQRT2);
  return za > 0 ? 0.5 * (decErfc(za) - decErfc(zb)) : zb < 0 ? 0.5 * (decErfc(-zb) - decErfc(-za)) : 1 - 0.5 * decErfc(-za) - 0.5 * decErfc(zb);
}
// Histogram (1/s per bin) of kind k for a list of { s: spectra of one decay, A: decays per second }; uniform bins [0, nb*w] in keV.
// sig (optional): function E (keV) -> standard deviation of the energy resolution; the spectrum is then folded with a Gaussian
// (discrete lines are folded at their own energy, continuous parts from the bin centres). What falls outside [0, nb*w] is lost.
function decHist(list, k, w, nb, sig) {
  const edges = Float64Array.from({ length: nb + 1 }, (_, i) => i * w), h = new Float64Array(nb), hc = new Float64Array(nb);
  const spread = (arr, e, c, sg) => {
    if (!(sg > w * 0.05)) { const i = Math.floor(e / w); if (i >= 0 && i < nb) arr[i] += c; return; }
    const j0 = Math.max(0, Math.floor((e - 7 * sg) / w)), j1 = Math.min(nb - 1, Math.floor((e + 7 * sg) / w));
    for (let j = j0; j <= j1; j++) arr[j] += c * decGaussBin(e, sg, edges[j], edges[j + 1]);
  };
  for (const it of list) {
    const t = it.s[k]; if (!t || !(it.A > 0)) continue;
    for (const l of t.lines) spread(h, l.E, it.A * l.I, sig ? sig(l.E) : 0);
    for (const b of t.br) { const v = decBetaBins(b.Emax, b.Z, b.s, edges, b.A); for (let i = 0; i < nb; i++) hc[i] += it.A * b.I * v[i]; }
    if (t.tab) for (let i = 1; i < t.tab.E.length; i++) {             // continuum: trapezoids shared out on the bins
      const e0 = t.tab.E[i - 1], e1 = t.tab.E[i]; if (e1 <= e0) continue;
      const a0 = Math.max(0, Math.floor(e0 / w)), a1 = Math.min(nb - 1, Math.floor(e1 / w)), n = 0.5 * (t.tab.y[i] + t.tab.y[i - 1]) * (e1 - e0);
      for (let j = a0; j <= a1; j++) { const lo = Math.max(e0, j * w), hi = Math.min(e1, (j + 1) * w); if (hi > lo) hc[j] += it.A * n * (hi - lo) / (e1 - e0); }
    }
  }
  if (!sig) for (let i = 0; i < nb; i++) h[i] += hc[i];
  else for (let i = 0; i < nb; i++) if (hc[i] > 0) spread(h, (i + 0.5) * w, hc[i], sig((i + 0.5) * w));
  return { edges, h };
}
// Highest energy (keV) of a kind in a list of spectra
function decEmax(list, k) {
  let m = 0;
  for (const it of list) { const t = it.s[k]; if (!t || !(it.A > 0)) continue; for (const l of t.lines) m = Math.max(m, l.E); for (const b of t.br) m = Math.max(m, b.Emax); if (t.tab) m = Math.max(m, t.tab.E[t.tab.E.length - 1]); }
  return m;
}

// Name of a decay mode from its RTYP code (ENDF-6: 1 beta-, 2 EC/beta+, 3 IT, 4 alpha, 5 n, 6 SF, 7 p; decimals = following particles, 1.5 = beta- n)
function decModeName(rt) {
  const L = { 0: 'γ', 1: 'β⁻', 2: 'ε/β⁺', 3: 'IT', 4: 'α', 5: 'n', 6: 'SF', 7: 'p' }, s = (+rt).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''), q = s.split('.'), f = q[1] || '';
  let out = L[q[0]] || '?';
  for (let i = 0; i < f.length;) { let j = i; while (j < f.length && f[j] === f[i]) j++; out += (j - i > 1 ? (j - i) : '') + (L[f[i]] || '?'); i = j; }
  return out;
}

// ---------- Experiment engine (pure: no page, no DOM, no global state) ----------
// Counts in a bin = (rate density integrated over the bin) x time x efficiency, with Poisson statistics. A stack of N identical
// samples uses the first-collision model: sample k sees the beam attenuated by T^(k-1), so the reaction rate of the stack is the
// single-sample rate times (1 - T^N) / (1 - T), T = exp(-tau(E)). Transmission folds fluence x exp(-N tau) with the resolution
// function and compares the sample-in with the sample-out (open beam) run.
//
// exCompute(cfg, m) takes the run settings cfg and a model m, a plain snapshot of everything the calculation reads
// (exModel() in experiment/engine.js builds it from the page):
//   m.F  facility {L, f, ...}        m.flux  fluence table of that facility      m.LT  flight path of the TOF axis
//   m.RP resolution parameters or null            m.f, m.L  repetition rate and flight path in use
//   m.area, m.atoms  beam spot area (cm2) and number of primary atoms of the sample       m.emin, m.emax  energy window (MeV)
//   m.tab, m.items, m.comps  primary table, rate items and further components     m.layOn  {front, back}
//   m.units  beam attenuation units (exUnitsOf)       m.target  description lines of the target, copied into the result
function lgam(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; s += c[j] / y; }
  return -t + Math.log(2.5066282746310005 * s / z);
}
function gammaP(a, x) {                                              // regularised lower incomplete gamma function
  if (!(x > 0)) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lgam(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgam(a)) * h;
}
function gammaInv(a, p) {                                            // x with P(a, x) = p
  let lo = 0, hi = a + 12 * Math.sqrt(a) + 40;
  for (let i = 0; i < 100; i++) { const m = 0.5 * (lo + hi); if (gammaP(a, m) < p) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}
// 68.27 % (one sigma) central interval of the Poisson mean that is compatible with n observed counts (Garwood)
function poissonInterval(n) {
  const al = 0.158655254;
  return [n > 0 ? gammaInv(n, al) : 0, gammaInv(n + 1, 1 - al)];
}
function poissonDraw(mu, rnd) {
  if (!(mu > 0)) return 0;
  if (mu < 40) { const L = Math.exp(-mu); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }
  const u = Math.max(1e-12, rnd()), v = rnd(), g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(0, Math.round(mu + Math.sqrt(mu) * g));
}
// Stack factor (1 - T^N)/(1 - T) with T = exp(-tau); tends to N for a thin sample.
function stackFactor(tau, N) {
  if (N <= 1) return 1;
  if (tau < 1e-9) return N;
  return -Math.expm1(-N * tau) / -Math.expm1(-tau);
}
// Bin edges on the chosen axis (MeV or ns) and the energy range of every bin.
function exBins(cfg, emin, emax, LT) {
  const tof = cfg.ax === 'T';
  const def0 = tof ? tofNs(emax, LT) : emin, def1 = tof ? tofNs(emin, LT) : emax;
  let lo = isFinite(cfg.r0) && cfg.r0 > 0 ? Math.max(def0, cfg.r0) : def0, hi = isFinite(cfg.r1) && cfg.r1 > 0 ? Math.min(def1, cfg.r1) : def1;
  if (!(hi > lo)) throw new Error('The range of the experiment plot is empty or outside the fluence range.');
  const log = cfg.bs === 'log';
  let n = log ? Math.ceil(Math.log10(hi / lo) * cfg.bn - 1e-9) : Math.round(cfg.bn);
  n = Math.max(1, n);
  if (n > 20000) throw new Error('Too many bins (' + n + '). Use fewer bins per decade or a smaller range.');
  const ax = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) ax[i] = log ? lo * Math.pow(hi / lo, i / n) : lo + (hi - lo) * i / n;
  ax[0] = lo; ax[n] = hi;
  const Elo = new Float64Array(n), Ehi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (tof) { Elo[i] = tofToE(ax[i + 1], LT); Ehi[i] = tofToE(ax[i], LT); } else { Elo[i] = ax[i]; Ehi[i] = ax[i + 1]; }
    Elo[i] = Math.max(emin, Math.min(emax, Elo[i])); Ehi[i] = Math.max(emin, Math.min(emax, isFinite(Ehi[i]) ? Ehi[i] : emax));
  }
  return { n, ax, Elo, Ehi, tof, log, LT };
}
function parseBgTable(txt) {                                       // lines "x  rate  [uncertainty]": x > 0, rate and 1-sigma uncertainty >= 0 (counts/s per us of TOF)
  const rows = []; let nu = 0;
  for (const ln of String(txt || '').split(/\r?\n/)) {
    const q = ln.replace(/#.*/, '').trim(); if (!q) continue;
    const t = q.split(/[\s,;]+/).map(Number);
    if (t.length < 2 || !(t[0] > 0) || !isFinite(t[1]) || t[1] < 0 || (t.length > 2 && !(isFinite(t[2]) && t[2] >= 0))) throw new Error('Background spectrum: "' + q + '" is not an "x  value  uncertainty" line with x > 0, value >= 0 and uncertainty >= 0 (the uncertainty is optional).');
    if (t.length > 2) nu++;
    rows.push([t[0], t[1], t.length > 2 ? t[2] : 0]);
  }
  if (!rows.length) return null;
  if (rows.length < 2) throw new Error('Background spectrum: give at least two rows.');
  if (nu && nu < rows.length) throw new Error('Background spectrum: either every line has an uncertainty (third column) or none.');
  rows.sort((p, q) => p[0] - q[0]);
  return { x: Float64Array.from(rows.map(r => r[0])), lnx: Float64Array.from(rows.map(r => Math.log(r[0]))), v: Float64Array.from(rows.map(r => r[1])), u: nu ? Float64Array.from(rows.map(r => r[2])) : null };
}
function exEffFn(cfg) {
  const tb = cfg.effTab;
  if (tb && tb.E.length > 1) return E => Math.max(0, interpLin(tb.lnE, tb.v, Math.log(E))) / 100;
  return () => cfg.eff / 100;
}
function parseEffTable(txt) {
  const rows = [];
  for (const ln of String(txt || '').split(/\r?\n/)) {
    const s = ln.replace(/#.*/, '').trim(); if (!s) continue;
    const t = s.split(/[\s,;]+/).map(Number);
    if (t.length < 2 || !(t[0] > 0) || !isFinite(t[1])) throw new Error('Efficiency table: "' + s + '" is not an "E[MeV]  efficiency[%]" pair.');
    rows.push([t[0], t[1]]);
  }
  if (!rows.length) return null;
  if (rows.length < 2) throw new Error('Efficiency table: give at least two rows.');
  rows.sort((p, q) => p[0] - q[0]);
  return { E: Float64Array.from(rows.map(r => r[0])), lnE: Float64Array.from(rows.map(r => Math.log(r[0]))), v: Float64Array.from(rows.map(r => r[1])) };
}
// cumulative counts-per-second curve of an item for the whole stack: atoms x trapezoid of rho x stack factor
function exCum(res, atoms, fs) {
  const n = res.E.length, c = new Float64Array(n);
  if (!fs) { for (let i = 0; i < n; i++) c[i] = res.cum[i] * atoms; return c; }
  for (let i = 1; i < n; i++) c[i] = c[i - 1] + 0.5 * (res.rho[i] * fs[i] + res.rho[i - 1] * fs[i - 1]) * Math.log(res.E[i] / res.E[i - 1]) * atoms;
  return c;
}
function exBinSum(E, cum, B, eff) {                                   // counts per second in each bin, times efficiency
  const o = new Float64Array(B.n), obj = { E, cum };
  for (let i = 0; i < B.n; i++) {
    const a = B.Elo[i], b = B.Ehi[i];
    o[i] = b > a ? (cumAt(obj, b) - cumAt(obj, a)) * eff(Math.sqrt(a * b)) : 0;
  }
  return o;
}
// beam attenuation of one sample unit (every component of every layer), tau(E) = (atoms / area) sum ratio sigma_tot
function exUnitsOf(tab, comps, area, atoms) {
  const nP = area > 0 ? atoms / area * 1e-24 : 0, out = [];
  const add = (t, ratio) => { const tr = t && t.rxs.find(r => r.mt === 1); if (tr && ratio > 0) out.push({ E: tr.E, xs: tr.xs, w: nP * ratio }); };
  add(tab, 1);
  for (const c of comps) if (c.tab && c.eff > 0) add(c.tab, c.eff);
  return out;
}
const exTau = (units, E) => { let s = 0; for (const u of units) s += u.w * interpLin(u.E, u.xs, E); return s; };
function exFold(Egrid, xs, m, sc) {                                    // fluence x xs(E), with the resolution function if it is on
  let r = integrate({ E: Egrid, xs }, m.flux, sc, m.emin, m.emax, null, 0, null);
  if (m.RP) r = applyResolution(r, m.RP.L, m.RP.sigT, m.RP.tg);
  return r;
}
function exCompute(cfg, m) {
  const F = m.F;
  if (!m.tab || !m.items || !m.items.length) throw new Error('Select an isotope and at least one reaction first.');
  if (!(m.area > 0) || !(m.atoms > 0)) throw new Error('The sample needs a mass above zero and a beam spot radius above zero.');
  if (!(cfg.t > 0)) throw new Error('Enter a measurement time above zero.');
  const LT = m.LT, RP = m.RP;
  const sc = (m.f / F.f) * Math.pow(F.L / m.L, 2);
  const B = exBins(cfg, m.emin, m.emax, LT), n = B.n, N = cfg.n;
  const doC = cfg.mode !== 'trans', doT = cfg.mode !== 'count';
  const share = Math.min(0.999, Math.max(0.001, cfg.share / 100));
  const tin = doT ? cfg.t * share : cfg.t, tout = doT ? cfg.t - tin : 0, tc = doT ? tin : cfg.t;
  const units = m.units;
  const R = { cfg, B, n, N, mode: cfg.mode, LT, edges: B.ax, ax: cfg.ax, Elo: B.Elo, Ehi: B.Ehi, tc, tin, tout, notes: [], nP: m.atoms / m.area * 1e-24 };
  R.tLo = Float64Array.from(B.Ehi, e => tofNs(e, LT)); R.tHi = Float64Array.from(B.Elo, e => tofNs(e, LT));      // TOF of the upper / lower energy edge
  const rnd = rng32(cfg.seed >>> 0 || 1);
  R.sim = !!cfg.sim; R.target = m.target;
  if (doC) {
    const eff = exEffFn(cfg), atomsOf = it => m.atoms * (it.all ? 1 : it.ratio), K = cfg.tg;
    const fsOf = res => (K.length === 1 && K[0] === 1) ? null : Float64Array.from(res.E, e => { const t = exTau(units, e); let f = 0; for (const k of K) f += Math.exp(-(k - 1) * t); return f; });
    const rate = it => exBinSum(it.res.E, exCum(it.res, atomsOf(it), fsOf(it.res)), B, eff);
    const PS = new Float64Array(n), PF = new Float64Array(n), PB = new Float64Array(n), names = { sample: [], front: [], back: [] };
    const groups = [{ grp: 'p', layer: 'sample', label: m.tab.label }].concat(m.comps.map((c, ci) => ({ grp: 'c' + ci, layer: layerOf(c), label: c.tab ? c.tab.label : '' })));
    for (const g of groups) {
      const its = m.items.filter(x => x.grp === g.grp); if (!its.length) continue;
      const r = rate(its.find(x => x.sum) || its[0]), dst = g.layer === 'front' ? PF : g.layer === 'back' ? PB : PS;
      for (let i = 0; i < n; i++) dst[i] += r[i];
      names[g.layer].push(g.label);
    }
    const Sg = new Float64Array(n), Hd = new Float64Array(n), hold = [];
    for (let i = 0; i < n; i++) {
      const lay = (cfg.inF ? PF[i] : 0) + (cfg.inB ? PB[i] : 0);
      if (cfg.inS) { Sg[i] = PS[i]; Hd[i] = lay; } else { Sg[i] = lay; }
    }
    if (cfg.inS) { if (cfg.inF) hold.push(...names.front); if (cfg.inB) hold.push(...names.back); }
    R.inc = { S: cfg.inS, F: cfg.inF, B: cfg.inB }; R.names = names; R.layOn = { front: !!m.layOn.front, back: !!m.layOn.back }; R.tgText = tgLabel(K, N);
    R.sigName = cfg.inS ? 'samples' : 'front layer and backing';
    R.holdNames = hold;
    const Bg = new Float64Array(n), Bu = new Float64Array(n), Bs = new Float64Array(n), bgr = cfg.bg > 0 ? cfg.bg : 0;     // Bg: all background counts/s; Bu, Bs: the uploaded part with its uncertainty (counts/s) when the file gives one
    const bt = cfg.bgTab;
    for (let i = 0; i < n; i++) {                                    // counts/s: rate per us times the TOF width in us (flat + uploaded spectrum)
      let rate = bgr, fv = 0, fu = 0;
      const dt = (tofNs(B.Elo[i], LT) - tofNs(B.Ehi[i], LT)) / 1000;
      if (bt) { const em = Math.sqrt(B.Elo[i] * B.Ehi[i]), xv = cfg.bgX === 'T' ? tofNs(em, LT) / 1000 : em; if (xv >= bt.x[0] && xv <= bt.x[bt.x.length - 1]) { const lx = Math.log(xv); fv = interpLin(bt.lnx, bt.v, lx); if (bt.u) fu = interpLin(bt.lnx, bt.u, lx); rate += fv; } }
      Bg[i] = rate * dt;
      if (bt && bt.u) { Bu[i] = fv * dt; Bs[i] = fu * dt; }
    }
    // bgU: counts of the uploaded part with a given uncertainty; bgV: its variance
    const norm = cfg.bk === 'norm', fN = norm && cfg.bkF > 0 ? cfg.bkF : 1, tb = norm && cfg.bkT > 0 ? cfg.bkT : tc, gN = fN * tc / tb;   // normalised: rates of a separate background run of duration tb; fN scales the rate into the sample run, gN = fN tc / tb scales its counts                   // normalised: the background run gives bgm counts, scaled by fN into the sample run
    const sg = new Float64Array(n), hd = new Float64Array(n), bg = new Float64Array(n), bgm = new Float64Array(n), bgU = new Float64Array(n), bgV = new Float64Array(n), pS = new Float64Array(n), pF = new Float64Array(n), pB = new Float64Array(n);
    for (let i = 0; i < n; i++) { sg[i] = Sg[i] * tc; hd[i] = Hd[i] * tc; bgm[i] = Bg[i] * tb; bg[i] = Bg[i] * tc * fN; bgU[i] = Bu[i] * tb; bgV[i] = Math.pow(Bs[i] * tb, 2); pS[i] = PS[i] * tc; pF[i] = PF[i] * tc; pB[i] = PB[i] * tc; }
    const meas = cfg.bk === 'meas', vsub = new Float64Array(n), vE = new Float64Array(n);       // vsub: variance of the subtracted background estimate
    const mu = new Float64Array(n), tot = new Float64Array(n), eLo = new Float64Array(n), eHi = new Float64Array(n);
    const net = new Float64Array(n), netErr = new Float64Array(n), rel = new Float64Array(n), tneed = new Float64Array(n);
    const SM = {}; for (const q of ['S', 'F', 'B', 'G']) SM[q] = { y: new Float64Array(n), lo: new Float64Array(n), hi: new Float64Array(n) };
    for (let i = 0; i < n; i++) {
      mu[i] = sg[i] + hd[i] + bg[i];
      const b0 = hd[i] + bg[i];
      let nt = mu[i], nb = b0;
      if (R.sim) {
        const d = [poissonDraw(pS[i], rnd), poissonDraw(pF[i], rnd), poissonDraw(pB[i], rnd), poissonDraw(bg[i], rnd)];
        ['S', 'F', 'B', 'G'].forEach((q, j) => { SM[q].y[i] = d[j]; if (d[j] < 25) { const iv = poissonInterval(d[j]); SM[q].lo[i] = d[j] - iv[0]; SM[q].hi[i] = iv[1] - d[j]; } else { SM[q].lo[i] = SM[q].hi[i] = Math.sqrt(d[j]); } });
        nt = (cfg.inS ? d[0] : 0) + (cfg.inF ? d[1] : 0) + (cfg.inB ? d[2] : 0) + d[3];
        const gs = bgV[i] > 0 ? Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()) : 0, fu = bgU[i] + Math.sqrt(bgV[i]) * gs;     // uploaded part: Gaussian with the uncertainty of the file
        if (meas) { const p = poissonDraw(b0 - bgU[i], rnd); nb = p + fu; vsub[i] = p + bgV[i]; } else if (norm) { const h = poissonDraw(hd[i], rnd), m = poissonDraw(bgm[i] - bgU[i], rnd); nb = h + gN * (m + fu); vsub[i] = h + gN * gN * (m + bgV[i]); } else nb = b0;
      }
      tot[i] = nt;
      if (R.sim && nt < 25) { const iv = poissonInterval(nt); eLo[i] = nt - iv[0]; eHi[i] = iv[1] - nt; } else { eLo[i] = eHi[i] = Math.sqrt(nt); }
      net[i] = nt - nb;
      const vexp = meas ? b0 - bgU[i] + bgV[i] : norm ? hd[i] + gN * gN * (bgm[i] - bgU[i] + bgV[i]) : 0;
      vE[i] = vexp; if (!R.sim) vsub[i] = vexp;
      const v = (R.sim ? nt : mu[i]) + vsub[i];
      netErr[i] = Math.sqrt(v);
      rel[i] = net[i] > 0 ? netErr[i] / net[i] : NaN;
      const rv = sg[i] > 0 ? (mu[i] + vexp) / (sg[i] * sg[i]) : Infinity;      // expected relative variance of the net signal
      tneed[i] = cfg.tgt > 0 ? tc * rv / (cfg.tgt * cfg.tgt) : NaN;
    }
    R.c = { SM, pS, pF, pB, sg, hd, bg, mu, norm, fN, tb, tot, eLo, eHi, net, netErr, rel, tneed, meas };
    const sum = a => { let s = 0; for (let i = 0; i < n; i++) s += a[i]; return s; };
    const tS = sum(sg), tH = sum(hd), tB = sum(bg), tT = sum(tot), tN = sum(net);
    const tV = sum(vsub), tVe = sum(vE), varI = R.sim ? tT + tV : tS + tH + tB + tV;
    R.cs = { sim: R.sim ? { S: sum(SM.S.y), F: sum(SM.F.y), B: sum(SM.B.y), G: sum(SM.G.y) } : null, pS: sum(pS), pF: sum(pF), pB: sum(pB), S: tS, H: tH, B: tB, mu: tS + tH + tB, tot: tT, net: tN, relInt: (R.sim ? tN : tS) > 0 ? Math.sqrt(varI) / (R.sim ? tN : tS) : NaN,
      tneedInt: cfg.tgt > 0 && tS > 0 ? tc * ((tS + tH + tB) + tVe) / (tS * tS) / (cfg.tgt * cfg.tgt) : NaN };
  }
  if (doT) {
    const effT = cfg.effT / 100, f = cfg.bgT > 0 ? cfg.bgT / 100 : 0;
    const tot0 = units.length;
    const Eg = []; for (const u of units) for (let k = 0; k < u.E.length; k++) { const e = u.E[k]; if (e >= m.emin && e <= m.emax) Eg.push(e); }
    Eg.push(m.emin, m.emax);
    const grid = Float64Array.from(Eg).sort(), U = [];
    for (let i = 0; i < grid.length; i++) if (!i || grid[i] > grid[i - 1]) U.push(grid[i]);
    const Eu = Float64Array.from(U), Tt = Float64Array.from(Eu, e => Math.exp(-N * exTau(units, e)));
    if (!tot0) R.notes.push('No total cross section (MT 1) was found in the tables, so the sample is taken as transparent.');
    const rIn = exFold(Eu, Tt, m, sc), rOut = exFold(Float64Array.of(m.emin, m.emax), Float64Array.of(1, 1), m, sc);
    const k1 = m.area * effT / 1e-24;
    const cIn = exBinSum(rIn.E, rIn.cum, B, () => k1), cOut = exBinSum(rOut.E, rOut.cum, B, () => k1);      // neutrons/s into the detector
    const mIn = new Float64Array(n), mOut = new Float64Array(n), bIn = new Float64Array(n), bOut = new Float64Array(n);
    const T = new Float64Array(n), Tth = new Float64Array(n), Terr = new Float64Array(n), sg = new Float64Array(n), sgTh = new Float64Array(n), sgErr = new Float64Array(n);
    const inLo = new Float64Array(n), inHi = new Float64Array(n), outLo = new Float64Array(n), outHi = new Float64Array(n);
    const relT = new Float64Array(n), tneed = new Float64Array(n), popt = new Float64Array(n), tOpt = new Float64Array(n);
    const nN = N * R.nP;
    for (let i = 0; i < n; i++) {
      const rI = cIn[i], rO = cOut[i], b = f * rO;
      bIn[i] = b * tin; bOut[i] = b * tout;
      const eI = rI * tin + bIn[i], eO = rO * tout + bOut[i];
      let kI = eI, kO = eO;
      if (R.sim) { kI = poissonDraw(eI, rnd); kO = poissonDraw(eO, rnd); }
      mIn[i] = kI; mOut[i] = kO;
      for (const [k, lo, hi] of [[kI, inLo, inHi], [kO, outLo, outHi]]) {
        if (R.sim && k < 25) { const iv = poissonInterval(k); lo[i] = k - iv[0]; hi[i] = iv[1] - k; } else { lo[i] = hi[i] = Math.sqrt(k); }
      }
      Tth[i] = rO > 0 ? rI / rO : NaN;
      const nI = kI - bIn[i], nO = kO - bOut[i];
      T[i] = nO > 0 ? nI / nO : NaN;
      const rv = (nI > 0 && nO > 0) ? kI / (nI * nI) + kO / (nO * nO) : NaN;
      Terr[i] = T[i] * Math.sqrt(rv);
      sg[i] = T[i] > 0 ? -Math.log(T[i]) / nN : NaN;
      sgErr[i] = Math.sqrt(rv) / nN;
      sgTh[i] = Tth[i] > 0 ? -Math.log(Tth[i]) / nN : NaN;
      relT[i] = Math.sqrt(rv);
      // expected relative variance with the chosen split, and with the best split
      const al = rI > 0 ? (rI + b) / (rI * rI) : Infinity, be = rO > 0 ? (rO + b) / (rO * rO) : Infinity;
      const rvE = al / tin + be / tout;
      tneed[i] = cfg.tgt > 0 ? cfg.t * rvE / (cfg.tgt * cfg.tgt) : NaN;       // time x relative variance at that time / target^2
      popt[i] = isFinite(al + be) ? Math.sqrt(al) / (Math.sqrt(al) + Math.sqrt(be)) : NaN;
      tOpt[i] = cfg.tgt > 0 && isFinite(al + be) ? Math.pow(Math.sqrt(al) + Math.sqrt(be), 2) / (cfg.tgt * cfg.tgt) : NaN;
    }
    R.t = { mIn, mOut, bIn, bOut, T, Tth, Terr, sg, sgTh, sgErr, inLo, inHi, outLo, outHi, relT, tneed, popt, tOpt };
    R.tUnit = tot0 ? '' : 'transparent';
  }
  return R;
}
// layer of a component, and the selection of stack positions (pure helpers of the engine and of the controls)
function layerOf(c) { return c.layer === 'front' || c.layer === 'back' ? c.layer : 'sample'; }
function parseTargets(txt, N) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t || t === 'all') return Array.from({ length: N }, (_, i) => i + 1);
  const set = new Set();
  for (const tok of t.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-–:]\s*(\d+))?$/.exec(tok);
    if (!m) throw new Error('Stacked targets counted: use all, a number, a list such as 1,3 or a range such as 2-4.');
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let k = Math.min(a, b); k <= Math.max(a, b); k++) if (k >= 1 && k <= N) set.add(k);
  }
  if (!set.size) throw new Error('None of the stacked targets counted exists: the stack has ' + N + ' target' + (N === 1 ? '' : 's') + '.');
  return Array.from(set).sort((p, q) => p - q);
}
function tgLabel(K, N) { return K.length === N ? (N === 1 ? 'one target' : 'all ' + N + ' targets') : 'target' + (K.length === 1 ? ' ' : 's ') + K.join(', '); }

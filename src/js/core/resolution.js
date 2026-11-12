// ---------- Time of flight and Gaussian resolution ----------
const MN_MEV = 939.56542052;          // neutron rest energy, MeV
const C_M_NS = 0.299792458;           // speed of light, m/ns
function betaOf(E) { const x = E / MN_MEV; return Math.sqrt(x * (2 + x)) / (1 + x); }
// Relativistic time of flight in ns for energy E (MeV) over L metres.
function tofNs(E, L) { return L / (betaOf(E) * C_M_NS); }
// Inverse: energy (MeV) for a flight time t (ns).
function tofToE(t, L) { const b = L / (C_M_NS * t); if (!(b < 1)) return Infinity; return MN_MEV * (1 / Math.sqrt(1 - b * b) - 1); }
// |dt/dlnE| in ns.
function dtdlnE(E, L) { const x = E / MN_MEV, g = 1 + x, b = betaOf(E); return E * L / (C_M_NS * MN_MEV * g * g * g * b * b * b); }
// Target/moderator spread as a fixed path-length spread dL (cm): a time spread (FWHM, ns) dt = dL / v(E).
function tgFwhm(E, tg) {
  if (!tg || !(tg.dL > 0)) return 0;
  return tg.dL / (betaOf(E) * C_M_NS * 100);
}
// ---------- Monte Carlo resolution function (RF) ----------
// For a beam line with a simulated resolution function the neutron arrives at t = (L + λ) / v, where λ is an extra equivalent
// path length with an energy-dependent distribution. It is parameterised as (1 − f2) EMG(μ, σ, τ1) + f2 EMG(μ, σ, τ2), a Gaussian
// convolved with one or two one-sided exponentials, limited to λ between −200 and 700 cm. The parameters are natural cubic
// splines in log10(E / eV) through the knot values fitted to the simulated histogram.
const RF_EAR2 = { id: 'ear2', name: 'EAR2', L: 19.55, pulseIncluded: true,
  knots: [-3,-2,-1.5,-1.25,-1,-0.75,-0.5,-0.25,0,1,2,3,3.5,4,4.5,5,5.5,6,7,8,9],
  theta: [[5.40488,5.95656,6.13731,5.93529,5.68192,5.92428,6.03483,6.04506,6.06533,6.18732,6.53945,7.27475,7.97441,9.06623,11.3737,15.1267,23.999,31.6196,30.8194,36.0696,64.6443],[-1.18124,-0.662214,-0.550242,-0.829618,-1.21219,-0.890823,-0.760728,-0.768322,-0.776207,-0.770612,-0.605875,-0.250986,0.0815391,0.508213,1.06286,1.67929,2.33406,2.6464,3.4054,4.50224,5.37836],[0.925294,1.8893,2.58454,2.78374,2.28006,1.4598,0.769862,0.601906,0.663795,0.85724,1.25524,1.7588,2.28932,2.56793,3.02141,3.59335,3.86682,3.53721,2.96842,0.210583,-4.47604],[-0.57657,-0.774793,-0.938031,-0.878866,-0.804268,-0.720052,-1.2656,-1.33046,-1.50848,-1.52358,-1.58549,-1.20259,-1.24361,-0.707097,0.246642,0.5091,-0.881932,-2.51149,-3.72959,-3.38423,-2.98905],[2.60015,2.41946,2.22323,2.13012,2.4105,2.78469,3.04322,3.01245,2.97266,2.85077,2.47775,2.0182,1.71795,1.75704,0.968882,-1.95594,-2.87803,-1.8616,0.814243,1.27224,0.979272]] };
// EAR1: FLUKA response of the target and moderator at 185 m (it has no proton pulse: the pulse is added by the page).
// Third component: a broad Gaussian that appears below about 0.1 eV (thermal neutrons that leave the moderator late).
const RF_EAR1 = { id: 'ear1', name: 'EAR1', L: 185, pulseIncluded: false,
  knots: [-2.5,-2,-1.5,-1.25,-1,-0.75,-0.5,-0.25,0,0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9],
  theta: [[9.52181,9.6078,9.86241,9.95729,10.0092,10.0595,10.1376,10.1957,10.2425,10.3413,10.4332,10.5415,10.6685,10.8407,11.0652,11.3936,11.8874,12.7253,14.2243,16.0973,18.4482,19.6288,22.8457,28.8682,38.6288,50.4531,57.3106],[-2.30819,-1.74688,-1.3067,-1.1082,-1.07755,-1.00315,-0.92568,-0.883159,-0.846576,-0.79026,-0.743839,-0.694108,-0.643895,-0.578388,-0.509051,-0.403595,-0.267939,-0.0257219,0.348612,0.623989,0.835466,0.755592,0.938251,1.18849,1.75146,1.33975,0.305973],[-0.347653,-0.092482,0.132497,0.301109,0.403452,0.460939,0.503569,0.532041,0.562076,0.595846,0.66017,0.780946,0.942173,1.15863,1.44009,1.82488,2.30971,2.8548,3.31354,3.52971,3.35118,2.89053,2.39283,1.84961,1.10466,0.118246,-1.02416],[0.9103,0.386562,-0.16302,-0.721793,-1.21114,-1.58017,-1.81681,-2.03826,-2.19422,-2.27789,-2.24511,-2.09658,-1.86835,-1.55131,-1.29848,-1.21991,-1.30836,-1.55097,-1.95872,-2.51291,-2.97466,-3.20341,-3.02451,-2.39764,-1.33371,0.0711953,1.56137],[5.85367,5.63791,5.38108,5.06137,4.69449,4.32667,3.94593,3.61983,3.33675,3.09498,2.87077,2.63537,2.43421,2.31981,2.21821,2.07559,1.75776,1.2538,0.725266,0.286761,-0.0274182,-0.229845,-0.46485,-0.622521,-0.585246,-0.293948,0.204861],[-0.761483,-1.42451,-2.38095,-2.98562,-3.69235,-5.36683,-7.61485,-8.12073,-7.96571,-7.85495,-7.80678,-7.766,-7.75566,-7.79636,-7.81986,-7.90396,-7.99025,-7.92816,-7.66727,-7.3506,-7.24276,-7.05766,-7.54963,-7.98926,-8.12547,-8.15161,-8.02992],[149.96,150.197,150.153,149.996,150.013,149.998,150.001,150,150.001,150.002,150.002,150.003,150.003,150.002,150.003,150.002,150.001,150,149.998,149.994,149.993,149.992,149.995,150,150.001,150,150],[4.07236,4.09903,3.97199,4.01846,4.38294,4.66923,4.81828,4.83217,4.9036,4.99267,5.03704,5.05788,5.07932,5.12185,5.13403,5.03928,4.86745,4.78895,4.78383,4.76963,4.81611,4.88055,4.87894,4.83607,4.8122,4.79185,4.78466]] };
// NEAR (6 m): no simulation is available; the RF is extrapolated from the EAR1 (185 m) and EAR2 (19.55 m) target-only RFs by
// linear extrapolation of their quantile functions in ln L, and refitted with the same 8-parameter model (indicative only).
const RF_NEAR = { id: 'near', name: 'NEAR', L: 6, pulseIncluded: false,
  knots: [-2.5,-2,-1.5,-1.25,-1,-0.75,-0.5,-0.25,0,0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9],
  theta: [[5.25046,5.80133,6.58934,6.64197,6.13415,5.80709,5.56414,5.11222,4.77821,3.94162,3.98015,4.16568,4.41093,4.57777,5.07939,6.03286,7.18964,11.0519,15.3426,24.8038,32.2262,34.2796,35.2599,33.1511,38.4337,46.7471,64.8836],[-0.231071,-0.0943604,0.224912,0.343563,0.250261,-0.0719241,-0.215135,-0.0673377,0.091762,0.270963,0.238064,0.248183,0.252334,0.12229,0.102176,0.0252686,0.350075,1.18401,1.73207,2.40352,2.38876,2.3591,0.517962,-2.87024,2.11797,3.90651,5.46711],[1.79964,2.03256,2.20961,2.19466,1.97274,1.6027,1.21927,0.948374,0.822827,0.841696,0.959476,1.13401,1.35973,1.64482,2.0357,2.51644,3.03129,3.45302,3.7104,3.8495,3.7938,3.50172,2.82046,1.64167,0.265667,-1.09344,-2.46892],[-0.771925,-0.724616,-0.691831,-0.714714,-0.809637,-0.957394,-1.12362,-1.26166,-1.36878,-1.43507,-1.46371,-1.4669,-1.43745,-1.39111,-1.33317,-1.29001,-1.28551,-1.36936,-1.54073,-1.73997,-1.95181,-2.16299,-2.38949,-2.65338,-2.94855,-3.25231,-3.5616],[2.1764,2.27525,2.39218,2.51309,2.61896,2.69395,2.75634,2.82086,2.87658,2.88793,2.83326,2.69391,2.48401,2.22776,1.96056,1.69475,1.41638,1.08546,0.757888,0.516147,0.383216,0.341727,0.360787,0.399228,0.438253,0.474949,0.50442],[-8.00178,-8.0087,-8.00423,-7.99569,-7.98781,-7.99673,-8.00887,-8.01,-7.98448,-7.9191,-7.90661,-7.93098,-7.95992,-7.98648,-8.00735,-8.01314,-7.98026,-7.98355,-8.02311,-8.00736,-8.01648,-8.02633,-7.88049,-7.82571,-8.02941,-8.00916,-7.99813],[150,150,150,150,150,150,150,150,150,149.999,149.999,149.999,150,150,150,150,150,150,150,150,150,150,150.001,150.001,149.999,150,150],[4.78259,4.7746,4.78269,4.78663,4.7877,4.78233,4.78179,4.78441,4.78661,4.80441,4.80622,4.80126,4.79445,4.78311,4.77723,4.77711,4.78432,4.7743,4.76458,4.76365,4.76859,4.76655,4.82786,4.6671,4.78049,4.78722,4.7859]] };
function rfOf(F) { return /near/i.test(F.name) ? RF_NEAR : /ear2/i.test(F.name) ? RF_EAR2 : /ear1/i.test(F.name) ? RF_EAR1 : null; }
function erfcxPos(z) {            // exp(z²) erfc(z), z >= 0
  if (z < 2.5) {
    const z2 = z * z; let term = z, sum = z;
    for (let n = 0; n < 200; n++) { term *= 2 * z2 / (2 * n + 3); sum += term; if (term < 1e-17 * sum) break; }
    return Math.exp(z2) - 1.1283791670955126 * sum;
  }
  let t = z;
  for (let k = 80; k >= 1; k--) t = z + 0.5 * k / t;
  return 0.5641895835477563 / t;
}
function ndtrF(x) {
  if (x < 0) return 0.5 * erfcxPos(-x / Math.SQRT2) * Math.exp(-0.5 * x * x);
  return 1 - 0.5 * erfcxPos(x / Math.SQRT2) * Math.exp(-0.5 * x * x);
}
// Cumulative distribution of a Gaussian (mu, s) convolved with an exponential tail of mean t.
function emgCdf(x, mu, s, t) {
  const u = (x - mu) / s, k = s / t, w = u - k;
  let term;
  if (w < 0) term = 0.5 * erfcxPos(-w / Math.SQRT2) * Math.exp(-0.5 * u * u);
  else term = Math.exp(-k * u + 0.5 * k * k) * ndtrF(w);
  return ndtrF(u) - term;
}
function natSpline(x, y) {
  const n = x.length, y2 = new Float64Array(n), u = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const sg = (x[i] - x[i - 1]) / (x[i + 1] - x[i - 1]), p = sg * y2[i - 1] + 2;
    y2[i] = (sg - 1) / p;
    const d = (y[i + 1] - y[i]) / (x[i + 1] - x[i]) - (y[i] - y[i - 1]) / (x[i] - x[i - 1]);
    u[i] = (6 * d / (x[i + 1] - x[i - 1]) - sg * u[i - 1]) / p;
  }
  for (let k = n - 2; k >= 0; k--) y2[k] = y2[k] * y2[k + 1] + u[k];
  return xv => {
    if (xv < x[0]) xv = x[0]; if (xv > x[n - 1]) xv = x[n - 1];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] > xv) hi = m; else lo = m; }
    const hh = x[hi] - x[lo], a = (x[hi] - xv) / hh, b = (xv - x[lo]) / hh;
    return a * y[lo] + b * y[hi] + ((a * a * a - a) * y2[lo] + (b * b * b - b) * y2[hi]) * hh * hh / 6;
  };
}
function rfParams(rf, lg) {       // lg = log10(E / eV)
  if (!rf.sp) rf.sp = rf.theta.map(r => natSpline(rf.knots, r));
  const q = rf.sp.map(f => f(lg)), t1 = Math.exp(q[2]);
  return { mu: q[0], s: Math.exp(q[1]), t1, f2: 1 / (1 + Math.exp(-q[3])), t2: t1 * (1 + Math.exp(q[4])),
    f3: q.length > 5 ? 1 / (1 + Math.exp(-q[5])) : 0, mu3: q[6], s3: q.length > 5 ? Math.exp(q[7]) : 1 };
}
function rfCdf(P, sx, x) {
  const c = (1 - P.f2) * emgCdf(x, P.mu, sx, P.t1) + P.f2 * emgCdf(x, P.mu, sx, P.t2);
  return P.f3 > 0 ? (1 - P.f3) * c + P.f3 * ndtrF((x - P.mu3) / P.s3) : c;
}
const RF_EDGES = (() => {
  const e = []; const add = (a, b, st) => { for (let x = a; x < b - 1e-9; x += st) e.push(Math.round(x * 100) / 100); };
  add(-200, 0, 20); add(0, 4, 1); add(4, 12, 0.25); add(12, 30, 1); add(30, 60, 2.5); add(60, 120, 5); add(120, 300, 10); add(300, 700, 25); e.push(700); return Float64Array.from(e);
})();
const RF_DLG = 0.005;
// Probability of each λ bin for the energy bin kb (cached), with the range of bins that matter; sa is the extra Gaussian σ in time (ns).
function rfMasses(rf, sa, kb) {
  const key = 'm' + sa; rf.cache = rf.cache || {}; const tab = rf.cache[key] || (rf.cache[key] = []);
  if (tab[kb]) return tab[kb];
  const lg = -3 + kb * RF_DLG, E = Math.pow(10, lg) * 1e-6;
  const P = rfParams(rf, lg), v = betaOf(E) * C_M_NS * 100;
  const sx = Math.sqrt(P.s * P.s + sa * sa * v * v);
  const n = RF_EDGES.length, c = new Float64Array(n);
  for (let i = 0; i < n; i++) c[i] = rfCdf(P, sx, RF_EDGES[i]);
  const tot = c[n - 1] - c[0], m = new Float64Array(n - 1); let bs = n - 1, be = -1;
  for (let i = 0; i < n - 1; i++) { m[i] = Math.max(0, (c[i + 1] - c[i]) / tot); if (m[i] > 1e-9) { if (i < bs) bs = i; be = i; } }
  return (tab[kb] = { m, bs, be });
}
// Fold a rate spectrum with the resolution function. L = flight path of the resolution function (m), sa = extra Gaussian σ (ns).
// Each source cell spreads its counts over apparent times t + λ / v with the mass of every λ bin, spread uniformly over the bin.
function applyRF(res, L, sa, rf) {
  const E = res.E, N = E.length;
  if (N < 3) return res;
  const T = new Float64Array(N), J = new Float64Array(N);          // ascending time: r = N − 1 − i
  for (let r = 0; r < N; r++) { const i = N - 1 - r; T[r] = tofNs(E[i], L); J[r] = dtdlnE(E[i], L); }
  const ce = new Float64Array(N + 1);
  ce[0] = T[0] - 0.5 * (T[1] - T[0]); ce[N] = T[N - 1] + 0.5 * (T[N - 1] - T[N - 2]);
  for (let r = 1; r < N; r++) ce[r] = 0.5 * (T[r - 1] + T[r]);
  const dR = new Float64Array(N + 1), dT = new Float64Array(N + 1), pR = new Float64Array(N), pT = new Float64Array(N);
  const nb = RF_EDGES.length - 1, kA = new Int32Array(nb + 1), kB = new Int32Array(nb + 1), tA = new Float64Array(nb + 1), tB = new Float64Array(nb + 1);
  const warmA = new Int32Array(nb + 1), warmB = new Int32Array(nb + 1);
  const find = (x, k) => {                                          // cell with ce[k] <= x < ce[k+1], searching from a guess
    if (k < 0) k = 0; else if (k > N - 1) k = N - 1;
    let lo, hi;
    if (ce[k] > x) {
      hi = k; let step = 1; lo = k - 1;
      while (lo > 0 && ce[lo] > x) { hi = lo; step *= 2; lo = k - step; }
      if (lo < 0) lo = 0;
    } else {
      lo = k; let step = 1; hi = k + 1;
      while (hi < N && ce[hi] <= x) { lo = hi; step *= 2; hi = k + step; }
      if (hi > N) hi = N;
    }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ce[m] <= x) lo = m; else hi = m; }
    return lo;
  };
  for (let r = 0; r < N; r++) {
    const i = N - 1 - r, w = ce[r + 1] - ce[r];
    const cR = res.rho[i] / J[r] * w, cT = res.rhoThin[i] / J[r] * w;
    if (!(cR > 0) && !(cT > 0)) continue;
    const lg = Math.log10(E[i] * 1e6), kbn = Math.round((Math.min(9, Math.max(-3, lg)) + 3) / RF_DLG);
    const MT = rfMasses(rf, sa, kbn), M = MT.m, v = betaOf(E[i]) * C_M_NS * 100;
    const b0 = MT.bs, b1 = MT.be;
    // The source is the whole cell [ce[r], ce[r+1]], not only its centre point: the mass of the λ bin b is spread uniformly over
    // [ce[r] + λa/v, ce[r+1] + λb/v] (cell width + bin width), which keeps the mean and avoids ripples on non-uniform grids.
    for (let b = b0; b <= b1; b++) {
      const xa = ce[r] + RF_EDGES[b] / v, xb = ce[r + 1] + RF_EDGES[b + 1] / v; tA[b] = xa; tB[b] = xb;
      if (xa < ce[0]) kA[b] = -1; else if (xa >= ce[N]) kA[b] = N; else { const k = find(xa, warmA[b]); kA[b] = k; warmA[b] = k; }
      if (xb < ce[0]) kB[b] = -1; else if (xb >= ce[N]) kB[b] = N; else { const k = find(xb, warmB[b]); kB[b] = k; warmB[b] = k; }
    }
    for (let b = b0; b <= b1; b++) {
      const m = M[b]; if (!(m > 1e-9)) continue;
      let ta = tA[b], tb = tB[b]; const len = tb - ta;
      if (tb <= ce[0] || ta >= ce[N]) continue;
      let ka = kA[b], kb2 = kB[b], fr = 1;
      if (ta < ce[0]) { fr -= (ce[0] - ta) / len; ta = ce[0]; ka = 0; }
      if (tb > ce[N]) { fr -= (tb - ce[N]) / len; tb = ce[N]; kb2 = N - 1; }
      const mr = m * fr * cR, mt = m * fr * cT, l2 = tb - ta;
      if (ka === kb2) { pR[ka] += mr; pT[ka] += mt; continue; }
      const o1 = (ce[ka + 1] - ta) / l2, o2 = (tb - ce[kb2]) / l2;
      pR[ka] += mr * o1; pT[ka] += mt * o1; pR[kb2] += mr * o2; pT[kb2] += mt * o2;
      if (kb2 > ka + 1) { dR[ka + 1] += mr / l2; dR[kb2] -= mr / l2; dT[ka + 1] += mt / l2; dT[kb2] -= mt / l2; }
    }
  }
  const rho = new Float64Array(N), thin = new Float64Array(N), cum = new Float64Array(N);
  let aR = 0, aT = 0, thinSum = 0;
  for (let r = 0; r < N; r++) {
    aR += dR[r]; aT += dT[r];
    const i = N - 1 - r, w = ce[r + 1] - ce[r];
    rho[i] = (aR + pR[r] / w) * J[r]; thin[i] = (aT + pT[r] / w) * J[r];
    if (rho[i] < 0) rho[i] = 0; if (thin[i] < 0) thin[i] = 0;
  }
  for (let i = 1; i < N; i++) {
    const dl = Math.log(E[i] / E[i - 1]);
    cum[i] = cum[i - 1] + 0.5 * (rho[i] + rho[i - 1]) * dl; thinSum += 0.5 * (thin[i] + thin[i - 1]) * dl;
  }
  return Object.assign({}, res, { rho, rhoThin: thin, cum, total: cum[N - 1], totalThin: thinSum, raw: res });
}
// FWHM of the λ distribution (cm) and the matching ΔE/E at energy E (MeV).
function rfFwhm(rf, E, sa) {
  const lg = Math.log10(E * 1e6), P = rfParams(rf, lg), v = betaOf(E) * C_M_NS * 100;
  const sx = Math.sqrt(P.s * P.s + sa * sa * v * v);
  const lo = Math.max(-200, P.mu - 6 * sx), hi = Math.min(700, P.mu + 6 * sx + 4 * P.t1), st = Math.max(sx / 10, (hi - lo) / 4000);
  const n = Math.ceil((hi - lo) / st), d = new Float64Array(n); let pk = 0, ip = 0, prevC = rfCdf(P, sx, lo);
  for (let i = 0; i < n; i++) { const c = rfCdf(P, sx, lo + (i + 1) * st); d[i] = (c - prevC) / st; prevC = c; if (d[i] > pk) { pk = d[i]; ip = i; } }
  let a = ip, b = ip; while (a > 0 && d[a] > pk / 2) a--; while (b < n - 1 && d[b] > pk / 2) b++;
  const fw = (b - a) * st;
  return { fwhmCm: fw, dEE: fw / v / dtdlnE(E, rf.L) };
}
// Gaussian resolution in the time-of-flight domain. sigT (ns) is the energy-independent part (pulse and additional width);
// tg = {mode, dL} adds the energy-dependent target/moderator spread in quadrature (see tgFwhm).
// Where the grid is much finer than the width, neighbouring points are first merged (rate, sigma and the time cells are
// summed or averaged, so the rate is conserved). The rate per ns is then spread from each true energy with the width of
// that energy. The cross section itself is not broadened (only merged cells are averaged).
function applyResolution(res, L, sigT, tg) {
  if (tg && tg.mode === 'rf' && tg.rf) return applyRF(res, L, sigT > 0 ? sigT : 0, tg.rf);
  const E0 = res.E, N0 = E0.length;
  if (!(L > 0) || N0 < 3) return res;
  const s0 = new Float64Array(N0), t0 = new Float64Array(N0), J0 = new Float64Array(N0), dt0 = new Float64Array(N0);
  let any = false;
  for (let i = 0; i < N0; i++) {
    const f = tgFwhm(E0[i], tg) / 2.354820045;
    s0[i] = Math.sqrt((sigT > 0 ? sigT * sigT : 0) + f * f);
    if (s0[i] > 0) any = true;
    t0[i] = tofNs(E0[i], L); J0[i] = dtdlnE(E0[i], L);
  }
  if (!any) return res;
  for (let i = 0; i < N0; i++) dt0[i] = i === 0 ? (t0[0] - t0[1]) / 2 : i === N0 - 1 ? (t0[N0 - 2] - t0[N0 - 1]) / 2 : (t0[i - 1] - t0[i + 1]) / 2;
  // merge points
  const gi = [], gdt = [], gR = [], gT = [], gS = [];
  for (let i = 0; i < N0;) {
    let e = i, acc = dt0[i], sR = res.rho[i] / J0[i] * dt0[i], sT = res.rhoThin[i] / J0[i] * dt0[i], sS = res.sig[i] * dt0[i];
    const lim = s0[i] / 5;
    while (e + 1 < N0 && acc + dt0[e + 1] <= lim) { e++; acc += dt0[e]; sR += res.rho[e] / J0[e] * dt0[e]; sT += res.rhoThin[e] / J0[e] * dt0[e]; sS += res.sig[e] * dt0[e]; }
    gi.push((i + e) >> 1); gdt.push(acc); gR.push(sR / acc); gT.push(sT / acc); gS.push(sS / acc);
    i = e + 1;
  }
  const N = gi.length;
  const E = new Float64Array(N), t = new Float64Array(N), J = new Float64Array(N), dt = Float64Array.from(gdt), sg = new Float64Array(N), phi = new Float64Array(N);
  const rt = Float64Array.from(gR), th = Float64Array.from(gT), sg0 = Float64Array.from(gS);
  for (let k = 0; k < N; k++) { const m = gi[k]; E[k] = E0[m]; t[k] = t0[m]; J[k] = J0[m]; sg[k] = s0[m]; phi[k] = res.phi[m]; }
  const firstLE = x => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] > x) lo = m + 1; else hi = m; } return lo; };
  const firstLT = x => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] >= x) lo = m + 1; else hi = m; } return lo; };
  const sig = new Float64Array(N), rOut = new Float64Array(N), tOut = new Float64Array(N), w = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const s = sg[j], cut = 4.5 * s;
    let lo = firstLE(t[j] + cut), hi = firstLT(t[j] - cut) - 1;
    if (lo > j) lo = j;
    if (hi < j) hi = j;
    let sw = 0;
    for (let i = lo; i <= hi; i++) { const d = s > 0 ? (t[i] - t[j]) / s : (i === j ? 0 : 1e3); const g = Math.exp(-0.5 * d * d) * dt[i]; w[i] = g; sw += g; }
    const a = rt[j] * dt[j] / sw, c = th[j] * dt[j] / sw;
    for (let i = lo; i <= hi; i++) { const g = w[i] / dt[i]; rOut[i] += a * g; tOut[i] += c * g; }
  }
  const rho = new Float64Array(N), thin = new Float64Array(N), cum = new Float64Array(N);
  let thinSum = 0;
  for (let i = 0; i < N; i++) {
    sig[i] = sg0[i];
    rho[i] = rOut[i] * J[i]; thin[i] = tOut[i] * J[i];
    if (i > 0) {
      const dl = Math.log(E[i] / E[i - 1]);
      cum[i] = cum[i - 1] + 0.5 * (rho[i] + rho[i - 1]) * dl;
      thinSum += 0.5 * (thin[i] + thin[i - 1]) * dl;
    }
  }
  return Object.assign({}, res, { E, phi, sig, rho, rhoThin: thin, cum, total: cum[N - 1], totalThin: thinSum, raw: res });
}


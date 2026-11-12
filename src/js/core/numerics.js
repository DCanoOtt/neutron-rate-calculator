// ---------- Numerics ----------
function lowerBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
function upperBound(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= x) lo = m + 1; else hi = m; } return lo; }
function interpLin(xs, ys, x) {
  const n = xs.length;
  if (!n || x < xs[0] || x > xs[n - 1]) return 0;
  const i = upperBound(xs, x) - 1;
  if (i >= n - 1) return ys[n - 1];
  const x0 = xs[i], x1 = xs[i + 1];
  if (x1 === x0) return ys[i + 1];
  return ys[i] + (ys[i + 1] - ys[i]) * (x - x0) / (x1 - x0);
}
function interpLog(xs, ys, x) {
  const n = xs.length;
  if (!n || x < xs[0] || x > xs[n - 1]) return 0;
  const i = upperBound(xs, x) - 1;
  if (i >= n - 1) return ys[n - 1];
  const x0 = xs[i], x1 = xs[i + 1], y0 = ys[i], y1 = ys[i + 1];
  if (x1 === x0) return y1;
  if (y0 > 0 && y1 > 0) return Math.exp(Math.log(y0) + (Math.log(y1) - Math.log(y0)) * Math.log(x / x0) / Math.log(x1 / x0));
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
}

// Sum of several reactions as one pseudo-reaction on the union of their energy grids (sigma is linear between points).
function sumRx(rxs, w) {
  const set = new Set();
  rxs.forEach(r => { for (let i = 0; i < r.E.length; i++) set.add(r.E[i]); });
  const E = Float64Array.from(Array.from(set).sort((a, b) => a - b));
  const xs = new Float64Array(E.length);
  for (let i = 0; i < E.length; i++) { let s = 0; for (let k = 0; k < rxs.length; k++) s += (w ? w[k] : 1) * interpLin(rxs[k].E, rxs[k].xs, E[i]); xs[i] = s; }
  return { E, xs, sym: 'Σ selected', mt: 'sum' };
}

// Rate per atom (1/s) = integral of sigma[b]*1e-24 * Phi dlnE, flux already in n/(cm2 s dlnE).
// ---------- Second-collision correction (analytic, "level 1") ----------
// Infinite slab, normal incidence, isotropic scattering without energy change. With T = tau_total the optical thickness:
// Y2 = (Sigma_el / Sigma_t) (Sigma_x / Sigma_t) G(T),  G(T) = int_0^T e^-t [1 - E2(t)/2 - E2(T-t)/2] dt.
function expint1(x) {
  if (x <= 0) return Infinity;
  if (x <= 1) { let sum = 0, term = 1; for (let k = 1; k < 40; k++) { term *= -x / k; sum -= term / k; if (Math.abs(term / k) < 1e-17) break; } return -0.5772156649015329 - Math.log(x) + sum; }
  let b = x + 1, c = 1e30, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) { const an = -i * i; b += 2; d = 1 / (an * d + b); c = b + an / c; const del = c * d; h *= del; if (Math.abs(del - 1) < 1e-13) break; }
  return h * Math.exp(-x);
}
function expint2(x) { return x <= 0 ? 1 : Math.exp(-x) - x * expint1(x); }
const GL8X = [0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GL8W = [0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
function slabG(T) {
  const U = Math.min(T, 40), f = t => Math.exp(-t) * (1 - 0.5 * expint2(t) - 0.5 * expint2(T - t));
  const pts = [0, 0.05, 0.25, 1, 3, 8, 20, 40, T - 0.05, T - 0.25, T - 1, T - 3, T - 8, T - 20, T].filter(x => x >= 0 && x <= U + 1e-12);
  if (pts[pts.length - 1] < U) pts.push(U);
  pts.sort((p, q) => p - q);
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b - a < 1e-14) continue;
    const m = (a + b) / 2, h = (b - a) / 2;
    for (let k = 0; k < 4; k++) { const d = h * GL8X[k]; sum += GL8W[k] * h * (f(m - d) + f(m + d)); }
  }
  return sum;
}
let _GT = null;
const G_LO = Math.log(1e-6), G_HI = Math.log(2e4), G_N = 700;
function slabGfast(T) {                                         // tabulated in ln T (log-log interpolation)
  if (!(T > 0)) return 0;
  if (!_GT) { _GT = new Float64Array(G_N); for (let i = 0; i < G_N; i++) _GT[i] = Math.log(Math.max(1e-300, slabG(Math.exp(G_LO + (G_HI - G_LO) * i / (G_N - 1))))); }
  const l = Math.log(T);
  if (l <= G_LO) return Math.exp(_GT[0] + 2 * (l - G_LO));
  if (l >= G_HI) return Math.exp(_GT[G_N - 1]);
  const x = (l - G_LO) / (G_HI - G_LO) * (G_N - 1), i = Math.floor(x), t = x - i;
  return Math.exp(_GT[i] + (_GT[Math.min(i + 1, G_N - 1)] - _GT[i]) * t);
}

// ---------- Multiple-scattering correction (Monte Carlo, "level 2") ----------
// Slab of areal density n0 (atoms/barn of the primary isotope), normal incidence, infinite lateral extent.
// Collisions after the first are followed by analogue Monte Carlo; the first collision is exact (forced) and is NOT
// scored, because it is already contained in the first-collision yield (sigma_x/sigma_tot)(1 - exp(-tau)).
// Elastic scattering only (MT 2), isotropic in the centre of mass, free-gas target below 400 kT, every other reaction removes the neutron.
function rng32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let _msE = 0, _msC = 1;
function msScatter(E, A, kT, rnd) {
  const sn = Math.sqrt(E);
  let tx = 0, ty = 0, tz = 0;
  if (kT > 0 && E < 400 * kT) {                                    // free gas, constant cross section approximation
    const y = Math.sqrt(A * E / kT);
    let x = 0, mut = 0;
    for (let it = 0; it < 1000; it++) {
      let x2;
      if (rnd() < 2 / (1.7724538509055159 * y + 2)) x2 = -Math.log(rnd() * rnd());
      else { const cs = Math.cos(1.5707963267948966 * rnd()); x2 = -Math.log(rnd()) - Math.log(rnd()) * cs * cs; }
      x = Math.sqrt(x2); mut = 2 * rnd() - 1;
      if (rnd() * (y + x) < Math.sqrt(Math.max(0, y * y + x2 - 2 * y * x * mut))) break;
    }
    const st = x * Math.sqrt(kT / A), sin = Math.sqrt(Math.max(0, 1 - mut * mut)), ph = 6.283185307179586 * rnd();
    tx = st * sin * Math.cos(ph); ty = st * sin * Math.sin(ph); tz = st * mut;
  }
  const A1 = A + 1;
  const cx = A * tx / A1, cy = A * ty / A1, cz = (sn + A * tz) / A1;          // centre-of-mass velocity (units sqrt(MeV))
  const rx = -tx, ry = -ty, rz = sn - tz, f = A / A1 * Math.sqrt(rx * rx + ry * ry + rz * rz);
  const m0 = 2 * rnd() - 1, s0 = Math.sqrt(1 - m0 * m0), p0 = 6.283185307179586 * rnd();
  const nx = cx + f * s0 * Math.cos(p0), ny = cy + f * s0 * Math.sin(p0), nz = cz + f * m0;
  const e2 = nx * nx + ny * ny + nz * nz;
  _msE = e2; _msC = e2 > 0 ? nz / Math.sqrt(e2) : 1;
}
// job = { layers: [{ iso: [{ w, A, kT, tot: {E, xs}, el: {E, xs} | null }] }], ch: [{ layer, w, E, xs }] }, w = atoms/barn of the isotope in the layer.
// Layers are stacked along the beam (front layer, sample, backing), each of unit thickness in the coordinate x (layer l spans [l, l+1]); only the
// optical thickness matters in an infinite slab. The first collision is forced and sampled over all layers; it is NOT scored (the first-collision term
// is calculated elsewhere). Returns, per channel, the yield from collisions after the first (per incident neutron) at incident energy E0.
function msTally(job, E0, H, seed) {
  const L = job.layers, nl = L.length, ch = job.ch, nc = ch.length, out = new Float64Array(nc), rnd = rng32(seed);
  const sT = L.map(l => new Float64Array(l.iso.length)), sE = L.map(l => new Float64Array(l.iso.length)), Sg = new Float64Array(nl);
  const xsAt = E => {
    for (let l = 0; l < nl; l++) {
      let S = 0; const iso = L[l].iso;
      for (let i = 0; i < iso.length; i++) { const o = iso[i]; sT[l][i] = o.w * interpLin(o.tot.E, o.tot.xs, E); sE[l][i] = o.el ? o.w * interpLin(o.el.E, o.el.xs, E) : 0; S += sT[l][i]; }
      Sg[l] = S;
    }
  };
  xsAt(E0);
  let tauAll = 0; for (let l = 0; l < nl; l++) tauAll += Sg[l];
  if (tauAll < 1e-3) return out;                                    // thin: the correction is below about 0.1 %
  const P = new Float64Array(nl); let before = 0, W = 0;
  for (let l = 0; l < nl; l++) { P[l] = Math.exp(-before) * -Math.expm1(-Sg[l]); before += Sg[l]; W += P[l]; }
  const S0 = Float64Array.from(Sg);
  for (let h = 0; h < H; h++) {
    let r = rnd() * W, lc = 0; while (lc < nl - 1 && r >= P[lc]) { r -= P[lc]; lc++; }
    let w = W, E = E0, mu = 1, n = 0, first = true;
    let a = -Math.log(1 - rnd() * -Math.expm1(-S0[lc]));            // optical depth of the first collision inside layer lc
    let x = lc + (S0[lc] > 0 ? a / S0[lc] : 0.5);
    for (;;) {
      if (!first) {                                                 // flight to the next collision
        xsAt(E);
        let s = -Math.log(1 - rnd()), l = Math.min(nl - 1, Math.max(0, Math.floor(x))), gone = false;
        const m = Math.abs(mu) < 1e-9 ? (mu < 0 ? -1e-9 : 1e-9) : mu;
        for (;;) {
          const d = m > 0 ? (l + 1 - x) / m : (x - l) / -m, ot = Sg[l] * d;
          if (ot >= s && Sg[l] > 0) { x += m * s / Sg[l]; break; }
          s -= ot; x = m > 0 ? l + 1 : l; l += m > 0 ? 1 : -1;
          if (l < 0 || l >= nl) { gone = true; break; }
        }
        if (gone) break;
        lc = l;
        for (let c = 0; c < nc; c++) if (ch[c].layer === lc) out[c] += w * ch[c].w * interpLin(ch[c].E, ch[c].xs, E) / Sg[lc];
      } else { xsAt(E); first = false; }
      const S = Sg[lc]; if (!(S > 0)) break;
      let q = rnd() * S, i = 0; const iso = L[lc].iso;               // isotope of the collision
      while (i < iso.length - 1 && q >= sT[lc][i]) { q -= sT[lc][i]; i++; }
      if (!(sT[lc][i] > 0)) break;
      w *= sE[lc][i] / sT[lc][i];                                   // only elastic scattering continues
      if (!(w > 0)) break;
      if (w < 1e-5) { if (rnd() < 0.1) w *= 10; else break; }
      msScatter(E, iso[i].A, iso[i].kT, rnd);
      if (!(_msE > 0)) break;
      const sin = Math.sqrt(Math.max(0, 1 - mu * mu)) * Math.sqrt(Math.max(0, 1 - _msC * _msC));
      mu = mu * _msC + sin * Math.cos(6.283185307179586 * rnd());
      mu = Math.max(-1, Math.min(1, mu));
      E = _msE;
      if (++n > (job.maxColl || 400)) break;
    }
  }
  for (let c = 0; c < nc; c++) out[c] /= H;
  return out;
}
// Energies at which the correction is computed: the grid points of all tables, thinned so that neither ln E nor the
// total cross section changes by more than a small step between neighbours (at most maxN points).
function msNodes(grids, emin, emax, sigOf, maxN) {
  const pts = [emin, emax];
  for (const g of grids) { const a = lowerBound(g, emin), b = upperBound(g, emax); for (let i = a; i < b; i++) pts.push(g[i]); }
  const q = Float64Array.from(pts).sort();
  const sv = new Float64Array(q.length);
  for (let i = 0; i < q.length; i++) sv[i] = sigOf(q[i]);
  for (let f = 1; f < 64; f *= 2) {
    const dE = 0.02 * f, dS = 0.05 * f, out = [];
    let le = 0, ls = 0;
    for (let i = 0; i < q.length; i++) {
      if (i > 0 && q[i] === q[i - 1]) continue;
      if (!out.length || Math.log(q[i] / le) >= dE || Math.abs(Math.log((sv[i] + 1e-12) / (ls + 1e-12))) >= dS || i === q.length - 1) { out.push(q[i]); le = q[i]; ls = sv[i]; }
    }
    if (out.length <= maxN) return Float64Array.from(out);
  }
  return Float64Array.from([emin, emax]);
}

// Fast E2(x) by table (linear in ln x), used by the layered second-collision term.
let _E2T = null;
const E2_LO = Math.log(1e-9), E2_HI = Math.log(60), E2_N = 6000;
function expint2fast(x) {
  if (!(x > 1e-9)) return 1;
  if (x >= 60) return 0;
  if (!_E2T) { _E2T = new Float64Array(E2_N); for (let i = 0; i < E2_N; i++) _E2T[i] = expint2(Math.exp(E2_LO + (E2_HI - E2_LO) * i / (E2_N - 1))); }
  const u = (Math.log(x) - E2_LO) / (E2_HI - E2_LO) * (E2_N - 1), i = Math.floor(u), t = u - i;
  return _E2T[i] + (_E2T[Math.min(i + 1, E2_N - 1)] - _E2T[i]) * t;
}
// Second collision for a stack of layers in the optical-depth coordinate s (infinite slabs, normal incidence, isotropic scattering, no energy
// change). t[j], te[j]: total and elastic optical thickness of layer j; k: layer where the reaction happens. Returns sum_j (te_j / t_j) I_jk with
// I_jk = int over layer j of e^-s1 K_k(s1) ds1, K_k the probability density of a reaction in layer k for an isotropic source at s1.
function layerSecond(t, te, k) {
  const n = t.length;
  if (!(t[k] > 1e-12)) return 0;
  const A = new Array(n), B = new Array(n); let s = 0;
  for (let j = 0; j < n; j++) { A[j] = s; s += t[j]; B[j] = s; }
  const Ak = A[k], Bk = B[k];
  const K = s1 => s1 < Ak ? 0.5 * (expint2fast(Ak - s1) - expint2fast(Bk - s1)) : s1 > Bk ? 0.5 * (expint2fast(s1 - Bk) - expint2fast(s1 - Ak)) : 1 - 0.5 * expint2fast(s1 - Ak) - 0.5 * expint2fast(Bk - s1);
  let tot = 0;
  for (let j = 0; j < n; j++) {
    if (!(t[j] > 1e-12) || !(te[j] > 0)) continue;
    const up = Math.min(t[j], 40 - A[j]); if (up <= 0) continue;
    const ed = [0, 0.3, 3, t[j] - 3, t[j] - 0.3, t[j]].map(v => Math.min(up, Math.max(0, v))).sort((p, q) => p - q);
    let I = 0;
    for (let e = 1; e < ed.length; e++) {
      const a = ed[e - 1], b = ed[e]; if (b - a < 1e-12) continue;
      const m = (a + b) / 2, h = (b - a) / 2;
      for (let q = 0; q < 4; q++) { const d = h * GL8X[q], w = GL8W[q] * h; const s1a = A[j] + m - d, s1b = A[j] + m + d; I += w * (Math.exp(-s1a) * K(s1a) + Math.exp(-s1b) * K(s1b)); }
    }
    tot += te[j] / t[j] * I;
  }
  return tot;
}
// Sum of several results (weights w) on the union of their energy grids; the resolution is linear, so the sum of folded results is the folded sum.
function sumRes(parts) {
  const grid = []; for (const p of parts) for (let i = 0; i < p.res.E.length; i++) grid.push(p.res.E[i]);
  const g = Float64Array.from(grid).sort(), Eu = [];
  for (let i = 0; i < g.length; i++) if (!i || g[i] > g[i - 1]) Eu.push(g[i]);
  const N = Eu.length, E = Float64Array.from(Eu), rho = new Float64Array(N), thin = new Float64Array(N), sig = new Float64Array(N), cum = new Float64Array(N);
  let phi = null, tauMax = 0, thinSum = 0;
  for (const p of parts) {
    const r = p.res, w = p.w; if (!phi && r.E.length) phi = Float64Array.from(E, e => interpLin(r.E, r.phi, e));
    if (r.tauMax > tauMax) tauMax = r.tauMax;
    for (let i = 0; i < N; i++) { rho[i] += w * interpLin(r.E, r.rho, E[i]); thin[i] += w * interpLin(r.E, r.rhoThin, E[i]); sig[i] += w * interpLin(r.E, r.sig, E[i]); }
  }
  for (let i = 1; i < N; i++) { const dl = Math.log(E[i] / E[i - 1]); cum[i] = cum[i - 1] + 0.5 * (rho[i] + rho[i - 1]) * dl; thinSum += 0.5 * (thin[i] + thin[i - 1]) * dl; }
  const out = { E, sig, phi: phi || new Float64Array(N), rho, cum, rhoThin: thin, total: N ? cum[N - 1] : 0, totalThin: thinSum, tauMax };
  if (parts.every(p => p.res.raw)) out.raw = sumRes(parts.map(p => ({ res: p.res.raw, w: p.w })));
  return out;
}

// Optional self-shielding: tot = MT1 reaction, nAtB = sample areal density in atoms/barn.
// Slab, first-collision model: factor (1-exp(-tau))/tau with tau = nAtB * sigma_tot(E).
function integrate(rx, flux, scale, emin, emax, tot, nAtB, ms, pre) {
  const res = { E: new Float64Array(0), sig: new Float64Array(0), phi: new Float64Array(0), rho: new Float64Array(0), cum: new Float64Array(0), rhoThin: new Float64Array(0), total: 0, totalThin: 0, tauMax: 0 };
  const tl = Array.isArray(tot) ? tot : (tot ? [{ E: tot.E, xs: tot.xs, w: nAtB }] : []);
  const shield = tl.length > 0 && nAtB > 0;
  const preL = Array.isArray(pre) && nAtB > 0 ? pre : [];          // layers in front of this one: they only attenuate the beam
  if (!(emin > 0) || !(emax > emin)) return res;
  const xe = rx.E, fe = flux.E;
  const wn = flux.win && flux.win.E && flux.win.E.length > 1 ? flux.win : null;   // vacuum window: attenuates the fluence, tau(E) on its own grid
  const pts = [emin, emax];
  let a = lowerBound(xe, emin), b = upperBound(xe, emax);
  for (let i = a; i < b; i++) pts.push(xe[i]);
  a = lowerBound(fe, emin); b = upperBound(fe, emax);
  for (let i = a; i < b; i++) pts.push(fe[i]);
  if (wn) { a = lowerBound(wn.E, emin); b = upperBound(wn.E, emax); for (let i = a; i < b; i++) pts.push(wn.E[i]); }
  const g = Float64Array.from(pts).sort();
  const E = [];
  for (let i = 0; i < g.length; i++) {
    if (i > 0 && g[i] === g[i - 1]) continue;
    if (E.length) {
      const p = E[E.length - 1], q = g[i];
      const n = Math.ceil(Math.log(q / p) / 0.03);
      for (let k = 1; k < n; k++) E.push(p * Math.pow(q / p, k / n));
    }
    E.push(g[i]);
  }
  const N = E.length;
  const sig = new Float64Array(N), phi = new Float64Array(N), rho = new Float64Array(N), cum = new Float64Array(N), thin = new Float64Array(N);
  let thinSum = 0, tauMax = 0, mj = 0;
  for (let i = 0; i < N; i++) {
    sig[i] = interpLin(xe, rx.xs, E[i]);
    phi[i] = scale * interpLog(fe, flux.V, E[i]);
    if (wn) phi[i] *= Math.exp(-interpLin(wn.E, wn.tau, E[i]));
    thin[i] = sig[i] * 1e-24 * phi[i];
    let ss = 1, ep = 1;
    if (preL.length) { let tp = 0; for (let k = 0; k < preL.length; k++) tp += preL[k].w * interpLin(preL[k].E, preL[k].xs, E[i]); ep = Math.exp(-tp); }
    if (shield) {
      let tau = 0;
      for (let k = 0; k < tl.length; k++) tau += tl[k].w * interpLin(tl[k].E, tl[k].xs, E[i]);
      if (tau > tauMax) tauMax = tau;
      ss = tau < 1e-6 ? 1 - tau / 2 : -Math.expm1(-tau) / tau;
    }
    rho[i] = thin[i] * ss * ep;
    if (ms && shield && ms.an) {                                      // second collision, analytic: rho/phi = 1e-24 sigma (Sigma_el / Sigma_t^2) G(T) n0 / n0
      let tau = 0, tel = 0;
      for (let k = 0; k < tl.length; k++) tau += tl[k].w * interpLin(tl[k].E, tl[k].xs, E[i]);
      for (let k = 0; k < ms.an.el.length; k++) tel += ms.an.el[k].w * interpLin(ms.an.el[k].E, ms.an.el[k].xs, E[i]);
      if (ms.an.lay) {                                                // several layers: second collision by quadrature in the optical depth
        const la = ms.an.lay, tt = [], te = [];
        for (let q = 0; q < la.tl.length; q++) { let a1 = 0, a2 = 0; for (const o of la.tl[q]) a1 += o.w * interpLin(o.E, o.xs, E[i]); for (const o of la.te[q]) a2 += o.w * interpLin(o.E, o.xs, E[i]); tt.push(a1); te.push(a2); }
        if (tt[la.k] > 1e-6) rho[i] += 1e-24 * phi[i] * sig[i] / tt[la.k] * layerSecond(tt, te, la.k);
      } else if (tau > 1e-6 && tel > 0) rho[i] += 1e-24 * phi[i] * sig[i] * tel * slabGfast(tau) / (tau * tau);
    } else if (ms && shield) {                                        // multiple-scattering yield added: rho/phi = 1e-24 * (sigma ss + Y_ms / (ratio n0))
      const le = Math.log(E[i]), L = ms.lnE, nl = L.length;
      if (nl > 1 && le >= L[0] && le <= L[nl - 1]) {
        while (mj < nl - 2 && L[mj + 1] < le) mj++;
        while (mj > 0 && L[mj] > le) mj--;
        const t = (le - L[mj]) / (L[mj + 1] - L[mj]), yms = ms.Y[mj] + (ms.Y[mj + 1] - ms.Y[mj]) * (t > 0 ? t : 0);
        if (yms > 0) rho[i] += 1e-24 * phi[i] * yms / (ms.ratio * nAtB);
      }
    }
    if (ms && shield) { const cap = 1e-24 * phi[i] / (ms.ratio * nAtB); if (rho[i] > cap) rho[i] = cap; }      // a yield cannot exceed 1
    if (i > 0) {
      const dl = Math.log(E[i] / E[i - 1]);
      cum[i] = cum[i - 1] + 0.5 * (rho[i] + rho[i - 1]) * dl;
      thinSum += 0.5 * (thin[i] + thin[i - 1]) * dl;
    }
  }
  res.E = Float64Array.from(E); res.sig = sig; res.phi = phi; res.rho = rho; res.cum = cum; res.rhoThin = thin;
  res.total = cum[N - 1]; res.totalThin = thinSum; res.tauMax = tauMax;
  return res;
}
function cumAt(res, x) {
  const E = res.E, n = E.length;
  if (!n) return 0;
  if (x <= E[0]) return 0;
  if (x >= E[n - 1]) return res.cum[n - 1];
  const i = upperBound(E, x) - 1;
  const t = Math.log(x / E[i]) / Math.log(E[i + 1] / E[i]);
  return res.cum[i] + (res.cum[i + 1] - res.cum[i]) * t;
}
function frameOverlapE(L, f) {
  const v = L * f / CLIGHT;
  return 0.5 * NMASS_MEV * v * v;
}
function decimate(E, Y, l0, l1, nb) {
  const n = E.length, out = [];
  let bin = -1, first = 0, last = 0, mn = 0, mx = 0;
  const flush = () => { if (bin < 0) return; const s = new Set([first, last, mn, mx]); out.push(...Array.from(s).sort((p, q) => p - q)); };
  for (let i = 0; i < n; i++) {
    const b = Math.floor((Math.log(E[i]) - l0) / (l1 - l0) * nb);
    if (b !== bin) { flush(); bin = b; first = last = mn = mx = i; }
    else { last = i; if (Y[i] < Y[mn]) mn = i; if (Y[i] > Y[mx]) mx = i; }
  }
  flush();
  return out;
}


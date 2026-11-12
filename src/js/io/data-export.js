// ---------- Data export (ASCII / ROOT): full energy range, energy and TOF, rates and yields ----------
// The page is recomputed twice, once as rate and once as yield (the yield always includes the attenuation in the sample), and
// the arrays are copied; the original state is restored afterwards. The zoom of the plots plays no role.
function exportPass(kind) {
  S.rateKind = kind; update();
  const r0 = S.res, items = S.items;
  if (!r0 || !items || !items.length) return null;
  const lead = items.find(x => x.res === r0) || items[0];
  const E = r0.E, atP = S.atomsP || 0, canY = S.area > 0 && atP > 0;
  const sampleN = (r, ratio) => canY ? atP * ratio / S.area : 0;
  const kxRate = it => S.rateSample ? atP * it.ratio : (S.viewAll ? it.ratio : 1);
  const onGrid = (r, Y) => r.E === E ? Y : Float64Array.from(E, e => interpLin(r.E, Y, e));
  const series = [lead].concat(items.filter(x => x !== lead)).map(it => {
    const r = it.res, kx = kxRate(it), sgs = S.viewAll ? it.ratio : 1, nA = sampleN(r, it.ratio);
    return {
      name: S.itemName(it), lead: it === lead,
      sig: onGrid(r, Float64Array.from(r.sig, v => v * sgs)),
      rate: onGrid(r, Float64Array.from(r.rho, v => v * kx)),
      yld: canY ? onGrid(r, Float64Array.from(r.rho, (v, i) => r.phi[i] > 0 ? v / r.phi[i] * nA : 0)) : null,
      thin: it === lead && r.rhoThin ? Float64Array.from(r.rhoThin, v => v * kx) : null
    };
  });
  const out = { E, phi: r0.phi, series, cum: r0.cum, total: r0.total, raw: null, busy: !!S.msBusy };
  if (r0.raw) {
    const rr = r0.raw, kx = kxRate(lead), nA = sampleN(rr, lead.ratio);
    out.raw = { E: rr.E, sig: rr.sig, rate: Float64Array.from(rr.rho, v => v * kx), yld: canY ? Float64Array.from(rr.rho, (v, i) => rr.phi[i] > 0 ? v / rr.phi[i] * nA : 0) : null };
  }
  return out;
}
function exportData() {
  const kind0 = S.rateKind;
  let R = null, Y = null;
  try { R = exportPass('rate'); Y = exportPass('yield'); }
  finally { S.rateKind = kind0; update(); }
  if (!R) return null;
  const F = curFac(), LT = S.resOn ? resL(F) : F.L;
  const tof = Float64Array.from(R.E, e => tofNs(e, LT));
  // yield columns come from the yield pass (same energy grid)
  const yOf = (k) => (Y && Y.series[k] && Y.series[k].yld && Y.E.length === R.E.length) ? Y.series[k].yld : null;
  R.series.forEach((s, k) => { s.yld = yOf(k); });
  if (R.raw && Y && Y.raw) R.raw.yld = Y.raw.yld;
  R.tof = tof; R.LT = LT; R.yieldBusy = !!(Y && Y.busy);
  R.rawTof = R.raw ? Float64Array.from(R.raw.E, e => tofNs(e, LT)) : null;
  return R;
}
function normText() {
  return S.rateSample ? 'rate in the sample (1/s per unit ln E)' : (S.viewAll ? 'rate per primary atom (1/s per unit ln E)' : 'rate per atom of the isotope (1/s per unit ln E)');
}
function chartHistograms() {
  const X = exportData(); if (!X) return [];
  const out = [], seen = {}, info = asciiName(runInfo().join(' | '));
  const add = (name, title, yt, E, T, Yv) => {
    let n = name.replace(/[^A-Za-z0-9_]+/g, '_'); if (seen[n]) n += '_' + (++seen[n]); else seen[n] = 1;
    out.push({ name: n, title: asciiName(title) + ' | ' + info, xt: 'E (MeV)', yt: asciiName(yt), edges: pointEdges(E), vals: Float64Array.from(Yv) });
    const m = E.length, tr = Float64Array.from(T).reverse(), vr = Float64Array.from(Yv).reverse();     // TOF runs opposite to the energy
    out.push({ name: n + '_tof', title: asciiName(title) + ' (vs TOF) | ' + info, xt: 'TOF (ns)', yt: asciiName(yt), edges: pointEdges(tr), vals: vr });
  };
  const E = X.E, T = X.tof, rt = 'rate_density_per_dlnE', rtl = normText();
  add('phi', 'Fluence', 'n/(cm^2*s*DlnE)', E, T, X.phi);
  X.series.forEach(s => {
    const sfx = s.lead ? '' : '_' + hname(s.name), nm = s.lead ? ' (' + s.name + ')' : ' ' + s.name;
    add('sigma' + sfx, 'Cross section' + nm, 'barn', E, T, s.sig);
    add('rate' + sfx, 'Reaction ' + rtl + nm, '1/s per DlnE', E, T, s.rate);
    if (s.thin) add('rate_thin_sample', 'Reaction ' + rtl + nm + ' (thin sample)', '1/s per DlnE', E, T, s.thin);
    if (s.yld) add('yield' + sfx, 'Reaction yield per incident neutron' + nm, 'reactions / neutron', E, T, s.yld);
  });
  if (X.raw) {
    const T2 = X.rawTof;
    add('sigma_without_resolution', 'Cross section (without resolution)', 'barn', X.raw.E, T2, X.raw.sig);
    add('rate_without_resolution', 'Reaction ' + rtl + ' (without resolution)', '1/s per DlnE', X.raw.E, T2, X.raw.rate);
    if (X.raw.yld) add('yield_without_resolution', 'Reaction yield per incident neutron (without resolution)', 'reactions / neutron', X.raw.E, T2, X.raw.yld);
  }
  if (X.total > 0) add('rate_cumulative_fraction', 'Cumulative fraction of the rate', 'fraction', E, T, Float64Array.from(X.cum, v => v / X.total));
  return out;
}
function chartText(F) {
  const X = exportData(); if (!X) return '';
  const A = asciiName, f = v => (Number.isFinite(v) ? v.toExponential(6) : 'nan'), L = [];
  const E0 = X.E, T0 = X.tof, S0 = X.series, lead = S0[0];
  L.push('# Neutron reaction rate calculator - data (full energy range, independent of the zoom of the plots)');
  L.push('# Created: ' + new Date().toISOString());
  runInfo().forEach((l, i) => L.push('# ' + (i === 0 ? 'Run: ' : '') + A(l)));
  if (S.libName) L.push('# Cross-section library: ' + A(S.libName));
  L.push('# Main curve (first curve of each quantity): ' + A(lead.name));
  L.push('# Energy range: ' + f(E0[0]) + ' - ' + f(E0[E0.length - 1]) + ' MeV (' + E0.length + ' points); time of flight ' + f(T0[T0.length - 1]) + ' - ' + f(T0[0]) + ' ns for a flight path of ' + f(X.LT) + ' m');
  L.push('# Rate: ' + A(normText()) + '. Yield: reactions per incident neutron = (atoms / area) x rate density per atom / fluence, with the attenuation in the sample (first-collision) always included.');
  if (!lead.yld) L.push('# No yield columns: the sample mass or the beam area is not defined.');
  if (X.yieldBusy) L.push('# Note: the multiple-scattering Monte Carlo was still running for the yield; its correction may be missing from the yield columns.');
  if (S0.length > 1) L.push('# Additional curves (other reactions / isotopes) are linearly interpolated onto the energy grid of column 1 (0 outside their own range).');
  const cols = ['E - neutron energy [MeV]', 'TOF - time of flight [ns]', 'Fluence Phi(E) [n/(cm^2*s*DlnE)]'], ys = [T0, X.phi];
  const nm = s => ' - ' + A(s.name);
  S0.forEach(s => { cols.push('Cross section sigma(E)' + nm(s) + ' [barn]'); ys.push(s.sig); });
  S0.forEach(s => { cols.push('Reaction rate' + nm(s) + ' [1/s per DlnE]'); ys.push(s.rate); });
  if (lead.thin) { cols.push('Reaction rate, thin sample - ' + A(lead.name) + ' [1/s per DlnE]'); ys.push(lead.thin); }
  if (lead.yld) S0.forEach(s => { cols.push('Reaction yield' + nm(s) + ' [reactions / neutron]'); ys.push(s.yld); });
  if (X.total > 0) { cols.push('Cumulative fraction of the rate - ' + A(lead.name) + ' [dimensionless]'); ys.push(Float64Array.from(X.cum, v => v / X.total)); }
  L.push('#'); L.push('# Columns (whitespace separated); each name gives the quantity, then the reaction (MT) or isotope it refers to, then [units]:');
  cols.forEach((c, i) => L.push('#   ' + (i + 1) + ': ' + c));
  L.push('# column numbers 1..' + cols.length);
  const ex = Float64Array.from(E0);
  for (let i = 0; i < ex.length; i++) L.push([ex[i]].concat(ys.map(y => y[i])).map(f).join('  '));
  if (X.raw) {
    const R = X.raw, TT = X.rawTof;
    L.push('#'); L.push('# ' + A(lead.name) + ', without resolution function (own energy grid)');
    const c2 = ['E - neutron energy [MeV]', 'TOF - time of flight [ns]', 'Cross section sigma(E) [barn]', 'Reaction rate [1/s per DlnE]']; const y2 = [TT, R.sig, R.rate];
    if (R.yld) { c2.push('Reaction yield [reactions / neutron]'); y2.push(R.yld); }
    c2.forEach((c, i) => L.push('#   ' + (i + 1) + ': ' + c));
    for (let i = 0; i < R.E.length; i++) L.push([R.E[i]].concat(y2.map(y => y[i])).map(f).join('  '));
  }
  return L.join('\n') + '\n';
}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(name, data) {                                          // one file, stored without compression
  const nb = new TextEncoder().encode(name), crc = crc32(data), t = new Date();
  const dosT = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1), dosD = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
  const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, 0, true);
  const off = 30 + nb.length + data.length, cdLen = 46 + nb.length;
  const ed = new DataView(new ArrayBuffer(22)); ed.setUint32(0, 0x06054b50, true); ed.setUint16(8, 1, true); ed.setUint16(10, 1, true); ed.setUint32(12, cdLen, true); ed.setUint32(16, off, true);
  return new Blob([lh.buffer, nb, data, ch.buffer, nb, ed.buffer], { type: 'application/zip' });
}


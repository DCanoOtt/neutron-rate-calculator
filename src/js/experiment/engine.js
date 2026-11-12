// ---------- Experiment: adapter between the page and the pure engine (core/experiment-core.js) ----------
// Snapshot of what the calculation reads from the page state.
function exModel() {
  const F = curFac();
  return {
    F, flux: fluxOf(F), LT: S.resOn ? resL(F) : F.L, RP: resParams(F), f: S.f, L: S.L, area: S.area, atoms: S.atoms, emin: S.emin, emax: S.emax,
    tab: S.tab, items: S.items, comps: S.comps, layOn: S.layOn, units: exUnitsOf(S.tab, S.comps, S.area, S.atoms), target: S.tab ? targetInfo() : []
  };
}
// Description of the target at the time of a run: composition, density, thickness and mass of every layer, total mass, beam spot.
function targetInfo() {
  const g = (v, n) => (Number.isFinite(v) ? (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) ? v.toExponential(2).replace('e+', 'e') : Number(v.toPrecision(n || 3)).toString()) : '?');
  const r = S.area > 0 ? Math.sqrt(S.area / Math.PI) : NaN, out = [];
  out.push('Beam spot: radius ' + g(r) + ' cm (area ' + g(S.area) + ' cm²)');
  if (S.layOn.win) out.push('Vacuum window (fluence attenuation only): ' + winName() + ' · thickness ' + g(S.lay.win.thick) + ' µm · ' + g(winDens()) + ' g/cm³' + (S.winPlan && S.winPlan.K ? ' · cross sections at ' + S.winPlan.K + ' K' : '') + (S.lay.win.air.cm > 0 ? ' · air gap ' + g(S.lay.win.air.cm) + ' cm, ' + g(winAirDens()) + ' g/cm³' : '') + (S.winPlan && S.winPlan.mixed.length && S.lay.win.mix ? ' · MIXED temperatures accepted' : '') + (S.winRun ? '' : ' · NOT applied (no tables)'));
  const thick = (m, d) => (m > 0 && d > 0 && S.area > 0 ? m * 1e-3 / (d * S.area) * 1e4 : NaN);
  const comp = l => {
    const cs = S.comps.filter(c => layerOf(c) === l && c.tab);
    const list = l === 'sample' ? [{ label: S.tab.label, ratio: 1 }].concat(cs.map(c => ({ label: c.tab.label, ratio: c.ratio }))) : cs.map(c => ({ label: c.tab.label, ratio: c.ratio }));
    return list.length ? list.map(x => x.label + (list.length > 1 ? ' (' + g(x.ratio) + ')' : '')).join(' + ') + (list.length > 1 ? ', atoms ' + (l === 'sample' ? 'per primary atom' : 'per formula unit') : '') : 'no isotope';
  };
  const dens = d => (d > 0 ? g(d) + ' g/cm³' : 'density not set');
  let tot = S.mass > 0 ? S.mass : 0;
  out.push('Sample: ' + comp('sample') + ' · mass ' + g(S.mass) + ' mg · ' + dens(S.dens) + (thick(S.mass, S.dens) > 0 ? ' · thickness ' + g(thick(S.mass, S.dens)) + ' µm' : '') + ' · ' + g(S.atoms) + ' primary atoms · ' + g(S.atoms / S.area * 1e-24) + ' primary atoms/b');
  for (const l of ['front', 'back']) {
    if (!S.layOn[l]) continue;
    const L = S.lay[l]; tot += L.mass > 0 ? L.mass : 0;
    out.push((l === 'front' ? 'Front layer: ' : 'Sample backing: ') + comp(l) + ' · mass ' + g(L.mass) + ' mg · ' + dens(L.dens) + (thick(L.mass, L.dens) > 0 ? ' · thickness ' + g(thick(L.mass, L.dens)) + ' µm' : ''));
  }
  out.push('Total target mass ' + g(tot) + ' mg' + (S.layOn.front || S.layOn.back ? ' (sample' + (S.layOn.front ? ' + front layer' : '') + (S.layOn.back ? ' + backing' : '') + ')' : '') + (S.libName ? ' · library: ' + S.libName : ''));
  return out;
}
function fmtDur(s) {
  if (!(s >= 0)) return '–';
  if (!isFinite(s)) return '∞';
  if (s < 60) return g3(s) + ' s';
  if (s < 3600) return g3(s / 60) + ' min';
  if (s < 86400) return g3(s / 3600) + ' h';
  return g3(s / 86400) + ' d';
}
const exMed = a => { const v = Array.from(a).filter(x => isFinite(x)).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
function exSummary(R) {
  const r = [], pc = v => isFinite(v) ? g3(100 * v) + ' %' : '–', c = R.cfg;
  r.push(['Mode', { count: 'Counting experiment', trans: 'Transmission experiment', both: 'Counting and transmission' }[R.mode] + (R.N > 1 ? ' · stack of ' + R.N + ' identical targets' : ' · one target')]);
  r.push(['Target', R.target.map(esc).join('<br>')]);
  if (R.c) r.push(['Targets plotted', [R.inc.S ? 'samples' : '', R.inc.F ? 'front layer' : '', R.inc.B ? 'sample backing' : ''].filter(Boolean).join(' + ') + (R.N > 1 ? ' · ' + R.tgText : '') + ' · the statistics below refer to this selection']);
  r.push(['Beam time', R.mode === 'count' ? fmtDur(R.cfg.t) : fmtDur(R.cfg.t) + ' in total: ' + fmtDur(R.tin) + ' sample in, ' + fmtDur(R.tout) + ' sample out']);
  r.push(['Bins', R.n + ' · ' + (R.ax === 'E' ? 'energy ' + sciTxt(R.edges[0], 3) + ' – ' + sciTxt(R.edges[R.n], 3) + ' MeV' : 'time of flight ' + fmtT(R.edges[0]) + ' – ' + fmtT(R.edges[R.n]))]);
  if (R.c) {
    const k = R.cs;
    const ex = on => on ? '' : ' · not in the spectrum', nmz = l => R.names[l].length ? ' (' + esc(R.names[l].join(', ')) + ')' : '';
    const rt = v => sciTxt(v / R.tc, 3) + ' counts/s';
    const row = (lab, exp, simv, on) => on && r.push([lab, (R.sim && on ? sciTxt(simv, 3) + ' simulated · ' + sciTxt(exp, 3) + ' expected' : sciTxt(exp, 3) + ' counts' + (R.sim ? ' expected' : '')) + ' · expected rate ' + rt(exp) + ex(on)]);
    row('Counts in the samples: ' + R.tgText + nmz('sample'), k.pS, k.sim && k.sim.S, R.inc.S);
    if (R.layOn.front && R.inc.F) row('Counts in the front layer' + nmz('front'), k.pF, k.sim && k.sim.F, R.inc.F);
    if (R.layOn.back && R.inc.B) row('Counts in the sample backing' + nmz('back'), k.pB, k.sim && k.sim.B, R.inc.B);
    if (!R.inc.S) r.push(['Signal used for the uncertainty', 'front layer and backing counts (the samples are not included)']);
    if (k.B > 0) r.push(['Background (flat and uploaded)', (R.sim ? sciTxt(k.sim.G, 3) + ' simulated · ' + sciTxt(k.B, 3) + ' expected' : sciTxt(k.B, 3) + ' counts') + ' · expected rate ' + rt(k.B)]);
    r.push(['Total counts in the spectrum (' + [R.inc.S ? 'samples' : '', R.inc.F ? 'front layer' : '', R.inc.B ? 'backing' : '', k.B > 0 ? 'background' : ''].filter(Boolean).join(' + ') + ')', sciTxt(R.sim ? k.tot : k.mu, 3) + (R.sim ? ' simulated · ' + sciTxt(k.mu, 3) + ' expected' : '') + ' · expected rate ' + rt(k.mu)]);
    r.push(['Net signal' + (R.sim ? ' (simulated)' : '') + ', whole range', sciTxt(R.sim ? k.net : k.S, 3) + ' ± ' + sciTxt((R.sim ? k.net : k.S) * k.relInt, 2) + ' (' + pc(k.relInt) + ')' + (R.c.norm ? ' · background measured separately for ' + sciTxt(R.c.tb, 3) + ' s, rate scaled by ' + g3(R.c.fN) : R.c.meas ? ' · background measured for the same time' : ' · background known')]);
    const rr = Array.from(R.c.rel).filter(x => isFinite(x));
    if (rr.length) r.push(['Relative uncertainty per bin', 'best ' + pc(Math.min(...rr)) + ' · median ' + pc(exMed(rr)) + ' · worst ' + pc(Math.max(...rr))]);
    if (c.tgt > 0) {
      const tn = Array.from(R.c.tneed).filter(x => isFinite(x));
      r.push(['Time for ' + g3(100 * c.tgt) + ' % on the net signal', 'whole range ' + fmtDur(k.tneedInt) + (tn.length ? ' · median bin ' + fmtDur(exMed(tn)) + ' · worst bin ' + fmtDur(Math.max(...tn)) : '')]);
    }
  }
  if (R.t) {
    const t = R.t, rt = Array.from(t.relT).filter(x => isFinite(x));
    const tt = Array.from(t.Tth).filter(x => isFinite(x));
    r.push(['Open beam counts (sample out)', sciTxt(t.mOut.reduce((a, b) => a + b, 0), 3) + ' · sample in ' + sciTxt(t.mIn.reduce((a, b) => a + b, 0), 3)]);
    if (tt.length) r.push(['Transmission T, per bin', 'min ' + g3(Math.min(...tt)) + ' · median ' + g3(exMed(tt)) + ' · max ' + g3(Math.max(...tt))]);
    if (rt.length) r.push(['Relative uncertainty of T', 'best ' + pc(Math.min(...rt)) + ' · median ' + pc(exMed(rt)) + ' · worst ' + pc(Math.max(...rt))]);
    const po = exMed(t.popt);
    if (isFinite(po)) r.push(['Best sample-in share of the beam time', g3(100 * po) + ' % (median over bins; the run uses ' + g3(R.cfg.share) + ' %)']);
    if (c.tgt > 0) {
      const tn = Array.from(t.tneed).filter(x => isFinite(x)), to = Array.from(t.tOpt).filter(x => isFinite(x));
      r.push(['Time for ' + g3(100 * c.tgt) + ' % on T', 'this split: median bin ' + fmtDur(exMed(tn)) + ', worst ' + fmtDur(tn.length ? Math.max(...tn) : NaN) + ' · best split: median bin ' + fmtDur(exMed(to))]);
    }
  }
  R.notes.forEach(n => r.push(['Note', esc(n)]));
  return '<tbody>' + r.map(x => '<tr><td>' + x[0] + '</td><td>' + x[1] + '</td></tr>').join('') + '</tbody>';
}

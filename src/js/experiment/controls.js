// ----- panel controls -----
const EX_IDS = ['exMode', 'exN', 'exT', 'exU', 'exAx', 'exBs', 'exBn', 'exR0', 'exR1', 'exEff', 'exBg', 'exBgTab', 'exBgX', 'exBgOn', 'exBk', 'exBkF', 'exBkT', 'exSim', 'exSeed', 'exShare', 'exEffT', 'exBgT', 'exTgt', 'exEffTab'];
function exCfgGet() {
  const o = {}; EX_IDS.forEach(id => { o[id] = $(id).value; });
  o.exLink = $('exLink').checked; o.exLog = $('exLog').checked;
  o.exSel = $('exSel').value; o.exPos = $('exPos').value; o.exTg = $('exTg').value;
  return o;
}
let EX_DEF = null;                                      // the values of the controls when the page opened
// Back to the opening values and no result on display: a setup must not inherit anything from the previous session.
function exCfgReset() {
  if (!EX_DEF) return;
  EX_IDS.forEach(id => { $(id).value = EX_DEF[id]; });
  $('exLink').checked = EX_DEF.exLink; $('exLog').checked = EX_DEF.exLog; $('exTg').value = EX_DEF.exTg;
  S.exR = null; S.exZ = { x: null, y: {} };
  $('exOut').hidden = true; $('exStale').hidden = true; $('exSum').innerHTML = '';
  $('exBgTab').dispatchEvent(new Event('input'));
  exLabels(EX_DEF.exSel, EX_DEF.exPos);
}
function exCfgSet(o) {
  exCfgReset();
  if (!o || typeof o !== 'object') return;
  EX_IDS.forEach(id => { if (o[id] !== undefined && o[id] !== null) $(id).value = String(o[id]); });
  if (typeof o.exLink === 'boolean') $('exLink').checked = o.exLink;
  if (typeof o.exLog === 'boolean') $('exLog').checked = o.exLog;
  let want = o.exSel;
  if (want === undefined && ['exInS', 'exInF', 'exInB'].some(k => typeof o[k] === 'boolean')) want = (o.exInS !== false ? 'S' : '') + (o.exInF !== false ? 'F' : '') + (o.exInB !== false ? 'B' : '');   // setups saved before the pulldown
  if (typeof o.exTg === 'string') $('exTg').value = o.exTg;
  let wp = o.exPos; if (wp === undefined && typeof o.exTg === 'string' && o.exTg.trim() && o.exTg.trim().toLowerCase() !== 'all') wp = 'custom';
  exLabels(want, wp);
  $('exBgTab').dispatchEvent(new Event('input'));
}
function exRead() {
  const num = (id, d) => { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
  const tof = $('exAx').value === 'T', U = { s: 1, min: 60, h: 3600, d: 86400 }[$('exU').value] || 1;
  const tg = num('exTgt', NaN);
  const c = {
    mode: $('exMode').value, n: Math.max(1, Math.round(num('exN', 1))), t: num('exT', NaN) * U, ax: tof ? 'T' : 'E', bs: $('exBs').value, bn: num('exBn', NaN),
    r0: num('exR0', NaN) * (tof ? 1000 : 1), r1: num('exR1', NaN) * (tof ? 1000 : 1),
    eff: num('exEff', 100), bg: num('exBg', 0), bgOn: $('exBgOn').value !== '0', bk: $('exBk').value, bkF: num('exBkF', 1), bkT: num('exBkT', NaN) * U, sim: $('exSim').value === 'sim', seed: Math.round(num('exSeed', 1)),
    share: num('exShare', 50), effT: num('exEffT', 100), bgT: num('exBgT', 0), tgt: tg > 0 ? tg / 100 : 0, effTab: null
  };
  if (!(c.bn > 0)) throw new Error('Enter the number of bins' + (c.bs === 'log' ? ' per decade' : '') + '.');
  if (!(c.eff >= 0 && c.eff <= 100) || !(c.effT >= 0 && c.effT <= 100)) throw new Error('Detection efficiencies are percentages between 0 and 100.');
  if (!(c.share > 0 && c.share < 100)) throw new Error('The sample-in share of the beam time must be between 0 and 100 %.');
  exSelFill();
  const sel = $('exSel').value, pv = c.n > 1 ? $('exPos').value : 'all';
  c.tg = parseTargets(pv === 'all' ? 'all' : pv === 'custom' ? $('exTg').value : pv, c.n);
  c.inS = sel.includes('S'); c.inF = sel.includes('F') && !!S.layOn.front; c.inB = sel.includes('B') && !!S.layOn.back;
  if (c.mode !== 'trans' && !c.inS && !c.inF && !c.inB) throw new Error('Tick at least one source of counts: samples, front layer or sample backing.');
  c.effTab = parseEffTable($('exEffTab').value);
  c.bgTab = parseBgTable($('exBgTab').value); c.bgX = $('exBgX').value;
  if (c.bk === 'norm' && !(c.bkF > 0)) throw new Error('Enter a positive normalisation factor for the background.');
  if (c.bk === 'norm' && $('exBkT').value.trim() && !(c.bkT > 0)) throw new Error('The background measuring time must be above zero (or empty for the same time as the sample).');
  if (!c.bgOn) { c.bg = 0; c.bgTab = null; }                       // background not added to the spectrum
  return c;
}
function exSelFill(wantSel, wantPos) {
  const sel = $('exSel'), pos = $('exPos'); if (!sel || !pos) return;
  const parts = [['S', 'Samples'], ['F', 'Front layer'], ['B', 'Sample backing']].filter(q => q[0] === 'S' || (q[0] === 'F' ? S.layOn.front : S.layOn.back)), n = parts.length, opts = [];
  for (let m = (1 << n) - 1; m >= 1; m--) { const sub = parts.filter((q, i) => (m >> i) & 1); opts.push([sub.map(q => q[0]).join(''), (sub.length === n && n > 1 ? 'All: ' : '') + sub.map(q => q[1]).join(' + ')]); }
  if (wantSel) sel.dataset.user = '1';
  const cur = wantSel || (sel.dataset.user ? sel.value : ''), N = Math.max(1, Math.round(parseFloat($('exN').value) || 1));
  const sig = opts.map(o => o.join('|')).join(';') + '#' + N;
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = opts.map(o => '<option value="' + o[0] + '">' + o[1] + '</option>').join('');
    let pp = '<option value="all">' + (N === 1 ? 'the target' : 'all ' + N + ' targets') + '</option>';
    if (N > 1) { for (let k = 1; k <= Math.min(N, 30); k++) pp += '<option value="' + k + '">Target ' + k + (k === 1 ? ' (first in the beam)' : '') + '</option>'; pp += '<option value="custom">Several positions…</option>'; }
    pos.innerHTML = pp; sel.dataset.sig = sig;
  }
  const curP = wantPos || pos.value;
  sel.value = opts.some(o => o[0] === cur) ? cur : opts[0][0];
  pos.value = [...pos.options].some(o => o.value === curP) ? curP : 'all';
  $('exPosW').hidden = N < 2; $('exTgW').hidden = N < 2 || pos.value !== 'custom';
}
function exLabels(wantSel, wantPos) {
  exSelFill(wantSel, wantPos);
  const lg = $('exBs').value === 'log', tof = $('exAx').value === 'T', m = $('exMode').value;
  $('exBkFw').hidden = $('exBk').value !== 'norm' || m === 'trans';
  $('exBnL').textContent = lg ? 'Bins per decade' : 'Number of bins';
  $('exR0L').textContent = 'From (' + (tof ? 'µs' : 'MeV') + ', empty = flux range)'; $('exR1L').textContent = 'To (' + (tof ? 'µs' : 'MeV') + ', empty = flux range)';
  document.querySelectorAll('#expCard [data-for]').forEach(e => { e.hidden = e.dataset.for.split(',').indexOf(m) < 0; });
}
function exMarkStale() { const e = $('exStale'); if (e) e.hidden = !S.exR; }
// The default range of the experiment is the energy range of the selected facility fluence: the page is recomputed over that
// range for the simulation and restored afterwards.
function exOverFlux(fn) {
  const fl = fluxOf(curFac()), f0 = fl.E[0], f1 = fl.E[fl.E.length - 1];
  const sv = { emin: S.emin, emax: S.emax, zx: S.zx, yr: S.yr };
  if (!(f1 > f0) || (f0 === S.emin && f1 === S.emax)) return fn();
  try { S.emin = f0; S.emax = f1; update(); return fn(); }
  finally { S.emin = sv.emin; S.emax = sv.emax; S.zx = sv.zx; S.yr = sv.yr; update(); }
}
function exRun() {
  const msg = $('exMsg');
  try {
    if (!S.res) throw new Error('Nothing to simulate yet: load a library and select an isotope and reaction.');
    const cfg = exRead();
    $('exRun').disabled = true; msg.textContent = 'Calculating…';
    setTimeout(() => {
      try {
        S.exR = exOverFlux(() => exCompute(cfg, exModel())); S.exZ = { x: null, y: {} };
        $('exSum').innerHTML = exSummary(S.exR); $('exStale').hidden = true; $('exOut').hidden = false;
        if (!S.exCollapsed) { S.exCollapsed = true; $('exSetup').open = false; }
        msg.textContent = '';
        renderExp();
      } catch (e) { msg.textContent = e.message || String(e); }
      finally { $('exRun').disabled = false; }
    }, 20);
  } catch (e) { msg.textContent = e.message || String(e); }
}
function expInfo() {
  const R = S.exR, c = R.cfg, g = (v, n) => (Number.isFinite(v) ? Number(v.toPrecision(n || 3)).toString() : '?');
  const l = runInfo().slice(0, 2).concat(R.target || []);
  l.push('Experiment: ' + { count: 'counting', trans: 'transmission', both: 'counting + transmission' }[R.mode] + ' · ' + (R.N > 1 ? R.N + ' identical targets' : '1 target') + ' · ' + fmtDur(c.t) + (R.mode === 'count' ? '' : ' (' + g(c.share) + ' % sample in)') + ' · ' + (R.sim ? 'simulated, seed ' + c.seed : 'expected values') + ' · ' + R.n + ' bins');
  l.push('Efficiency ' + (c.effTab ? 'table' : g(c.eff) + ' %') + (R.mode !== 'count' ? ' · transmission detector ' + g(c.effT) + ' %' : '') + (c.bgOn && c.bg > 0 ? ' · flat background ' + g(c.bg) + ' counts/s/µs' : '') + (R.holdNames && R.holdNames.length ? ' · backing: ' + R.holdNames.join(', ') : ''));
  return l;
}
function expColumns(R) {
  const tof = R.ax === 'T', ax = tof ? 'TOF [ns]' : 'E [MeV]';
  const cols = [['bin lower edge, ' + ax, R.edges.subarray(0, R.n)], ['bin upper edge, ' + ax, R.edges.subarray(1)],
    ['E lower edge [MeV]', R.Elo], ['E upper edge [MeV]', R.Ehi], ['TOF lower edge [ns]', R.tLo], ['TOF upper edge [ns]', R.tHi]];
  if (R.c) {
    const c = R.c;
    cols.push(['Counts, ' + (R.sim ? 'simulated total' : 'expected total') + ' (signal + container / backing + background)', c.tot], ['Counts, lower uncertainty', c.eLo], ['Counts, upper uncertainty', c.eHi],
      ['Counts, expected samples (selected positions)', c.pS], ['Counts, expected front layer', c.pF], ['Counts, expected sample backing', c.pB], ['Counts, expected signal', c.sg], ['Counts, expected container / backing', c.hd], ['Counts, expected flat background', c.bg],
      ...[['S', 'samples (selected positions)', true], ['F', 'front layer', R.layOn.front], ['B', 'sample backing', R.layOn.back], ['G', 'flat and uploaded background', R.cs.B > 0]].filter(q => q[2]).flatMap(q => {
        const ex = { S: c.pS, F: c.pF, B: c.pB, G: c.bg }[q[0]], nm = q[1] + (q[0] !== 'G' && !R.inc[q[0]] ? ' (not in the total)' : '');
        return R.sim ? [['Counts, simulated ' + nm, c.SM[q[0]].y], ['Counts, simulated ' + nm + ', lower uncertainty', c.SM[q[0]].lo], ['Counts, simulated ' + nm + ', upper uncertainty', c.SM[q[0]].hi]]
          : [['Counts, expected ' + nm + ', uncertainty (sqrt N)', Float64Array.from(ex, Math.sqrt)]];
      }),
      ['Net signal (background subtracted)', c.net], ['Net signal, 1 sigma uncertainty', c.netErr], ['Net signal, relative uncertainty', c.rel]);
    if (R.cfg.tgt > 0) cols.push(['Time needed for ' + (100 * R.cfg.tgt).toPrecision(3).replace(/\.?0+$/, '') + ' % relative uncertainty on the net signal [s]', c.tneed]);   // only when a target precision was given
  }
  if (R.t) {
    const t = R.t;
    cols.push(['Transmitted counts, sample in', t.mIn], ['Transmitted counts, sample in, lower uncertainty', Float64Array.from(t.inLo)], ['Transmitted counts, sample in, upper uncertainty', t.inHi],
      ['Transmitted counts, sample out', t.mOut], ['Transmitted counts, sample out, lower uncertainty', t.outLo], ['Transmitted counts, sample out, upper uncertainty', t.outHi],
      ['Transmission T, expected', t.Tth], ['Transmission T, ' + (R.sim ? 'simulated' : 'expected'), t.T], ['Transmission T, 1 sigma uncertainty', t.Terr],
      ['Total cross section per primary atom, from the expected T [barn]', t.sgTh], ['Total cross section per primary atom [barn]', t.sg], ['Total cross section, 1 sigma uncertainty [barn]', t.sgErr]);
  }
  return cols;
}
function expText() {
  const R = S.exR; if (!R) return '';
  const A = asciiName, f = v => (Number.isFinite(v) ? v.toExponential(6) : 'nan'), L = [], cols = expColumns(R);
  L.push('# Neutron reaction rate calculator - simulated experiment (independent of the zoom of the plots)');
  L.push('# Created: ' + new Date().toISOString());
  expInfo().forEach((l, i) => L.push('# ' + (i === 0 ? 'Run: ' : '') + A(l)));
  if (S.libName) L.push('# Cross-section library: ' + A(S.libName));
  L.push('# ' + (R.sim ? 'One simulated measurement (Poisson, seed ' + R.cfg.seed + '); uncertainties are 68.27 % intervals (Garwood below 25 counts).' : 'Expected values; uncertainties are sqrt(N).'));
  L.push('# Counts include the detection efficiency. Stack of identical targets and transmission use the first-collision model.');
  L.push('# nan = undefined value (for example a relative uncertainty without net signal, or a cross section outside the range of the data).');
  L.push('#'); L.push('# Columns (whitespace separated):');
  cols.forEach((c, i) => L.push('#   ' + (i + 1) + ': ' + A(c[0])));
  for (let i = 0; i < R.n; i++) L.push(cols.map(c => f(c[1][i])).join('  '));
  return L.join('\n') + '\n';
}
function expHistograms() {
  const R = S.exR; if (!R) return [];
  const out = [], info = asciiName(expInfo().join(' | ')), tof = R.ax === 'T', xt = tof ? 'TOF (ns)' : 'E (MeV)';
  const add = (name, title, yt, vals, err) => out.push({ name, title: asciiName(title) + ' | ' + info, xt, yt, edges: R.edges, vals: Float64Array.from(vals), err: err ? Float64Array.from(err) : null });
  const sq = (lo, hi) => Float64Array.from(lo, (v, i) => 0.5 * (v + hi[i]));
  if (R.c) {
    const c = R.c;
    add('exp_counts_total', 'Counts per bin, ' + (R.sim ? 'simulated' : 'expected') + ' total', 'counts', c.tot, sq(c.eLo, c.eHi));
    if (R.sim) for (const [q, nm, on, id] of [['S', 'samples', true, 'samples'], ['F', 'front layer', R.layOn.front, 'front_layer'], ['B', 'sample backing', R.layOn.back, 'backing'], ['G', 'flat background', R.cs.B > 0, 'flat_background']]) if (on) add('exp_counts_' + id + '_simulated', 'Simulated counts in the ' + nm, 'counts', c.SM[q].y, sq(c.SM[q].lo, c.SM[q].hi));
    add('exp_counts_samples', 'Expected counts in the samples', 'counts', c.pS, Float64Array.from(c.pS, Math.sqrt));
    if (R.layOn.front) add('exp_counts_front_layer', 'Expected counts in the front layer', 'counts', c.pF, Float64Array.from(c.pF, Math.sqrt));
    if (R.layOn.back) add('exp_counts_backing', 'Expected counts in the sample backing', 'counts', c.pB, Float64Array.from(c.pB, Math.sqrt));
    add('exp_counts_signal', 'Expected signal counts', 'counts', c.sg, Float64Array.from(c.sg, Math.sqrt));
    if (R.holdNames.length) add('exp_counts_holder', 'Expected container / backing counts', 'counts', c.hd, Float64Array.from(c.hd, Math.sqrt));
    if (R.cs.B > 0) add('exp_counts_flat_background', 'Expected flat background counts', 'counts', c.bg, Float64Array.from(c.bg, Math.sqrt));
    add('exp_net_signal', 'Net signal (background subtracted)', 'counts', Float64Array.from(c.net, v => isFinite(v) ? v : 0), c.netErr);
    add('exp_net_relative_uncertainty', 'Relative uncertainty of the net signal', 'fraction', Float64Array.from(c.rel, v => isFinite(v) ? v : 0));
    if (R.cfg.tgt > 0) add('exp_time_needed', 'Time needed for the target precision', 's', Float64Array.from(c.tneed, v => isFinite(v) ? v : 0));
  }
  if (R.t) {
    const t = R.t, fin = a => Float64Array.from(a, v => isFinite(v) ? v : 0);
    add('exp_transmitted_in', 'Transmitted counts, sample in', 'counts', t.mIn, sq(t.inLo, t.inHi));
    add('exp_transmitted_out', 'Transmitted counts, sample out', 'counts', t.mOut, sq(t.outLo, t.outHi));
    add('exp_T_expected', 'Transmission, expected', 'T', fin(t.Tth));
    add('exp_T', 'Transmission, ' + (R.sim ? 'simulated' : 'expected'), 'T', fin(t.T), fin(t.Terr));
    add('exp_sigma_tot_expected', 'Total cross section per primary atom, from the expected T', 'barn', fin(t.sgTh));
    add('exp_sigma_tot', 'Total cross section per primary atom', 'barn', fin(t.sg), fin(t.sgErr));
  }
  return out;
}
function exBind() {
  EX_DEF = exCfgGet();
  const card = $('expCard'), win = $('expWin'), isOpen = () => !win.hidden;
  const openW = () => { win.hidden = false; S.exCollapsed = false; exLabels(); if (S.exR) requestAnimationFrame(renderExp); };
  $('expOpen').addEventListener('click', openW);
  $('expClose').addEventListener('click', () => { win.hidden = true; });
  { const hd = $('expHead'); let dw = null;
    hd.addEventListener('pointerdown', ev => { if (ev.target.closest('button,input')) return; const r = win.getBoundingClientRect(); dw = { dx: ev.clientX - r.left, dy: ev.clientY - r.top }; hd.setPointerCapture(ev.pointerId); });
    hd.addEventListener('pointermove', ev => { if (!dw) return; win.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dw.dx)) + 'px'; win.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dw.dy)) + 'px'; });
    hd.addEventListener('pointerup', () => { dw = null; }); }
  if (window.ResizeObserver) new ResizeObserver(() => { if (isOpen() && S.exR) requestAnimationFrame(renderExp); }).observe(win);
  const SELS = ['exSel', 'exPos', 'exTg'];
  card.addEventListener('input', ev => { if (ev.target.id === 'exSel') ev.target.dataset.user = '1'; }, true);
  card.addEventListener('change', ev => { if (ev.target.id === 'exSel') ev.target.dataset.user = '1'; }, true);
  card.addEventListener('input', ev => { if (ev.target.id === 'exLink' || ev.target.id === 'exLog') { renderExp(); return; } exLabels(); if (!SELS.includes(ev.target.id)) exMarkStale(); });
  card.addEventListener('change', ev => { if (ev.target.id === 'exLink' || ev.target.id === 'exLog') { renderExp(); return; } exLabels(); if (SELS.includes(ev.target.id)) { if (ev.target.id === 'exSel') ev.target.dataset.user = '1'; if (S.exR) exRun(); } else exMarkStale(); });
  $('exRun').addEventListener('click', exRun);
  const bgInfo = () => { let t = ''; try { const b = parseBgTable($('exBgTab').value); t = b ? b.x.length + ' points loaded, x from ' + b.x[0] + ' to ' + b.x[b.x.length - 1] + (b.u ? ', with uncertainties' : ', without uncertainties') : 'no file loaded'; } catch (e) { t = 'invalid: ' + e.message; } $('exBgInfo').textContent = t; };
  const bgLoad = e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) f.text().then(t => { $('exBgTab').value = t; bgInfo(); exMarkStale(); }); };
  $('exBgFile').addEventListener('change', bgLoad); $('exBgFile2').addEventListener('change', bgLoad);
  $('exBgLoad').addEventListener('click', () => $('exBgFile2').click());
  $('exBgClear').addEventListener('click', () => { $('exBgTab').value = ''; bgInfo(); exMarkStale(); });
  $('exBgTab').addEventListener('input', bgInfo); bgInfo();
  $('exReset').addEventListener('click', exResetZoom);
  const sm = $('exSaveMenu'), sb = $('exSaveBtn'), close = () => { sm.hidden = true; sb.setAttribute('aria-expanded', 'false'); };
  sb.addEventListener('click', ev => { ev.stopPropagation(); sm.hidden = !sm.hidden; sb.setAttribute('aria-expanded', String(!sm.hidden)); });
  document.addEventListener('click', close);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') close(); });
  [['exSavePng', 'png'], ['exSavePdf', 'pdf'], ['exSaveTxt', 'txt'], ['exSaveRoot', 'root']].forEach(([id, k]) => $(id).addEventListener('click', () => { close(); saveChart(k, true); }));
  window.addEventListener('resize', () => { if (S.exR && isOpen()) renderExp(); });
  exLabels();
}


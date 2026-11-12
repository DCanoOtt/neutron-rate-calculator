// ---------- Vacuum window (UI): material choice, tables at one temperature, optical depth ----------
// The window is a layer in front of the front layer that only attenuates the fluence (no reaction rates). Its isotopes are the natural
// isotopes of the material; the library tables of all of them are taken at the same temperature (as in the name of the table, e.g. 294 K).
const WIN_T0 = 293.6;                                          // K, room temperature: preferred when there is a choice
const winKelvin = t => Math.round(t.temp / MEV_PER_K);
const winComp = () => winComposition(S.lay.win.mat, S.lay.win.custom);        // { error } when the typed material cannot be read
const winName = () => { const c = winComp(); return c && !c.error ? c.name : (S.lay.win.mat === 'custom' ? (S.lay.win.custom.name || 'Custom material') : WIN_MATS[S.lay.win.mat].name); };
const winShort = () => { const c = winComp(); return c && !c.error ? c.short : 'Custom'; };
const winDens = () => { const w = S.lay.win, c = winComp(); return w.densUser && w.dens > 0 ? w.dens : (c && c.dens > 0 ? c.dens : 0); };
const winAirOn = () => S.lay.win.air.cm > 0;
const winAirDens = () => { const a = S.lay.win.air; return a.densUser && a.dens > 0 ? a.dens : WIN_AIR.dens; };
const winCK = () => { const w = S.lay.win; return [w.mat, w.temp, w.mat === 'custom' ? w.custom.text + '|' + w.custom.mode : '', winAirOn() ? 'air' : '', w.mix ? 'mix' : ''].join('|'); };
// Which library table of every natural isotope (window and air gap) is used: one temperature K for all of them. An isotope that has no table
// at K is left out, unless the user accepted mixed temperatures (then its table at the closest temperature is used).
function winPlan() {
  const w = S.lay.win, comp = winComp(), air = winAirOn() ? winComposition('air') : null;
  const parts = [{ id: 'win', comp, g: 0 }].concat(air ? [{ id: 'air', comp: air, g: 1 }] : []);
  const byIso = new Map();                                          // 'Z:A' -> [{K, idx}] sorted by K (first table of each temperature)
  for (const pt of parts) for (const o of pt.comp.isos) {
    const k = o.Z + ':' + o.A; if (byIso.has(k)) continue;
    const list = [], seen = new Set();
    S.tables.forEach((t, i) => { if (t.missing || parseInt(t.zaid, 10) !== o.Z * 1000 + o.A) return; const K = winKelvin(t); if (!seen.has(K)) { seen.add(K); list.push({ K, idx: i }); } });
    byIso.set(k, list.sort((a, b) => a.K - b.K));
  }
  const cnt = new Map(); for (const list of byIso.values()) for (const x of list) cnt.set(x.K, (cnt.get(x.K) || 0) + 1);
  const nIso = byIso.size, temps = Array.from(cnt.keys()).sort((a, b) => a - b);
  let K = 0;
  if (w.temp > 0 && cnt.has(w.temp)) K = w.temp;
  else if (temps.length) K = temps.slice().sort((a, b) => (cnt.get(b) === nIso) - (cnt.get(a) === nIso) || cnt.get(b) - cnt.get(a) || Math.abs(a - WIN_T0) - Math.abs(b - WIN_T0))[0];
  const mixed = [], none = [];
  parts.forEach(pt => {
    pt.items = pt.comp.isos.map(o => {
      const list = byIso.get(o.Z + ':' + o.A), at = list.find(x => x.K === K);
      if (at) return { o, idx: at.idx, K, g: pt.g, part: pt.id };
      const near = list.slice().sort((a, b) => Math.abs(a.K - K) - Math.abs(b.K - K) || a.K - b.K)[0];
      const it = { o, idx: -1, K: 0, g: pt.g, part: pt.id };
      if (near && K > 0) { it.sub = near; mixed.push(it); if (w.mix) { it.idx = near.idx; it.K = near.K; it.mixed = true; } } else none.push(it);
      return it;
    });
  });
  const items = [].concat(...parts.map(pt => pt.items));
  return { src: S.tables, ck: winCK(), comp, air, parts, K, temps: temps.map(k => ({ K: k, n: cnt.get(k), full: cnt.get(k) === nIso })), nIso, mixed, none, items,
    id: [winCK(), K].concat(items.map(x => x.idx)).join(',') };
}
async function winLoad(plan) {
  const my = S.winTok = (S.winTok || 0) + 1;
  S.winData = { plan, ready: false };
  try {
    const tabs = await Promise.all(plan.items.map(it => it.idx >= 0 ? fetchTab(it.idx) : null));
    if (my !== S.winTok) return;
    const parts = [];
    plan.items.forEach((it, k) => { const tr = tabs[k] && tabs[k].rxs.find(r => r.mt === 1); if (tr) parts.push({ E: tr.E, xs: tr.xs, f: it.o.f, g: it.g }); else if (tabs[k]) it.idx = -1; });
    S.winData = { plan, ready: parts.length > 0, merged: parts.length ? winMerge(parts) : null, err: parts.length ? '' : 'No cross-section table of this material is in the library.' };
  } catch (e) {
    if (my !== S.winTok) return;
    S.winData = { plan, ready: false, err: (e && e.message) || String(e) };
  }
  Store.touch('lay'); Store.flush();
  update();
}
// Called at the start of every update(): keeps the tables, the optical depth and the panel in step with the window settings.
function winEnsure() {
  const w = S.lay.win;
  if (!S.layOn.win) { S.winRun = null; return; }
  if (!S.tables.length) { S.winRun = null; S.winData = null; S.winPlan = null; winRender(); return; }
  if (winComp().error) { S.winRun = null; S.winPlan = null; S.winData = null; winRender(); return; }
  if (!S.winPlan || S.winPlan.src !== S.tables || S.winPlan.ck !== winCK()) { S.winPlan = winPlan(); winLoad(S.winPlan); }
  const d = S.winData, pl = S.winPlan;
  if (d && d.plan === pl && d.ready) {
    const nw = winNtot(winDens(), w.thick, pl.comp.Abar), na = pl.air ? winNtot(winAirDens(), w.air.cm * 1e4, pl.air.Abar) : 0;
    const fac = curFac(), fb = fac ? (S.custom[fac.id] || fac.flux) : null, hasF = !!(fb && fb.E && fb.E.length > 1), key = pl.id + '|' + nw + '|' + na;
    if (!S.winRun || S.winRun.key !== key || S.winRun.fb !== (hasF ? fb : null)) {
      if (nw + na > 0) {
        const m = d.merged, s0 = m.sigs[0], s1 = m.sigs[1];
        if (hasF) {   // transmission on the bins (energy points) of the neutron spectrum itself
          const E = Float64Array.from(fb.E), N = E.length, tau = new Float64Array(N), tw = new Float64Array(N), ta = new Float64Array(N);
          for (let i = 0; i < N; i++) { tw[i] = nw * interpLin(m.E, s0, E[i]); ta[i] = s1 ? na * interpLin(m.E, s1, E[i]) : 0; tau[i] = tw[i] + ta[i]; }
          S.winRun = { E, tau, tw, ta, key, n: nw, na, fb };
        } else {      // no spectrum: thinned cross-section grid
          const tot = new Float64Array(m.E.length);
          for (let i = 0; i < tot.length; i++) tot[i] = nw * s0[i] + (s1 ? na * s1[i] : 0);
          const th = winThin(m.E, tot, 1);
          S.winRun = { E: th.E, tau: th.tau, tw: Float64Array.from(th.idx, i => nw * s0[i]), ta: Float64Array.from(th.idx, i => (s1 ? na * s1[i] : 0)), key, n: nw, na, fb: null };
        }
      } else S.winRun = null;
    }
  } else S.winRun = null;
  winRender();
  decRender('win');
}
const winNum = (v, n) => Number.isFinite(v) ? String(parseFloat(v.toPrecision(n || 4))) : '–';
function winInfoHTML(comp) {
  if (comp.error) return '';
  const sup = A => '<sup>' + A + '</sup>';
  const rows = comp.elems.map(e => '<tr><td><b>' + e.sym + '</b></td><td>' + winNum(e.mass * 100, 4) + '</td><td>' + winNum(e.atom * 100, 4) + '</td><td>' + e.iso.map(i => sup(i.A) + e.sym + ' ' + winNum(i.abund, 5) + ' %').join(' · ') + '</td></tr>').join('');
  return '<div class="wsum"><b>' + esc(comp.name) + '</b> · ' + (comp.formula) + ' · ' + (comp.dens > 0 ? 'density ' + comp.dens + ' g/cm³' : 'enter the density below') + ' · mean atomic mass ' + winNum(comp.Abar, 5) + ' g/mol</div>' +
    '<div class="wtw"><table class="wtab"><thead><tr><th>Element</th><th>Mass %</th><th>Atom %</th><th>Natural isotopic composition (atom %)</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="hint">' + esc(comp.src) + '</div>';
}
function winPlotSVG(run) {
  const W = 560, H = 210, R = 10, T = 32, B = 38, x0 = Math.log10(Math.max(S.emin > 0 ? S.emin : 1e-8, 1e-11)), x1 = Math.log10(S.emax > S.emin ? S.emax : 100), hasAir = run.na > 0;
  const lo = Math.pow(10, x0), hi = Math.pow(10, x1), a = Math.max(0, lowerBound(run.E, lo) - 1), b = Math.min(run.E.length, upperBound(run.E, hi) + 1);
  const Es = run.E.subarray(a, b), tr = arr => Float64Array.from(arr.subarray(a, b), v => Math.exp(-v)), Tt = tr(run.tau);
  let tmin = 1; for (let i = 0; i < Tt.length; i++) if (Tt[i] < tmin) tmin = Tt[i];
  const span0 = Math.max(1 - tmin, 0), ylo = Math.max(0, Math.min(tmin - Math.max(0.15 * span0, 0.005), 1 - 0.01));   // autoscale: from the lowest transmission (plus a small margin) up to 1
  const raw = (1 - ylo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(q => q * mag).find(q => q >= raw) || raw, dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / Math.pow(10, Math.floor(Math.log10(step))) === 2.5 ? 1 : 0));
  const L = Math.max(44, 30 + 6.3 * (dec + 2));   // left margin grows with the width of the tick labels, so the axis title never touches them
  const X = e => L + (Math.log10(Math.min(Math.max(e, lo), hi)) - x0) / (x1 - x0) * (W - L - R), Y = t => T + (1 - (t - ylo) / (1 - ylo)) * (H - T - B);
  let g = '';
  for (let d = Math.ceil(x0); d <= Math.floor(x1); d++) { const x = X(Math.pow(10, d)); g += '<line class="gl" x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (H - B) + '"/>' + (((d - Math.ceil(x0)) % 2 === 0) ? '<text x="' + x + '" y="' + (H - B + 14) + '" text-anchor="middle">1e' + d + '</text>' : ''); }
  const tk = []; for (let v = Math.ceil(ylo / step - 1e-9) * step; v <= 1 + 1e-9; v += step) tk.push(Math.min(v, 1));
  if (tk[tk.length - 1] < 1 - 1e-9) tk.push(1);
  for (const t of tk) g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text x="' + (L - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + t.toFixed(dec) + '</text>';
  const curves = [];
  if (Es.length > 1) {
    const idx = decimate(Es, Tt, Math.log(lo), Math.log(hi), 260), path = T2 => '<path class="cv ' + T2.c + '" d="' + idx.map((i, q) => (q ? 'L' : 'M') + X(Es[i]).toFixed(1) + ' ' + Y(T2.v[i]).toFixed(1)).join('') + '"/>';
    if (hasAir) { curves.push({ c: 'win', v: tr(run.tw), n: 'Vacuum window' }, { c: 'air', v: tr(run.ta), n: 'Air gap' }, { c: 'tot', v: Tt, n: 'Total' }); }
    else curves.push({ c: 'tot', v: Tt, n: 'Vacuum window' });
    g += curves.map(path).join('');
  }
  let lx = L; const lg = curves.map(c => { const x = lx; lx += 38 + c.n.length * 6.4 + 14; return '<line class="cv ' + c.c + '" x1="' + x + '" x2="' + (x + 22) + '" y1="13" y2="13"/><text x="' + (x + 28) + '" y="17">' + c.n + '</text>'; }).join('');   // legend in its own strip above the plot area, so it never covers a curve
  return '<svg class="wplot" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Transmission of the vacuum window and the air gap versus neutron energy">' + g + lg +
    '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">Neutron energy (MeV)</text><text transform="translate(11 ' + (T + (H - T - B) / 2) + ') rotate(-90)" text-anchor="middle">Transmission</text></svg>';
}
let winShown = '';
function winRender() {
  if (!$('winInfo')) return;
  const w = S.lay.win, comp = winComp(), plan = S.winPlan, d = S.winData, run = S.winRun, cu = w.custom, isC = w.mat === 'custom', A = w.air;
  const key = [w.mat, w.temp, w.thick, w.densUser ? w.dens : '', isC ? cu.name + '|' + cu.text + '|' + cu.mode : '', A.cm, A.densUser ? A.dens : '', w.mix, S.tables.length, plan && plan.id, d && d.ready, d && d.err, run && run.key, run && run.E.length, run && run.E[0], run && run.E[run.E.length - 1], S.emin, S.emax].join('|');
  if (key === winShown) return; winShown = key;
  if ($('winMat').value !== w.mat) $('winMat').value = w.mat;
  $('winCustom').hidden = !isC; $('winDensReset').disabled = isC && !(comp && comp.dens > 0);
  if (isC) { for (const [id, v] of [['winCName', cu.name], ['winCText', cu.text], ['winCMode', cu.mode]]) if (document.activeElement !== $(id) && $(id).value !== v) $(id).value = v; $('winCErr').textContent = comp.error && cu.text.trim() ? comp.error : ''; }
  const ik = w.mat + (isC ? '|' + cu.name + '|' + cu.text + '|' + cu.mode : '');
  if ($('winMat').dataset.info !== ik) { $('winMat').dataset.info = ik; $('winInfo').innerHTML = comp.error ? '' : winInfoHTML(comp); }
  const air = winComposition('air');
  $('winAirInfo').innerHTML = A.cm > 0 ? winInfoHTML(Object.assign({}, air, { name: 'Air gap: ' + air.name })) : '';
  const ft = $('winThick'), fd = $('winDens'), fc = $('winAirCm'), fa = $('winAirDens');
  if (document.activeElement !== ft) ft.value = w.thick > 0 ? winNum(w.thick, 5) : '';
  if (document.activeElement !== fd) fd.value = winDens() > 0 ? winNum(winDens(), 5) : '';
  if (document.activeElement !== fc) fc.value = A.cm > 0 ? winNum(A.cm, 5) : '';
  if (document.activeElement !== fa) fa.value = winNum(winAirDens(), 5);
  if (comp.error) { $('winTemp').innerHTML = '<option value="0">Automatic</option>'; $('winNote').innerHTML = isC ? '' : '<div class="warnt">' + esc(comp.error) + '</div>'; $('winPlotBox').innerHTML = ''; return; }
  const sel = $('winTemp'), temps = plan ? plan.temps : [], nIso = plan ? plan.nIso : comp.isos.length;
  sel.innerHTML = '<option value="0">Automatic' + (plan && plan.K ? ' (' + plan.K + ' K)' : '') + '</option>' + temps.map(t => '<option value="' + t.K + '">' + t.K + ' K' + (t.full ? '' : ' (' + t.n + ' of ' + nIso + ' isotopes)') + '</option>').join('');
  sel.value = String(w.temp > 0 && temps.some(t => t.K === w.temp) ? w.temp : 0);
  const n = winNtot(winDens(), w.thick, comp.Abar), na = A.cm > 0 ? winNtot(winAirDens(), A.cm * 1e4, air.Abar) : 0, notes = [];
  const iso = it => (it.part === 'air' ? 'air ' : '') + it.o.sym + '-' + it.o.A;
  if (!(winDens() > 0)) notes.push('<span class="warnt">Enter the density of the material: the window is not applied without it.</span>');
  if (!S.tables.length) notes.push('<span class="warnt">Load a cross-section library first: the window is then included.</span>');
  else if (!plan || !plan.K) notes.push('<span class="warnt">The library has no table of the natural isotopes of this material (' + comp.isos.map(o => o.sym + '-' + o.A).join(', ') + '), so the window is not applied.</span>');
  else {
    const used = plan.items.filter(x => x.idx >= 0);
    notes.push('Cross sections: ' + used.length + ' tables' + (used.some(x => x.mixed) ? '' : ', all at ' + plan.K + ' K') + ' (' + esc(Array.from(new Set(used.map(x => S.tables[x.idx].zaid))).join(', ')) + ').');
    if (plan.mixed.length && !w.mix) notes.push('<div class="mixwarn"><b>Warning: mixed temperatures.</b> There is no ' + plan.K + ' K table for ' + esc(plan.mixed.map(iso).join(', ')) + ' (' + ['win', 'air'].filter(q => plan.mixed.some(x => x.part === q)).map(q => winNum(plan.mixed.filter(x => x.part === q).reduce((a, x) => a + x.o.f, 0) * 100, 3) + ' % of the atoms of the ' + (q === 'air' ? 'air gap' : 'window')).join(', ') + '; only ' + esc(plan.mixed.map(x => iso(x) + ' at ' + x.sub.K + ' K').join(', ')) + ' exist). They are left out for now. Press OK to use those tables at their closest temperature, so that the cross sections of the window and the air gap are at different temperatures; or choose another temperature above. <button class="btn pri" type="button" data-act="mix">OK, proceed with mixed temperatures</button></div>');
    if (plan.mixed.length && w.mix) notes.push('<div class="mixwarn"><b>Warning: mixed temperatures accepted.</b> ' + esc(plan.mixed.map(x => iso(x) + ' at ' + x.sub.K + ' K').join(', ')) + ' instead of ' + plan.K + ' K. <button class="btn" type="button" data-act="unmix">Undo</button></div>');
    if (plan.none.length) notes.push('<span class="warnt">No table at all for ' + esc(plan.none.map(iso).join(', ')) + ' (' + winNum(plan.none.reduce((a, x) => a + x.o.f, 0) * 100, 3) + ' % of the atoms): left out.</span>');
    if (d && d.err) notes.push('<span class="warnt">' + esc(d.err) + '</span>');
    if (!d || (!d.ready && !d.err)) notes.push('Reading the tables…');
  }
  notes.push('Window: areal density ' + sciTxt(n, 3) + ' atoms/b · ' + winNum(winDens() * w.thick * 1e-4 * 1e3, 4) + ' mg/cm².' + (A.cm > 0 ? ' Air gap: ' + winNum(A.cm, 4) + ' cm · ' + sciTxt(na, 3) + ' atoms/b · ' + winNum(winAirDens() * A.cm * 1e3, 4) + ' mg/cm².' : ''));
  if (run) {
    const at = (arr, e) => Math.exp(-interpLin(run.E, arr, e)), EN = [[2.53e-8, '25.3 meV'], [1e-6, '1 eV'], [1e-3, '1 keV'], [1, '1 MeV'], [14, '14 MeV']], line = (nm, arr) => nm + ': ' + EN.map(([e, l]) => l + ' ' + winNum(at(arr, e), 3)).join(' · ') + '.';
    if (run.na > 0) { notes.push(line('Transmission of the window', run.tw)); notes.push(line('Transmission of the air gap', run.ta)); notes.push('<b>' + line('Total transmission (window and air)', run.tau) + '</b>'); }
    else notes.push(line('Transmission', run.tau));
  }
  notes.push('Only the attenuation of the neutron fluence is calculated: no reaction rates for the window or the air. The fluence in the plots and rates is the one behind both (the total transmission).');
  $('winNote').innerHTML = notes.map(x => '<div>' + x + '</div>').join('');
  $('winPlotBox').innerHTML = run ? winPlotSVG(run) : '';
}
function bindWindow() {
  const W = S.lay.win;
  const reset = () => { W.mix = false; };                                   // an acceptance of mixed temperatures holds only for the choice it was given for
  $('winMat').innerHTML = Object.keys(WIN_MATS).map(k => '<option value="' + k + '">' + esc(WIN_MATS[k].name) + '</option>').join('') + '<option value="custom">Custom material (type the elements)…</option>';
  $('winMat').addEventListener('change', ev => { W.mat = ev.target.value; W.densUser = false; W.dens = NaN; reset(); update(); });
  let tmr = 0;                                                             // typed composition: the error shows at once, the tables are read when typing pauses
  const cust = (k, ev) => { W.custom[k] = ev.target.value; const c = winComp(); $('winCErr').textContent = c.error && W.custom.text.trim() ? c.error : ''; if (k !== 'name') reset(); clearTimeout(tmr); tmr = setTimeout(update, k === 'name' ? 0 : 450); };
  $('winCName').addEventListener('input', ev => cust('name', ev)); $('winCText').addEventListener('input', ev => cust('text', ev)); $('winCMode').addEventListener('change', ev => cust('mode', ev));
  $('winTemp').addEventListener('change', ev => { W.temp = parseInt(ev.target.value, 10) || 0; reset(); update(); });
  $('winThick').addEventListener('input', ev => { const v = parseFloat(ev.target.value); W.thick = isFinite(v) && v >= 0 ? v : 0; schedule(); });
  $('winDens').addEventListener('input', ev => { const v = parseFloat(ev.target.value); W.dens = isFinite(v) && v > 0 ? v : NaN; W.densUser = isFinite(v) && v > 0; schedule(); });
  $('winDensReset').addEventListener('click', () => { W.densUser = false; W.dens = NaN; update(); });
  $('winAirCm').addEventListener('input', ev => { const v = parseFloat(ev.target.value), was = W.air.cm > 0; W.air.cm = isFinite(v) && v >= 0 ? v : 0; if (was !== W.air.cm > 0) reset(); schedule(); });
  $('winAirDens').addEventListener('input', ev => { const v = parseFloat(ev.target.value); W.air.dens = isFinite(v) && v > 0 ? v : NaN; W.air.densUser = isFinite(v) && v > 0; schedule(); });
  $('winAirReset').addEventListener('click', () => { W.air.densUser = false; W.air.dens = NaN; update(); });
  $('winNote').addEventListener('click', ev => { const b = ev.target.closest('[data-act]'); if (!b) return; W.mix = b.dataset.act === 'mix'; update(); });
}

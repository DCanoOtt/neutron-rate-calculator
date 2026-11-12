// ---------- Compound components ----------
async function fetchTab(idx) {
  const t = S.tables[idx];
  if (!t) throw new Error('No isotope table selected.');
  let src = t.file || S.blob, start = t.start, end = t.end;
  if (t.xs) {
    const f = findAceFile(t);
    if (!f) throw new Error('Isotope ' + t.zaid + ' is listed in xsdir, but its file "' + t.fileName + '" was not found in the selected folder.');
    let tabs = S.scanCache.get(f);
    if (!tabs) { try { tabs = await scanAce(f); } catch (er) { throw new Error('File "' + f.name + '": ' + er.message); } S.scanCache.set(f, tabs); }
    const m = tabs.find(x => x.zaid.toLowerCase() === t.zaid.toLowerCase()) || (tabs.length === 1 ? tabs[0] : null);
    if (!m) throw new Error('File "' + f.name + '" does not contain the table ' + t.zaid + '.');
    src = f; start = m.start; end = m.end;
  }
  const tab = buildTable(new TextDecoder('latin1').decode(await src.slice(start, end).arrayBuffer()));
  tab.label = t.label;
  return tab;
}
function compShown(c) {
  const q = c.filter.trim().toLowerCase().replace(/\s+/g, ' ');
  const list = [];
  S.tables.forEach((t, i) => { if (!q || t.key.indexOf(q) >= 0) list.push(i); });
  return list.slice(0, 400);
}
function compIsoHTML(c) {
  const sh = compShown(c);
  return sh.map(i => { const t = S.tables[i]; return '<option value="' + i + '"' + (i === c.idx ? ' selected' : '') + (t.missing ? ' disabled' : '') + '>' + esc(t.label + ' · ' + t.zaid + (t.temp > 0 ? ' · ' + Math.round(t.temp / MEV_PER_K) + ' K' : '') + (t.missing ? ' · file missing' : t.bad ? ' · damaged' : '')) + '</option>'; }).join('') || '<option value="-1">No match</option>';
}
function compMtHTML(c) {
  if (!c.tab) return '<span class="hint">Load a table first.</span>';
  return c.tab.rxs.map((r, i) => '<label><input type="checkbox" value="' + i + '"' + (c.mts.indexOf(i) >= 0 ? ' checked' : '') + '> <span>' + esc(mtLabel(r)) + '</span></label>').join('');
}
function refreshComp(c) {
  const i = S.comps.indexOf(c);
  const row = i >= 0 && document.querySelector('.pane .comp[data-i="' + i + '"]');
  if (!row) return;
  row.querySelector('[data-k="i"]').innerHTML = compIsoHTML(c);
  row.querySelector('[data-k="m"]').innerHTML = compMtHTML(c);
  row.querySelector('.errline').textContent = c.err || '';
}
// Atoms of each component per primary atom. Sample components: as typed. Front layer and backing: the layer has its own mass and its
// components are stoichiometric amounts (atoms per formula unit), so the atoms follow from the mass of the layer.
function computeEff(atoms) {
  for (const c of S.comps) if (layerOf(c) === 'sample') c.eff = c.ratio;
  for (const l of ['front', 'back']) {
    const cs = S.comps.filter(c => layerOf(c) === l && c.tab && c.ratio > 0);
    const m = S.lay[l].mass, mp = cs.reduce((a, c) => a + c.ratio * c.tab.awr * NEUTRON_U / NAVO, 0);
    const nU = (m > 0 && mp > 0) ? m * 1e-3 / mp : 0;
    for (const c of S.comps) if (layerOf(c) === l) c.eff = (atoms > 0 && c.tab && c.ratio > 0) ? nU * c.ratio / atoms : 0;
  }
}
// Atoms in a front layer or backing: formula units times the atoms per formula unit; mass per atom follows from the stoichiometry.
function layMpa(l) {
  const cs = S.comps.filter(c => layerOf(c) === l && c.tab && c.ratio > 0);
  const sr = cs.reduce((a, c) => a + c.ratio, 0), mp = cs.reduce((a, c) => a + c.ratio * c.tab.awr * NEUTRON_U / NAVO, 0);
  return sr > 0 ? mp / sr : NaN;                                        // g per atom
}
function layAtoms(l) { const m = layMpa(l), L = S.lay[l]; return (m > 0 && L.mass > 0) ? L.mass * 1e-3 / m : NaN; }
function layThick(l) { const L = S.lay[l]; return (L.mass > 0 && L.dens > 0 && S.area > 0) ? L.mass * 1e-3 / (L.dens * S.area) * 1e4 : NaN; }
function layDens() {                                                    // default density: the element density when the layer is one element
  for (const l of ['front', 'back']) {
    const L = S.lay[l]; if (L.densUser) continue;
    const Zs = Array.from(new Set(S.comps.filter(c => layerOf(c) === l && c.tab).map(c => Math.floor(parseInt(c.tab.zaid, 10) / 1000))));
    L.dens = Zs.length === 1 && DENS[Zs[0]] ? DENS[Zs[0]] : NaN;
    const el = document.querySelector('.laybox [data-l="' + l + '"] [data-k="dens"]'); if (el && document.activeElement !== el) el.value = L.dens > 0 ? fmtField(L.dens) : '';
  }
  layInfo();
}
function layInfo() {
  Store.touch('target'); Store.flush();
  for (const l of ['front', 'back']) {
    const row = document.querySelector('.laybox [data-l="' + l + '"]'); if (!row) continue;
    const L = S.lay[l], th = layThick(l), nb = S.area > 0 && S.atoms > 0 ? S.comps.filter(c => layerOf(c) === l).reduce((a, c) => a + (c.eff || 0), 0) * S.atoms / S.area * 1e-24 : NaN;
    const el = row.querySelector('[data-k="info"]'), tin = row.querySelector('[data-k="thick"]'), ain = row.querySelector('[data-k="atoms"]'), na = layAtoms(l);
    if (tin && document.activeElement !== tin) tin.value = isFinite(th) ? fmtField(th) : '';
    if (ain && document.activeElement !== ain) ain.value = isFinite(na) ? na.toPrecision(5).replace(/\.?0+e/, 'e').replace('e+', 'e') : '';
    el.textContent = (isFinite(nb) && nb > 0 ? 'Areal density ' + sciTxt(nb, 3) + ' atoms/b' : '') + (L.dens > 0 ? '' : ' · enter a density to get the thickness (or the mass from a thickness)');
  }
}
function renderLayerBox() {
  for (const l of ['front', 'back']) {
    const host = $(l === 'front' ? 'layBoxFront' : 'layBoxBack'), L = S.lay[l];
    if (!S.layOn[l]) { host.innerHTML = ''; continue; }
    host.innerHTML = '<div data-l="' + l + '"><div class="row2">' +
      '<label class="fld"><span>Mass (mg)</span><input data-k="mass" type="number" step="any" min="0" value="' + fmtField(L.mass) + '"></label>' +
      '<label class="fld"><span>Number of atoms</span><input data-k="atoms" type="number" step="any" min="0" inputmode="decimal"></label>' +
      '<label class="fld"><span>Density (g/cm³)</span><input data-k="dens" type="number" step="any" min="0" value="' + (L.dens > 0 ? fmtField(L.dens) : '') + '"></label>' +
      '<label class="fld"><span>Thickness (µm)</span><input data-k="thick" type="number" step="any" min="0"></label></div><div class="hint" data-k="info" style="margin-top:6px"></div></div>';
  }
  layDens();
}
function layModal(open) {
  const m = $('layModal'); if (!m) return;
  m.hidden = !open; if (open) layModal.t = Date.now();
  if (open) { $('layModalTitle').textContent = 'Define the ' + LAYER_NAMES[S.tgtSel].toLowerCase(); const f = m.querySelector('.pane:not([hidden]) input'); if (f) f.focus(); }
}
const LAYER_NAMES = { win: 'Vacuum window + air', front: 'Front layer', sample: 'Sample', back: 'Sample backing' };
function layerName(c) { return LAYER_NAMES[layerOf(c)]; }
function compNum(c) { const l = layerOf(c); return S.comps.filter(x => layerOf(x) === l).indexOf(c) + (l === 'sample' ? 2 : 1); }
function renderComps() {
  for (const l of ['front', 'back']) if (S.comps.some(c => layerOf(c) === l)) S.layOn[l] = true;
  const html = c => {
    const i = S.comps.indexOf(c), sm = layerOf(c) === 'sample';
    return '<div class="comp" data-i="' + i + '"><div class="btns" style="margin-bottom:6px"><button class="btn" data-k="n" type="button">Isotope chart (nuclide table)</button></div><div class="row2">' +
      '<label class="fld"><span>Isotope ' + compNum(c) + ': find</span><input data-k="f" type="text" autocomplete="off" spellcheck="false" value="' + esc(c.filter) + '"></label>' +
      '<label class="fld"><span>' + (sm ? 'Atoms per primary atom' : 'Atoms per formula unit') + '</span><input data-k="r" type="number" step="any" min="0" value="' + c.ratio + '"></label></div>' +
      '<label class="fld"><span>Table</span><select data-k="i">' + compIsoHTML(c) + '</select></label>' +
      '<div class="fld"><span>Reactions to count (none ticked = shielding only)</span><div class="mtbox" data-k="m">' + compMtHTML(c) + '</div></div>' +
      '<div class="errline" role="alert">' + esc(c.err || '') + '</div>' +
      '<div class="btns"><button class="btn" data-k="c" type="button">Reset reaction selection</button><button class="btn" data-k="x" type="button">Remove</button></div></div>';
  };
  $('compList').innerHTML = S.comps.filter(c => layerOf(c) === 'sample').map(html).join('');
  $('compListFront').innerHTML = S.comps.filter(c => layerOf(c) === 'front').map(html).join('');
  $('compListBack').innerHTML = S.comps.filter(c => layerOf(c) === 'back').map(html).join('');
  renderLayerBox();
  Store.touch('comps'); Store.flush();                    // the views below redraw the panels, the target drawing and the experiment options
}
// Views of the layer structure: run once for the state keys they depend on (see core/store.js).
Store.view('layer-panels', ['layOn', 'tgtSel', 'comps'], () => {
  for (const l of ['win', 'front', 'back']) if (!S.layOn[l] && S.tgtSel === l) S.tgtSel = 'sample';
  if (!$('pnlFront')) return;
  $('pnlWin').hidden = !(S.layOn.win && S.tgtSel === 'win');
  if ($('layModalTitle') && !$('layModal').hidden) $('layModalTitle').textContent = 'Define the ' + LAYER_NAMES[S.tgtSel].toLowerCase();
  $('pnlFront').hidden = !(S.layOn.front && S.tgtSel === 'front'); $('pnlBack').hidden = !(S.layOn.back && S.tgtSel === 'back'); $('pnlSample').hidden = S.tgtSel !== 'sample';
});
Store.view('target-drawing', ['comps', 'layOn', 'tgtSel', 'lay', 'mass', 'tab', 'area', 'atoms', 'target'], () => { if ($('tgtTabs')) drawTarget(); });
Store.view('experiment-options', ['layOn', 'comps'], () => { if (typeof exLabels === 'function' && $('exSel')) exLabels(); });
function layerSummary(l) {
  if (l === 'win') { const w = S.lay.win, K = S.winPlan && S.winPlan.K; return winShort() + ' · ' + fmtField(w.thick) + ' µm' + (w.air.cm > 0 ? ' · air gap ' + fmtField(w.air.cm) + ' cm, ' + winNum(winAirDens(), 4) + ' g/cm³' : '') + (K ? ' · ' + K + ' K' : '') + ' · attenuation only'; }
  const names = S.comps.filter(c => layerOf(c) === l && c.tab).map(c => c.tab.label);
  if (l === 'sample') { names.unshift(S.tab ? S.tab.label : '–'); return names.join(' + ') + ' · ' + fmtField(S.mass) + ' mg'; }
  return (names.length ? names.join(' + ') : 'no isotope yet') + ' · ' + fmtField(S.lay[l].mass) + ' mg';
}
function drawTarget() {
  const W = { win: 14, front: 30, sample: 56, back: 30 }, X = { win: 46, front: 92, sample: 134, back: 202 }, NM = { win: 'Vacuum window + air', front: 'Front layer', sample: 'Sample', back: 'Backing' };
  let h = '<path class="beam" d="M8 56 H34 M28 50 L34 56 L28 62"/><text x="8" y="44">n</text>';
  for (const l of ['win', 'front', 'sample', 'back']) {
    const on = l === 'sample' || S.layOn[l], hh = 84, y = 56 - hh / 2, cx = X[l] + W[l] / 2;
    h += '<g class="tl ' + (on ? 'on' : '') + (l === 'sample' ? ' smp' : l === 'win' ? ' win' : '') + (S.tgtSel === l ? ' sel' : '') + '" data-l="' + l + '" tabindex="0" role="button" aria-label="' + NM[l] + (on ? '' : ' (off, click to add)') + '">' +
      '<rect class="lay" x="' + X[l] + '" y="' + y + '" width="' + W[l] + '" height="' + hh + '" rx="2"/>' +
      (l === 'win' ? '<text x="' + cx + '" y="108" text-anchor="middle">Vacuum</text><text x="' + cx + '" y="120" text-anchor="middle">window</text><text x="' + cx + '" y="132" text-anchor="middle">+ air</text>' : '<text x="' + cx + '" y="108" text-anchor="middle">' + NM[l] + '</text>') + (on ? '' : '<text x="' + cx + '" y="60" text-anchor="middle" style="font-size:16px">+</text>') + '</g>';
  }
  $('tgtSvg').innerHTML = h;
  $('tgtTabs').innerHTML = ['win', 'front', 'sample', 'back'].map(l => {
    const on = l === 'sample' || S.layOn[l];
    return '<div class="tb ' + (on ? '' : 'off ') + (S.tgtSel === l ? 'sel' : '') + '" data-l="' + l + '" role="tab" tabindex="0" aria-selected="' + (S.tgtSel === l) + '"><b>' + NM[l] + '</b><small>' + (on ? esc(layerSummary(l)) : '+ Add ' + NM[l].toLowerCase()) + '</small>' +
      (l !== 'sample' && on ? '<span class="x" data-x="1" title="Switch this layer off (its isotopes are kept)" aria-label="Switch ' + NM[l] + ' off">×</span>' : (l === 'sample' ? '<span class="x" title="The sample is always part of the target" style="cursor:default">🔒</span>' : '')) + '</div>';
  }).join('');
}
function selectLayer(l) {
  if (l !== 'sample' && !S.layOn[l]) { S.tgtSel = l; toggleLayer(l); return; }
  S.tgtSel = l; renderComps();
}
function toggleLayer(l) {
  if (l === 'win') {                                                    // the window has no isotopes: it is a material, only attenuating
    if (S.layOn.win) { S.layOn.win = false; if (S.tgtSel === 'win') S.tgtSel = 'sample'; }
    else { S.layOn.win = true; S.tgtSel = 'win'; }
    update(); return;
  }
  if (l === 'sample') return;
  if (S.layOn[l]) {
    if (S.tgtSel === l) S.tgtSel = 'sample';
    S.stash[l] = S.comps.filter(c => layerOf(c) === l);
    S.stash[l].forEach(c => { c.tok = (c.tok || 0) + 1; });
    S.comps = S.comps.filter(c => layerOf(c) !== l);
    S.layOn[l] = false;
  } else {
    S.layOn[l] = true; S.tgtSel = l;
    if (S.stash[l].length) { S.comps.push(...S.stash[l]); S.stash[l] = []; }
    else if (S.tables.length) { renderComps(); $(l === 'front' ? 'frontAdd' : 'holderAdd').click(); return; }
  }
  renderComps(); applyElementDensity(); update();
}
async function loadComp(c) {
  const my = c.tok = (c.tok || 0) + 1;
  try {
    const tab = await fetchTab(c.idx);
    if (my !== c.tok) return;
    c.tab = tab; c.err = ''; c.mts = [];
  } catch (e) {
    if (my !== c.tok) return;
    c.tab = null; c.err = tableProblem(S.tables[c.idx], e);
  }
  refreshComp(c);
  applyElementDensity();
  update();
}
function bindComps() {
  const addComp = layer => {
    if (!S.tables.length) { setStatus('aceStatus', 'Load a library first.', true); return; }
    const c = { filter: '', idx: S.tables[0] ? compShown({ filter: '' })[0] : -1, ratio: 1, tab: null, mts: [], err: '', layer };
    if (layer !== 'sample') S.layOn[layer] = true;
    S.comps.push(c);
    renderComps();
    applyElementDensity();
    loadComp(c);
  };
  $('compAdd').addEventListener('click', () => addComp('sample'));
  $('frontAdd').addEventListener('click', () => addComp('front'));
  $('holderAdd').addEventListener('click', () => addComp('back'));
  const pick = ev => {
    const g = ev.target.closest('[data-l]'); if (!g || !g.closest('#tgtSvg, #tgtTabs')) return;
    if (ev.target.closest('[data-x]')) { toggleLayer(g.dataset.l); return; }
    // The drawing is rebuilt after a click, so a native dblclick can miss; two clicks on the same layer within 450 ms open the window.
    const now = Date.now(), dbl = ev.type === 'click' && pick.l === g.dataset.l && now - pick.t < 450;
    pick.l = g.dataset.l; pick.t = dbl ? 0 : now;
    selectLayer(g.dataset.l);
    if (dbl) layModal(true);
  };
  pick.l = ''; pick.t = 0;
  $('tgtSvg').addEventListener('click', pick); $('tgtTabs').addEventListener('click', pick);
  const openLayer = ev => {
    const g = ev.target.closest('[data-l]'); if (!g || ev.target.closest('[data-x]')) return;
    selectLayer(g.dataset.l); layModal(true);
  };
  $('tgtSvg').addEventListener('dblclick', openLayer); $('tgtTabs').addEventListener('dblclick', openLayer);
  $('layModalClose').addEventListener('click', () => layModal(false));
  $('layModal').addEventListener('mousedown', ev => { if (ev.target === $('layModal') && Date.now() - layModal.t > 600) layModal(false); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('layModal').hidden && $('nuclWin').hidden) layModal(false); });
  for (const el of [$('tgtSvg'), $('tgtTabs')]) el.addEventListener('keydown', ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); pick(ev); } });
  const layIn = ev => {
    const row = ev.target.closest('[data-l]'); if (!row) return;
    const l = row.dataset.l, k = ev.target.dataset.k, L = S.lay[l], v = parseFloat(ev.target.value), q = d => row.querySelector('[data-k="' + d + '"]');
    if (k === 'mass') { L.mass = isFinite(v) && v >= 0 ? v : 0; const th = layThick(l); q('thick').value = isFinite(th) ? fmtField(th) : ''; }
    else if (k === 'atoms') { const m = layMpa(l); if (v > 0 && m > 0) { L.mass = v * m * 1e3; q('mass').value = fmtField(L.mass); const th = layThick(l); q('thick').value = isFinite(th) ? fmtField(th) : ''; } }
    else if (k === 'thick') { if (v > 0 && L.dens > 0 && S.area > 0) { L.mass = L.dens * S.area * v * 1e-4 * 1e3; q('mass').value = fmtField(L.mass); } }
    else if (k === 'dens') { L.dens = isFinite(v) && v > 0 ? v : NaN; L.densUser = true; const th = layThick(l); q('thick').value = isFinite(th) ? fmtField(th) : ''; }
    schedule();
  };
  $('layBoxFront').addEventListener('input', layIn); $('layBoxBack').addEventListener('input', layIn);
  const rowOf = ev => { const el = ev.target.closest('.comp'); return el ? S.comps[parseInt(el.dataset.i, 10)] : null; };
  const LS = ['compList', 'compListFront', 'compListBack'].map($);
  const on = (t, f) => LS.forEach(L => L.addEventListener(t, f));
  on('input', ev => {
    const c = rowOf(ev); if (!c) return;
    const k = ev.target.dataset.k;
    if (k === 'r') { const v = parseFloat(ev.target.value); c.ratio = isFinite(v) && v >= 0 ? v : 0; applyElementDensity(); schedule(); }
    else if (k === 'f') {
      c.filter = ev.target.value;
      const sh = compShown(c);
      if (sh.length) { c.idx = sh[0]; c.err = ''; } else { c.err = 'Isotope "' + c.filter.trim() + '" was not found in the loaded library.'; }
      refreshComp(c);
      if (sh.length) { clearTimeout(c.lt); c.lt = setTimeout(() => loadComp(c), 300); }
    }
  });
  on('change', ev => {
    const c = rowOf(ev); if (!c) return;
    const box = ev.target.closest('[data-k]');
    const k = box ? box.dataset.k : '';
    if (k === 'i') { c.idx = parseInt(ev.target.value, 10); loadComp(c); }
    else if (k === 'y') { c.layer = ev.target.value; renderComps(); applyElementDensity(); update(); }
    else if (k === 'm') { c.mts = Array.from(box.querySelectorAll('input:checked')).map(x => parseInt(x.value, 10)); update(); }
  });
  on('click', ev => {
    const c = rowOf(ev); if (!c) return;
    if (ev.target.closest('[data-k="n"]')) { NV.target = c; nuclTitle(); if ($('nuclWin').hidden) $('nuclOpen').click(); else nuclDraw(); return; }
    if (ev.target.closest('[data-k="c"]')) { c.mts = []; refreshComp(c); update(); return; }
    if (!ev.target.closest('[data-k="x"]')) return;
    c.tok = (c.tok || 0) + 1;
    S.comps.splice(S.comps.indexOf(c), 1);
    renderComps();
    applyElementDensity();
    update();
  });
}

// Background Monte Carlo run for the multiple-scattering correction (chunks of about 25 ms so the page stays responsive).
// one item recalculated for another fluence or without resolution; noMs = leave the multiple-scattering term out
function calcItem(it, F, sc, rp, noMs) {
  if (it.parts) return sumRes(it.parts.map(g => ({ res: calcItem(g, F, sc, rp, noMs), w: g.ratio })));
  return integrateR(it.rx, fluxOf(F), sc, S.emin, S.emax, it.self, S.nAtB, rp, noMs ? null : it.ms, it.pre);
}
function msStart(key, layIso, chList) {
  const LAYN = ['front', 'sample', 'back'];
  const layers = LAYN.map(l => ({ iso: layIso[l].map(o => ({ w: S.nAtB * o.r, A: o.tab.awr, kT: o.tab.temp, tot: o.tab.rxs.find(r => r.mt === 1), el: o.tab.rxs.find(r => r.mt === 2) || null })).filter(o => o.tot) }));
  const job = { layers, ch: chList.map(c => ({ layer: c.layer, w: S.nAtB * c.r, E: c.rx.E, xs: c.rx.xs })) };
  const allIso = [].concat(...layers.map(l => l.iso));
  const sigOf = E => { let v = 0; for (const o of allIso) v += o.w * interpLin(o.tot.E, o.tot.xs, E); return v; };
  const nodes = msNodes(allIso.map(o => o.tot.E), S.emin, S.emax, sigOf, 6000);
  const tok = ++S.msTok, N = nodes.length, Yc = chList.map(() => new Float64Array(N)), stat = $('msStat'), t0 = performance.now(), H = S.msN;
  S.msBusy = key;
  let i = 0;
  const step = () => {
    if (tok !== S.msTok) return;
    const t1 = performance.now();
    while (i < N && performance.now() - t1 < 25) { const y = msTally(job, nodes[i], H, 1234567 + i); for (let c = 0; c < y.length; c++) Yc[c][i] = y[c]; i++; }
    if (i < N) { stat.textContent = 'Multiple-scattering correction: computing ' + Math.round(100 * i / N) + ' % (' + N + ' energies × ' + H + ' histories)…'; setTimeout(step, 0); return; }
    const Y = {}; chList.forEach((c, k) => { Y[c.id] = Yc[k]; });
    S.msCache = { key, lnE: Float64Array.from(nodes, Math.log), Y, nodes: N, sec: (performance.now() - t0) / 1000 };
    S.msBusy = null;
    update();
  };
  stat.textContent = 'Multiple-scattering correction: computing…';
  setTimeout(step, 0);
}
function renderCompare(atoms) {
  const t = S.tab, rows = [];
  for (const F of FAC) {
    const mine = F.id === S.facId;
    const f = mine ? S.f : F.f, L = mine ? S.L : F.L;
    const r = calcItem(S.viewItem, F, (f / F.f) * Math.pow(F.L / L, 2), resParams(F));
    rows.push({ F, f, L, mine, pa: r.total, ps: r.total * atoms, pp: r.total * atoms / f });
  }
  const mx = Math.max.apply(null, rows.map(r => r.pa));
  $('cmp').innerHTML =
    '<thead><tr><th>Beam line</th><th class="n">per atom (1/s)</th><th class="n">in sample (1/s)</th><th class="n">per pulse</th><th>relative</th></tr></thead><tbody>' +
    rows.map(r => {
      const w = r.pa > 0 && mx > 0 ? Math.max(2, Math.min(100, 100 * (1 + Math.log10(r.pa / mx) / 6))) : 0;
      return '<tr class="' + (r.mine ? 'cur' : '') + '" style="--fc:' + r.F.color + '"><td><span class="sw' + (r.F.dash ? ' dash' : '') + '"></span> ' + esc(r.F.name) +
        '<div class="cfg">' + r.L + ' m · ' + fmtRep(r.f) + (r.F.cfg ? ' · ' + esc(r.F.cfg) : '') + (r.mine && (r.f !== r.F.f || r.L !== r.F.L) ? ' · your settings' : '') + '</div></td>' +
        '<td class="n">' + sci(r.pa, 3) + '</td><td class="n">' + sci(r.ps, 3) + '</td><td class="n">' + sci(r.pp, 3) + '</td>' +
        '<td><div class="bar"><i style="width:' + w + '%"></i></div></td></tr>';
    }).join('') + '</tbody>';
}

function renderDecades(atoms, res) {
  if (!res || !res.E.length || !(res.total > 0)) { $('dec').innerHTML = '<tbody><tr><td>No reactions in this window.</td></tr></tbody>'; return; }
  const kLo = Math.floor(Math.log10(S.emin) + 1e-9), kHi = Math.ceil(Math.log10(S.emax) - 1e-9);
  const rows = [];
  for (let k = kLo; k < kHi; k++) {
    const lo = Math.max(S.emin, Math.pow(10, k)), hi = Math.min(S.emax, Math.pow(10, k + 1));
    if (hi <= lo) continue;
    const share = (cumAt(res, hi) - cumAt(res, lo)) / res.total;
    rows.push({ lo, hi, share });
  }
  $('dec').innerHTML = '<thead><tr><th>Energy range</th><th class="n">share (%)</th><th class="n">in sample (1/s)</th><th class="n">reactions/pulse</th><th>&nbsp;</th></tr></thead><tbody>' +
    rows.map(r => '<tr><td>' + fmtEnergy(r.lo) + ' – ' + fmtEnergy(r.hi) + '</td><td class="n">' + (100 * r.share).toFixed(r.share < 0.001 ? 3 : 1) + ' %</td><td class="n">' + sci(r.share * res.total * atoms, 3) + '</td><td class="n">' + sci(r.share * res.total * atoms / S.f, 3) + '</td><td><div class="bar acc"><i style="width:' + Math.max(0, Math.min(100, 100 * r.share)) + '%"></i></div></td></tr>').join('') +
    '<tr><td><b>Total</b></td><td class="n">100 %</td><td class="n">' + sci(res.total * atoms, 3) + '</td><td class="n">' + sci(res.total * atoms / S.f, 3) + '</td><td></td></tr></tbody>';
}


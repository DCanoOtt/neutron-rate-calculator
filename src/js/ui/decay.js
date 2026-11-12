// ---------- Decay data (UI): library loader and the radioactivity table of every layer ----------
// Decay data are read from the ENDF/B-VIII.0 decay sublibrary (folder of dec-*.endf files) and/or the JEFF-4.0 decay file (one large
// file). Only the nuclides that are needed are read and parsed (and cached). For each layer the table gives, for every radioactive
// isotope selected, the activity and the alpha, beta- , beta+ and gamma particles emitted per second, and the sums.
S.dec = { dauOn: true, dauDays: null, age: null, ageU: 86400, ageUser: false, libs: [], sel: -1, tok: {}, keys: {} };
const DEC_YR = 365.25 * 86400;
const decLib = () => S.dec.libs[S.dec.sel] || null;
const decSym = Z => ELEMENTS[Z] || '';
const decName = (Z, A, liso) => decSym(Z) + '-' + A + (liso > 0 ? 'm' : '');
function decTime(s) {
  if (!(s > 0)) return '–';
  const g = v => String(parseFloat(v.toPrecision(3)));
  if (s < 60) return (s < 1e-3 ? sciTxt(s, 3) : g(s)) + ' s';
  if (s < 3600) return g(s / 60) + ' min';
  if (s < 86400) return g(s / 3600) + ' h';
  if (s < DEC_YR) return g(s / 86400) + ' d';
  const y = s / DEC_YR; return (y >= 1e4 ? sciTxt(y, 3) : g(y)) + ' y';
}
const decModes = y => (y.m || []).map(m => decModeName(m[0]) + ' ' + String(parseFloat((m[1] * 100).toPrecision(4))) + ' %').join(', ') || '–';
const decNumTxt = v => v > 0 ? sciTxt(v, 3) : '0';
// ---- record of one nuclide from a library: { y: yields per decay, s: spectra per decay } (cached; null when the library has no such nuclide) ----
async function decRecordOf(lib, Z, A, liso) {
  const key = Z * 1e6 + A * 10 + liso;
  if (lib.cache.has(key)) return lib.cache.get(key);
  let r = null;
  try {
    let lines = null;
    if (lib.kind === 'endf') {
      const f = lib.files.get(decFileName(Z, A, liso, decSym(Z)).toLowerCase());
      if (f) lines = (await f.text()).split('\n');
    } else {
      const q = lib.idx.get((Z * 1000 + A) * 10 + liso);
      if (q) lines = lib.text.slice(q[0], q[1]).split('\n');
    }
    const d = lines && decParse(lines);
    r = d ? { y: decYields(d), s: decSpectra(d) } : null;
  } catch (e) { r = null; }
  lib.cache.set(key, r);
  return r;
}
// ---- loading ----
function decStatus() {
  const L = S.dec.libs;
  $('decSelFld').hidden = L.length < 2;
  $('decLib').innerHTML = L.map((l, i) => '<option value="' + i + '"' + (i === S.dec.sel ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('');
  const l = decLib();
  setStatus('decStatus', l ? 'Decay data: ' + l.name + ' (' + l.n + ' nuclides' + (l.kind === 'endf' ? ', files read when needed' : '') + ').' : 'No decay data loaded: the layer windows show no activity.');
}
function decAdd(lib) {
  const i = S.dec.libs.findIndex(l => l.kind === lib.kind);
  if (i >= 0) S.dec.libs[i] = lib; else S.dec.libs.push(lib);
  S.dec.sel = S.dec.libs.indexOf(lib);
  const w = S.dec.libs.findIndex(l => l.name === S.dec.want); if (w >= 0) S.dec.sel = w;          // the library named in a loaded setup
  S.dec.keys = {}; decStatus(); decRenderAll();
}
async function decLoadFiles(files, label) {
  const endf = new Map(), big = [];
  for (const f of files) {
    if (/^dec-\d{3}_.*\.endf$/i.test(f.name)) endf.set(f.name.toLowerCase(), f);
    else if (f.size > 1e6 && !/\.(zip|gz|root|ace|db|png|pdf)$/i.test(f.name)) big.push(f);
  }
  let got = 0;
  if (endf.size) {
    const rel = (files.find(f => f.webkitRelativePath) || {}).webkitRelativePath || '';
    decAdd({ kind: 'endf', folder: label || '', name: (rel.split('/')[0] || label || 'ENDF decay files') + ' (ENDF)', files: endf, cache: new Map(), n: endf.size }); got++;
  }
  for (const f of big) {
    try { if (!/RADIOACTIVE DECAY/i.test(await f.slice(0, 2500).text())) continue; } catch (e) { continue; }
    setStatus('decStatus', 'Reading ' + f.name + '…');
    const text = new TextDecoder('latin1').decode(await f.arrayBuffer());
    if (!/RADIOACTIVE DECAY/i.test(text.slice(0, 2000))) continue;
    const idx = decIndexText(text);
    if (!idx.size) continue;
    const jm = /JEFF[-_ ]?\d+(\.\d+)?/i.exec(text.slice(0, 3000)) || /JEFF[-_ ]?\d+(\.\d+)?/i.exec(f.name);
    decAdd({ kind: 'jeff', folder: label || '', name: (jm ? jm[0].replace(/[_ ]/, '-') : f.name) + ' (single file)', text, idx, cache: new Map(), n: idx.size }); got++;
  }
  if (!got) setStatus('decStatus', 'No decay data found in the chosen folder: it must contain the dec-*.endf files (ENDF/B-VIII.0) or the JEFF-4.0 decay file.', true);
  return got;
}
// ---- the isotopes of a layer and their number of atoms ----
function decAdd1(map, Z, A, liso, atoms) {
  if (!(atoms > 0)) return;
  const k = Z + ':' + A + ':' + liso, o = map.get(k);
  if (o) o.atoms += atoms; else map.set(k, { Z, A, liso, atoms });
}
const DEC_SRC = { win: 'Vacuum window + air', front: 'Front layer', sample: 'Sample', back: 'Sample backing', target: 'Target (front layer + sample + backing)' };
const decN = () => Math.max(1, Math.round(parseFloat(($('exN') || {}).value) || 1));                // identical targets of the experiment simulation
const decSrcName = s => s === 'targets' ? 'All ' + decN() + ' targets together' : DEC_SRC[s];
function decItems(l) {
  const map = new Map();
  if (l === 'target' || l === 'targets') {                                // the three layers of one target, or of all the identical targets
    const f = l === 'targets' ? decN() : 1;
    for (const q of ['front', 'sample', 'back']) for (const o of decItems(q).items) decAdd1(map, o.Z, o.A, o.liso, o.atoms * f);
    return { items: Array.from(map.values()), area: true };
  }
  if (l === 'win') {
    const w = S.lay.win; if (!S.layOn.win || !(S.area > 0)) return { items: [], area: S.area > 0 };
    const comp = winComp(), air = winAirOn() ? winComposition('air') : null;
    const parts = [[comp, winNtot(winDens(), w.thick, comp && comp.Abar)]].concat(air ? [[air, winNtot(winAirDens(), w.air.cm * 1e4, air.Abar)]] : []);
    for (const [c, n] of parts) if (c && !c.error) for (const o of c.isos) decAdd1(map, o.Z, o.A, (o.Z === 73 && o.A === 180) ? 1 : 0, o.f * n * 1e24 * S.area);   // natural 180Ta is the isomer
    return { items: Array.from(map.values()), area: true };
  }
  if (!S.tab || !(S.atoms > 0)) return { items: [], area: true };
  if ((l === 'front' && !S.layOn.front) || (l === 'back' && !S.layOn.back)) return { items: [], area: true };
  const add = (tab, n) => { const z = decZaid(parseInt(tab.zaid, 10)); decAdd1(map, z.Z, z.A, z.liso, n); };
  if (l === 'sample') add(S.tab, S.atoms);
  for (const c of S.comps) if (layerOf(c) === l && c.tab && c.eff > 0) add(c.tab, c.eff * S.atoms);
  return { items: Array.from(map.values()), area: true };
}
// ---- analysis of one source (a layer, one target, all targets): rates of its radioactive isotopes and which radiations it emits ----
async function decAnalyze(src) {
  const lib = decLib(), { items, area } = decItems(src);
  const an = { src, lib, items, area, rows: [], stable: [], none: [], list: [], kinds: {}, tot: { A: 0, a: 0, bm: 0, bp: 0, g: 0, tot: 0 }, state: !items.length ? 'noitems' : !lib ? 'nolib' : 'ok' };
  if (an.state !== 'ok') return an;
  const recs = await Promise.all(items.map(o => decRecordOf(lib, o.Z, o.A, o.liso)));
  items.forEach((o, i) => {
    const r = recs[i], nm = decName(o.Z, o.A, o.liso);
    if (!r) an.none.push(nm); else if (r.y.stable) an.stable.push(nm);
    else { const rt = decRates(r.y, o.atoms); an.rows.push({ o, y: r.y, nm, r: rt }); an.list.push({ s: r.s, A: rt.A, nm }); }
  });
  an.rows.sort((p, q) => q.r.A - p.r.A);
  if (S.dec.dauOn && an.rows.length) {                                  // short-lived daughters in (transient) equilibrium with their parent
    const out = [], age = S.dec.age, limitOf = root => S.dec.dauDays >= 0 && S.dec.dauDays !== null ? S.dec.dauDays * 86400 : decAutoLimit(root.y.T);       // user limit, or automatic from the half-life of the initial isotope
    const walk = async (x, depth, maxT) => {
      out.push(x); if (depth >= 5) return;
      for (const d of decDaughters(x.y, x.o.Z, x.o.A)) {
        const r = await decRecordOf(lib, d.Z, d.A, d.liso); if (!r || r.y.stable || !(r.y.T <= maxT)) continue;
        const Ad = decEquil(x.r.A, x.y.T, d.br, r.y.T); if (!(Ad > 0)) continue;
        const atoms = Ad * r.y.T / Math.LN2, nm = decName(d.Z, d.A, d.liso);
        await walk({ o: { Z: d.Z, A: d.A, liso: d.liso, atoms }, y: r.y, nm, r: decRates(r.y, atoms), from: x.nm, depth: depth + 1, s: r.s }, depth + 1, maxT);
      }
    };
    const walkT = async (x, depth, root) => {                           // time after preparation: Bateman solution along the chain, all daughters
      out.push(x); if (depth >= 8) return;
      for (const d of decDaughters(x.y, x.o.Z, x.o.A)) {
        const r = await decRecordOf(lib, d.Z, d.A, d.liso); if (!r || r.y.stable || !(r.y.T > 0)) continue;
        const lams = x.path.lams.concat(Math.LN2 / r.y.T), brs = x.path.brs.concat(d.br), atoms = decBateman(lams, brs, x.path.N0, age), rt = decRates(r.y, atoms);
        if (!(rt.A > 1e-6 * root.r.A)) continue;
        await walkT({ o: { Z: d.Z, A: d.A, liso: d.liso, atoms }, y: r.y, nm: decName(d.Z, d.A, d.liso), r: rt, from: x.nm, depth: depth + 1, s: r.s, path: { lams, brs, N0: x.path.N0 } }, depth + 1, root);
      }
    };
    if (age !== null) for (const x of an.rows) { const l0 = Math.LN2 / x.y.T; x.path = { lams: [l0], brs: [1], N0: x.o.atoms * Math.exp(l0 * age) }; await walkT(x, 0, x); }
    else for (const x of an.rows) await walk(x, 0, limitOf(x));
    an.rows = out;
    for (const x of an.rows) if (x.from) an.list.push({ s: x.s, A: x.r.A, nm: x.nm + ' (from ' + x.from + ')' });
  }
  for (const x of an.rows) for (const k in an.tot) an.tot[k] += x.r[k];
  for (const k of Object.keys(SPC)) an.kinds[k] = SPC[k].curves.some(([c]) => an.list.some(it => { const t = it.s[c]; return t && (t.lines.length || t.br.length || t.tab); }));
  return an;
}
function decTableHTML(an, title) {
  const rows = an.rows, tot = an.tot, MAXR = 14, shown = rows.slice(0, MAXR);
  // only the emission columns that apply to the isotopes of this source (alpha, beta-, beta+ / EC, gamma); the total is always shown
  const COLS = [['a', 'α'], ['bm', 'β⁻'], ['bp', 'β⁺'], ['g', 'γ']].filter(c => rows.some(x => x.r[c[0]] > 0));
  const nc = 5 + COLS.length;
  const num = v => '<td class="n">' + decNumTxt(v) + '</td>';
  const tr = x => '<tr><td>' + (x.from ? '<span class="dau">↳ ' + esc(x.nm) + '</span> <span class="hint">from ' + esc(x.from) + '</span>' : '<b>' + esc(x.nm) + '</b>') + '</td><td class="n">' + sciTxt(x.o.atoms, 3) + '</td><td class="n">' + decTime(x.y.T) + '</td><td>' + esc(decModes(x.y)) + '</td>' + num(x.r.A) + COLS.map(c => num(x.r[c[0]])).join('') + num(x.r.tot) + '</tr>';
  let h = '<div class="dechead">Radioactivity of ' + esc(title) + ' <span class="hint">(' + esc(an.lib.name) + ')</span></div>';
  if (rows.length) {
    h += '<div class="wtw"><table class="t dectab"><thead><tr><th>Isotope</th><th class="n">Atoms</th><th class="n">T½</th><th>Decay mode</th><th class="n">Activity (Bq)</th>' + COLS.map(c => '<th class="n">' + c[1] + ' (1/s)</th>').join('') + '<th class="n">Total (1/s)</th></tr></thead><tbody>' +
      shown.map(tr).join('') + (rows.length > MAXR ? '<tr><td colspan="' + nc + '" class="hint">+ ' + (rows.length - MAXR) + ' more radioactive isotopes with lower activity (included in the total)</td></tr>' : '') +
      '<tr class="dectot"><td><b>Total</b></td><td></td><td></td><td></td>' + num(tot.A) + COLS.map(c => num(tot[c[0]])).join('') + num(tot.tot) + '</tr></tbody></table></div>';
  } else h += '<div class="hint">None of the isotopes of this layer is radioactive in these decay data: no emission.</div>';
  h += '<div class="hint">' + (an.stable.length ? 'Stable: ' + esc(an.stable.join(', ')) + '. ' : '') + (an.none.length ? 'Not in the decay data: ' + esc(an.none.join(', ')) + '. ' : '') +
    'Rates are particles emitted per second' + (S.dec.dauOn && S.dec.age !== null ? ', including the daughters marked ↳ grown in during ' + decTime(S.dec.age) + ' after the preparation of the source (Bateman equations; the atoms of the parent are those now, at the time of the measurement)' : S.dec.dauOn ? ', including the short-lived daughters marked ↳ (half-life shorter than the parent and at most ' + (S.dec.dauDays !== null && S.dec.dauDays >= 0 ? decTime(S.dec.dauDays * 86400) + ', set by you' : 'the smaller of a tenth of the half-life of the initial isotope and 30 d, automatic') + '), taken in transient equilibrium with their parent: activity = parent × branching ratio × λd/(λd − λp), so their atoms are the equilibrium atoms' : ', for the decays of the listed isotopes themselves (the decay products are not followed)') + '; nothing is absorbed or self-shielded; the total is the sum of the columns shown (α, β⁻, β⁺ and γ; a column appears only if some isotope emits that radiation). Electron capture, conversion and Auger electrons, X rays and annihilation photons are not counted in the table.</div>';
  return h;
}
// spectra buttons of a source: only the radiations that it emits
function decSpcButtons(an) {
  const ks = Object.keys(SPC).filter(k => an.kinds[k]); if (!ks.length) return '';
  return '<div class="btns"><span class="hint">Emission spectra</span>' + ks.map(k => '<button class="btn" type="button" data-spc="' + k + '" data-src="' + an.src + '">' + SPC[k].short + ' spectra</button>').join('') + '</div>';
}
// ---- the table in the window of a layer ----
async function decRender(l) {
  const box = $('decBox_' + l); if (!box) return;
  const lib = decLib(), { items, area } = decItems(l);
  const key = [lib ? S.dec.sel + lib.name : '', area, S.dec.dauOn, S.dec.dauDays, S.dec.age, items.map(o => o.Z + ':' + o.A + ':' + o.liso + ':' + o.atoms.toPrecision(8)).join(',')].join('|');
  if (S.dec.keys[l] === key) return;
  S.dec.keys[l] = key;
  if (!items.length) { box.innerHTML = l === 'win' && S.layOn.win && !area ? '<div class="hint">Set the beam spot radius (Target definition) to get the number of atoms in the window and the air.</div>' : ''; return; }
  if (!lib) { box.innerHTML = '<div class="decnote">Radioactivity: load decay data (ENDF/B-VIII.0 folder or JEFF-4.0 file) in the <i>Nuclear data</i> panel to see the activity and the alpha, beta and gamma emission of the isotopes of this layer.</div>'; return; }
  const my = S.dec.tok[l] = (S.dec.tok[l] || 0) + 1;
  const an = await decAnalyze(l); if (my !== S.dec.tok[l]) return;
  box.innerHTML = decTableHTML(an, 'this layer') + decSpcButtons(an);
}
// ---- the sources shown in the "decay data" window: window + air, the layers, the target and, with several targets, all of them ----
async function decShownSources() {
  const srcs = ['win', 'front', 'sample', 'back', 'target'].concat(decN() > 1 ? ['targets'] : []);
  const ans = await Promise.all(srcs.map(decAnalyze));
  const nLay = ['front', 'sample', 'back'].filter(q => ans[srcs.indexOf(q)].rows.length).length;
  return ans.filter(a => a.rows.length && !(a.src === 'target' && nLay < 2));              // the target total only adds something with two or more radioactive layers
}
async function decViewRender() {
  const box = $('decViewBody'), my = S.dec.vtok = (S.dec.vtok || 0) + 1, lib = decLib();
  if (!lib) { box.innerHTML = '<div class="decnote">Load decay data in the <i>Nuclear data</i> panel to see the radioactivity of the target.</div>'; return; }
  const list = await decShownSources(); if (my !== S.dec.vtok) return;
  const N = decN();
  if (!list.length) { box.innerHTML = '<div class="hint">No radioactive isotope in the vacuum window + air, the front layer, the sample or the backing in these decay data' + (S.layOn.win && !(S.area > 0) ? ' (set the beam spot radius to include the window and the air)' : '') + '.</div>'; return; }
  box.innerHTML = (N > 1 ? '<div class="hint">The experiment has ' + N + ' identical targets: the layers and the target are given for one target; the last block is all ' + N + ' targets together. The window and the air are in front of the first target and counted once.</div>' : '') +
    list.map(a => '<div class="decsec"><h3>' + esc(decSrcName(a.src) + (N > 1 && ['front', 'sample', 'back', 'target'].includes(a.src) ? ' – one target' : '')) + '</h3>' + decTableHTML(a, decSrcName(a.src)) + decSpcButtons(a) + '</div>').join('');
}
// default time after the preparation: 7 half-lives of the initial isotope (the radioactive isotope with the highest activity), in the unit of its half-life
async function decAgeAuto() {
  if (S.dec.ageUser) return;
  const lib = decLib(); let best = null;
  if (lib) for (const l of ['sample', 'front', 'back', 'win']) for (const o of decItems(l).items) {
    const r = await decRecordOf(lib, o.Z, o.A, o.liso); if (!r || r.y.stable || !(r.y.T > 0)) continue;
    const A = decRates(r.y, o.atoms).A; if (!best || A > best.A) best = { A, T: r.y.T };
  }
  if (!best) { S.dec.age = null; decAgeFields(); return; }
  const U = [1, 60, 3600, 86400, DEC_YR], u = U.filter(v => best.T >= v).pop() || 1;
  S.dec.age = 7 * best.T; S.dec.ageU = u; decAgeFields();
}
function decAgeFields() { $('decAge').value = S.dec.age === null ? '' : +(S.dec.age / S.dec.ageU).toPrecision(4); $('decAgeU').value = String(S.dec.ageU); decAgeNote(); }
async function decRenderAll() { await decAgeAuto(); ['sample', 'front', 'back', 'win'].forEach(decRender); if (!$('decModal').hidden) decViewRender(); if (!$('spcModal').hidden) spcRender(); }
function decBind() {
  decStatus(); spcBind(); decSaveBind();
  $('decLib').addEventListener('change', e => { S.dec.sel = parseInt(e.target.value, 10); S.dec.keys = {}; decStatus(); decRenderAll(); });
  const run = async (files, label) => { try { await decLoadFiles(files, label); } catch (e) { setStatus('decStatus', 'Could not read the decay data: ' + ((e && e.message) || e), true); } };
  $('decLoad').addEventListener('click', async () => {
    let h = null;
    if (window.showDirectoryPicker) {
      let start = null; try { const rec = await LibStore.get(); start = rec && rec.handle; } catch (e) { }          // the dialog opens in the library folder
      try { h = await window.showDirectoryPicker(start ? { mode: 'read', startIn: start } : { mode: 'read' }); } catch (e) { if (e && e.name === 'AbortError') return; try { h = await window.showDirectoryPicker({ mode: 'read' }); } catch (e2) { if (e2 && e2.name === 'AbortError') return; h = null; } }
    }
    if (!h) { $('decDirInput').click(); return; }
    try { await LibStore.set({ handle: h, name: h.name }, 'decdir'); } catch (e) { }
    setStatus('decStatus', 'Reading the folder "' + h.name + '"…');
    await run(await dirFiles(h, h.name + '/', []), h.name);
  });
  $('decDirInput').addEventListener('change', e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) run(f); });
  const dauSet = () => { S.dec.dauOn = $('decDau').checked; const d = parseFloat($('decDauT').value); S.dec.dauDays = $('decDauT').value.trim() !== '' && d >= 0 ? d : null; $('decDauT').disabled = !S.dec.dauOn; decAgeNote(); S.dec.keys = {}; decRenderAll(); };
  const ageSet = () => { const v = $('decAge').value.trim(), x = parseFloat(v); S.dec.ageU = parseFloat($('decAgeU').value) || 86400; S.dec.age = v !== '' && x >= 0 ? x * S.dec.ageU : null; S.dec.ageUser = true; decAgeNote(); S.dec.keys = {}; decRenderAll(); };
  $('decAge').addEventListener('input', ageSet); $('decAgeU').addEventListener('change', ageSet);
  $('decAgeDef').addEventListener('click', () => { S.dec.ageUser = false; S.dec.keys = {}; decRenderAll(); });
  decDauSync();
  $('decDau').addEventListener('change', dauSet); $('decDauT').addEventListener('change', dauSet);
  const showDec = async () => { await decAgeAuto(); $('decModal').hidden = false; decViewRender(); };
  $('decShow').addEventListener('click', showDec);
  if ($('exDecay')) $('exDecay').addEventListener('click', showDec);
  $('decModalClose').addEventListener('click', () => { $('decModal').hidden = true; });
  $('decModal').addEventListener('mousedown', ev => { if (ev.target === $('decModal')) $('decModal').hidden = true; });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('decModal').hidden) { $('decModal').hidden = true; ev.stopImmediatePropagation(); } }, true);
  $('decReload').addEventListener('click', async () => { await decRestore(true); });
}
// Chrome / Edge: reload the decay data chosen earlier (the browser may ask for permission once per visit).
async function decRestore(user) {
  let need = false;
  for (const k of ['decdir']) {
    try {
      const rec = await LibStore.get(k); if (!rec || !rec.handle) continue;
      let pm = await rec.handle.queryPermission({ mode: 'read' });
      if (pm !== 'granted' && user) pm = await rec.handle.requestPermission({ mode: 'read' });
      if (pm !== 'granted') { need = true; continue; }
      setStatus('decStatus', 'Reading the saved decay data "' + rec.name + '"…');
      if (k === 'decdir') await decLoadFiles(await dirFiles(rec.handle, rec.name + '/', []), rec.name);
      else await decLoadFiles([await rec.handle.getFile()], rec.name);
    } catch (e) { }
  }
  $('decReload').hidden = !need || S.dec.libs.length > 1;
}

// ================= Emission spectra of the sample (alpha, beta, gamma + X ray, conversion electrons) =================
// The decays per second of each isotope of the sample (N ln2 / T½) times the spectrum per decay of the decay data. Discrete lines are put
// into energy bins; beta spectra are calculated from the end-point energies and intensities of the decay data with the allowed Fermi shape.
const SPC = {
  a:  { name: 'Alpha spectrum', short: 'α', curves: [['a', 'α']], x: 'Alpha energy (keV)' },
  b:  { name: 'Beta spectrum (β⁻ and β⁺)', short: 'β⁻/β⁺', curves: [['bm', 'β⁻'], ['bp', 'β⁺']], x: 'Beta kinetic energy (keV)' },
  g:  { name: 'Gamma-ray + X-ray spectrum', short: 'γ + X', curves: [['g', 'γ + X rays']], x: 'Photon energy (keV)' },
  ce: { name: 'Conversion + Auger electron spectrum', short: 'conversion e⁻', curves: [['ce', 'e⁻']], x: 'Electron energy (keV)' }
};
S.spc = { hidden: {}, kind: 'a', src: 'sample', bin: {}, fwhm: {}, range: {}, log: true, data: null, tok: 0 };
const spcRK = () => S.spc.src + ':' + S.spc.kind;
const decE = v => Number(v).toExponential(5);
const decAscii = t => String(t).replace(/ε\/β⁺/g, 'EC/beta+').replace(/β⁻/g, 'beta-').replace(/β⁺/g, 'beta+').replace(/α/g, 'alpha').replace(/γ/g, 'gamma').replace(/e⁻/g, 'e-').replace(/⁻/g, '-').replace(/[^\x20-\x7e]/g, '?');
const spcW = v => String(parseFloat(v.toPrecision(3)));
const spcNice = v => { const m = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(q => q * m).find(q => q >= v * 0.999) || v; };
async function spcData(kind, src) {
  src = src || 'sample';
  const an = await decAnalyze(src);
  if (an.state === 'nolib') return { err: 'Load decay data (Nuclear data panel) to calculate emission spectra.' };
  if (an.state === 'noitems') return { err: 'No atoms in ' + decSrcName(src) + ' (enter the mass, and the beam spot radius for the window).' };
  if (!an.rows.length) return { err: 'No isotope of ' + decSrcName(src) + ' is radioactive in these decay data.' };
  const list = an.list;
  const C = SPC[kind], keys = C.curves.map(c => c[0]);
  const em = Math.max(0, ...keys.map(k => decEmax(list, k)));
  if (!(em > 0)) return { err: 'The radioactive isotopes of ' + decSrcName(src) + ' emit no ' + C.short + ' radiation in these decay data.' };
  const fwhm = S.spc.fwhm[kind] > 0 ? S.spc.fwhm[kind] : 0, sig = decSigma('abs', fwhm);          // constant Gaussian energy resolution (FWHM in keV)
  const span = em * 1.04 + (fwhm > 0 ? 3 * fwhm : 0), user = S.spc.bin[kind];
  const w = Math.max(user > 0 ? user : spcNice(Math.min(span / 400, fwhm > 0 ? fwhm / 4 : Infinity)), span / 5000), nb = Math.max(1, Math.ceil(span / w));
  const MAXC = 10, comps = [];                                           // one curve per isotope (and per component), the ten strongest, the rest lumped, then the sum of all
  for (const it of list) for (const [k, cn] of C.curves) { const r = decHist([it], k, w, nb, sig); let tot = 0; for (const v of r.h) tot += v; if (tot > 0) comps.push({ it, k, cn, h: r.h, tot }); }
  const curves = [], sumH = new Float64Array(nb); let sumT = 0;
  for (const c of comps) { for (let i = 0; i < nb; i++) sumH[i] += c.h[i]; sumT += c.tot; }
  comps.sort((p, q) => q.tot - p.tot);
  const used = new Map();
  comps.slice(0, MAXC).forEach(c => {
    let nm = c.it.nm.replace(/ \(from .*\)$/, '') + (C.curves.length > 1 ? ' ' + c.cn : ''); const n = (used.get(nm) || 0) + 1; used.set(nm, n); if (n > 1) nm += ' #' + n;
    curves.push({ k: c.k, id: nm.replace(/[^A-Za-z0-9]+/g, '_'), nm, h: c.h, tot: c.tot, kind: 'iso' });
  });
  if (comps.length > MAXC) { const h = new Float64Array(nb); let tot = 0; for (const c of comps.slice(MAXC)) { for (let i = 0; i < nb; i++) h[i] += c.h[i]; tot += c.tot; } curves.push({ k: 'other', id: 'other', nm: 'Other (' + (comps.length - MAXC) + ')', h, tot, kind: 'iso' }); }
  if (comps.length > 1) curves.push({ k: 'sum', id: 'total', nm: 'Total', h: sumH, tot: sumT, kind: 'sum' });
  const edges = Float64Array.from({ length: nb + 1 }, (_, i) => i * w);
  const rows = [];                                                      // discrete lines and beta end-points, with their rate
  for (const it of list) for (const [k, nm] of C.curves) { const t = it.s[k]; if (!t) continue; for (const l of t.lines) rows.push({ nm: it.nm, c: nm, E: l.E, r: it.A * l.I }); for (const b of t.br) rows.push({ nm: it.nm, c: nm, E: b.Emax, r: it.A * b.I, ep: true }); }
  rows.sort((p, q) => q.r - p.r);
  const xmax = edges[nb], rg0 = S.spc.range[src + ':' + kind], range = rg0 && rg0[1] > rg0[0] && rg0[0] < xmax ? [Math.max(0, rg0[0]), Math.min(xmax, rg0[1])] : null;
  return { kind, src, srcName: decSrcName(src), C, edges, w, nb, fwhm, range, curves, rows, lib: an.lib.name, sample: S.tab ? S.tab.label : '' };
}
function spcTicks(lo, hi, n) { const st = spcNice((hi - lo) / n), t = []; for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + st * 1e-9; v += st) t.push(+v.toPrecision(12)); return t; }
function spcSVG(D, log) {
  const W = 640, L = 72, R = 14, B = 44, xa = D.range ? D.range[0] : 0, xb = D.range ? D.range[1] : D.edges[D.nb];
  let lx = L, ly = 17, rows = 1;                                         // legend: isotopes (wrapping rows), then the resolution
  for (const c of D.curves) { const w = 30 + c.nm.length * 6.3 + 12; if (lx + w > W - R && lx > L) { lx = L; rows++; } lx += w; }
  const T = 22 + rows * 15 + 12, H = 306 + T;
  lx = L;
  let ymax = 0, ymin = Infinity;                                       // the y axis follows the bins inside the selected energy range
  const hid = c => !!S.spc.hidden[D.src + ':' + D.kind + ':' + c.id], vis = D.curves.filter(c => !hid(c));
  for (const c of vis) for (let i = 0; i < D.nb; i++) { const v = c.h[i]; if (v > 0 && D.edges[i + 1] > xa && D.edges[i] < xb) { if (v > ymax) ymax = v; if (v < ymin) ymin = v; } }
  if (!(ymax > 0)) { ymax = 1; ymin = 0.1; }
  let y0, y1;
  if (log) { y1 = Math.ceil(Math.log10(ymax) - 1e-9); y0 = Math.max(Math.floor(Math.log10(ymin)), y1 - 8); if (y1 - y0 < 2) y0 = y1 - 2; } else { y0 = 0; y1 = ymax * 1.06; }
  const X = e => L + (e - xa) / (xb - xa) * (W - L - R), Y = v => T + (1 - ((log ? Math.log10(Math.max(v, Math.pow(10, y0))) : v) - y0) / (y1 - y0)) * (H - T - B), yb = T + (H - T - B);
  let g = '';
  for (const t of spcTicks(xa, xb, 7)) g += '<line class="gl" x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + yb + '"/><text x="' + X(t) + '" y="' + (yb + 15) + '" text-anchor="middle">' + (t >= 1e5 ? sciTxt(t, 2) : String(t)) + '</text>';
  if (log) for (let d = y0; d <= y1; d++) g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(Math.pow(10, d)) + '" y2="' + Y(Math.pow(10, d)) + '"/><text x="' + (L - 6) + '" y="' + (Y(Math.pow(10, d)) + 4) + '" text-anchor="end">1e' + d + '</text>';
  else for (const t of spcTicks(0, y1, 5)) g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text x="' + (L - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + (t === 0 ? '0' : sciTxt(t, 2)) + '</text>';
  const PAL = ['#1f77b4', '#d9731a', '#2a9d57', '#c0392b', '#8e5ab5', '#9c6b3f', '#d1568f', '#6b7280', '#b5a000', '#17a2b8', '#4c6ef5', '#e67e22'];
  const colOf = (c, ci) => c.kind === 'sum' ? 'var(--ink)' : PAL[ci % PAL.length];
  const lo = log ? Math.pow(10, y0) : 0;
  const order = D.curves.map((c, ci) => ({ c, ci })).filter(o => !hid(o.c)).sort((p, q) => (q.c.kind === 'sum') - (p.c.kind === 'sum'));                       // the sum is drawn first (filled), the isotopes on top
  for (const { c, ci } of order) {
    let area = '', line = '', prev = -2;
    for (let i = 0; i < D.nb; i++) {
      const v = c.h[i]; if (!(v > lo) || D.edges[i + 1] <= xa || D.edges[i] >= xb) continue;
      const p0 = Math.max(X(D.edges[i]), L), p1 = Math.min(Math.max(X(D.edges[i + 1]), p0 + 0.8), W - R), yv = Y(v).toFixed(1);
      if (prev === i - 1) line += 'V' + yv + 'H' + p1.toFixed(1); else line += (prev >= 0 ? 'V' + yb : '') + 'M' + p0.toFixed(1) + ' ' + yb + 'V' + yv + 'H' + p1.toFixed(1);
      prev = i;
      if (c.kind === 'sum') area += 'M' + p0.toFixed(1) + ' ' + yb + 'V' + yv + 'H' + p1.toFixed(1) + 'V' + yb;
    }
    if (prev >= 0) line += 'V' + yb;
    if (c.kind === 'sum') g += '<path d="' + area + '" fill="var(--ink)" fill-opacity=".14" stroke="none"/>';
    g += '<path d="' + line + '" fill="none" stroke="' + colOf(c, ci) + '" stroke-width="' + (c.kind === 'sum' ? 1.8 : 1.3) + '" stroke-linejoin="round"/>';
  }
  const lg = D.curves.map((c, ci) => { const w = 30 + c.nm.length * 6.3 + 12; if (lx + w > W - R && lx > L) { lx = L; ly += 15; } const x = lx; lx += w; const off = hid(c);
    return '<g class="lgi" data-id="' + esc(c.id) + '" opacity="' + (off ? 0.35 : 1) + '"><title>' + (off ? 'Click to show ' : 'Click to hide ') + esc(c.nm) + '</title><rect x="' + (x - 3) + '" y="' + (ly - 12) + '" width="' + (w - 6) + '" height="15" fill="transparent"/><line x1="' + x + '" x2="' + (x + 18) + '" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" stroke="' + colOf(c, ci) + '" stroke-width="' + (c.kind === 'sum' ? 2.4 : 1.8) + '"/><text x="' + (x + 23) + '" y="' + ly + '"' + (off ? ' text-decoration="line-through"' : '') + '>' + esc(c.nm) + '</text></g>'; }).join('');
  const rs = '<text x="' + L + '" y="' + (ly + 15) + '">' + (D.fwhm > 0 ? 'Energy resolution: Gaussian, FWHM ' + spcW(D.fwhm) + ' keV' : 'Energy resolution: none') + '</text>';
  return '<svg class="spc" data-t="' + T + '" data-h="' + H + '" data-b="' + B + '" data-xa="' + xa + '" data-xb="' + xb + '" data-l="' + L + '" data-r="' + R + '" data-w="' + W + '" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(D.C.name) + '">' + g + lg + rs +
    '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(D.C.x) + '</text><text transform="translate(13 ' + (T + (H - T - B) / 2) + ') rotate(-90)" text-anchor="middle">Emission rate per ' + spcW(D.w) + ' keV bin (1/s)</text></svg>';
}
const spcInfoLines = D => [D.C.name + ' – ' + D.srcName, 'Sample: ' + (D.sample || '?') + ' · radioactive isotopes of: ' + D.srcName + (S.dec.dauOn ? ' (with short-lived daughters in equilibrium)' : ' (decay products not followed)'), 'Decay data: ' + D.lib + ' · bin width ' + spcW(D.w) + ' keV' + (D.fwhm > 0 ? ' · Gaussian energy resolution FWHM ' + spcW(D.fwhm) + ' keV' : ' · no energy resolution') + (D.range ? ' · range ' + spcW(D.range[0]) + ' to ' + spcW(D.range[1]) + ' keV' : '')];
function spcText(D) {
  const L = ['# ' + decAscii(D.C.name) + ' - ' + decAscii(D.srcName), '# Sample: ' + D.sample + ' - decay data: ' + D.lib, '# Emission per second inside the sample' + (S.dec.dauOn ? ' (with short-lived daughters in equilibrium); curves: one per isotope, then the total.' : '; decay products are not followed; curves: one per isotope, then the total.'), '# Part 1: discrete lines and beta end-points (isotope, component, energy [keV], emission rate [1/s])'];
  for (const r of D.rows) L.push([r.nm, decAscii(r.c) + (r.ep ? '_end-point' : ''), decE(r.E), decE(r.r)].join('  '));
  L.push('# Part 2: histogram' + (D.fwhm > 0 ? ' folded with a Gaussian of FWHM ' + spcW(D.fwhm) + ' keV' : '') + ', bin width ' + spcW(D.w) + ' keV. Columns: bin low edge [keV], bin high edge [keV], ' + D.curves.map(c => decAscii(c.nm) + ' rate [1/s]').join(', '));
  for (let i = 0; i < D.nb; i++) L.push([decE(D.edges[i]), decE(D.edges[i + 1])].concat(D.curves.map(c => decE(c.h[i]))).join('  '));
  return L.join('\n') + '\n';
}
function spcHistos(D) {
  const info = asciiName(spcInfoLines(D).slice(1).join(' | '));
  return D.curves.map(c => ({ name: 'spec_' + D.src + '_' + D.kind + '_' + c.id, title: asciiName(D.C.name + ' ' + c.nm) + ' | ' + info, xt: asciiName(D.C.x), yt: 'emission rate per bin (1/s)', edges: D.edges, vals: c.h }));
}
function zipFiles(files) {                                              // several files, stored without compression
  const enc = new TextEncoder(), loc = [], cen = []; let off = 0;
  const t = new Date(), dosT = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1), dosD = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  for (const f of files) {
    const nb = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, dosT, true); lh.setUint16(12, dosD, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, nb.length, true);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, dosT, true); ch.setUint16(14, dosD, true); ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    loc.push(lh.buffer, nb, f.data); cen.push(ch.buffer, nb); off += 30 + nb.length + n;
  }
  let cl = 0; for (const f of files) cl += 46 + enc.encode(f.name).length;
  const ed = new DataView(new ArrayBuffer(22)); ed.setUint32(0, 0x06054b50, true); ed.setUint16(8, files.length, true); ed.setUint16(10, files.length, true); ed.setUint32(12, cl, true); ed.setUint32(16, off, true);
  return new Blob(loc.concat(cen, [ed.buffer]), { type: 'application/zip' });
}
async function spcDownloader() {
  let dl = null, inClaude = true;
  try { dl = window.claude && await window.claude.use('downloads'); } catch (e) { dl = null; }
  if (!dl) {
    inClaude = false;
    dl = { save: async r => { const b = r.data instanceof Blob ? r.data : new Blob([r.data]), a = document.createElement('a'), u = URL.createObjectURL(b); a.href = u; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return { status: 'saved' }; } };
  }
  return { dl, inClaude };
}
// kinds: list of spectrum kinds; fmt: png | pdf | txt | root. One spectrum gives one file, several give one file too (a zip for pictures).
async function spcSave(combos, fmt, msgEl) {
  const msg = t => { msgEl.textContent = t; };
  try {
    msg('Calculating…');
    const Ds = [], skipped = [];
    for (const c of combos) { const D = await spcData(c.kind, c.src); if (D.err) skipped.push(SPC[c.kind].short + ' of ' + decSrcName(c.src)); else Ds.push(D); }
    if (!Ds.length) { msg('Nothing to save: no radioactive material emits these radiations.'); return; }
    const { dl, inClaude } = await spcDownloader();
    const base0 = ('decay_spectra_' + (S.tab ? S.tab.label : 'sample')).replace(/[^A-Za-z0-9.-]+/g, '_').replace(/^_+|_+$/g, ''), base = base0 + (combos.length === 1 ? '_' + combos[0].src + '_' + combos[0].kind : '');
    let done;
    if (fmt === 'txt') { await dl.save({ filename: base + '.txt', data: Ds.map(spcText).join('\n') }); done = base + '.txt'; }
    else if (fmt === 'root') {
      const hs = [].concat(...Ds.map(spcHistos)), rn = base + '.root', rb = RootIO.file(rn, hs);
      if (!inClaude) { await dl.save({ filename: rn, data: new Blob([rb], { type: 'application/octet-stream' }) }); done = rn; }
      else { const fz = base + '_histograms.zip'; await dl.save({ filename: fz, data: zipStore(rn, rb) }); done = fz + ' (' + rn + ')'; }
    } else {
      const off = document.createElement('div'); off.id = 'spcOff'; off.style.cssText = 'position:fixed;left:-10000px;top:0;width:700px'; document.body.appendChild(off);
      const files = [];
      try {
        for (const D of Ds) {
          off.innerHTML = spcSVG(D, S.spc.log);
          const im = await chartImage(3, 'spcOff', spcInfoLines(D));
          if (fmt === 'png') files.push({ name: base0 + '_' + D.src + '_' + D.kind + '.png', data: new Uint8Array(await (await canvasBlob(im.canvas, 'image/png')).arrayBuffer()) });
          else { const jb = await canvasBlob(im.canvas, 'image/jpeg', 0.95); files.push({ name: base0 + '_' + D.src + '_' + D.kind + '.pdf', data: new Uint8Array(await (await pdfFromJpeg(new Uint8Array(await jb.arrayBuffer()), im.canvas.width, im.canvas.height, im.W * 0.75, im.H * 0.75)).arrayBuffer()) }); }
        }
      } finally { off.remove(); }
      if (files.length === 1) { await dl.save({ filename: files[0].name, data: new Blob([files[0].data], { type: fmt === 'png' ? 'image/png' : 'application/pdf' }) }); done = files[0].name; }
      else { const fz = base + '_' + fmt + '.zip'; await dl.save({ filename: fz, data: zipFiles(files) }); done = fz + ' (' + files.length + ' files)'; }
    }
    msg('Saved ' + done + '.');
  } catch (e) { msg(e && e.code === 'declined' ? '' : 'Could not save: ' + ((e && e.message) || e)); }
}
async function spcRender() {
  const my = ++S.spc.tok, kind = S.spc.kind, C = SPC[kind];
  $('spcTitle').textContent = C.name + ' – ' + decSrcName(S.spc.src);
  $('spcBin').value = S.spc.bin[kind] > 0 ? S.spc.bin[kind] : '';
  $('spcRes').value = S.spc.fwhm[kind] > 0 ? S.spc.fwhm[kind] : '';
  const D = await spcData(kind, S.spc.src); if (my !== S.spc.tok) return;
  S.spc.data = D;
  if (D.err) { $('spcHost').innerHTML = '<div class="hint">' + esc(D.err) + '</div>'; $('spcLines').innerHTML = ''; $('spcBin').placeholder = 'auto'; return; }
  $('spcBin').placeholder = 'auto = ' + spcW(spcNice(D.edges[D.nb] / 1.04 / 400));
  $('spcHost').innerHTML = spcSVG(D, S.spc.log);
  const top = D.rows.slice(0, 12);
  $('spcLines').innerHTML = '<div class="dechead">Total emission rate' + D.curves.map(c => ' · ' + esc(c.nm) + ' ' + sciTxt(c.tot, 3) + ' /s').join('') + '</div>' +
    '<div class="wtw"><table class="t dectab"><thead><tr><th>Isotope</th><th>Radiation</th><th class="n">' + (kindHasEp(D) ? 'Energy / end-point (keV)' : 'Energy (keV)') + '</th><th class="n">Rate (1/s)</th></tr></thead><tbody>' +
    top.map(r => '<tr><td><b>' + esc(r.nm) + '</b></td><td>' + esc(r.c) + (r.ep ? ' end-point' : '') + '</td><td class="n">' + sciTxt(r.E, 5) + '</td><td class="n">' + sciTxt(r.r, 3) + '</td></tr>').join('') +
    (D.rows.length > top.length ? '<tr><td colspan="4" class="hint">+ ' + (D.rows.length - top.length) + ' weaker lines (all are in the ASCII file)</td></tr>' : '') + '</tbody></table></div>' +
    '<div class="hint">' + (kind === 'b' ? 'The beta spectra are calculated from the end-point energies and intensities of the decay data with the allowed (Fermi) shape; forbidden shape factors and atomic screening are not included, so forbidden transitions are approximate. ' : '') +
    (kind === 'g' ? 'Includes the X rays and the 511 keV annihilation photons listed in the decay data. ' : '') + (kind === 'ce' ? 'Conversion and Auger electrons as listed in the decay data. ' : '') +
    (S.spc.fwhm[kind] > 0 ? 'The spectrum is folded with a Gaussian of constant FWHM ' + spcW(S.spc.fwhm[kind]) + ' keV (the area is kept; the part below zero energy is lost). ' : '') + 'Emission inside ' + D.srcName + ', nothing is absorbed or scattered; ' + (S.dec.dauOn ? 'short-lived daughters are included in equilibrium (see the Nuclear data panel)' : 'the daughters of the decays are not followed') + '. Lines are put into the energy bins (change the bin width above).</div>';
}
const kindHasEp = D => D.rows.some(r => r.ep);
function spcOpen(kind, src) { S.spc.kind = kind; S.spc.src = src || 'sample'; $('spcModal').hidden = false; $('spcSaveMsg').textContent = ''; spcRender(); }
function spcBind() {
  document.addEventListener('click', ev => { const b = ev.target.closest('[data-spc]'); if (b) spcOpen(b.dataset.spc, b.dataset.src || 'sample'); });
  $('spcClose').addEventListener('click', () => { $('spcModal').hidden = true; });
  $('spcModal').addEventListener('mousedown', ev => { if (ev.target === $('spcModal')) $('spcModal').hidden = true; });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('spcModal').hidden) { $('spcModal').hidden = true; ev.stopImmediatePropagation(); } }, true);
  $('spcBin').addEventListener('change', () => { const v = parseFloat($('spcBin').value); S.spc.bin[S.spc.kind] = v > 0 ? v : 0; spcRender(); });
  $('spcRangeReset').addEventListener('click', () => { S.spc.range[spcRK()] = null; spcRender(); });
  // select the energy range with the mouse: drag on the plot, double-click shows everything again
  const host = $('spcHost');
  host.addEventListener('dblclick', ev => { if (ev.target.closest('.lgi')) return; S.spc.range[spcRK()] = null; spcRender(); });
  host.addEventListener('click', ev => {                              // click on a legend entry: hide or show that curve
    const g = ev.target.closest('.lgi'); if (!g || !S.spc.data || S.spc.data.err) return;
    const k = S.spc.data.src + ':' + S.spc.data.kind + ':' + g.dataset.id; S.spc.hidden[k] = !S.spc.hidden[k];
    host.innerHTML = spcSVG(S.spc.data, S.spc.log);
  });
  host.addEventListener('mousedown', ev => {
    const svg = ev.target.closest('svg.spc'); if (!svg || ev.button !== 0 || ev.target.closest('.lgi')) return; ev.preventDefault();
    const bb = svg.getBoundingClientRect(), W = +svg.dataset.w, L = +svg.dataset.l, R = +svg.dataset.r, xa = +svg.dataset.xa, xb = +svg.dataset.xb;
    const vx = cx => Math.min(Math.max((cx - bb.left) / bb.width * W, L), W - R), en = v => xa + (v - L) / (W - L - R) * (xb - xa);
    const v0 = vx(ev.clientX); let v1 = v0;
    const NS = 'http://www.w3.org/2000/svg', r = document.createElementNS(NS, 'rect'); r.setAttribute('class', 'spsel'); r.setAttribute('y', +svg.dataset.t); r.setAttribute('height', +svg.dataset.h - +svg.dataset.t - +svg.dataset.b); svg.appendChild(r);
    const draw = () => { r.setAttribute('x', Math.min(v0, v1)); r.setAttribute('width', Math.abs(v1 - v0)); };
    const mv = e => { v1 = vx(e.clientX); draw(); };
    const up = e => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); v1 = vx(e.clientX);
      if (Math.abs(v1 - v0) * bb.width / W < 5) { r.remove(); return; }          // a click, not a drag
      S.spc.range[spcRK()] = [en(Math.min(v0, v1)), en(Math.max(v0, v1))]; spcRender();
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  $('spcRes').addEventListener('change', () => { const v = parseFloat($('spcRes').value); S.spc.fwhm[S.spc.kind] = v > 0 ? v : 0; spcRender(); });
  $('spcLog').addEventListener('change', () => { S.spc.log = $('spcLog').checked; spcRender(); });
  document.querySelectorAll('[data-spcsave]').forEach(b => b.addEventListener('click', async () => {
    const all = !!b.dataset.spcall, msgEl = all ? $(b.dataset.spcmsg || 'spcAllMsg') : $('spcSaveMsg');
    let combos = [{ src: S.spc.src, kind: S.spc.kind }];
    if (all) { combos = []; for (const a of await decShownSources()) for (const k of Object.keys(SPC)) if (a.kinds[k]) combos.push({ src: a.src, kind: k }); }
    spcSave(combos, b.dataset.spcsave, msgEl);
  }));
}

// ---- the radioactivity tables of all layers as one ASCII file ----
async function decTableText() {
  const lib = decLib(); if (!lib) throw new Error('Load decay data first.');
  const L = ['# Radioactivity of the target - decay data: ' + lib.name + (S.tab ? ' - sample: ' + S.tab.label : '') + (decN() > 1 ? ' - ' + decN() + ' identical targets (layers and target: one target)' : ''),
    '# Particles emitted per second by the decays of the listed isotopes' + (S.dec.dauOn ? ' (short-lived daughters in equilibrium are listed as isotope_from_parent)' : ' (decay products are not followed)') + '; nothing is absorbed.',
    '# Columns: isotope, atoms, half-life [s], decay modes (branching), activity [Bq], alpha [1/s], beta- [1/s], beta+ [1/s], gamma [1/s], total [1/s]'];
  for (const a of await decShownSources()) {
    L.push('', '# ' + decAscii(decSrcName(a.src)));
    for (const x of a.rows) L.push([(x.from ? x.nm + '_from_' + x.from : x.nm).replace(/ /g, '_'), decE(x.o.atoms), decE(x.y.T), decAscii(decModes(x.y)).replace(/ /g, '_'), decE(x.r.A), decE(x.r.a), decE(x.r.bm), decE(x.r.bp), decE(x.r.g), decE(x.r.tot)].join('  '));
    const t = a.tot; L.push(['Total', '', '', '', decE(t.A), decE(t.a), decE(t.bm), decE(t.bp), decE(t.g), decE(t.tot)].join('  '));
    if (a.stable.length) L.push('# stable: ' + a.stable.join(', '));
    if (a.none.length) L.push('# not in the decay data: ' + a.none.join(', '));
  }
  return L.join('\n') + '\n';
}
function decSaveBind() {
  $('decSaveTxt').addEventListener('click', async () => {
    const m = $('decSaveMsg');
    try {
      const tx = await decTableText(), { dl } = await spcDownloader(), fn = ('decay_data_' + (S.tab ? S.tab.label : 'layers')).replace(/[^A-Za-z0-9.-]+/g, '_') + '.txt';
      await dl.save({ filename: fn, data: tx }); m.textContent = 'Saved ' + fn + '.';
    } catch (e) { m.textContent = e && e.code === 'declined' ? '' : 'Could not save: ' + ((e && e.message) || e); }
  });
}

// ---- default decay data: the folder <library name>_decay in the library folder (the one with the xsdir and the ACE files) ----
// all: the files of the chosen library folder (they include the sub-folders); xf: the xsdir file.
async function decAuto(all, xf) {
  const rp = xf.webkitRelativePath || xf.name, segs = rp.split('/'), rootName = segs.length > 1 ? segs[segs.length - 2] : '';
  const want = [S.libName, rootName].filter(Boolean).map(n => (n + '_decay').toLowerCase());
  const dirs = new Map();                                                     // folder path -> files, for every folder called *_decay
  for (const f of all) {
    const p = (f.webkitRelativePath || '').split('/');
    for (let i = 0; i < p.length - 1; i++) if (/_decay$/i.test(p[i])) { const k = p.slice(0, i + 1).join('/'); if (!dirs.has(k)) dirs.set(k, []); dirs.get(k).push(f); break; }
  }
  if (!dirs.size) return;
  let keys = Array.from(dirs.keys()).filter(k => want.includes(k.split('/').pop().toLowerCase()));
  if (!keys.length) keys = Array.from(dirs.keys()).slice(0, 2);
  const files = [].concat(...keys.map(k => dirs.get(k)));
  setStatus('decStatus', 'Reading the decay data "' + keys.map(k => k.split('/').pop()).join(', ') + '" next to the library…');
  try { if (await decLoadFiles(files, keys[0].split('/').pop())) setStatus('decStatus', $('decStatus').textContent + ' (found next to the cross-section library)'); } catch (e) { }
}

// A setup remembers which decay data were used: they are reloaded from the folder saved in this browser (as the ACE library); when the ACE
// library is reloaded, the <library>_decay folder next to it is read as well (decAuto) and the library named in the setup is selected.
async function decAfterSetup(st) {
  S.dec.want = st.decayLibrary || '';
  S.dec.wantFolder = st.decayFolder || '';
  if (!S.dec.libs.length) { try { await decRestore(false); } catch (e) { } }
  if (!S.dec.libs.length && (st.decayLibrary || st.decayFolder)) setStatus('decStatus', 'The setup used decay data "' + (st.decayLibrary || '') + '"' + (st.decayFolder ? ' (folder "' + st.decayFolder + '")' : '') + ': press "Load decay data…" and choose that folder.');
  const i = S.dec.libs.findIndex(l => l.name === S.dec.want);
  if (i >= 0 && i !== S.dec.sel) { S.dec.sel = i; S.dec.keys = {}; decStatus(); decRenderAll(); }
}

// automatic limit for the daughters: a tenth of the half-life of the initial isotope (near secular equilibrium), at most 30 days (equilibrium within weeks)
const decAutoLimit = T => Math.min(T / 10, 30 * 86400);
function decAgeNote() { $('decAgeNote').textContent = !S.dec.dauOn ? 'Daughters are switched off in the Nuclear data panel.' : S.dec.age === null ? 'No time given: short-lived daughters are in equilibrium with their parent (half-life limit in the Nuclear data panel).' : 'Daughters grown in for ' + decTime(S.dec.age) + ' after the preparation, with all the half-lives (the number of atoms of each isotope entered is the one at the time of the measurement).'; }
function decDauSync() { decAgeFields(); $('decDau').checked = S.dec.dauOn; $('decDauT').value = S.dec.dauDays === null ? '' : S.dec.dauDays; $('decDauT').disabled = !S.dec.dauOn; }

// ---------- Setup: save / load as a JSON file, and a share link in the URL ----------
// The setup holds everything that defines a calculation except the cross-section files themselves (the library is identified by its
// ZAID names and temperatures and has to be loaded by the user) and a user fluence table.
// ---- Cross-section library folder: remembered in this browser (File System Access API, Chromium) so that a setup can reload it ----
const LibStore = {
  db() { return new Promise((ok, no) => { const r = indexedDB.open('neutron-rate-calculator', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
  async get(k) { try { const db = await this.db(); return await new Promise(ok => { const q = db.transaction('h').objectStore('h').get(k || 'lib'); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } },
  async set(v, k) { try { const db = await this.db(); await new Promise((ok, no) => { const tx = db.transaction('h', 'readwrite'); tx.objectStore('h').put(v, k || 'lib'); tx.oncomplete = ok; tx.onerror = () => no(tx.error); }); } catch (e) { } }
};
async function dirFiles(h, prefix, out) {
  for await (const [name, e] of h.entries()) {
    if (e.kind === 'file') { const f = await e.getFile(); try { Object.defineProperty(f, 'webkitRelativePath', { value: prefix + name }); } catch (er) { } out.push(f); }
    else await dirFiles(e, prefix + name + '/', out);
  }
  return out;
}
// Reload the library folder that was chosen earlier in this browser. user = true when called from a click (permission prompt allowed).
async function libRestore(user) {
  const rec = await LibStore.get();
  if (!rec || !rec.handle) return 'none';
  try {
    let pm = await rec.handle.queryPermission({ mode: 'read' });
    if (pm !== 'granted') { if (!user) return 'need'; pm = await rec.handle.requestPermission({ mode: 'read' }); }
    if (pm !== 'granted') return 'denied';
    setStatus('aceStatus', 'Reading the saved library folder "' + rec.name + '"…');
    const files = await dirFiles(rec.handle, rec.name + '/', []);
    $('libReload').hidden = true; $('setupLibReload').hidden = true;
    await loadFolder(files);
    return 'ok';
  } catch (e) { return 'error: ' + ((e && e.message) || e); }
}
async function libAfterSetup(st) {
  const path = st.libraryPath || '';
  if (path) { $('libPath').value = path; try { localStorage.setItem('aceFolderPath2', path); } catch (e) { } }
  const r = await libRestore(false);
  if (r === 'ok') return;
  const what = (st.library ? 'library ' + st.library + ' ' : 'the library ') + (path ? 'in "' + path + '"' : '');
  if (r === 'need') { $('libReload').hidden = false; $('setupLibReload').hidden = false; $('setupMsg').textContent = 'Setup read. One click on "Reload saved library" (then Allow) loads the cross sections and applies the setup. In Chrome or Edge choose "Allow on every visit" to skip this next time.'; setStatus('aceStatus', 'Setup read. Press "Reload saved library" to give the page access to ' + what + ' again.', true); }
  else setStatus('aceStatus', 'Setup read. A web page cannot open a folder from a path: choose ' + what + ' with "Choose folder…" (the path is in the box above) and the isotopes of the setup are applied.' + (r === 'none' ? '' : ' (' + r + ')'), true);
  update();
}
function setupGet() {
  const F = curFac(), tabOf = i => { const x = S.tables[i]; return x ? { zaid: x.zaid, tempK: x.temp > 0 ? Math.round(x.temp / MEV_PER_K * 10) / 10 : 0, label: x.label } : null; };
  const iso = tabOf(S.tabIdx) || {};
  iso.reactions = S.rxs.map(r => r.mt);
  const tg = S.tg[F.id], pulse = S.pulse[F.id];
  const st = {
    app: 'Neutron reaction rate calculator', version: 1,
    library: S.libName || '',
    decayLibrary: (typeof decLib === 'function' && decLib()) ? decLib().name : '',
    spectra: { fwhmKeV: Object.assign({}, S.spc.fwhm), binKeV: Object.assign({}, S.spc.bin), logY: !!S.spc.log },
    decayDaughters: { on: !!S.dec.dauOn, maxDays: S.dec.dauDays, ageSec: S.dec.ageUser ? S.dec.age : undefined, ageUnit: S.dec.ageU, ageUser: !!S.dec.ageUser },
    decayFolder: (typeof decLib === 'function' && decLib()) ? (decLib().folder || '') : '',
    libraryPath: $('libPath').value || '',
    libraryKind: S.tables.length ? (S.libName ? 'folder with xsdir' : 'folder or file') : 'none',
    layers: { win: { on: !!S.layOn.win, material: S.lay.win.mat, tempK: S.lay.win.temp || 0, thicknessUm: S.lay.win.thick, densityGcm3: S.lay.win.densUser ? S.lay.win.dens : null, air: { cm: S.lay.win.air.cm, densityGcm3: S.lay.win.air.densUser ? S.lay.win.air.dens : null }, mixedTemperaturesAccepted: !!S.lay.win.mix, custom: S.lay.win.mat === 'custom' ? { name: S.lay.win.custom.name, text: S.lay.win.custom.text, mode: S.lay.win.custom.mode } : null }, front: { massMg: S.lay.front.mass, densityGcm3: S.lay.front.densUser ? S.lay.front.dens : null }, back: { massMg: S.lay.back.mass, densityGcm3: S.lay.back.densUser ? S.lay.back.dens : null } },
    customFluence: S.custom[F.id] ? { E: Array.from(S.custom[F.id].E), V: Array.from(S.custom[F.id].V) } : null,
    facility: { id: F.id, name: F.name, title: F.title, repetitionRateHz: S.f, flightPathM: S.L },
    isotope: iso,
    components: S.comps.map(c => { const o = tabOf(c.idx) || {}; o.ratio = c.ratio; o.layer = layerOf(c); o.holder = layerOf(c) === 'back'; o.reactions = c.tab ? c.mts.map(i => c.tab.rxs[i] && c.tab.rxs[i].mt).filter(m => m !== undefined) : []; return o; }),
    sample: { massMg: S.mass, beamRadiusCm: readNum('area'), densityGcm3: S.densUser ? S.dens : null },
    energyRangeMeV: [S.emin, S.emax],
    resolution: { on: !!S.resOn, widthsAre: S.resK, addedWidthNs: S.resW, pulseWidthNs: pulse === undefined ? null : pulse, targetMode: tg ? tg.mode : null, pathSpreadM: tg ? tg.dL : null },
    options: { selfShielding: !!S.ss, selfShieldingModel: S.ssModel, mcHistories: S.msN, quantity: S.rateKind, perSample: !!S.rateSample, logY: !!S.rateLog, xAxis: S.tofAxis ? 'tof' : 'energy' },
    view: S.view || '',
    experiment: exCfgGet()
  };
  return st;
}
const b64u = {
  enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: t => decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/'))))
};
function setupLink() { return location.href.split('#')[0] + '#setup=' + b64u.enc(JSON.stringify(setupGet())); }
function setupCheck(st) {
  if (!st || typeof st !== 'object' || st.app !== 'Neutron reaction rate calculator') throw new Error('This is not a setup file of this page.');
  if (!(st.version >= 1)) throw new Error('Unknown setup version.');
  return st;
}
function setupFindTab(d) {
  if (!d || !d.zaid) return -1;
  let best = -1; const dist = i => Math.abs(S.tables[i].temp / MEV_PER_K - (d.tempK || 0));
  S.tables.forEach((t, i) => { if (t.zaid === d.zaid && (best < 0 || dist(i) < dist(best))) best = i; });
  if (best < 0 && d.label) S.tables.forEach((t, i) => { if (t.label === d.label && (best < 0 || dist(i) < dist(best))) best = i; });
  return best;
}
const fire = (id, type) => $(id).dispatchEvent(new Event(type, { bubbles: true }));
function setupApply(st) {
  setupCheck(st);
  { const u = $('setupUrl'); if (u) { u.hidden = true; u.value = ''; } }                    // a link shown earlier no longer describes the page
  const num = (id, v, ev) => { if (v !== null && v !== undefined && isFinite(v)) { $(id).value = String(v); fire(id, ev || 'input'); } };
  const fa = st.facility || {};
  const F = FAC.find(x => x.id === fa.id && x.name === fa.name) || FAC.find(x => x.name === fa.name) || FAC.find(x => x.title === fa.title);
  const warn = [];
  if (F) { $('fac').value = F.id; fire('fac', 'change'); } else if (fa.name) warn.push('beam line "' + fa.name + '" is not in the fluence file');
  num('f', fa.repetitionRateHz); num('L', fa.flightPathM);
  if (F && st.customFluence && Array.isArray(st.customFluence.E) && st.customFluence.E.length > 1) { S.custom[F.id] = { E: Float64Array.from(st.customFluence.E), V: Float64Array.from(st.customFluence.V) }; setStatus('fxStatus', 'Using the fluence table of the setup (' + st.customFluence.E.length + ' points).'); }
  const rs = st.resolution || {};
  $('resOn').checked = !!rs.on; fire('resOn', 'change');
  if (rs.widthsAre) { $('resK').value = rs.widthsAre; fire('resK', 'change'); }
  num('resW', rs.addedWidthNs);
  if (rs.targetMode) { $('tgMode').value = rs.targetMode; fire('tgMode', 'change'); }
  num('tgL', rs.pathSpreadM); num('pulseW', rs.pulseWidthNs);
  const sm = st.sample || {};
  num('mass', sm.massMg); num('area', sm.beamRadiusCm);
  if (sm.densityGcm3 > 0) num('dens', sm.densityGcm3); else if (S.densUser) $('densReset').click();
  const er = st.energyRangeMeV || [];
  num('emin', er[0]); num('emax', er[1]);
  const op = st.options || {};
  if (typeof op.selfShielding === 'boolean') { $('ss').checked = op.selfShielding; fire('ss', 'change'); }
  if (op.selfShieldingModel) { $('ssModel').value = op.selfShieldingModel; fire('ssModel', 'change'); }
  num('msN', op.mcHistories);
  $('qRate').click();
  $(op.perSample === false ? 'nrAtom' : 'nrSample').click();
  if (op.quantity === 'yield') $('qYield').click();
  $(op.logY === false ? 'axLin' : 'axLog').click();
  $(op.xAxis === 'tof' ? 'axT' : 'axE').click();
  S.zx = null; S.yr = {};
  exCfgSet(st.experiment);                                    // also without an experiment block: back to the opening values
  S.dec.keys = {};
  if (!st.decayDaughters) { S.dec.dauOn = true; S.dec.dauDays = null; S.dec.ageUser = false; S.dec.age = null; S.dec.ageU = 86400; decDauSync(); }
  if (st.decayDaughters) { S.dec.dauOn = st.decayDaughters.on !== false; S.dec.dauDays = st.decayDaughters.maxDays >= 0 && st.decayDaughters.maxDays !== null ? st.decayDaughters.maxDays : null; S.dec.ageUser = !!st.decayDaughters.ageUser; S.dec.age = S.dec.ageUser && st.decayDaughters.ageSec >= 0 ? st.decayDaughters.ageSec : null; S.dec.ageU = st.decayDaughters.ageUnit > 0 ? st.decayDaughters.ageUnit : 86400; decDauSync(); S.dec.keys = {}; }
  Object.assign(S.spc, { hidden: {}, kind: 'a', src: 'sample', range: {}, data: null, fwhm: {}, bin: {}, log: true }); $('spcLog').checked = true;
  if (st.spectra) { S.spc.fwhm = Object.assign({}, st.spectra.fwhmKeV || {}); S.spc.bin = Object.assign({}, st.spectra.binKeV || {}); S.spc.log = st.spectra.logY !== false; S.spc.range = {}; $('spcLog').checked = S.spc.log; }   // energy resolution and binning of the decay spectra
  decAfterSetup(st);                                         // decay data: reloaded like the ACE library (saved folder, or the <library>_decay folder next to it)
  // isotopes: applied when the library is available
  S.pending = { isotope: st.isotope, components: st.components || [], view: st.view || '', layers: st.layers || null };
  if (S.tables.length) fillIso(true);
  else libAfterSetup(st).catch(e => { setStatus('aceStatus', 'Setup read. Could not reload the library: ' + ((e && e.message) || e), true); update(); });
  return warn;
}
async function setupFinish() {
  const st = S.pending; S.pending = null; if (!st) return;
  const warn = [];
  if (!S.tab) return;
  if (st.isotope && Array.isArray(st.isotope.reactions)) {
    const have = new Set(S.rxs.map(r => r.mt)), want = st.isotope.reactions;
    if (!want.length) { applyPrimarySel([]); $('mt').querySelectorAll('input').forEach(x => { x.checked = false; }); }
    else if (want.some(m => !have.has(m)) || S.rxs.length !== want.length) {
      const idx = []; S.tab.rxs.forEach((r, i) => { if (want.indexOf(r.mt) >= 0) idx.push(i); });
      if (idx.length) { applyPrimarySel(idx); $('mt').querySelectorAll('input').forEach(x => { x.checked = idx.indexOf(parseInt(x.value, 10)) >= 0; }); }
    }
  }
  S.comps = []; S.layOn = { win: false, front: false, back: false }; S.stash = { front: [], back: [] }; renderComps();
  for (const d of st.components) {
    const idx = setupFindTab(d);
    if (idx < 0) { warn.push((d.label || d.zaid || 'a component') + ' is not in the library'); continue; }
    const c = { filter: '', idx, ratio: d.ratio > 0 ? d.ratio : 1, tab: null, mts: [], err: '', layer: d.layer === 'front' || d.layer === 'back' ? d.layer : (d.holder ? 'back' : 'sample') };
    S.comps.push(c); renderComps(); applyElementDensity();
    await loadComp(c);
    if (c.tab && Array.isArray(d.reactions)) { c.mts = []; c.tab.rxs.forEach((r, i) => { if (d.reactions.indexOf(r.mt) >= 0) c.mts.push(i); }); refreshComp(c); }
  }
  { // layers: new setups carry the mass of each layer; old ones gave atoms per primary atom, converted here (same atoms)
    const mpaS = S.tab.awr * NEUTRON_U / NAVO + S.comps.reduce((a, c) => a + (c.tab && layerOf(c) === 'sample' ? c.ratio * c.tab.awr * NEUTRON_U / NAVO : 0), 0), atomsS = S.mass > 0 && mpaS > 0 ? S.mass * 1e-3 / mpaS : 0;
    for (const l of ['front', 'back']) {
      const L = S.lay[l], d = st.layers && st.layers[l], cs = S.comps.filter(c => layerOf(c) === l && c.tab);
      if (d) { L.mass = d.massMg >= 0 ? d.massMg : 1; L.densUser = d.densityGcm3 > 0; if (L.densUser) L.dens = d.densityGcm3; }
      else if (cs.length) { L.mass = atomsS * cs.reduce((a, c) => a + c.ratio * c.tab.awr * NEUTRON_U / NAVO, 0) * 1e3; L.densUser = false; }
    }
    renderLayerBox();
  }
  { // vacuum window (older setups have none)
    const d = st.layers && st.layers.win, W = S.lay.win;
    S.layOn.win = !!(d && d.on);
    if (d) { if (WIN_MATS[d.material] || d.material === 'custom') W.mat = d.material; if (d.custom) W.custom = { name: String(d.custom.name || ''), text: String(d.custom.text || ''), mode: d.custom.mode === 'mass' ? 'mass' : 'atoms' }; W.temp = d.tempK > 0 ? Math.round(d.tempK) : 0; W.thick = d.thicknessUm >= 0 ? d.thicknessUm : 100; W.densUser = d.densityGcm3 > 0; W.dens = W.densUser ? d.densityGcm3 : NaN; const ar = d.air || {}; W.air.cm = ar.cm > 0 ? ar.cm : 0; W.air.densUser = ar.densityGcm3 > 0; W.air.dens = W.air.densUser ? ar.densityGcm3 : NaN; W.mix = !!d.mixedTemperaturesAccepted; }
  }
  if (st.view) S.view = st.view;
  update();
  if (warn.length) setStatus('aceStatus', 'Setup applied, but: ' + warn.join('; ') + '.', true);
}
async function setupDownloader() {
  let dl = null;
  try { dl = window.claude && await window.claude.use('downloads'); } catch (e) { dl = null; }
  if (dl) return dl;
  return { save: async r => {
    const b = r.data instanceof Blob ? r.data : new Blob([r.data]), a = document.createElement('a'), u = URL.createObjectURL(b);
    a.href = u; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    return { status: 'saved' };
  } };
}
// The folder chosen for the setup files, with write permission (asked on a click when the browser needs it).
async function setupDirReady(user) {
  const h = S.setupDir; if (!h) return null;
  try {
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && user) p = await h.requestPermission({ mode: 'readwrite' });
    return p === 'granted' ? h : null;
  } catch (e) { return null; }
}
function setupBind() {
  const msg = t => { $('setupMsg').textContent = t; };
  $('setupSave').addEventListener('click', async () => {
    try {
      const F = curFac(), lt = l => S.layOn[l] ? '_' + (l === 'front' ? 'front' : 'back') + '-' + (Array.from(new Set(S.comps.filter(c => layerOf(c) === l && c.tab).map(c => c.tab.label))).join('+') || 'layer') : '',
        nm = ('setup_' + ((S.tab && S.tab.label) || 'rates') + (S.comps.some(c => layerOf(c) === 'sample' && c.tab) ? '+' + Array.from(new Set(S.comps.filter(c => layerOf(c) === 'sample' && c.tab).map(c => c.tab.label))).join('+') : '') + (S.layOn.win ? '_win-' + winShort() : '') + lt('front') + lt('back') + '_' + F.name).replace(/[^A-Za-z0-9.+-]+/g, '_').slice(0, 140);
      const dl = await setupDownloader();
      const text = JSON.stringify(setupGet(), null, 1), dh = await setupDirReady(true);
      if (dh) { const w = await (await dh.getFileHandle(nm + '.json', { create: true })).createWritable(); await w.write(text); await w.close(); msg('Saved ' + nm + '.json in the folder ' + dh.name + '.'); return; }
      await dl.save({ filename: nm + '.json', data: text });
      msg('Saved ' + nm + '.json.');
    } catch (e) { msg(e && e.code === 'declined' ? '' : 'Could not save: ' + ((e && e.message) || e)); }
  });
  $('setupLoad').addEventListener('click', async () => {
    const dh = await setupDirReady(true);
    if (dh && window.showOpenFilePicker) {
      try {
        const [fh] = await window.showOpenFilePicker({ startIn: dh, multiple: false, types: [{ description: 'Setup (JSON)', accept: { 'application/json': ['.json'] } }] });
        const f = await fh.getFile(), w = setupApply(JSON.parse(await f.text())); msg('Setup loaded from ' + f.name + (w.length ? ' (' + w.join('; ') + ')' : '') + '.');
      } catch (er) { if (!er || er.name !== 'AbortError') msg('Could not read the setup: ' + ((er && er.message) || er)); }
      return;
    }
    $('setupFile').click();
  });
  if (window.showDirectoryPicker) {
    $('setupDirRow').hidden = false;
    $('setupDir').addEventListener('click', async () => {
      try { const h = await window.showDirectoryPicker({ mode: 'readwrite' }); S.setupDir = h; await LibStore.set({ handle: h, name: h.name }, 'setups'); $('setupDirName').textContent = 'setups folder: ' + h.name; msg('Save setup now writes into ' + h.name + ' and Load setup starts there.'); }
      catch (er) { if (!er || er.name !== 'AbortError') msg('Could not use that folder here: ' + ((er && er.message) || er)); }
    });
    LibStore.get('setups').then(r => { if (r && r.handle) { S.setupDir = r.handle; $('setupDirName').textContent = 'setups folder: ' + r.name; } });
  }
  $('setupFile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const w = setupApply(JSON.parse(await f.text())); msg('Setup loaded from ' + f.name + (w.length ? ' (' + w.join('; ') + ')' : '') + '.'); }
    catch (er) { msg('Could not read the setup: ' + er.message); }
  });
  $('setupLink').addEventListener('click', async () => {
    const url = setupLink();
    try { history.replaceState(null, '', '#setup=' + url.split('#setup=')[1]); } catch (e) { }
    $('setupUrl').hidden = false; $('setupUrl').value = url; $('setupUrl').scrollLeft = $('setupUrl').scrollWidth;
    try { await navigator.clipboard.writeText(url); msg('Link copied (' + url.length + ' characters, ending …' + url.slice(-10) + '). Anyone who opens it gets this setup; the cross-section library has to be loaded by them. If the address does not open (for example a link copied from an embedded view), use Paste link on the page.'); }
    catch (e) { $('setupUrl').select(); msg('Copy the link from the box below.'); }
  });
  $('setupPaste').addEventListener('click', () => { const b = $('setupPasteBox'); b.hidden = !b.hidden; if (!b.hidden) b.focus(); });
  $('setupPasteBox').addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    const t = ev.target.value.trim(), i = t.indexOf('#setup='), code = (i >= 0 ? t.slice(i + 7) : t).replace(/\s+/g, '');
    try { const w = setupApply(JSON.parse(b64u.dec(code))); msg('Setup read from the pasted link' + (w.length ? ' (' + w.join('; ') + ')' : '') + '.'); ev.target.value = ''; ev.target.hidden = true; }
    catch (er) { msg('The pasted text does not hold a valid setup: ' + er.message); }
  });
  const fromHash = () => {
    const m = /^#setup=(.+)$/.exec(location.hash);
    if (!m) return;
    try { const w = setupApply(JSON.parse(b64u.dec(m[1]))); msg('Setup read from the link' + (w.length ? ' (' + w.join('; ') + ')' : '') + '.'); }
    catch (er) { msg('The link does not hold a valid setup: ' + er.message); }
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}


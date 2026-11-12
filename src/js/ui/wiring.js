// ---------- Wiring ----------
function bind() {
  nuclBind();
  $('fac').addEventListener('change', e => { S.facId = e.target.value; applyFacDefaults(); update(); });
  $('f').addEventListener('input', () => { S.f = readNum('f'); schedule(); });
  $('L').addEventListener('input', () => { S.L = readNum('L'); schedule(); });
  $('facFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.text().then(t => {
      try { loadFluxText(t, f.name); setStatus('facStatus', FAC.length + ' beam lines read from ' + f.name); update(); }
      catch (err) { setStatus('facStatus', err.message, true); }
    });
  });
  bindComps(); bindWindow();
  Store.touch('target'); Store.flush();
  $('resOn').addEventListener('change', e => { S.resOn = e.target.checked; update(); });
  $('resW').addEventListener('input', () => { S.resW = readNum('resW'); schedule(); });
  const tgIn = () => { syncTgLab(); S.tg[curFac().id] = { mode: $('tgMode').value, dL: readNum('tgL') }; schedule(); };
  $('tgL').addEventListener('input', tgIn);
  $('tgMode').addEventListener('change', () => {
    const F = curFac(), d = tgDef(F);
    if ($('tgMode').value !== tgOf(F).mode) $('tgL').value = $('tgMode').value === 'rf' ? 0 : 0.5;
    tgIn();
    if (!(F.id in S.pulse)) { $('pulseW').value = pulseOf(F); }
  });
  $('pulseW').addEventListener('input', () => { S.pulse[curFac().id] = readNum('pulseW'); schedule(); });
  $('resK').addEventListener('change', e => { S.resK = e.target.value; syncWLab(); { const F = curFac(); if (!(F.id in S.pulse)) $('pulseW').value = pulseOf(F); } update(); });
  const setX = t => { S.tofAxis = t; $('axE').setAttribute('aria-pressed', String(!t)); $('axT').setAttribute('aria-pressed', String(t)); if (S.res) renderCharts(); };
  const sm = $('saveMenu'), sbtn = $('saveBtn'), closeSm = () => { sm.hidden = true; sbtn.setAttribute('aria-expanded', 'false'); };
  sbtn.addEventListener('click', ev => { ev.stopPropagation(); sm.hidden = !sm.hidden; sbtn.setAttribute('aria-expanded', String(!sm.hidden)); });
  document.addEventListener('click', closeSm);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSm(); });
  $('savePng').addEventListener('click', () => { closeSm(); saveChart('png'); });
  $('savePdf').addEventListener('click', () => { closeSm(); saveChart('pdf'); });
  $('saveTxt').addEventListener('click', () => { closeSm(); saveChart('txt'); });
  $('saveRoot').addEventListener('click', () => { closeSm(); saveChart('root'); });
  $('saveWrap').hidden = false;      // inside Claude the viewer's download feature is used, elsewhere a normal browser download
  $('axE').addEventListener('click', () => setX(false));
  $('axT').addEventListener('click', () => setX(true));
  $('reset').addEventListener('click', () => { delete S.pulse[curFac().id]; delete S.tg[curFac().id]; applyFacDefaults(); update(); });
  $('natoms').addEventListener('input', () => {
    const n = readNum('natoms');
    if (n >= 0 && S.mpa > 0) { S.mass = n * S.mpa * 1e3; $('mass').value = fmtField(S.mass); syncThick(); }
    schedule();
  });
  $('mass').addEventListener('input', () => { S.mass = readNum('mass'); syncThick(); schedule(); });
  $('thick').addEventListener('input', () => {
    const t = readNum('thick');
    if (t > 0 && S.dens > 0 && S.area > 0) { S.mass = S.dens * S.area * t * 1e-4 * 1e3; $('mass').value = fmtField(S.mass); }
    schedule();
  });
  $('dens').addEventListener('input', () => { S.dens = readNum('dens'); S.densUser = true; syncThick(); applyElementDensity(); schedule(); });
  $('densReset').addEventListener('click', () => { S.densUser = false; applyElementDensity(); update(); });
  $('emin').addEventListener('input', () => { S.emin = readNum('emin'); S.zx = null; schedule(); });
  $('emax').addEventListener('input', () => { S.emax = readNum('emax'); S.zx = null; schedule(); });
  $('axReset').addEventListener('click', () => { S.zx = null; S.yr = {}; if (S.res) renderCharts(); });
  const setArea = () => {
    const r = readNum('area');
    S.area = r > 0 ? Math.PI * r * r : 0;
    $('areaInfo').textContent = r > 0 ? 'Circular spot: area = π r² = ' + g3(S.area) + ' cm²' : 'Enter a radius above zero.';
  };
  setArea();
  $('area').addEventListener('input', () => { setArea(); syncThick(); schedule(); });
  $('ss').addEventListener('change', e => { S.ss = e.target.checked; update(); });
  $('ssModel').addEventListener('change', e => { S.ssModel = e.target.value; $('msN').disabled = S.ssModel !== 'ms'; update(); });
  $('msN').addEventListener('input', () => { const n = Math.round(readNum('msN')); if (n >= 100) { S.msN = Math.min(n, 200000); schedule(); } });
  $('msN').disabled = true;
  const setAxis = log => { S.rateLog = log; $('axLin').setAttribute('aria-pressed', String(!log)); $('axLog').setAttribute('aria-pressed', String(log)); if (S.res) renderCharts(); };
  const setNorm = s => { S.rateSample = s; $('nrAtom').setAttribute('aria-pressed', String(!s)); $('nrSample').setAttribute('aria-pressed', String(s)); if (S.res) renderCharts(); };
  const setKind = k => { S.rateKind = k; $('qRate').setAttribute('aria-pressed', String(k === 'rate')); $('qYield').setAttribute('aria-pressed', String(k === 'yield')); $('nrAtom').disabled = $('nrSample').disabled = k === 'yield'; update(); };
  $('qRate').addEventListener('click', () => setKind('rate'));
  $('qYield').addEventListener('click', () => setKind('yield'));
  $('nrAtom').addEventListener('click', () => setNorm(false));
  $('nrSample').addEventListener('click', () => setNorm(true));
  $('axLin').addEventListener('click', () => setAxis(false));
  $('axLog').addEventListener('click', () => setAxis(true));
  $('iso').addEventListener('change', e => selectTable(parseInt(e.target.value, 10)));
  $('isoFilter').addEventListener('input', e => { S.filter = e.target.value; fillIso(false, true); });
  $('mtReset').addEventListener('click', () => {
    if (!S.tab) return;
    const rx = S.tab.rxs;
    let pick = rx.findIndex(r => r.mt === 102);
    if (pick < 0) pick = rx.findIndex(r => r.mt === 18);
    if (pick < 0) pick = Math.min(1, rx.length - 1);
    applyPrimarySel([pick]);
    $('mt').querySelectorAll('input').forEach(x => { x.checked = parseInt(x.value, 10) === pick; });
    S.view = ''; S.decView = 'follow';
    update();
  });
  $('mtClear').addEventListener('click', () => {
    if (!S.tab) return;
    applyPrimarySel([]);
    $('mt').querySelectorAll('input').forEach(x => { x.checked = false; });
    S.view = ''; S.decView = 'follow';
    update();
  });
  $('cmpCard').addEventListener('toggle', () => { if ($('cmpCard').open && S.res && S.rxView) renderCompare(S.cmpAtoms); });
  $('viewSel').addEventListener('change', e => { S.view = e.target.value; update(); });
  $('decSel').addEventListener('change', e => { S.decView = e.target.value; update(); });
  $('mt').addEventListener('change', e => {
    const idxs = Array.from($('mt').querySelectorAll('input:checked')).map(x => parseInt(x.value, 10));
    applyPrimarySel(idxs);
    update();
  });
  $('aceFile').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    loadLibrary(new Blob(files), files.length === 1 ? files[0].name : files.length + ' files');
  });
  const DEF_PATH = '/Users/ott/CIEMAT/Privada/python programs/nuclear-data-files/lib80x';
  let saved = DEF_PATH;
  try { saved = localStorage.getItem('aceFolderPath2') || DEF_PATH; } catch (e) { }
  $('libPath').value = saved;
  $('libPath').addEventListener('input', e => { try { localStorage.setItem('aceFolderPath2', e.target.value); } catch (er) { } });
  const reloadLib = async () => { const r = await libRestore(true); if (r !== 'ok') setStatus('aceStatus', r === 'none' ? 'No folder was saved in this browser: use "Choose folder…".' : 'Could not reload the folder (' + r + '). Use "Choose folder…".', true); };
  $('libReload').addEventListener('click', reloadLib); $('setupLibReload').addEventListener('click', reloadLib);
  $('pickDir').addEventListener('click', async () => {
    let h = null;
    if (window.showDirectoryPicker) {                                  // Chromium: keeps a handle so that a setup can reload the folder
      try { h = await window.showDirectoryPicker({ mode: 'read' }); }
      catch (e) { if (e && e.name === 'AbortError') return; h = null; }
    }
    if (!h) { $('dirInput').click(); return; }
    try {
      await LibStore.set({ handle: h, name: h.name, path: $('libPath').value });
      setStatus('aceStatus', 'Reading the folder "' + h.name + '"…');
      await loadFolder(await dirFiles(h, h.name + '/', []));
    } catch (e) { setStatus('aceStatus', 'Could not read the folder: ' + ((e && e.message) || e), true); }
  });
  $('dirInput').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) {
      setStatus('aceStatus', 'The browser returned no files for that folder. Accept the upload prompt if one appeared, or use the single-file chooser below.', true);
      return;
    }
    setStatus('aceStatus', 'Received ' + files.length + ' files from the folder…');
    loadFolder(files).catch(err => setStatus('aceStatus', 'Could not read the folder: ' + (err && err.message ? err.message : err), true));
  });
  $('copyPath').addEventListener('click', () => {
    const v = $('libPath').value;
    const fallback = () => { $('libPath').focus(); $('libPath').select(); setStatus('aceStatus', 'Path selected. Press Ctrl/⌘+C to copy it.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(() => setStatus('aceStatus', 'Path copied.'), fallback);
    else fallback();
  });
  $('fxFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) f.text().then(t => { $('fxText').value = t; });
  });
  $('fxApply').addEventListener('click', () => {
    try {
      const F = curFac();
      S.custom[F.id] = parseFluxText($('fxText').value, parseFloat($('fxE').value), $('fxQ').value, F);
      setStatus('fxStatus', 'Using your table (' + S.custom[F.id].E.length + ' points).');
      update();
    } catch (err) { setStatus('fxStatus', err.message, true); }
  });
  $('fxClear').addEventListener('click', () => { delete S.custom[S.facId]; setStatus('fxStatus', 'Using ' + S.fluxSource + ' (' + curFac().flux.E.length + ' points).'); update(); });
  if (window.ResizeObserver) {
    let w = 0;
    new ResizeObserver(en => { const nw = Math.floor(en[0].contentRect.width); if (nw !== w) { w = nw; requestAnimationFrame(() => { if (S.res) renderCharts(); }); } }).observe($('chartHost'));
  }
}

function loadFluxText(text, name) {
  const prev = FAC.length ? curFac().title : '';
  setFacilities(parseFluxFile(text));
  S.custom = {};
  S.fluxSource = name;
  S.facId = (FAC.find(F => F.title === prev) || FAC.find(F => /ear1/i.test(F.name)) || FAC[0]).id;
  initFacilities();
}
loadFluxText(FLUX_DEFAULT, 'Fluxes01.txt');
bind();
setStatus('aceStatus', 'No cross sections loaded yet. Choose the folder that holds xsdir, or a single ACE file.');
setupBind(); exBind(); decBind(); decRestore(false); modalDrag();
// Chrome / Edge: reload the library folder chosen earlier as soon as the page opens when the browser still allows it.
(async function libAuto() {
  try {
    if (S.tables.length || !window.showDirectoryPicker) return;
    const rec = await LibStore.get(); if (!rec || !rec.handle) return;
    const pm = await rec.handle.queryPermission({ mode: 'read' });
    if (pm === 'granted') { if (!S.tables.length) await libRestore(false); }
    else if (!S.tables.length) { $('libReload').hidden = false; $('setupLibReload').hidden = false; setStatus('aceStatus', 'Saved library folder "' + rec.name + '" found: press "Reload saved library" (choose "Allow on every visit" to load it automatically next time).'); }
  } catch (e) { }
})();
// Errors that nothing caught are shown in the status line instead of being lost in the console.
{
  const show = msg => {
    if (!msg || /ResizeObserver/.test(msg)) return;
    const el = $('aceStatus'); if (!el) return;
    $('setupMsg').textContent = '';
    el.textContent = 'Unexpected error: ' + String(msg).slice(0, 200) + ' (reload the page if the display looks wrong)'; el.classList.add('err');
  };
  window.addEventListener('error', ev => show(ev.message));
  window.addEventListener('unhandledrejection', ev => show(ev.reason && ev.reason.message ? ev.reason.message : ev.reason));
}

// the dialogs (layer radioactivity, decay data, spectra, layers) can be moved by their title bar; they return to the centre when reopened
function modalDrag() {
  document.querySelectorAll('.lmod').forEach(mod => {
    const dlg = mod.querySelector('.ldlg'), hd = dlg && dlg.querySelector('.lh'); if (!hd) return;
    let o = null, x = 0, y = 0;
    const put = () => { dlg.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
    hd.title = 'Drag to move'; hd.style.cursor = 'move'; hd.style.touchAction = 'none'; hd.style.userSelect = 'none';
    hd.addEventListener('pointerdown', ev => { if (ev.target.closest('button,input,select')) return; o = { px: ev.clientX - x, py: ev.clientY - y }; try { hd.setPointerCapture(ev.pointerId); } catch (e) { } });
    hd.addEventListener('pointermove', ev => {
      if (!o) return; const r = dlg.getBoundingClientRect();
      const nx = ev.clientX - o.px, ny = ev.clientY - o.py, dx = nx - x, dy = ny - y;           // keep the title bar inside the screen
      if (r.right + dx < 80 || r.left + dx > innerWidth - 80 || r.top + dy < 0 || r.top + dy > innerHeight - 40) return;
      x = nx; y = ny; put();
    });
    const end = () => { o = null; };
    hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
    new MutationObserver(() => { if (mod.hidden) { x = 0; y = 0; put(); } }).observe(mod, { attributes: true, attributeFilter: ['hidden'] });
  });
}

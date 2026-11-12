// ---------- xsdir ----------
function parseXsdir(text) {
  const raw = text.split(/\r?\n/);
  const start = raw.findIndex(l => /^\s*directory\s*$/i.test(l));
  const lines = [];
  let acc = '';
  for (let i = start + 1; i < raw.length; i++) {
    let l = raw[i];
    if (acc) { l = acc + ' ' + l.trim(); acc = ''; }
    if (/\+\s*$/.test(l)) { acc = l.replace(/\+\s*$/, ''); continue; }
    lines.push(l);
  }
  if (acc) lines.push(acc);
  const out = [];
  let binary = 0;
  for (const l of lines) {
    const t = l.trim().split(/\s+/);
    if (t.length < 7 || !/^\d+\.\w*c$/i.test(t[0])) continue;
    if (t[4] !== '1') { binary++; continue; }
    const info = zaidInfo(t[0]);
    const temp = parseFloat(t[9]);
    out.push({ xs: true, zaid: t[0], awr: parseFloat(t[1]), fileName: t[2], address: parseFloat(t[5]), temp: temp > 0 ? temp : 0,
               comment: '', label: info.label, key: info.key + ' ' + t[2].toLowerCase() });
  }
  out.binary = binary;
  // optional header line  datapath=<folder>  (MCNP convention): the folder with the ACE files
  const dpl = raw.slice(0, start > 0 ? start : 0).map(l => /^\s*datapath\s*=\s*(.+?)\s*$/i.exec(l)).filter(Boolean).pop();
  out.datapath = dpl ? dpl[1].replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/\/+$/, '') : '';
  return out;
}
function findAceFile(t) {
  const F = S.files;
  if (!F) return null;
  const name = t.fileName.replace(/\\/g, '/').replace(/^\.\//, '');
  const base = name.split('/').pop().toLowerCase();
  const sub = '';
  const dp = (S.datapath || '').replace(/^\.\//, ''), dparts = dp.split('/').filter(Boolean), dtries = [];
  if (dp && !/^(\/|[A-Za-z]:)/.test(dp)) dtries.push((dp + '/' + name).toLowerCase());          // relative datapath
  for (let k = Math.min(3, dparts.length); k >= 1; k--) dtries.push((dparts.slice(-k).join('/') + '/' + base).toLowerCase());  // absolute: its last folders
  const tries = [name.toLowerCase()].concat(dtries, [(sub ? sub + '/' : '') + base, base]);
  for (const k of tries) if (F.byRel.has(k)) return F.byRel.get(k);
  const l = F.byBase.get(base);
  return l && l.length ? l[0] : null;
}
async function loadXsdir(all, xf) {
  const my = ++S.token;
  setStatus('aceStatus', 'Reading xsdir…');
  const text = new TextDecoder('latin1').decode(await xf.arrayBuffer());
  const entries = parseXsdir(text);
  S.datapath = entries.datapath || '';
  if (!entries.length) {
    const head = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 4).map(l => l.slice(0, 60)).join(' | ');
    setStatus('aceStatus', 'Found "' + (xf.webkitRelativePath || xf.name) + '" among ' + all.length + ' files, but it has no ASCII neutron (…c) entries' + (entries.binary ? ' (' + entries.binary + ' binary entries skipped; binary ACE is not supported)' : '') + '. First lines: ' + head, true);
    return;
  }
  const rp0 = (xf.webkitRelativePath || xf.name).split('/');
  const root = rp0.slice(0, -1).join('/');
  const byRel = new Map(), byBase = new Map();
  for (const f of all) {
    const rp = f.webkitRelativePath || f.name;
    const rel = root && rp.indexOf(root + '/') === 0 ? rp.slice(root.length + 1) : rp;
    byRel.set(rel.toLowerCase(), f);
    const b = f.name.toLowerCase();
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(f);
  }
  if (my !== S.token) return;
  entries.sort((a, b) => parseInt(a.zaid, 10) - parseInt(b.zaid, 10) || a.zaid.localeCompare(b.zaid));
  S.files = { byRel, byBase }; S.scanCache = new Map();
  // library name = last folder of the datapath= line, otherwise the folder that holds xsdir
  S.libName = (S.datapath || '').split('/').filter(Boolean).pop() || (root ? root.split('/').pop() : '');
  S.blob = null; S.tables = entries; S.tab = null; S.tabIdx = -1;
  let nMissing = 0;
  for (const e of entries) { e.missing = !findAceFile(e); if (e.missing) nMissing++; }
  S.nMissing = nMissing;
  setStatus('aceStatus', (S.libName ? 'Library: ' + S.libName + ' · ' : '') + 'xsdir at "' + (xf.webkitRelativePath || xf.name) + '": ' + entries.length + ' isotope tables · ' + all.length + ' files in the folder' + (entries.binary ? ' · ' + entries.binary + ' binary entries skipped' : ''));
  if (nMissing) { const el = $('aceStatus'); el.textContent += ' · WARNING: ' + nMissing + ' table' + (nMissing === 1 ? '' : 's') + ' of xsdir ha' + (nMissing === 1 ? 's' : 've') + ' no file in this folder (shown as "file missing" and not counted as data).'; el.classList.add('err'); }
  fillIso(true);
}

async function loadFolder(all) {
  setStatus('aceStatus', 'Looking for xsdir among ' + all.length + ' files…');
  const xf = all.filter(f => /^xsdir/i.test(f.name)).sort((a, b) => (a.webkitRelativePath || '').split('/').length - (b.webkitRelativePath || '').split('/').length || (a.name.toLowerCase() === 'xsdir' ? 0 : 1) - (b.name.toLowerCase() === 'xsdir' ? 0 : 1))[0];
  if (xf) { S.files = null; const r = await loadXsdir(all, xf); try { decAuto(all, xf); } catch (e) { } return r; }
  S.files = null; S.libName = '';
  const my = ++S.token;
  const cand = all.filter(f => f.size >= 1500 && !/\.(txt|md|pdf|xml|json|py|csv|html?|png|jpe?g|zip|gz|tar|log|sh)$/i.test(f.name) && !/^(xsdir|xsdata|\.)/i.test(f.name));
  if (!cand.length) { setStatus('aceStatus', 'That folder has no files that look like ACE tables.', true); return; }
  const tables = [];
  let next = 0, done = 0, skipped = 0;
  const skippedNames = [];
  const dec = new TextDecoder('latin1');
  const worker = async () => {
    while (next < cand.length) {
      const f = cand[next++];
      try {
        const head = dec.decode(await f.slice(0, 8192).arrayBuffer()).split('\n').slice(0, 80).map(s => s.replace(/\r$/, ''));
        const h = parseAceHeader(head);
        const approx = (h.hlen + Math.ceil(h.nxs[0] / 4)) * 81;
        if (f.size > approx * 1.1) {
          for (const t of await scanAce(f)) { t.file = f; tables.push(t); }
        } else {
          const info = zaidInfo(h.zaid);
          tables.push({ zaid: h.zaid, awr: h.awr, temp: h.temp, comment: h.comment, label: info.label, key: info.key + ' ' + f.name.toLowerCase(), nes: h.nxs[2], file: f, start: 0, end: f.size });
        }
      } catch (e) { skipped++; if (skippedNames.length < 4) skippedNames.push(f.name + ' (' + String((e && e.message) || e).slice(0, 60) + ')'); }
      done++;
      if (done % 40 === 0 && my === S.token) setStatus('aceStatus', 'Reading headers… ' + done + ' / ' + cand.length + (cand.length > 1500 ? ' (an xsdir file in the folder makes loading instant)' : ''));
    }
  };
  setStatus('aceStatus', 'No xsdir in this folder: reading the headers of ' + cand.length + ' files' + (cand.length > 1500 ? ' - this can take a while; an xsdir file in the folder makes loading instant' : '') + '…');
  await Promise.all(Array.from({ length: 16 }, worker));
  if (my !== S.token) return;
  if (!tables.length) { setStatus('aceStatus', 'No readable ACE tables found (' + cand.length + ' files checked).', true); return; }
  tables.sort((a, b) => parseInt(a.zaid, 10) - parseInt(b.zaid, 10) || a.temp - b.temp);
  S.blob = null; S.tables = tables; S.tab = null; S.tabIdx = -1;
  setStatus('aceStatus', 'Folder: ' + tables.length + ' tables from ' + cand.length + ' files' + (skipped ? ' (' + skipped + ' file' + (skipped === 1 ? '' : 's') + ' could not be read as ACE, for example ' + skippedNames.join('; ') + ')' : ''), skipped > 0 && skipped === cand.length);
  fillIso(true);
}
function fillIso(forceLoad, defer) {
  if (forceLoad && (S.comps.length || S.layOn.front || S.layOn.back)) { S.comps = []; S.layOn = { win: S.layOn.win, front: false, back: false }; S.stash = { front: [], back: [] }; renderComps(); }
  const want = forceLoad && S.pending ? setupFindTab(S.pending.isotope) : -1;     // isotope asked for by a loaded setup
  if (want >= 0) { S.filter = ''; $('isoFilter').value = ''; }
  const q = S.filter.trim().toLowerCase().replace(/\s+/g, ' ');
  const list = [];
  S.tables.forEach((t, i) => { if (!q || t.key.indexOf(q) >= 0) list.push(i); });
  const shown = list.slice(0, 800);
  if (want >= 0 && shown.indexOf(want) < 0) shown.unshift(want);
  $('iso').innerHTML = shown.map(i => {
    const t = S.tables[i];
    return '<option value="' + i + '"' + (t.missing ? ' disabled' : '') + '>' + esc(t.label + ' · ' + t.zaid + (t.temp > 0 ? ' · ' + Math.round(t.temp / MEV_PER_K) + ' K' : '') + (t.missing ? ' · file missing' : t.bad ? ' · damaged' : '')) + '</option>';
  }).join('') || '<option value="-1">No match</option>';
  if (!shown.length) {
    $('isoErr').textContent = 'Isotope "' + S.filter.trim() + '" was not found in ' + (S.files ? 'xsdir' : 'the loaded library') + '. Check the ZAID (for example 26056.80c) or the name (Fe-56).';
    return;
  }
  $('isoErr').textContent = '';
  const keep = shown.indexOf(S.tabIdx) >= 0 && !forceLoad;
  const idx = want >= 0 ? want : keep ? S.tabIdx : (shown.find(i => !S.tables[i].missing && !S.tables[i].bad) ?? shown.find(i => !S.tables[i].missing) ?? shown[0]);
  $('iso').value = String(idx);
  if (S.pending) {                                                       // a setup is waiting for the library
    if (want < 0) { S.pending.isotope = null; setStatus('aceStatus', 'The isotope of the setup is not in this library; the first table is used.', true); }
    else S.mts = new Set((S.pending.isotope.reactions || []).length ? S.pending.isotope.reactions : [102]);
    clearTimeout(S.lt); selectTable(idx).then(setupFinish); return;
  }
  if (!keep || !S.tab) {
    clearTimeout(S.lt);
    if (defer) S.lt = setTimeout(() => selectTable(idx), 300); else selectTable(idx);
  }
}
// Message for a table that cannot be read; a damaged table is flagged so that the lists and the chart of nuclides do not offer it as good data.
function tableProblem(t, e) {
  const m = (e && e.message) || String(e);
  if (!t) return m;
  if (/damaged|cut off|not readable|binary|not an ACE|incomplete|Empty ACE|does not contain|NXS/.test(m)) { t.bad = m; fillIsoLabels(t); return 'Table ' + t.zaid + (t.fileName ? ' (file "' + t.fileName + '")' : '') + ' cannot be used: ' + m.replace(/^File "[^"]*": /, '').replace(/\.$/, '') + '.'; }
  return m;
}
function fillIsoLabels(t) {
  NV.availSrc = null; if (!$('nuclWin').hidden) nuclDraw();
  const o = t && $('iso').querySelector('option[value="' + S.tables.indexOf(t) + '"]');
  if (o && !/damaged/.test(o.textContent)) o.textContent += ' · damaged';
}
async function selectTable(idx) {
  const t = S.tables[idx];
  if (!t) return;
  const my = ++S.token;
  S.tabIdx = idx;
  $('isoErr').textContent = '';
  try {
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
    const buf = await src.slice(start, end).arrayBuffer();
    const tab = buildTable(new TextDecoder('latin1').decode(buf));
    if (my !== S.token) return;
    tab.label = t.label;
    S.tab = tab;
    applyElementDensity();
    const prev = S.mts && S.mts.size ? S.mts : new Set([102]);
    let sel = [];
    tab.rxs.forEach((r, i) => { if (prev.has(r.mt)) sel.push(i); });
    if (!sel.length) {
      let pick = tab.rxs.findIndex(r => r.mt === 102);
      if (pick < 0) pick = tab.rxs.findIndex(r => r.mt === 18);
      if (pick < 0) pick = Math.min(1, tab.rxs.length - 1);
      sel = [pick];
    }
    applyPrimarySel(sel);
    $('mt').innerHTML = tab.rxs.map((r, i) => '<label><input type="checkbox" value="' + i + '"' + (sel.indexOf(i) >= 0 ? ' checked' : '') + '> <span>' + esc(mtLabel(r)) + '</span></label>').join('');
    update();
  } catch (e) {
    if (my !== S.token) return;
    S.tab = null; S.rx = null;
    $('mt').innerHTML = '';
    $('isoErr').textContent = tableProblem(t, e);
    update();
  }
}

function applyPrimarySel(idxs) {
  idxs = idxs.slice().sort((a, b) => a - b);
  S.rxs = idxs.map(i => S.tab.rxs[i]);
  S.rx = S.rxs[0] || null;
  S.mts = new Set(S.rxs.map(r => r.mt));
}
function readNum(id) { const v = parseFloat($(id).value); return isFinite(v) ? v : NaN; }

function parseFluxText(text, eUnit, qty, F) {
  const E = [], V = [];
  for (const raw of text.split(/\r?\n/)) {
    const ln = raw.trim();
    if (!ln || /^[#%;!/]/.test(ln)) continue;
    const t = ln.split(/[\s,;]+/).map(Number);
    if (t.length >= 2 && isFinite(t[0]) && isFinite(t[1]) && t[0] > 0) { E.push(t[0] * eUnit); V.push(t[1]); }
  }
  if (E.length < 2) throw new Error('Need at least two numeric rows (energy, value).');
  const idx = E.map((_, i) => i).sort((a, b) => E[a] - E[b]);
  const Es = idx.map(i => E[i]);
  const Vs = idx.map((i, k) => {
    const v = V[i];
    if (qty === 'mev') return v * Es[k];
    if (qty === 'pulse') return v * F.f;
    return v;
  });
  return { E: Float64Array.from(Es), V: Float64Array.from(Vs) };
}

function pulseDef(F) {
  // n_TOF: the proton pulse has σ = 7 ns, shown as 16.484 ns when the widths are FWHM.
  if (/^n_?tof/i.test(F.name)) return Math.round((S.resK === 'sigma' ? 7 : 7 * 2.354820045) * 1000) / 1000;
  return /gelina/i.test(F.name) ? 1 : /^nfs/i.test(F.name) ? 5.6 : /dones/i.test(F.name) ? 5.6 : /tof/i.test(F.name) ? 7 : 0; }
function pulseOf(F) { const v = F.id in S.pulse ? S.pulse[F.id] : pulseDef(F); return v > 0 ? v : 0; }
// Target/moderator spread. EAR1 and EAR2 use their Monte Carlo resolution function; NEAR uses a fixed path-length spread of 40 cm
// (its Monte Carlo function is only an extrapolation and remains selectable); every other beam line uses a fixed spread of 0.5 cm.
function tgDef(F) { return /near/i.test(F.name) ? { mode: 'dl', dL: 40 } : rfOf(F) ? { mode: 'rf', dL: 0 } : { mode: 'dl', dL: 0.5 }; }
function tgOf(F) {
  const v = F.id in S.tg ? S.tg[F.id] : tgDef(F), rf = rfOf(F);
  const mode = v.mode === 'rf' && rf ? 'rf' : 'dl';
  return { mode, dL: v.dL > 0 ? v.dL : 0, rf: mode === 'rf' ? rf : null };
}
// Flight path of the resolution: the one in the beam line name, or the one of the resolution function.
function resL(F) { const g = tgOf(F); return g.mode === 'rf' ? g.rf.L : F.L; }
function resParts(F) {
  const k = S.resK === 'sigma' ? 1 : 1 / 2.354820045;
  const tg = tgOf(F), sp = tg.mode === 'rf' && tg.rf.pulseIncluded ? 0 : pulseOf(F) * k, sa = (S.resW > 0 ? S.resW : 0) * k;
  return { sp, sa, s: Math.sqrt(sp * sp + sa * sa), tg, tgOn: tg.mode === 'rf' || tg.dL > 0 };
}
function resParams(F) { const pr = resParts(F); return S.resOn && (pr.s > 0 || pr.tgOn) ? { L: resL(F), sigT: pr.s, tg: pr.tgOn ? pr.tg : null } : null; }
function integrateR(rx, flux, sc, emin, emax, tot, nAtB, rp, ms, pre) {
  const r = integrate(rx, flux, sc, emin, emax, tot, nAtB, ms, pre);
  return rp ? applyResolution(r, rp.L, rp.sigT, rp.tg) : r;
}

function update() {
  winEnsure();
  const F = curFac();
  const warn = [];
  if (!(S.f > 0)) warn.push('Repetition rate must be above zero.');
  if (!(S.L > 0)) warn.push('Flight path must be above zero.');
  if (!(S.emin > 0) || !(S.emax > S.emin)) warn.push('Energy window needs 0 < E min < E max.');
  $('warn').textContent = warn.join(' ');
  $('nom').textContent = 'Nominal: ' + fmtRep(F.f) + ', ' + F.L + ' m';
  const ew = (S.f > 0 && S.L > 0) ? frameOverlapE(S.L, S.f) : NaN;
  const sc = (S.f > 0 && S.L > 0) ? (S.f / F.f) * Math.pow(F.L / S.L, 2) : NaN;
  $('facInfo').innerHTML =
    '<dt>Pulse spacing</dt><dd>' + (S.f > 0 ? fmtTime(1 / S.f) : '–') + '</dd>' +
    '<dt>Fluence scale vs nominal</dt><dd>' + (isFinite(sc) ? sci(sc, 3) : '–') + '</dd>' +
    '<dt>Pulse overlap below</dt><dd>' + (isFinite(ew) ? fmtEnergy(ew) : '–') + '</dd>';

  const t = S.tab;
  $('tabInfo').innerHTML = t
    ? (S.libName ? '<dt>Library</dt><dd>' + esc(S.libName) + '</dd>' : '') + '<dt>ZAID</dt><dd>' + esc(t.zaid) + '</dd><dt>AWR</dt><dd>' + t.awr.toFixed(4) + '</dd><dt>Temperature</dt><dd>' + Math.round(t.temp / MEV_PER_K) + ' K</dd><dt>Energy points</dt><dd>' + t.nes + '</dd><dt>Comment</dt><dd>' + esc(t.comment) + '</dd>'
    : '';

  if (!t || warn.length) {
    $('sel' + 'Line').innerHTML = '';
    $('sum').innerHTML = '';
    $('chartHost').innerHTML = '';
    $('cmp').innerHTML = ''; $('dec').innerHTML = '';
    S.res = null;
    decRenderAll();
    return;
  }

  let mpa = t.awr * NEUTRON_U / NAVO;
  for (const c of S.comps) if (c.tab && c.ratio > 0 && layerOf(c) === 'sample') mpa += c.ratio * c.tab.awr * NEUTRON_U / NAVO;   // mass of the sample layer only
  S.mpa = mpa;
  const atoms = (S.mass > 0 ? S.mass : 0) * 1e-3 / mpa;
  S.atoms = atoms; S.awr = t.awr;
  if (document.activeElement !== $('natoms')) $('natoms').value = atoms > 0 ? atoms.toPrecision(5).replace(/\.?0+e/, 'e').replace('e+', 'e') : '';
  // A yield can never exceed 1, so the yield plot always includes the attenuation in the sample (first-collision model)
  S.nAtB = ((S.ss || S.rateKind === 'yield') && S.area > 0) ? atoms / S.area * 1e-24 : 0;   // atoms per barn
  S.totXs = t.rxs.find(r => r.mt === 1);
  // Layers along the beam: front layer (container), sample (primary isotope + its additional components), sample backing.
  // Every layer shields with its own total cross sections; a layer is attenuated by all layers in front of it.
  computeEff(atoms);
  decRenderAll();
  const act = S.comps.filter(c => c.tab && c.eff > 0);
  const LAYS = ['front', 'sample', 'back'];
  const layIso = { front: [], sample: [{ r: 1, tab: t }], back: [] };
  act.forEach(c => layIso[layerOf(c)].push({ r: c.eff, tab: c.tab }));
  const lists = {};
  LAYS.forEach(l => { lists[l] = layIso[l].map(o => { const tr = o.tab.rxs.find(r => r.mt === 1); return tr ? { E: tr.E, xs: tr.xs, w: S.nAtB * o.r } : null; }).filter(Boolean); });
  const preOf = l => LAYS.slice(0, LAYS.indexOf(l)).reduce((a, q) => a.concat(lists[q]), []);
  const multi = layIso.front.length > 0 || layIso.back.length > 0;
  S.shield = lists.sample; S.multiLayer = multi;
  const RP = resParams(F);
  // ---- multiple-scattering correction (Monte Carlo): computed in the background, cached, applied when ready
  const isoTabs = [{ r: 1, tab: t }].concat(act.map(c => ({ r: c.eff, tab: c.tab })));
  const chList = S.rxs.map(rx => ({ id: 'p:' + rx.mt, r: 1, rx, layer: 1 }));
  act.forEach(c => { const g = 'c' + S.comps.indexOf(c); c.mts.forEach(i => { const rx = c.tab.rxs[i]; if (rx) chList.push({ id: g + ':' + rx.mt, r: c.eff, rx, layer: LAYS.indexOf(layerOf(c)) }); }); });
  const modelOn = S.nAtB > 0 && !!S.totXs && chList.length > 0;
  const useMs = S.ssModel === 'ms' && modelOn, useAn = S.ssModel === 'ms1' && modelOn;
  // elastic cross sections (MT 2) with the same weights as the shielding list, for the analytic second-collision term
  const elas = [], elasL = {};
  if (useAn) { LAYS.forEach(l => { elasL[l] = layIso[l].map(o => { const e = o.tab.rxs.find(r => r.mt === 2); return e ? { E: e.E, xs: e.xs, w: S.nAtB * o.r } : null; }).filter(Boolean); }); elas.push(...elasL.sample); }
  let msC = null;
  if (useMs) {
    const key = [S.nAtB.toPrecision(9), S.msN, S.emin, S.emax].concat(LAYS.map(l => l + ':' + layIso[l].map(o => o.r + '*' + S.tables.indexOf(o.tab) + '@' + o.tab.temp).join(',')), chList.map(c => c.id + '@' + c.layer)).join('|');
    if (S.msCache && S.msCache.key === key) msC = S.msCache;
    else if (S.msBusy !== key) msStart(key, layIso, chList);
  } else { S.msTok++; S.msBusy = null; }
  S.msUsed = !!msC || useAn;
  const msFor = (ids, ratio, layer) => {
    if (useAn && multi) return { an: { el: [], lay: { tl: LAYS.map(l => lists[l]), te: LAYS.map(l => elasL[l]), k: LAYS.indexOf(layer || 'sample') } }, ratio };
    if (useAn) return { an: { el: elas }, ratio };
    if (!msC) return null;
    const Y = new Float64Array(msC.lnE.length);
    for (const id of ids) { const a = msC.Y[id]; if (a) for (let i = 0; i < Y.length; i++) Y[i] += a[i]; }
    return { lnE: msC.lnE, Y, ratio };
  };
  const mk = (grp, gname, ratio, list, layer) => {
    const self = lists[layer], pre = preOf(layer);
    const out = list.map(rx => { const ms = msFor([grp + ':' + rx.mt], ratio, layer); return { key: grp + ':mt:' + rx.mt, grp, gname, ratio, rx, sum: false, ms, layer, self, pre, res: integrateR(rx, fluxOf(F), sc, S.emin, S.emax, self, S.nAtB, RP, ms, pre) }; });
    if (list.length > 1) { const sx = sumRx(list), ms = msFor(list.map(rx => grp + ':' + rx.mt), ratio, layer); out.push({ key: grp + ':sum', grp, gname, ratio, rx: sx, sum: true, ms, layer, self, pre, res: integrateR(sx, fluxOf(F), sc, S.emin, S.emax, self, S.nAtB, RP, ms, pre) }); }
    return out;
  };
  let items = mk('p', t.label + (act.length ? ' (primary)' : ''), 1, S.rxs, 'sample');
  act.forEach(c => { if (c.mts.length) items = items.concat(mk('c' + S.comps.indexOf(c), c.tab.label + (layerOf(c) === 'sample' ? '' : ' (' + layerName(c).toLowerCase() + ')'), c.eff, c.mts.map(i => c.tab.rxs[i]), layerOf(c))); });
  const grpIds = Array.from(new Set(items.map(x => x.grp)));
  const gts = grpIds.map(g => { const gi = items.filter(x => x.grp === g); return gi.find(x => x.sum) || gi[0]; });
  if (gts.length > 1) {
    const sx = sumRx(gts.map(x => x.rx), gts.map(x => x.ratio));
    sx.sym = 'Σ all isotopes';
    const msA = multi ? null : msFor(chList.map(c => c.id), 1);
    // with several layers every group has its own shielding, so the total is the sum of the group results
    items.push({ key: 'all:total', grp: 'all', gname: 'Compound (all isotopes)', ratio: 1, rx: sx, sum: true, all: true, gts, ms: msA, parts: multi ? gts : null, self: lists.sample, pre: [],
      res: multi ? sumRes(gts.map(g => ({ res: g.res, w: g.ratio }))) : integrateR(sx, fluxOf(F), sc, S.emin, S.emax, S.shield, S.nAtB, RP, msA) });
  }
  S.items = items;
  if (!items.length) {                                               // nothing ticked: no curves, only a note
    $('selLine').innerHTML = '';
    $('sum').innerHTML = '<div class="note">No reaction channel is selected. Tick a reaction of the primary isotope or of an additional component to see rates. An isotope without a ticked reaction still shields the sample.</div>';
    $('chartHost').innerHTML = ''; $('cmp').innerHTML = ''; $('dec').innerHTML = ''; $('compTab').innerHTML = '';
    $('compCard').hidden = true; $('viewSel').innerHTML = ''; $('decSel').innerHTML = ''; $('msStat').textContent = '';
    S.res = null; S.chartData = null; S.extraRes = [];
    return;
  }
  // when the selection changes so that a sum appears (several reactions or several isotopes), show the sum
  const sig = items.map(x => x.key).join('|');
  if (sig !== S.itemSig) {
    S.itemSig = sig;
    const top = items.find(x => x.all) || (gts.length === 1 ? items.find(x => x.sum) : null);
    if (top) S.view = top.key;
  }
  const vi = items.find(x => x.key === S.view) || items.find(x => x.all) || items.find(x => x.sum) || items[0];
  S.view = vi.key; S.rxView = vi.rx; S.msView = vi.ms || null; S.viewItem = vi;
  const di = S.decView === 'follow' ? vi : (items.find(x => x.key === S.decView) || vi);
  const ilab = it => it.all ? 'Σ over isotopes, weighted by atoms' : it.sum ? 'Σ selected reactions' : it.rx.sym + ' · MT ' + it.rx.mt;
  const iname = it => it.all ? 'Σ all isotopes' : (it.grp === 'p' ? '' : it.gname + ' ') + (it.sum ? 'Σ selected' : it.rx.sym + ' (MT ' + it.rx.mt + ')');
  const optsOf = (selFn) => {
    const groups = [];
    items.forEach(it => { let g = groups.find(x => x.grp === it.grp); if (!g) groups.push(g = { grp: it.grp, gname: it.gname, list: [] }); g.list.push(it); });
    return groups.map(g => {
      const o = g.list.map(it => '<option value="' + it.key + '"' + (selFn(it) ? ' selected' : '') + '>' + esc(ilab(it)) + '</option>').join('');
      return groups.length > 1 ? '<optgroup label="' + esc(g.gname) + '">' + o + '</optgroup>' : o;
    }).join('');
  };
  $('viewSel').innerHTML = optsOf(it => it === vi);
  $('decSel').innerHTML = '<option value="follow"' + (S.decView === 'follow' ? ' selected' : '') + '>same as results</option>' + optsOf(it => S.decView !== 'follow' && it === di);
  const res = vi.res;
  S.res = res;
  S.viewName = iname(vi); S.viewAtoms = atoms * vi.ratio; S.atomsP = atoms;
  S.itemName = iname;
  S.viewAll = !!vi.all;
  S.extraRes = vi.all
    ? vi.gts.map(g => ({ rx: g.rx, name: g.gname + ' · ' + (g.sum ? 'Σ selected' : g.rx.sym + ' (MT ' + g.rx.mt + ')'), res: { E: g.res.E, sig: Float64Array.from(g.res.sig, v => v * g.ratio), rho: Float64Array.from(g.res.rho, v => v * g.ratio), phi: g.res.phi } }))
    : items.filter(x => x !== vi && x.grp === vi.grp).map(x => ({ rx: x.rx, res: x.res, name: iname(x) }));
  const vatoms = atoms * vi.ratio;
  const perAtom = res.total, inSample = perAtom * vatoms, perPulse = inSample / S.f;
  const reduction = res.totalThin > 0 ? res.total / res.totalThin : 1;
  $('ssInfo').textContent = S.ss
    ? (S.area > 0 ? 'Areal density ' + sciTxt(S.nAtB, 3) + ' atoms/b' + (S.dens > 0 ? ' · thickness ' + g3(S.mass * 1e-3 / (S.dens * S.area) * 1e4) + ' µm' : '') + ' · peak optical depth ' + sciTxt(res.tauMax, 2) + ' · rate = ' + (100 * reduction).toFixed(reduction < 0.1 ? 2 : 1) + ' % of the thin-sample value' : 'Enter a beam spot radius above zero.')
    : 'Thin-sample rate (no self-shielding).';
  (() => {                                                           // status of the multiple-scattering model
    const st = $('msStat');
    if (S.ssModel === 'first') { st.textContent = ''; return; }
    if (!(S.nAtB > 0)) { st.textContent = 'Multiple scattering needs self-shielding (tick it) and a beam spot radius above zero.'; return; }
    if (S.ssModel === 'ms1' && !S.rxs.length) { st.textContent = ''; return; }
    if (!S.msUsed) return;                                           // the runner is writing the progress
    const a = calcItem(vi, F, sc, null), b = calcItem(vi, F, sc, null, true);
    const gain = b.total > 0 ? 100 * (a.total / b.total - 1) : 0;
    st.textContent = (S.ssModel === 'ms1' ? 'Second-collision correction on (analytic, elastic scattering from MT 2' + (S.shield.length > 1 || true ? '' : '') + '). ' : 'Multiple-scattering correction on: ' + S.msCache.nodes + ' energies × ' + S.msN + ' histories (' + S.msCache.sec.toFixed(1) + ' s). ') + 'The total rate of the chosen reaction is ' + (gain >= 0 ? '+' : '') + gain.toFixed(gain < 1 ? 2 : 1) + ' % compared with the first-collision model.';
  })();

  (() => {
    const pr = resParts(F), LF = resL(F), K = 2.354820045;
    if (!(pr.s > 0) && !pr.tgOn) { $('resInfo').textContent = 'Enter a pulse width, an additional width or a path-length spread above zero.'; return; }
    const isRf = pr.tg.mode === 'rf';
    const fw = E => Math.sqrt(Math.pow(pr.s * K, 2) + Math.pow(tgFwhm(E, pr.tgOn && !isRf ? pr.tg : null), 2));
    const rel = E => isRf ? g3(100 * rfFwhm(pr.tg.rf, E, pr.s).dEE) + ' %' : g3(100 * fw(E) / dtdlnE(E, LF)) + ' %';
    $('resInfo').textContent = 'Flight path used: ' + LF + (isRf ? ' m (of the resolution function)' : ' m (from the beam line name)') + (isRf ? ' · ' + pr.tg.rf.name + ' Monte Carlo resolution function (' + (pr.tg.rf.pulseIncluded ? 'it already includes the proton pulse and the target / moderator' : 'target / moderator only; the proton pulse is added, FWHM ' + g3(pr.sp * K) + ' ns') + ')' : ' · pulse FWHM ' + g3(pr.sp * K) + ' ns') + ' + additional FWHM ' + g3(pr.sa * K) + ' ns' + (isRf ? '' : pr.tgOn ? ' + target path spread ΔL = ' + g3(pr.tg.dL) + ' cm' : ' (no target spread)') + ' · total ΔE/E (FWHM) at 1 eV: ' + rel(1e-6) + ', 1 keV: ' + rel(1e-3) + ', 1 MeV: ' + rel(1) + (S.resOn ? '' : ' · currently off');
  })();
  $('selLine').innerHTML =
    '<span class="sw' + (F.dash ? ' dash' : '') + '"></span><b>' + esc(F.name) + '</b><span>' + S.L + ' m · ' + fmtRep(S.f) + (F.cfg ? ' · ' + esc(F.cfg) : '') + '</span>' +
    '<span>→</span><b>' + esc(t.label) + '</b><span class="hint">' + esc(t.zaid) + '</span>' + (S.libName ? '<span class="chip">Library: ' + esc(S.libName) + '</span>' : '') + '<span>' + esc(S.rxs.map(r => r.sym + ' · MT ' + r.mt).join(', ')) + '</span>' +
    (S.custom[F.id] ? '<span class="chip">Custom fluence</span>' : '') +
    (RP ? '<span class="chip">' + (RP.tg && RP.tg.mode === 'rf' ? 'Resolution: ' + RP.tg.rf.name + ' Monte Carlo RF, L = ' + RP.L + ' m' : 'Resolution: pulse ' + g3(pulseOf(F)) + ' ns' + (S.resK === 'sigma' ? ' σ' : ' FWHM') + (RP.tg ? ' + target spread' : '') + ', L = ' + F.L + ' m') + '</span>' : '');

  $('sum').innerHTML =
    '<div><div class="k">' + esc((vi.grp === 'p' || vi.all ? '' : vi.gname + ' · ') + ilab(vi)) + (vi.all ? ' per primary atom' : ' per target atom') + (S.nAtB > 0 ? ' (self-shielded)' : '') + '</div><div class="v">' + sci(perAtom, 3) + '</div><div class="u">1/s per atom' + (S.nAtB > 0 ? ' · thin: ' + sciTxt(res.totalThin, 3) : '') + '</div></div>' +
    '<div><div class="k">In the sample (' + g3(S.mass) + ' mg, ' + sci(vatoms, 3).replace(/<[^>]+>/g, m => m) + ' atoms' + (vi.grp === 'p' || vi.all ? '' : ' of ' + esc(vi.gname)) + ')</div><div class="v">' + sci(inSample, 3) + '</div><div class="u">1/s</div></div>' +
    '<div><div class="k">Per beam pulse</div><div class="v">' + sci(perPulse, 3) + '</div><div class="u">reactions / pulse</div></div>';

  renderCharts();
  $('h-cmp').textContent = 'All facilities: ' + (vi.all ? 'Σ all isotopes' : (vi.grp === 'p' ? t.label + ' ' : '') + iname(vi));
  S.cmpAtoms = vatoms;
  if ($('cmpCard').open) renderCompare(vatoms); else $('cmp').innerHTML = '';
  renderDecades(atoms * di.ratio, di.res);
  renderComponents(atoms);
  exMarkStale();
}

function renderComponents(atoms) {
  const t = S.tab, card = $('compCard');
  const act = S.comps.filter(c => c.tab && c.eff > 0);
  $('compInfo').textContent = S.comps.length ? 'Sample mass is that of the sample layer. N is the number of ' + t.label + ' atoms (' + sciTxt(atoms, 3) + '); the others follow from their ratios.' : '';
  layInfo();
  const rows = S.items.filter(x => !x.sum).map(x => ({ label: x.gname, ratio: x.ratio, rx: x.rx, r: x.res }));
  if (!S.rxs.length) rows.unshift({ label: t.label, ratio: 1, rx: null, r: null, awr: t.awr });
  for (const c of act) if (!c.mts.length) rows.push({ label: c.tab.label, ratio: c.eff, rx: null, r: null, awr: c.tab.awr, lay: layerOf(c) });
  if (rows.length < 2) { card.hidden = true; $('compTab').innerHTML = ''; return; }
  let tot = 0, cnt = 0;
  const body = rows.map(x => {
    const n = atoms * x.ratio;
    if (!x.r) return '<tr><td>' + esc(x.label) + (x.lay && x.lay !== 'sample' ? ' (' + LAYER_NAMES[x.lay].toLowerCase() + ')' : '') + '<div class="cfg">' + sciTxt(n * x.awr * NEUTRON_U / NAVO * 1e3, 3) + ' mg · ' + (S.area > 0 ? sciTxt(n / S.area * 1e-24, 3) + ' atoms/b' : '') + '</div></td><td class="n">' + sciTxt(n, 3) + '</td><td>shielding only</td><td class="n">–</td><td class="n">–</td><td class="n">–</td></tr>';
    const s = x.r.total * n; tot += s; cnt++;
    return '<tr><td>' + esc(x.label) + '</td><td class="n">' + sciTxt(n, 3) + '</td><td>' + esc(x.rx.sym) + ' · MT ' + x.rx.mt + '</td><td class="n">' + sci(x.r.total, 3) + '</td><td class="n">' + sci(s, 3) + '</td><td class="n">' + sci(s / S.f, 3) + '</td></tr>';
  }).join('');
  $('compTab').innerHTML = '<thead><tr><th>Component</th><th class="n">atoms</th><th>reaction</th><th class="n">per atom (1/s)</th><th class="n">in sample (1/s)</th><th class="n">per pulse</th></tr></thead><tbody>' + body +
    (cnt > 1 ? '<tr><td><b>Sum of listed reactions</b><div class="cfg">Overlapping channels (for example MT 101 and MT 102) are counted twice.</div></td><td></td><td></td><td></td><td class="n">' + sci(tot, 3) + '</td><td class="n">' + sci(tot / S.f, 3) + '</td></tr>' : '') + '</tbody>';
  card.hidden = false;
}


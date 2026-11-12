// ---------- Facility fluences ----------
// File format: for each beam line a title "Name (L m, f kHz) - note", the number of points N,
// then N rows "energy[MeV]  flux[n/(cm2 s dlnE)]" at that nominal path and repetition rate.
const FAC = [];
function parseFluxFile(text) {
  const L = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < L.length) {
    if (!L[i].trim()) { i++; continue; }
    const title = L[i].trim();
    const nl = (L[i + 1] || '').trim();
    const n = parseInt(nl, 10);
    if (!/^\d+$/.test(nl) || !(n > 1)) throw new Error('Line ' + (i + 2) + ': expected the number of points after the title "' + title + '".');
    const pr = [];
    for (let k = 0; k < n; k++) {
      const ln = L[i + 2 + k];
      if (ln === undefined) throw new Error('"' + title + '" ends early: ' + k + ' of ' + n + ' points.');
      const t = ln.trim().split(/[\s,;]+/).map(Number);
      if (t.length < 2 || !isFinite(t[0]) || !isFinite(t[1])) throw new Error('Line ' + (i + 3 + k) + ' is not an energy/flux pair.');
      if (t[0] > 0) pr.push([t[0], Math.max(0, t[1])]);
    }
    pr.sort((p, q) => p[0] - q[0]);
    out.push({ title, E: Float64Array.from(pr.map(p => p[0])), V: Float64Array.from(pr.map(p => p[1])) });
    i += 2 + n;
  }
  if (!out.length) throw new Error('No fluence blocks found.');
  return out;
}
function parseFacTitle(title) {
  const m = /^(.*?)\s*\(\s*([\d.]+)\s*m\s*,\s*([\d.eE+-]+?)\s*(MHz|kHz|Hz)\s*\)\s*(?:-\s*(.*))?$/i.exec(title);
  if (!m) return { name: title, cfg: '', L: NaN, f: NaN };
  const mult = { mhz: 1e6, khz: 1e3, hz: 1 }[m[4].toLowerCase()];
  const cfg = (m[5] || '').replace(/\s*deg\b/gi, '°').replace(/\s+-\s+/g, ' · ').trim();
  return { name: m[1].trim(), cfg, L: parseFloat(m[2]), f: parseFloat(m[3]) * mult };
}
function setFacilities(blocks) {
  const list = [];
  let dones = 0;
  blocks.forEach((b, i) => {
    const t = parseFacTitle(b.title);
    if (!(t.L > 0) || !(t.f > 0)) throw new Error('Cannot read path and rate from "' + b.title + '". Use the form "Name (20 m, 175 kHz) - note".');
    const isG = /gelina/i.test(t.name), moder = isG && /moder/i.test(t.name);
    let color;
    if (/^dones/i.test(t.name)) color = dones++ === 0 ? 'var(--fc-red)' : 'var(--fc-black)';
    else if (/^nfs/i.test(t.name)) color = 'var(--fc-orange)';
    else if (/ear1/i.test(t.name)) color = 'var(--fc-blue)';
    else if (/ear2/i.test(t.name)) color = 'var(--fc-magenta)';
    else if (/near/i.test(t.name)) color = 'var(--fc-brown)';
    else if (isG) color = moder ? 'var(--fc-purple)' : 'var(--fc-green)';
    else color = ['var(--fc-red)', 'var(--fc-blue)', 'var(--fc-green)', 'var(--fc-orange)', 'var(--fc-magenta)', 'var(--fc-brown)'][i % 6];
    list.push({ id: 'fac' + i, title: b.title, name: t.name, cfg: t.cfg, L: (/ear2/i.test(t.name) && t.L === 20 ? 19.55 : t.L), f: t.f, color, dash: moder, flux: { E: b.E, V: b.V } });
  });
  // Order in the beam-line list: n_TOF first, then GELINA, then NFS, then the rest (file order kept inside each group).
  const rank = F => /^n_?tof/i.test(F.name) ? 0 : /^gelina/i.test(F.name) ? 1 : /^nfs/i.test(F.name) ? 2 : 3;
  list.forEach((F, k) => { F.ord = k; });
  list.sort((a, b) => rank(a) - rank(b) || a.ord - b.ord);
  FAC.splice(0, FAC.length, ...list);
}

// ==== CORE END

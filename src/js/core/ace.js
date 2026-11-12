// ---------- ACE reading ----------
function printable(s) { return String(s).slice(0, 60).replace(/[^\x20-\x7e]/g, '?').trim(); }
// Handles the legacy 12-line header and the ACE 2.0.0 header ("2.0.0 SZAID" first line,
// "AWR TEMP DATE NCOMMENT" second line, then NCOMMENT comment lines).
function parseAceHeader(L) {
  if (!L.length) throw new Error('Empty ACE header');
  const t0 = L[0].trim().split(/\s+/);
  let zaid, awr, temp, date, comment, mat = '', base = 0;
  if (/^\d\./.test(t0[0]) && t0.length >= 2) {
    if (L.length < 2) throw new Error('ACE header is incomplete');
    const t1 = L[1].trim().split(/\s+/);
    const nc = parseInt(t1[3], 10) || 0;
    zaid = t0[1]; awr = parseFloat(t1[0]); temp = parseFloat(t1[1]); date = t1[2] || '';
    comment = L.slice(2, 2 + nc).map(s => s.trim()).join(' ');
    base = nc;
  } else {
    zaid = t0[0]; awr = parseFloat(t0[1]); temp = parseFloat(t0[2]); date = t0[3] || '';
    comment = (L[1] || '').slice(0, 70).trim(); mat = (L[1] || '').slice(70).trim();
    if (!/^\d+\.\w+$/.test(zaid) && !/^[A-Za-z]/.test(zaid)) throw new Error('First line is not an ACE header: "' + printable(L[0]) + '"');
  }
  const hlen = 12 + base;
  if (L.length < hlen) throw new Error('ACE header is incomplete');
  if (!isFinite(awr) || !isFinite(temp)) throw new Error('Header numbers are not readable (binary ACE is not supported): "' + printable(L[0]) + '"');
  const nxs = (L[base + 6] + ' ' + L[base + 7]).trim().split(/\s+/).map(Number);
  const jxs = (L[base + 8] + ' ' + L[base + 9] + ' ' + L[base + 10] + ' ' + L[base + 11]).trim().split(/\s+/).map(Number);
  if (nxs.length !== 16 || jxs.length !== 32 || nxs.some(Number.isNaN) || jxs.some(Number.isNaN)) {
    throw new Error('NXS/JXS arrays are not readable');
  }
  return { zaid, awr, temp, date, comment, mat, nxs, jxs, hlen };
}

async function scanAce(blob, onProgress) {
  const CH = 8 * 1024 * 1024, size = blob.size, dec = new TextDecoder('latin1');
  const out = [];
  let hdr = [], hdrStart = 0, skip = 0, cur = null, carry = '', carryOff = 0, need = 12;
  function handle(line, off, len) {
    if (skip > 0) {
      skip--;
      if (skip === 0) { cur.end = off + len; out.push(cur); cur = null; }
      return;
    }
    if (hdr.length === 0) {
      if (line.trim() === '') return;
      hdrStart = off;
    }
    hdr.push(line);
    if (hdr.length === 1) {
      const z = line.trim().split(/\s+/)[0] || '';
      if (!/^\d\./.test(z) && !/^\d+\.\w+$/.test(z) && !/^[A-Za-z]/.test(z)) throw new Error('First line is not an ACE header: "' + printable(line) + '" (byte ' + hdrStart + ')');
    }
    if (hdr.length === 2) {
      const t0 = hdr[0].trim().split(/\s+/);
      need = 12;
      if (/^\d\./.test(t0[0]) && t0.length >= 2) { const nc = parseInt(hdr[1].trim().split(/\s+/)[3], 10); need = 12 + (nc > 0 ? nc : 0); }
    }
    if (hdr.length === need) {
      let h;
      try { h = parseAceHeader(hdr); } catch (e) { throw new Error(e.message + ' (byte ' + hdrStart + ')'); }
      const info = zaidInfo(h.zaid);
      cur = { zaid: h.zaid, awr: h.awr, temp: h.temp, comment: h.comment, label: info.label, key: info.key,
              nes: h.nxs[2], start: hdrStart, end: size };
      skip = Math.ceil(h.nxs[0] / 4);
      hdr = []; need = 12;
      if (skip === 0) { cur.end = off + len; out.push(cur); cur = null; }
    }
  }
  for (let p = 0; p < size; p += CH) {
    const buf = await blob.slice(p, Math.min(size, p + CH)).arrayBuffer();
    const text = carry + dec.decode(buf);
    let s = 0, nl;
    while ((nl = text.indexOf('\n', s)) >= 0) {
      handle(text.slice(s, nl), carryOff + s, nl + 1 - s);
      s = nl + 1;
    }
    carry = text.slice(s);
    carryOff += s;
    if (onProgress) onProgress(Math.min(1, (p + CH) / size));
  }
  if (carry.length) handle(carry, carryOff, carry.length);
  if (cur) { cur.truncated = true; out.push(cur); }
  return out;
}

function buildTable(text) {
  const lines = text.split('\n').map(s => s.replace(/\r$/, ''));
  const H = parseAceHeader(lines);
  const { nxs, jxs } = H;
  const n = nxs[0], nes = nxs[2], ntr = nxs[3];
  if (!(n > 0 && n < 5e8) || !(nes > 1) || !(jxs[0] > 0) || jxs[0] - 1 + 4 * nes > n) throw new Error('the header numbers (NXS/JXS) are inconsistent: the file is damaged');
  const xss = new Float64Array(n);
  let k = 0, bad = 0, badLine = 0;
  for (let i = H.hlen; i < lines.length && k < n; i++) {
    const ln = lines[i];
    for (let j = 0; j < 4 && k < n; j++) {
      const s = ln.substr(20 * j, 20);
      if (!s.trim()) break;
      let v = +s;
      if (Number.isNaN(v)) v = +s.trim().replace(/([0-9.])([+-]\d+)$/, '$1e$2');
      if (!Number.isFinite(v)) { if (!bad) badLine = i + 1; bad++; v = 0; }
      xss[k++] = v;
    }
  }
  if (k < n) throw new Error('the data block is shorter than the header says (' + k + ' of ' + n + ' values): the file is cut off or damaged');
  if (bad) throw new Error(bad + ' value(s) cannot be read as numbers (first at line ' + badLine + ' of the table): the file is damaged');
  const esz = jxs[0] - 1;
  for (let i = 0; i < nes; i++) {
    const e = xss[esz + i];
    if (!(e > 0) || (i > 0 && !(e >= xss[esz + i - 1]))) throw new Error('the energy grid is not positive and increasing (point ' + (i + 1) + '): the file is damaged');
  }
  const E = xss.slice(esz, esz + nes);
  const tot = xss.slice(esz + nes, esz + 2 * nes);
  const abs = xss.slice(esz + 2 * nes, esz + 3 * nes);
  const el = xss.slice(esz + 3 * nes, esz + 4 * nes);
  const rxs = [];
  const add = (mt, e, xs, derived) => rxs.push(Object.assign({ mt, E: e, xs, derived: !!derived }, mtName(mt)));
  add(1, E, tot);
  add(2, E, el);
  if (abs.some(v => v > 0)) add(101, E, abs);
  const non = new Float64Array(nes);
  let anyNon = false;
  for (let i = 0; i < nes; i++) { non[i] = Math.max(0, tot[i] - el[i]); if (non[i] > 0) anyNon = true; }
  if (anyNon) add(3, E, non, true);
  if (ntr > 0 && jxs[2] > 0) {
    const mtr = jxs[2] - 1, lsig = jxs[5] - 1, sig = jxs[6] - 1;
    for (let r = 0; r < ntr; r++) {
      const mt = Math.round(xss[mtr + r]);
      const loc = Math.round(xss[lsig + r]);
      const idx = sig + loc - 1;
      const ie = Math.round(xss[idx]), ne = Math.round(xss[idx + 1]);
      if (!(ne > 0) || ie < 1 || ie - 1 + ne > nes || idx + 2 + ne > n) continue;
      add(mt, E.subarray(ie - 1, ie - 1 + ne), xss.slice(idx + 2, idx + 2 + ne));
    }
  }
  rxs.sort((a, b) => a.mt - b.mt);
  return { zaid: H.zaid, awr: H.awr, temp: H.temp, comment: H.comment, mat: H.mat, nes, E, rxs };
}


// ----- plot -----
const EXC = { a: '#2a7de1', b: '#d9822b', c: '#2e9e6b', d: '#a64ac9', e: '#c2453f', g: '#6b7280' };
function exPanels(R) {
  const P = [], logT = $('exLog').checked;
  const nm = R.ax === 'E' ? 'neutron energy' : 'time of flight';
  if (R.c) {
    const c = R.c, tot = c.tot, S0 = [], sim = R.sim;
    const part = (on, name, color, exp, q) => {
      if (!on) return;
      S0.push({ k: 'step', name: name + (sim ? ' (expected)' : ''), color, y: exp, dash: sim ? '5 3' : '' });
      if (sim) S0.push({ k: 'pts', name: name + ' (simulated)', color, y: c.SM[q].y, lo: Float64Array.from(c.SM[q].y, (v, i) => v - c.SM[q].lo[i]), hi: Float64Array.from(c.SM[q].y, (v, i) => v + c.SM[q].hi[i]) });
    };
    part(R.inc.S, 'samples (' + R.tgText + ')', EXC.c, c.pS, 'S');
    part(R.inc.F && R.layOn.front, 'front layer', EXC.b, c.pF, 'F');
    part(R.inc.B && R.layOn.back, 'sample backing', EXC.e, c.pB, 'B');
    part(R.cs.B > 0, 'background', EXC.g, c.bg, 'G');
    S0.push({ k: 'pts', name: R.sim ? 'total (simulated)' : 'total counts, ±√N', color: EXC.a, y: tot, lo: Float64Array.from(tot, (v, i) => v - c.eLo[i]), hi: Float64Array.from(tot, (v, i) => v + c.eHi[i]) });
    P.push({ id: 'cnt', title: 'Counts per bin', unit: 'counts', ylog: logT, S: S0 });
    P.push({ id: 'rel', title: 'Relative uncertainty of the net signal', unit: '%', ylog: true, S: [{ k: 'pts', name: R.sim ? 'simulated' : 'expected', color: EXC.d, y: Float64Array.from(c.rel, v => 100 * v), bars: false }].concat(R.cfg.tgt > 0 ? [{ k: 'hline', name: 'target', color: EXC.e, y: 100 * R.cfg.tgt }] : []) });
    if (R.cfg.tgt > 0) P.push({ id: 'tnd', title: 'Time needed for ' + g3(100 * R.cfg.tgt) + ' % on the net signal', unit: 's', ylog: true, S: [{ k: 'step', name: 'time needed', color: EXC.e, y: c.tneed }, { k: 'hline', name: 'time used', color: EXC.g, y: R.tc, dash: '5 3' }] });
  }
  if (R.t) {
    const t = R.t;
    P.push({ id: 'tc', title: 'Transmitted counts per bin', unit: 'counts', ylog: logT, S: [
      { k: 'pts', name: 'sample out (open beam)', color: EXC.b, y: t.mOut, lo: Float64Array.from(t.mOut, (v, i) => v - t.outLo[i]), hi: Float64Array.from(t.mOut, (v, i) => v + t.outHi[i]) },
      { k: 'pts', name: 'sample in', color: EXC.a, y: t.mIn, lo: Float64Array.from(t.mIn, (v, i) => v - t.inLo[i]), hi: Float64Array.from(t.mIn, (v, i) => v + t.inHi[i]) }] });
    P.push({ id: 'T', title: 'Transmission T', unit: '', ylog: false, S: [
      { k: 'step', name: 'expected', color: EXC.c, y: t.Tth },
      { k: 'pts', name: R.sim ? 'simulated' : '±1σ', color: EXC.a, y: t.T, lo: Float64Array.from(t.T, (v, i) => v - t.Terr[i]), hi: Float64Array.from(t.T, (v, i) => v + t.Terr[i]) }] });
    P.push({ id: 'sig', title: 'Total cross section per ' + (S.tab ? S.tab.label : 'primary') + ' atom', unit: 'barn', ylog: logT, S: [
      { k: 'step', name: 'from the expected T', color: EXC.c, y: t.sgTh },
      { k: 'pts', name: R.sim ? 'simulated' : '±1σ', color: EXC.d, y: t.sg, lo: Float64Array.from(t.sg, (v, i) => v - t.sgErr[i]), hi: Float64Array.from(t.sg, (v, i) => v + t.sgErr[i]) }] });
    if (!R.c && R.cfg.tgt > 0) P.push({ id: 'tnd', title: 'Time needed for ' + g3(100 * R.cfg.tgt) + ' % on T (this split)', unit: 's', ylog: true, S: [{ k: 'step', name: 'this split', color: EXC.e, y: t.tneed }, { k: 'step', name: 'best split', color: EXC.c, y: t.tOpt }, { k: 'hline', name: 'time used', color: EXC.g, y: R.cfg.t, dash: '5 3' }] });
  }
  P.forEach(p => { p.axis = nm; });
  return P;
}
function exView(R) {
  const e = R.edges, full = [e[0], e[R.n]];
  if ($('exLink').checked && S.zx) {
    const a = R.ax === 'E' ? S.zx[0] : tofNs(S.zx[1], R.LT), b = R.ax === 'E' ? S.zx[1] : tofNs(S.zx[0], R.LT);
    const lo = Math.max(full[0], a), hi = Math.min(full[1], b);
    return hi > lo ? [lo, hi] : full;
  }
  const z = S.exZ && S.exZ.x;
  if (z && z[0] >= full[0] * 0.9999 && z[1] <= full[1] * 1.0001 && z[1] > z[0]) return z;
  return full;
}
function renderExp() {
  const host = $('exHost'), R = S.exR;
  if (!R) { host.innerHTML = ''; return; }
  const W = Math.max(320, Math.floor(host.clientWidth || 640)), mobile = W < 520;
  const ml = mobile ? 66 : 82, mr = mobile ? 20 : 30, H = mobile ? 280 : 370, gap = mobile ? 26 : 30, top = 6, axisH = 46, pw = W - ml - mr;
  const [x0, x1] = exView(R), xlog = R.B.log, tof = R.ax === 'T';
  S.exZ = S.exZ || { x: null, y: {} };
  const X = v => ml + (xlog ? (Math.log(v) - Math.log(x0)) / (Math.log(x1) - Math.log(x0)) : (v - x0) / (x1 - x0)) * pw;
  const xc = i => xlog ? Math.sqrt(R.edges[i] * R.edges[i + 1]) : 0.5 * (R.edges[i] + R.edges[i + 1]);
  const vis = []; for (let i = 0; i < R.n; i++) if (R.edges[i + 1] >= x0 && R.edges[i] <= x1) vis.push(i);
  let ticks = xlog ? (tof ? tTicks(x0, x1, pw) : xTicks(x0, x1, pw)) : linTicks(x0, x1, tof);
  if (xlog && ticks.filter(t => t.label).length < 3) ticks = linTicks(x0, x1, tof);
  const panels = exPanels(R);
  let yy = top;
  panels.forEach(p => {
    const items = p.S.filter(s => s.k !== 'hline' || s.name).map(s => ({ name: s.name, color: s.color, dash: s.dash }));
    let cx = ml, row = 0;
    items.forEach(e => { const w = 26 + e.name.length * 7.3 + 16; if (cx > ml && cx + w > ml + pw + 14) { cx = ml; row++; } e.x = cx; e.row = row; e.w = w; cx += w; });
    p.leg = items; p.hd = 22 + (items.length ? (row + 1) * 16 : 0); p.py = yy; yy += p.hd + H + gap;
  });
  const byAll = yy - gap, totalH = byAll + axisH;
  let svg = '<svg viewBox="0 0 ' + W + ' ' + totalH + '" width="' + W + '" height="' + totalH + '" role="img" aria-label="Simulated experiment">';
  let legSvg = '';
  S.exHide = S.exHide || {};
  panels.forEach((p, pi) => {
    const py = p.py + p.hd, key = p.id;
    const yrm = S.exZ.y[key];
    svg += '<text class="ttl" x="' + ml + '" y="' + (p.py + 14) + '">' + esc(p.title) + '<tspan dx="8" style="font-weight:400;fill:var(--ink2)">' + esc(p.unit) + '</tspan>' + (yrm ? '<tspan dx="8" style="font-weight:400;fill:var(--warn)">[y zoomed]</tspan>' : '') + '</text>';
    p.leg.forEach(e => {
      const ly = p.py + 14 + 16 * (e.row + 1), off = !!S.exHide[key + '|' + e.name];
      legSvg += '<g class="lgi" data-k="' + esc(key + '|' + e.name) + '" style="cursor:pointer" opacity="' + (off ? 0.35 : 1) + '"><title>Click to ' + (off ? 'show' : 'hide') + ' this curve</title><rect x="' + (e.x - 3).toFixed(1) + '" y="' + (ly - 13) + '" width="' + (e.w - 4).toFixed(1) + '" height="16" fill="transparent"/><line x1="' + e.x.toFixed(1) + '" x2="' + (e.x + 18).toFixed(1) + '" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" style="stroke:' + e.color + '" stroke-width="2"' + (e.dash ? ' stroke-dasharray="' + e.dash + '"' : '') + '/><text x="' + (e.x + 23).toFixed(1) + '" y="' + ly + '" style="fill:var(--ink2);font-size:11.5px' + (off ? ';text-decoration:line-through' : '') + '">' + esc(e.name) + '</text></g>';
    });
    // vertical range from the visible bins
    const ylog = p.ylog;
    let mn = Infinity, mx = -Infinity;
    for (const s of p.S) {
      if (S.exHide[key + '|' + s.name]) continue;
      const arrs = s.k === 'hline' ? [[s.y]] : s.k === 'step' ? [s.y] : [s.y, s.lo, s.hi].filter(Boolean);
      for (const A of arrs) { if (s.k === 'hline') { const v = A[0]; if (isFinite(v) && (!ylog || v > 0)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } continue; }
        for (const i of vis) { const v = A[i]; if (isFinite(v) && (!ylog || v > 0)) { if (v < mn) mn = v; if (v > mx) mx = v; } } }
    }
    if (!(mx > -Infinity)) { mn = 1; mx = 10; }
    let a, b, yf, inv, ytk = [];
    if (ylog) {
      b = Math.ceil(Math.log10(mx) - 1e-9); a = Math.floor(Math.log10(mn) + 1e-9);
      if (b - a < 1) a = b - 1;
      if (b - a > 14) a = b - 14;
      if (yrm && yrm.lo > 0) { a = Math.log10(yrm.lo); b = Math.log10(yrm.hi); }
      yf = v => H - (Math.log10(v) - a) / (b - a) * H; inv = yr => Math.pow(10, a + (H - yr) / H * (b - a));
      const sp = (b - a) < 0.6 ? [1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9] : (b - a) < 1.6 ? [1, 2, 5] : [1], st = (b - a) > 8 ? 2 : 1;
      for (let k = Math.floor(a); k <= Math.ceil(b); k++) for (const m of sp) {
        if (m === 1 && (k - Math.floor(a)) % st) continue;
        const v = m * Math.pow(10, k); if (v >= Math.pow(10, a) * 0.9999 && v <= Math.pow(10, b) * 1.0001) ytk.push({ y: yf(v), label: m === 1 ? p10(k) : sciTxt(v, 1) });
      }
    } else {
      a = Math.min(0, mn); b = mx > 0 ? mx * 1.08 : 1;
      if (p.id === 'T') { a = 0; b = Math.max(1.05, Math.min(mx * 1.05, 3)); }
      if (yrm) { a = yrm.lo; b = yrm.hi; }
      yf = v => H - (v - a) / (b - a) * H; inv = yr => a + (H - yr) / H * (b - a);
      const step = niceStep((b - a) / 4), k0 = Math.ceil(a / step - 1e-9), k1 = Math.min(k0 + 40, Math.floor(b / step + 1e-9));
      for (let k = k0; k <= k1; k++) { const v = k * step; ytk.push({ y: yf(v), label: Math.abs(v) < step * 1e-6 ? '0' : sciTxt(v, 3) }); }
    }
    p.inv = inv; p.ylog = ylog;
    svg += '<g transform="translate(0,' + py + ')"><clipPath id="ecp' + pi + '"><rect x="' + ml + '" y="0" width="' + pw + '" height="' + H + '"/></clipPath>';
    svg += '<rect x="' + ml + '" y="0" width="' + pw + '" height="' + H + '" fill="none" stroke="var(--line)"/>';
    ytk.forEach(t => { svg += '<line class="grid" x1="' + ml + '" x2="' + (ml + pw) + '" y1="' + t.y.toFixed(1) + '" y2="' + t.y.toFixed(1) + '"/><text x="' + (ml - 6) + '" y="' + (t.y + 4).toFixed(1) + '" text-anchor="end">' + t.label + '</text>'; });
    ticks.forEach(t => { svg += '<line class="grid minor" x1="' + X(t.v).toFixed(1) + '" x2="' + X(t.v).toFixed(1) + '" y1="0" y2="' + H + '"/>'; });
    svg += '<g clip-path="url(#ecp' + pi + ')">';
    const ok = v => isFinite(v) && (!ylog || v > 0);
    for (const s of p.S) {
      if (S.exHide[key + '|' + s.name]) continue;
      if (s.k === 'hline') { if (ok(s.y)) svg += '<line x1="' + ml + '" x2="' + (ml + pw) + '" y1="' + yf(s.y).toFixed(1) + '" y2="' + yf(s.y).toFixed(1) + '" style="stroke:' + s.color + '" stroke-width="1.2" stroke-dasharray="' + (s.dash || '4 3') + '"/>'; continue; }
      if (s.k === 'step') {
        let d = '', pen = false;
        for (const i of vis) { const v = s.y[i]; if (!ok(v)) { pen = false; continue; } const y = yf(v).toFixed(1); d += (pen ? 'L' : 'M') + X(Math.max(x0, R.edges[i])).toFixed(1) + ' ' + y + 'L' + X(Math.min(x1, R.edges[i + 1])).toFixed(1) + ' ' + y; pen = true; }
        svg += '<path d="' + d + '" fill="none" style="stroke:' + s.color + '" stroke-width="1.6" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
        continue;
      }
      for (const i of vis) {
        const v = s.y[i]; if (!ok(v)) continue;
        const cx = X(xc(i)), cy = yf(v);
        if (s.bars !== false && s.lo) {
          const l = s.lo[i], h = s.hi[i], yl = ok(l) ? yf(l) : (ylog ? H + 50 : yf(l)), yh = ok(h) ? yf(h) : yf(v);
          svg += '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + yl.toFixed(1) + '" y2="' + yh.toFixed(1) + '" style="stroke:' + s.color + '" stroke-width="1"/>';
        }
        svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="2.4" style="fill:' + s.color + '"/>';
      }
    }
    svg += '</g>';
    if (pi < panels.length - 1) ticks.forEach(t => { if (t.label) svg += '<text x="' + X(t.v).toFixed(1) + '" y="' + (H + 16) + '" text-anchor="middle" style="fill:var(--ink2);font-size:11px">' + t.label + '</text>'; });
    svg += '</g>';
  });
  const by = byAll;
  ticks.forEach(t => { svg += '<line x1="' + X(t.v).toFixed(1) + '" x2="' + X(t.v).toFixed(1) + '" y1="' + by + '" y2="' + (by + 5) + '" stroke="var(--ink2)"/>' + (t.label ? '<text x="' + X(t.v).toFixed(1) + '" y="' + (by + 18) + '" text-anchor="middle">' + t.label + '</text>' : ''); });
  svg += '<text x="' + (ml + pw / 2) + '" y="' + (by + 36) + '" text-anchor="middle">' + (tof ? 'Time of flight (flight path ' + R.LT + ' m, relativistic)' : 'Neutron energy (MeV)') + '</text>';
  svg += '<line id="ecross" y1="' + top + '" y2="' + by + '" x1="-10" x2="-10" style="stroke:var(--ink)" stroke-width="1" opacity="0.6"/>';
  svg += '<rect id="ebox" x="0" y="' + top + '" width="0" height="' + (by - top) + '" fill="var(--accent)" opacity="0.18" stroke="var(--accent)"/>';
  svg += '<rect class="hit" id="ehit" x="' + ml + '" y="' + top + '" width="' + pw + '" height="' + (totalH - top) + '"/>' + legSvg + '</svg>';
  host.innerHTML = svg;
  host.querySelectorAll('.lgi').forEach(g => g.addEventListener('click', ev => { ev.stopPropagation(); const k = g.dataset.k; S.exHide[k] = !S.exHide[k]; renderExp(); }));
  const linked = $('exLink').checked;
  $('exReset').disabled = !(S.exZ.x || Object.keys(S.exZ.y).length || (linked && S.zx));
  const hit = $('ehit'), cross = $('ecross'), box = $('ebox'), ro = $('exReadout');
  const yAt = (ev, pin) => {
    const r = host.firstChild.getBoundingClientRect(), y = (ev.clientY - r.top) * (totalH / r.height);
    if (pin) { const y0 = pin.py + pin.hd, yc = Math.max(y0, Math.min(y0 + H, y)); return { y: yc, p: pin, v: pin.inv(yc - y0) }; }
    for (const p of panels) { const y0 = p.py + p.hd; if (y >= y0 && y <= y0 + H && p.inv) return { y, p, v: p.inv(y - y0) }; }
    return null;
  };
  const pxOf = ev => { const r = host.firstChild.getBoundingClientRect(); return Math.max(ml, Math.min(ml + pw, (ev.clientX - r.left) * (W / r.width))); };
  const vOf = px => xlog ? Math.exp(Math.log(x0) + (px - ml) / pw * (Math.log(x1) - Math.log(x0))) : x0 + (px - ml) / pw * (x1 - x0);
  let drag = null, dragY = null;
  hit.addEventListener('pointerdown', ev => { drag = pxOf(ev); dragY = yAt(ev); try { hit.setPointerCapture(ev.pointerId); } catch (e) { } });
  hit.addEventListener('pointerup', ev => {
    if (drag === null) return;
    const a = drag, b = pxOf(ev), y0 = dragY, y1 = y0 ? yAt(ev, y0.p) : null;
    drag = null; dragY = null; box.setAttribute('width', 0);
    let chg = false, main = false;
    if (Math.abs(b - a) > 6) {
      const v1 = vOf(a), v2 = vOf(b), lo = Math.min(v1, v2), hi = Math.max(v1, v2);
      if (hi / lo > 1.0001) {
        if ($('exLink').checked) { S.zx = tof ? [tofToE(hi, R.LT), tofToE(lo, R.LT)] : [lo, hi]; main = true; } else S.exZ.x = [lo, hi];
        chg = true;
      }
    }
    if (ev.shiftKey && y0 && y1 && y0.p === y1.p && Math.abs(y1.y - y0.y) > 6) {
      const lo = Math.min(y0.v, y1.v), hi = Math.max(y0.v, y1.v);
      if (hi > lo && (!y0.p.ylog || lo > 0)) { S.exZ.y[y0.p.id] = { lo, hi }; chg = true; }
    }
    if (main) renderCharts(); else if (chg) renderExp();      // renderCharts redraws this plot too
  });
  hit.addEventListener('pointercancel', () => { drag = null; dragY = null; box.setAttribute('width', 0); });
  hit.addEventListener('dblclick', () => exResetZoom());
  hit.addEventListener('pointermove', ev => {
    const px = pxOf(ev);
    if (drag !== null) {
      box.setAttribute('x', Math.min(drag, px)); box.setAttribute('width', Math.abs(px - drag));
      const cy = dragY ? yAt(ev, dragY.p) : null;
      if (ev.shiftKey && dragY && cy) { box.setAttribute('y', Math.min(dragY.y, cy.y)); box.setAttribute('height', Math.abs(cy.y - dragY.y)); }
      else { box.setAttribute('y', top); box.setAttribute('height', by - top); }
    }
    cross.setAttribute('x1', px); cross.setAttribute('x2', px);
    const v = vOf(px); let k = upperBound(R.edges, v) - 1; k = Math.max(0, Math.min(R.n - 1, k));
    const lines = [(tof ? 'TOF ' + fmtT(R.edges[k]) + ' – ' + fmtT(R.edges[k + 1]) : 'E ' + fmtEnergy(R.edges[k]) + ' – ' + fmtEnergy(R.edges[k + 1])) + ' · bin ' + (k + 1) + ' of ' + R.n];
    if (R.c) lines.push('counts ' + sciTxt(R.c.tot[k], 3) + ' (−' + sciTxt(R.c.eLo[k], 2) + ' +' + sciTxt(R.c.eHi[k], 2) + ') · signal ' + sciTxt(R.c.sg[k], 3) + (R.holdNames.length ? ' · container/backing ' + sciTxt(R.c.hd[k], 3) : '') + (R.cs.B > 0 ? ' · flat ' + sciTxt(R.c.bg[k], 3) : '') + ' · rel. unc. ' + (isFinite(R.c.rel[k]) ? g3(100 * R.c.rel[k]) + ' %' : '–'));
    if (R.t) lines.push('in ' + sciTxt(R.t.mIn[k], 3) + ' · out ' + sciTxt(R.t.mOut[k], 3) + ' · T = ' + (isFinite(R.t.T[k]) ? g3(R.t.T[k]) + ' ± ' + g3(R.t.Terr[k]) : '–') + ' (expected ' + g3(R.t.Tth[k]) + ') · σ = ' + (isFinite(R.t.sg[k]) ? sciTxt(R.t.sg[k], 3) + ' ± ' + sciTxt(R.t.sgErr[k], 2) + ' b' : '–'));
    ro.innerHTML = lines.join('<br>');
  });
  hit.addEventListener('pointerleave', () => { cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); });
}
function exResetZoom() {
  S.exZ = { x: null, y: {} };
  if ($('exLink').checked && S.zx) { S.zx = null; if (S.res) renderCharts(); else renderExp(); } else renderExp();
}

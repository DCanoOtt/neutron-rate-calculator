// ---------- Charts ----------
function niceStep(s) {
  const p = Math.pow(10, Math.floor(Math.log10(s))), f = s / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
function fmtT(v) {
  if (v >= 1e9) return g3(v / 1e9) + ' s';
  if (v >= 1e6) return g3(v / 1e6) + ' ms';
  if (v >= 1e3) return g3(v / 1e3) + ' µs';
  return g3(v) + ' ns';
}
function tTicks(x0, x1, pw) {
  const a = Math.ceil(Math.log10(x0) - 1e-9), b = Math.floor(Math.log10(x1) + 1e-9);
  const span = Math.log10(x1 / x0), out = [];
  if (span >= 1.6) {
    const step = Math.max(1, Math.ceil(58 / (pw / span)));
    for (let k = a; k <= b; k++) out.push({ v: Math.pow(10, k), label: (k - a) % step === 0 ? fmtT(Math.pow(10, k)) : '' });
  } else {
    for (let k = a - 1; k <= b; k++) for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, k);
      if (v >= x0 && v <= x1) out.push({ v, label: fmtT(v) });
    }
  }
  return out;
}
function xTicks(x0, x1, pw) {
  const a = Math.ceil(Math.log10(x0) - 1e-9), b = Math.floor(Math.log10(x1) + 1e-9);
  const span = Math.log10(x1 / x0), out = [];
  if (span >= 2.2) {
    const step = Math.max(1, Math.ceil(38 / (pw / span)));
    for (let k = a; k <= b; k++) out.push({ v: Math.pow(10, k), label: (k - a) % step === 0 ? p10(k) : '' });
  } else {
    for (let k = a - 1; k <= b; k++) for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, k);
      if (v >= x0 && v <= x1) out.push({ v, label: m === 1 ? p10(k) : m + '×' + p10(k) });
    }
  }
  return out;
}
// Narrow zoom windows: round-number ticks on a linear scale, so the axis always carries values.
function linTicks(a, b, isT) {
  const st = niceStep((b - a) / 4), out = [];
  const dec = Math.max(0, -Math.floor(Math.log10(st)) + 1);
  for (let v = Math.ceil(a / st - 1e-9) * st; v <= b * (1 + 1e-12); v += st) {
    const r = parseFloat(v.toPrecision(12));
    out.push({ v: r, label: isT ? fmtT(r) : (Math.abs(r) >= 1e4 || Math.abs(r) < 1e-3 ? sciTxt(r, 3) : r.toFixed(Math.min(dec, 8))) });
  }
  return out;
}
function pathOf(idx, E, Y, X, yf, log) {
  let d = '', pen = false;
  for (const i of idx) {
    const v = Y[i];
    if (log && !(v > 0)) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + X(E[i]).toFixed(1) + ' ' + yf(v).toFixed(1);
    pen = true;
  }
  return d;
}

function renderCharts() {
  const host = $('chartHost'), res = S.res;
  if (!res || !res.E.length) { host.innerHTML = ''; return; }
  const W = Math.max(320, Math.floor(host.clientWidth || 640));
  const mobile = W < 520;
  const ml = mobile ? 66 : 82, mr = mobile ? 42 : 54, H = mobile ? 240 : 330, gap = mobile ? 26 : 30, top = 6, axisH = 46;
  const pw = W - ml - mr;
  if (S.zx && !(S.zx[0] >= S.emin * 0.9999 && S.zx[1] <= S.emax * 1.0001 && S.zx[1] > S.zx[0])) S.zx = null;
  const x0 = S.zx ? S.zx[0] : S.emin, x1 = S.zx ? S.zx[1] : S.emax;
  const ia = Math.max(0, lowerBound(res.E, x0) - 1), ib = Math.min(res.E.length, upperBound(res.E, x1) + 1);
  const V = { E: res.E.subarray(ia, ib), phi: res.phi.subarray(ia, ib), sig: res.sig.subarray(ia, ib), rho: res.rho.subarray(ia, ib), thin: res.rhoThin.subarray(ia, ib), cum: res.cum.subarray(ia, ib) };
  const kN = S.rateSample ? S.viewAtoms : 1;
  // Reaction yield per incident neutron: Y = (atoms / area) · σ_eff, where σ_eff = rate density per atom / fluence (self-shielding included)
  const yld = S.rateKind === 'yield' && S.viewAtoms > 0 && S.area > 0, nA = yld ? S.viewAtoms / S.area : 0;
  const yv = (rho, phi) => { const o = new Float64Array(rho.length); for (let i = 0; i < o.length; i++) o[i] = phi[i] > 0 ? rho[i] / phi[i] * nA : 0; return o; };
  if (kN !== 1) { V.rho = V.rho.map(v => v * kN); V.thin = V.thin.map(v => v * kN); }
  const multi = S.extraRes.length > 0;
  let RAW = null;
  if (!multi && res.raw) {
    const rr = res.raw, ra = Math.max(0, lowerBound(rr.E, x0) - 1), rb = Math.min(rr.E.length, upperBound(rr.E, x1) + 1);
    RAW = { E: rr.E.subarray(ra, rb), sig: rr.sig.subarray(ra, rb), rho: rr.rho.subarray(ra, rb).map(v => v * kN), rho0: rr.rho.subarray(ra, rb), phi: rr.phi.subarray(ra, rb) };
  }
  const RC = ['#2a7de1', '#d9822b', '#2e9e6b', '#a64ac9', '#c2453f', '#8a7a2a', '#3a9bb5', '#8c5a3c'];
  const rname = r => r.mt === 'sum' ? r.sym : r.sym + ' (MT ' + r.mt + ')';
  const XV = S.extraRes.map((x, k) => {
    const r = x.res, a = Math.max(0, lowerBound(r.E, x0) - 1), b = Math.min(r.E.length, upperBound(r.E, x1) + 1);
    return { name: x.name, color: RC[(k + 1) % RC.length], E: r.E.subarray(a, b), sig: r.sig.subarray(a, b), rho: r.rho.subarray(a, b).map(v => v * kN), rho0: r.rho.subarray(a, b), phi: r.phi.subarray(a, b) };
  });
  $('axReset').disabled = !S.zx && !(S.yr && Object.keys(S.yr).length);
  const l0 = Math.log(x0), l1 = Math.log(x1);
  const tofMode = S.tofAxis, LT = (S.resOn ? resL(curFac()) : curFac().L);
  const lt0 = Math.log(tofNs(x1, LT)), lt1 = Math.log(tofNs(x0, LT));
  const XT = tt => ml + (Math.log(tt) - lt0) / (lt1 - lt0) * pw;
  const X = tofMode ? (e => XT(tofNs(e, LT))) : (e => ml + (Math.log(e) - l0) / (l1 - l0) * pw);
  const XTk = tofMode ? XT : X;
  const nb = Math.max(120, Math.floor(pw * 1.5));
  const ew = frameOverlapE(S.L, S.f);
  let ticks = tofMode ? tTicks(tofNs(x1, LT), tofNs(x0, LT), pw) : xTicks(x0, x1, pw);
  if (ticks.filter(t => t.label).length < 3) ticks = linTicks(tofMode ? tofNs(x1, LT) : x0, tofMode ? tofNs(x0, LT) : x1, tofMode);
  const panels = [
    { id: 'phi', title: 'Fluence Φ(E)', unit: 'n/(cm²·s·ΔlnE)', Y: V.phi, log: S.rateLog, color: 'var(--fc)' },
    { id: 'sig', title: 'Cross section σ(E)' + (S.viewAll ? ', per primary atom' : ''), unit: 'barn', Y: V.sig, log: S.rateLog, color: multi ? RC[0] : 'var(--accent)', leadName: S.viewName, ex: XV.map(x => ({ E: x.E, Y: x.sig, color: x.color, name: x.name })) },
    { id: 'rho', nm: yld ? 'yield' : 'rate', title: yld ? 'Reaction yield per incident neutron' : (S.rateSample ? 'Rate density in sample' : 'Rate density per atom'), unit: yld ? 'reactions / neutron' : '1/s per ΔlnE', Y: yld ? yv(res.rho.subarray(ia, ib), V.phi) : V.rho, Y3: RAW ? (yld ? yv(RAW.rho0, RAW.phi) : RAW.rho) : null, E3: RAW ? RAW.E : null, Y2: (S.nAtB > 0 && !multi && !yld) ? (yld ? yv(res.rhoThin.subarray(ia, ib), V.phi) : V.thin) : null, log: S.rateLog, color: multi ? RC[0] : 'var(--fc)', leadName: S.viewName, ex: XV.map(x => ({ E: x.E, Y: yld ? yv(x.rho0, x.phi) : x.rho, color: x.color, name: x.name })) }
  ];
  S.chartData = { panels, V, total: yld ? 0 : res.total };
  // Legends sit in a band above each plot so they never cover the curves.
  let yy = top;
  panels.forEach((p, pi) => {
    const items = [];
    if (p.Y3) items.push({ name: 'without resolution', color: 'var(--ink2)', dash: '5 3' });
    if ((p.ex || []).length) { items.push({ name: p.leadName, color: p.color }); p.ex.forEach(e => items.push({ name: e.name, color: e.color })); }
    if (pi === 2) {
      if (!yld) items.push({ name: multi ? 'cumulative, ' + S.viewName : 'cumulative', color: 'var(--ink)', dash: '4 3' });
      if (p.Y2) items.push({ name: 'thin sample', color: 'var(--ink2)', dash: '1.5 3' });
    }
    let cx = ml, row = 0;
    items.forEach(e => {
      const w = 26 + e.name.length * 7.3 + 16;
      if (cx > ml && cx + w > ml + pw + 14) { cx = ml; row++; }
      e.x = cx; e.row = row; cx += w;
    });
    p.leg = items;
    p.hd = 22 + (items.length ? (row + 1) * 16 : 0);
    p.py = yy;
    yy += p.hd + H + gap;
  });
  const byAll = yy - gap;
  const totalH = byAll + axisH;
  let svg = '<svg viewBox="0 0 ' + W + ' ' + totalH + '" width="' + W + '" height="' + totalH + '" role="img" aria-label="Fluence, cross section and rate density against neutron energy">';
  panels.forEach((p, pi) => {
    const py = p.py + p.hd;
    svg += '<text class="ttl" x="' + ml + '" y="' + (p.py + 14) + '">' + p.title + '<tspan dx="8" style="font-weight:400;fill:var(--ink2)">' + p.unit + '</tspan>' + (S.yr && S.yr[p.id + (p.nm || '')] ? '<tspan dx="8" style="font-weight:400;fill:var(--warn)">[y zoomed]</tspan>' : '') + '</text>';
    p.leg.forEach(e => {
      const ly = p.py + 14 + 16 * (e.row + 1);
      svg += '<line x1="' + e.x.toFixed(1) + '" x2="' + (e.x + 18).toFixed(1) + '" y1="' + (ly - 4) + '" y2="' + (ly - 4) + '" style="stroke:' + e.color + '" stroke-width="2"' + (e.dash ? ' stroke-dasharray="' + e.dash + '"' : '') + '/><text x="' + (e.x + 23).toFixed(1) + '" y="' + ly + '" style="fill:var(--ink2)">' + esc(e.name) + '</text>';
    });
    let a, b, yf, ytk = [];
    if (p.log) {
      let mn = Infinity, mx = 0;
      for (const A of [p.Y].concat(p.Y2 ? [p.Y2] : [], p.Y3 ? [p.Y3] : [], (p.ex || []).map(e => e.Y))) for (let i = 0; i < A.length; i++) { const v = A[i]; if (v > 0) { if (v < mn) mn = v; if (v > mx) mx = v; } }
      if (!(mx > 0)) { mn = 1; mx = 100; }
      b = Math.ceil(Math.log10(mx) - 1e-9); a = Math.floor(Math.log10(mn) + 1e-9);
      if (b - a < 2) a = b - 2;
      const maxSpan = (p.ex || []).length ? 18 : 10;
      if (b - a > maxSpan) a = b - maxSpan;
      const yrm = S.yr && S.yr[p.id + (p.nm || '')];
      if (yrm && yrm.lo > 0) { a = Math.log10(yrm.lo); b = Math.log10(yrm.hi); }
      p.yman = !!yrm;
      yf = v => H - (Math.log10(v) - a) / (b - a) * H;
      const st = (b - a) > 14 ? 3 : (b - a) > 7 ? 2 : 1;
      if (yrm) {
        const s2 = (b - a) < 0.6 ? [1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9] : (b - a) < 1.6 ? [1, 2, 5] : [1];
        for (let k = Math.floor(a) - 1; k <= Math.ceil(b); k++) for (const m of s2) { const v = m * Math.pow(10, k); if (v >= Math.pow(10, a) * 0.9999 && v <= Math.pow(10, b) * 1.0001) ytk.push({ y: yf(v), label: m === 1 ? p10(k) : sciTxt(v, 1) }); }
      } else for (let k = b; k >= a; k -= st) ytk.push({ y: yf(Math.pow(10, k)), label: p10(k) });
      p.inv = yr => Math.pow(10, a + (H - yr) / H * (b - a));
    } else {
      let mx = 0;
      for (const A of [p.Y].concat(p.Y2 ? [p.Y2] : [], p.Y3 ? [p.Y3] : [], (p.ex || []).map(e => e.Y))) for (let i = 0; i < A.length; i++) if (A[i] > mx) mx = A[i];
      if (!(mx > 0)) mx = 1;
      let step = niceStep(mx * 1.05 / 3);
      let top0 = Math.ceil(mx * 1.02 / step) * step, bot0 = 0;
      const yrm = S.yr && S.yr[p.id + (p.nm || '')];
      if (yrm) { bot0 = yrm.lo; top0 = yrm.hi; step = niceStep((top0 - bot0) / 3); }
      p.yman = !!yrm;
      yf = v => H - (v - bot0) / (top0 - bot0) * H;
      p.inv = yr => bot0 + (H - yr) / H * (top0 - bot0);
      const k0 = Math.ceil(bot0 / step - 1e-9), k1 = Math.min(k0 + 40, Math.floor(top0 / step + 1e-9));
      for (let k = k0; k <= k1; k++) { const v = k * step; ytk.push({ y: yf(v), label: Math.abs(v) < step * 1e-6 ? '0' : sciTxt(v, 3) }); }
    }
    svg += '<g transform="translate(0,' + py + ')"><clipPath id="cp' + pi + '"><rect x="' + ml + '" y="0" width="' + pw + '" height="' + H + '"/></clipPath>';
    svg += '<rect x="' + ml + '" y="0" width="' + pw + '" height="' + H + '" fill="none" stroke="var(--line)"/>';
    ytk.forEach(t => { svg += '<line class="grid" x1="' + ml + '" x2="' + (ml + pw) + '" y1="' + t.y.toFixed(1) + '" y2="' + t.y.toFixed(1) + '"/><text x="' + (ml - 6) + '" y="' + (t.y + 4).toFixed(1) + '" text-anchor="end">' + t.label + '</text>'; });
    ticks.forEach(t => { svg += '<line class="grid minor" x1="' + XTk(t.v).toFixed(1) + '" x2="' + XTk(t.v).toFixed(1) + '" y1="0" y2="' + H + '"/>'; });
    if (ew > x0) {
      const xe = X(Math.min(ew, x1));
      const sx0 = tofMode ? xe : ml, sw = tofMode ? ml + pw - xe : xe - ml;
      svg += '<rect x="' + sx0.toFixed(1) + '" y="0" width="' + sw.toFixed(1) + '" height="' + H + '" fill="var(--warn)" opacity="0.10"/>';
      if (pi === 0 && sw > 78) svg += '<text x="' + (sx0 + 6).toFixed(1) + '" y="' + (H - 8) + '" style="fill:var(--warn)">pulse overlap</text>';
    }
    const idx = decimate(V.E, p.Y, l0, l1, nb);
    const d = pathOf(idx, V.E, p.Y, X, yf, p.log);
    if (pi < panels.length - 1) ticks.forEach(t => { if (t.label) svg += '<text class="xl" x="' + XTk(t.v).toFixed(1) + '" y="' + (H + 16) + '" text-anchor="middle" style="fill:var(--ink2);font-size:11px">' + t.label + '</text>'; });
    svg += '<g clip-path="url(#cp' + pi + ')">';
    if (p.Y2) {
      const d2 = pathOf(decimate(V.E, p.Y2, l0, l1, nb), V.E, p.Y2, X, yf, p.log);
      svg += '<path d="' + d2 + '" fill="none" style="stroke:var(--ink2)" stroke-width="1" stroke-dasharray="2 3"/>';
    }
    if (p.Y3) svg += '<path d="' + pathOf(decimate(p.E3, p.Y3, l0, l1, nb), p.E3, p.Y3, X, yf, p.log) + '" fill="none" style="stroke:var(--ink2)" stroke-width="1.1" stroke-dasharray="5 3"/>';
    (p.ex || []).forEach(e => {
      svg += '<path d="' + pathOf(decimate(e.E, e.Y, l0, l1, nb), e.E, e.Y, X, yf, p.log) + '" fill="none" style="stroke:' + e.color + '" stroke-width="1.5" stroke-linejoin="round"/>';
    });
    if (!p.log && d && !(p.ex || []).length) {
      const lastI = idx[idx.length - 1], firstI = idx[0];
      svg += '<path d="' + d + 'L' + X(V.E[lastI]).toFixed(1) + ' ' + H + 'L' + X(V.E[firstI]).toFixed(1) + ' ' + H + 'Z" fill="' + p.color + '" opacity="0.16"/>';
    }
    svg += '<path d="' + d + '" fill="none" style="stroke:' + p.color + '" stroke-width="1.5" stroke-linejoin="round"' + (pi === 0 && curFac().dash ? ' stroke-dasharray="6 4"' : '') + '/>';
    if (pi === 2 && res.total > 0 && !yld) {
      const cf = v => H - v / res.total * H;
      svg += '<path d="' + pathOf(idx, V.E, V.cum, X, cf, false) + '" fill="none" style="stroke:var(--ink)" stroke-width="1.2" stroke-dasharray="4 3"/>';
    }
    svg += '</g>';
    if (pi === 2 && !yld) {
      [0, 50, 100].forEach(v => { const y = H - v / 100 * H; svg += '<text x="' + (ml + pw + 6) + '" y="' + (y + 4).toFixed(1) + '">' + v + '%</text>'; });
    }
    svg += '</g>';
  });
  const by = byAll;
  ticks.forEach(t => { svg += '<line x1="' + XTk(t.v).toFixed(1) + '" x2="' + XTk(t.v).toFixed(1) + '" y1="' + by + '" y2="' + (by + 5) + '" stroke="var(--ink2)"/>' + (t.label ? '<text x="' + XTk(t.v).toFixed(1) + '" y="' + (by + 18) + '" text-anchor="middle">' + t.label + '</text>' : ''); });
  svg += '<text x="' + (ml + pw / 2) + '" y="' + (by + 36) + '" text-anchor="middle">' + (tofMode ? 'Time of flight (flight path ' + LT + ' m, relativistic)' : 'Neutron energy (MeV)') + '</text>';
  svg += '<line id="hcross" x1="' + ml + '" x2="' + (ml + pw) + '" y1="-10" y2="-10" style="stroke:var(--ink)" stroke-width="1" opacity="0.45" stroke-dasharray="3 3" pointer-events="none"/>';
  svg += '<text id="yval" x="' + (ml + pw - 4) + '" y="-10" text-anchor="end" pointer-events="none" style="fill:var(--ink);font-weight:600;paint-order:stroke;stroke:var(--panel);stroke-width:4px;stroke-linejoin:round"></text>';
  svg += '<line id="cross" y1="' + top + '" y2="' + (by) + '" x1="-10" x2="-10" style="stroke:var(--ink)" stroke-width="1" opacity="0.6"/>';
  svg += '<rect id="selbox" x="0" y="' + top + '" width="0" height="' + (by - top) + '" fill="var(--accent)" opacity="0.18" stroke="var(--accent)"/>';
  svg += '<rect class="hit" id="hit" x="' + ml + '" y="' + top + '" width="' + pw + '" height="' + (totalH - top) + '"/>';
  svg += '</svg>';
  host.innerHTML = svg;
  if (S.exR) renderExp();

  const hit = $('hit'), cross = $('cross'), ro = $('readout'), box = $('selbox'), hcross = $('hcross'), yval = $('yval');
  // the y value (in the units of the panel under the pointer) is shown on a horizontal guide line
  const yAt = (ev, pin) => {
    const r = host.firstChild.getBoundingClientRect(), y = (ev.clientY - r.top) * (totalH / r.height);
    if (pin) { const y0 = pin.py + pin.hd, yc = Math.max(y0, Math.min(y0 + H, y)); return { y: yc, p: pin, v: pin.inv(yc - y0) }; }   // while dragging, stay inside the panel where the box started
    for (const p of panels) { const y0 = p.py + p.hd; if (y >= y0 && y <= y0 + H && p.inv) return { y, p, v: p.inv(y - y0) }; }
    return null;
  };
  const hideY = () => { hcross.setAttribute('y1', -10); hcross.setAttribute('y2', -10); yval.setAttribute('y', -10); yval.textContent = ''; };
  const pxOf = ev => { const r = host.firstChild.getBoundingClientRect(); return Math.max(ml, Math.min(ml + pw, (ev.clientX - r.left) * (W / r.width))); };
  const eOf = px => tofMode ? tofToE(Math.exp(lt0 + (px - ml) / pw * (lt1 - lt0)), LT) : Math.exp(l0 + (px - ml) / pw * (l1 - l0));
  let drag = null, dragY = null;
  hit.addEventListener('pointerdown', ev => { drag = pxOf(ev); dragY = yAt(ev); try { hit.setPointerCapture(ev.pointerId); } catch (e) { } });
  const endDrag = ev => {
    if (drag === null) return;
    const a = drag, b = pxOf(ev), y0 = dragY, y1 = y0 ? yAt(ev, y0.p) : null;
    drag = null; dragY = null;
    box.setAttribute('width', 0);
    let chg = false;
    if (Math.abs(b - a) > 6) {
      const e1 = eOf(a), e2 = eOf(b), ea = Math.min(e1, e2), eb = Math.max(e1, e2);
      if (eb / ea > 1.02) { S.zx = [ea, eb]; chg = true; }
    }
    if (ev.shiftKey && y0 && y1 && y0.p === y1.p && Math.abs(y1.y - y0.y) > 6) {
      const lo = Math.min(y0.v, y1.v), hi = Math.max(y0.v, y1.v);
      if (hi > lo && (y0.p.log ? (lo > 0 && hi / lo > 1.05) : (hi - lo) > 1e-6 * Math.max(Math.abs(hi), Math.abs(lo)))) { (S.yr = S.yr || {})[y0.p.id + (y0.p.nm || '')] = { lo, hi }; chg = true; }
    }
    if (chg) renderCharts();
  };
  hit.addEventListener('pointerup', endDrag);
  hit.addEventListener('pointercancel', () => { drag = null; dragY = null; box.setAttribute('width', 0); });
  hit.addEventListener('dblclick', () => { S.zx = null; S.yr = {}; renderCharts(); });
  const show = ev => {
    const px = pxOf(ev);
    if (drag !== null) {
      box.setAttribute('x', Math.min(drag, px)); box.setAttribute('width', Math.abs(px - drag));
      const cy = dragY ? yAt(ev, dragY.p) : null;
      if (ev.shiftKey && dragY && cy) {
        box.setAttribute('y', Math.min(dragY.y, cy.y)); box.setAttribute('height', Math.abs(cy.y - dragY.y));
      } else { box.setAttribute('y', top); box.setAttribute('height', by - top); }
    }
    const E = eOf(px);
    if (!(E >= x0 && E <= x1)) return;
    cross.setAttribute('x1', px); cross.setAttribute('x2', px);
    const ya = yAt(ev);
    if (ya) {
      hcross.setAttribute('y1', ya.y); hcross.setAttribute('y2', ya.y);
      yval.setAttribute('y', Math.max(top + 12, ya.y - 5)); yval.textContent = sciTxt(ya.v, 3) + ' ' + ya.p.unit;
    } else hideY();
    const i = upperBound(res.E, E) - 1;
    let j = Math.max(0, Math.min(res.E.length - 1, i));
    if (j + 1 < res.E.length && Math.log(E / res.E[j]) > Math.log(res.E[j + 1] / E)) j++;
    ro.innerHTML = 'E = <b>' + fmtEnergy(E) + '</b> · t = <b>' + fmtT(tofNs(E, LT)) + '</b> · Φ = ' + sci(res.phi[j], 3) + ' · σ = ' + sci(res.sig[j], 3) + ' b<br>' + (yld ? 'yield = ' + sci(res.phi[j] > 0 ? res.rho[j] / res.phi[j] * nA : 0, 3) + ' reactions / neutron' : 'rate density = ' + sci(res.rho[j] * kN, 3) + ' /s per ΔlnE · cumulative ' + (res.total > 0 ? (100 * cumAt(res, E) / res.total).toFixed(1) : '0') + ' %');
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); hideY(); });
}




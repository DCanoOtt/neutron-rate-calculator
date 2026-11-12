// ---------- Saving the plots (PNG / PDF) ----------
// The chart is an SVG that takes its colours and fonts from the page style sheet, so the computed style is copied onto a clone
// first; the clone is drawn on a canvas at 3× and saved as PNG, or embedded as a JPEG in a one-page PDF.
function chartImage(scale, hostId, linesIn) {
  const svg = $(hostId || 'chartHost').firstChild;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') return Promise.reject(new Error('No chart to save.'));
  const clone = svg.cloneNode(true);
  const root = document.documentElement, prevTheme = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');                           // the saved picture always uses the light palette
  const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'stroke-linejoin'];
  for (let i = 0; i < src.length; i++) {
    const cs = getComputedStyle(src[i]); let s = '';
    for (const p of props) s += p + ':' + cs.getPropertyValue(p) + ';';
    dst[i].setAttribute('style', s);
  }
  if (prevTheme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prevTheme);
  ['cross', 'selbox', 'hit', 'ecross', 'ebox', 'ehit'].forEach(id => { const e = clone.querySelector('#' + id); if (e) e.remove(); });
  const W = parseFloat(svg.getAttribute('width')), Hh = parseFloat(svg.getAttribute('height'));
  const bg = '#ffffff';
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('width', W); r.setAttribute('height', Hh); r.setAttribute('style', 'fill:' + bg); clone.insertBefore(r, clone.firstChild);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => {
      const lines = linesIn || runInfo(), hd = 12 + lines.length * 20 + 6, c = document.createElement('canvas');
      c.width = Math.round(W * scale); c.height = Math.round((Hh + hd) * scale);
      const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, hd * scale, W * scale, Hh * scale);
      const ff = getComputedStyle(document.body).fontFamily || 'sans-serif';
      lines.forEach((tx, i) => {                                         // title block: shrink a line that does not fit
        let px = i === 0 ? 15 : 12.5; const wt = i === 0 ? '600 ' : '400 ';
        g.fillStyle = i === 0 ? '#111111' : '#333333'; g.textBaseline = 'alphabetic';
        for (; px > 8; px -= 0.5) { g.font = wt + (px * scale) + 'px ' + ff; if (g.measureText(tx).width <= (W - 28) * scale) break; }
        g.textAlign = 'center'; g.fillText(tx, W / 2 * scale, (12 + i * 20 + 14) * scale);
      });
      ok({ canvas: c, W, H: Hh + hd });
    };
    im.onerror = () => no(new Error('The chart could not be rendered.'));
    im.src = url;
  });
}
function canvasBlob(c, type, q) { return new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('Encoding failed.')), type, q)); }
async function pdfFromJpeg(jpg, pxW, pxH, ptW, ptH) {                  // one page, the JPEG fills it
  const enc = new TextEncoder(), parts = [], off = []; let len = 0;
  const add = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (n, body) => { off[n] = len; add(n + ' 0 obj\n'); add(body); add('\nendobj\n'); };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + ptW.toFixed(2) + ' ' + ptH.toFixed(2) + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  off[4] = len; add('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + pxW + ' /Height ' + pxH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n'); add(jpg); add('\nendstream\nendobj\n');
  const cont = 'q ' + ptW.toFixed(2) + ' 0 0 ' + ptH.toFixed(2) + ' 0 0 cm /Im0 Do Q';
  obj(5, '<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream');
  const xr = len; let t = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n++) t += String(off[n]).padStart(10, '0') + ' 00000 n \n';
  add(t + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}
async function saveChart(kind, ex) {
  const msg = ex ? $('exMsg') : $('saveMsg');
  try {
    // inside Claude the viewer's download feature is used; in a normal browser the file goes through an ordinary download link
    let dl = null, inClaude = true;
    try { dl = window.claude && await window.claude.use('downloads'); } catch (e) { dl = null; }
    if (!dl) {
      inClaude = false;
      dl = { save: async r => {
        const b = r.data instanceof Blob ? r.data : new Blob([r.data]), a = document.createElement('a'), u = URL.createObjectURL(b);
        a.href = u; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
        return { status: 'saved' };
      } };
    }
    const F = curFac(), nm = ((ex ? 'experiment ' : '') + (S.viewName || 'rates') + ' ' + F.name).replace(/γ/g, 'g').replace(/[^A-Za-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'rates';
    if (kind === 'txt') {
      const tx = ex ? expText() : chartText(F); if (!tx) { msg.textContent = 'No plot to save.'; return; }
      await dl.save({ filename: nm + '.txt', data: tx });
      msg.textContent = 'Saved ' + nm + '.txt.';
      return;
    }
    if (kind === 'root') {
      const hs = ex ? expHistograms() : chartHistograms(); if (!hs.length) { msg.textContent = 'No plot to save.'; return; }
      const rn = nm + '.root', rb = RootIO.file(rn, hs);
      if (!inClaude) { await dl.save({ filename: rn, data: new Blob([rb], { type: 'application/octet-stream' }) }); msg.textContent = 'Saved ' + rn + ' with ' + hs.length + ' histograms.'; return; }
      const zb = zipStore(rn, rb), fz = nm + '_histograms.zip';
      await dl.save({ filename: fz, data: zb });
      msg.textContent = 'Saved ' + fz + ' (' + rn + ' with ' + hs.length + ' histograms).';
      return;
    }
    const im = ex ? await chartImage(3, 'exHost', expInfo()) : await chartImage(3);
    let blob, fn;
    if (kind === 'png') { blob = await canvasBlob(im.canvas, 'image/png'); fn = nm + '.png'; }
    else {
      const jb = await canvasBlob(im.canvas, 'image/jpeg', 0.95), jpg = new Uint8Array(await jb.arrayBuffer());
      blob = await pdfFromJpeg(jpg, im.canvas.width, im.canvas.height, im.W * 0.75, im.H * 0.75); fn = nm + '.pdf';
    }
    await dl.save({ filename: fn, data: blob });
    msg.textContent = 'Saved ' + fn + '.';
  } catch (e) {
    msg.textContent = e && e.code === 'declined' ? '' : 'Could not save: ' + ((e && e.message) || e);
  }
}



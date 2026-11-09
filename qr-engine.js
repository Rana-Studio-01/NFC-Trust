/* Tap Trust QR – engine: HD render, save to gallery, copy, toast */
(function (w, d) {
  'use strict';
  const Q = w.TT_QR;
  if (w.qrcode && w.qrcode.stringToBytesFuncs) w.qrcode.stringToBytes = w.qrcode.stringToBytesFuncs['UTF-8'];

  Q.QUIET = 2; // white margin in modules (scanners need at least 2 to read reliably)
  Q.inApp = /Instagram|FBAN|FBAV|FB_IAB|Snapchat|Line\//i.test(navigator.userAgent);

  /** Draws a pixel-perfect black-on-white QR into a square canvas (default 1920 x 1920). */
  Q.render = (data, size = 1920) => {
    const qr = w.qrcode(0, 'M');
    qr.addData(data);
    try { qr.make(); } catch (e) { throw new Error('This is too long for one QR code. Use a shorter link.'); }
    const n = qr.getModuleCount(), s = size / (n + Q.QUIET * 2);
    const c = d.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
    x.fillStyle = '#000';
    for (let r = 0; r < n; r++) {
      for (let k = 0; k < n; k++) {
        if (!qr.isDark(r, k)) continue;
        const x0 = Math.round((k + Q.QUIET) * s), y0 = Math.round((r + Q.QUIET) * s);
        x.fillRect(x0, y0, Math.round((k + Q.QUIET + 1) * s) - x0, Math.round((r + Q.QUIET + 1) * s) - y0);
      }
    }
    return c;
  };

  /** Saves the PNG. iPhone: share sheet (Save Image). Android/desktop: direct download (shows in Gallery). */
  Q.save = async (canvas, name) => {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Could not create the image. Try again.');
    const file = new File([blob], name, { type: 'image/png' });
    if (/iP(hone|ad|od)/.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; }
    }
    const a = d.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    d.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return 'saved';
  };

  Q.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const t = d.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0';
      d.body.appendChild(t); t.select();
      let ok = false; try { ok = d.execCommand('copy'); } catch (_) {}
      t.remove(); return ok;
    }
  };

  let tt;
  Q.toast = (msg, type) => {
    const el = d.getElementById('toast');
    el.textContent = msg; el.className = 'toast show ' + (type || '');
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove('show'), 2600);
  };
})(window, document);

/* Tap Trust QR – scanner: live camera + gallery photo (jsQR), with "find the QR and lock on" animation */
(function (w, d) {
  'use strict';
  const Q = w.TT_QR;
  const $scan = () => d.getElementById('scan');

  /* ---------- jsQR loader: if local jsqr.min.js is missing/broken, load from CDN ---------- */
  const CDNS = ['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'];
  let loading = null;
  function ensureJsQR() {
    if (typeof w.jsQR === 'function') return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      for (const u of CDNS) {
        const ok = await new Promise((res) => {
          const s = d.createElement('script');
          s.src = u; s.onload = () => res(true); s.onerror = () => res(false);
          d.head.appendChild(s);
        });
        if (ok && typeof w.jsQR === 'function') return true;
      }
      loading = null;
      return false;
    })();
    return loading;
  }
  ensureJsQR();

  /* ---------- detect: returns { text, loc, canvas, cw, ch } or null ---------- */
  function detect(src, sw, sh) {
    if (typeof w.jsQR !== 'function') return null;
    const MAX = 1100;
    const k = Math.min(1, MAX / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
    const c = d.createElement('canvas');
    c.width = cw; c.height = ch;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, cw, ch);
    const img = x.getImageData(0, 0, cw, ch);
    const r = w.jsQR(img.data, cw, ch, { inversionAttempts: 'attemptBoth' });
    if (!r || !r.data) return null;
    const L = r.location;
    return { text: r.data, canvas: c, cw, ch, loc: [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner] };
  }

  function detectFile(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        let out = null;
        try {
          out = detect(im, im.naturalWidth, im.naturalHeight);
          if (!out && Math.max(im.naturalWidth, im.naturalHeight) > 600) {
            const s = 600 / Math.max(im.naturalWidth, im.naturalHeight);
            out = detect(im, Math.round(im.naturalWidth * s), Math.round(im.naturalHeight * s));
          }
        } catch (e) { out = null; }
        URL.revokeObjectURL(url);
        resolve(out);
      };
      im.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      im.src = url;
    });
  }

  /* ---------- result preview: show the photo, shrink a frame onto the QR, sweep, tick ---------- */
  const st = d.createElement('style');
  st.textContent = '.ttpv{position:absolute;inset:68px 12px 42% 12px;animation:ttpvIn .25s ease both}' +
    '.ttpv canvas{width:100%;height:100%;object-fit:contain;border-radius:14px;display:block}' +
    '.ttpv svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}' +
    '@keyframes ttpvIn{from{opacity:0}to{opacity:1}}';
  d.head.appendChild(st);

  let pv = null, af = 0;
  function clearPreview() {
    cancelAnimationFrame(af); af = 0;
    if (pv) { pv.remove(); pv = null; }
    const s = $scan(), r = s && s.querySelector('.reticle');
    if (r) r.style.visibility = '';
  }
  if ($scan()) new MutationObserver(() => { const s = $scan(); if (s && s.hidden) clearPreview(); })
    .observe($scan(), { attributes: true, attributeFilter: ['hidden'] });

  const NS = 'http://www.w3.org/2000/svg';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function el(name, attrs, parent) {
    const e = d.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function showHit(hit) {
    return new Promise((resolve) => {
      clearPreview();
      const s = $scan();
      if (!s) return resolve();
      const reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const { cw, ch, loc } = hit;

      pv = d.createElement('div'); pv.className = 'ttpv';
      pv.appendChild(hit.canvas);
      const svg = el('svg', { viewBox: `0 0 ${cw} ${ch}`, preserveAspectRatio: 'xMidYMid meet' }, pv);
      const sw = Math.max(3, Math.min(cw, ch) / 70);
      const dim = el('path', { fill: 'rgba(0,0,0,.62)', 'fill-rule': 'evenodd' }, svg);
      const tint = el('polygon', { fill: 'rgba(34,197,94,.28)', opacity: 0 }, svg);
      const beam = el('line', { stroke: '#FFC400', 'stroke-width': sw * 0.8, 'stroke-linecap': 'round', opacity: 0 }, svg);
      const br = el('path', { fill: 'none', stroke: '#FFC400', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      const ok = el('g', { opacity: 0 }, svg);
      el('circle', { r: 1, fill: '#22c55e' }, ok);
      el('path', { d: 'M-0.5 0.02 L-0.14 0.4 L0.52 -0.34', fill: 'none', stroke: '#fff', 'stroke-width': 0.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ok);
      s.insertBefore(pv, s.querySelector('.reticle'));
      const ret = s.querySelector('.reticle'); if (ret) ret.style.visibility = 'hidden';

      const pad = Math.min(cw, ch) * 0.03;
      const start = [[pad, pad], [cw - pad, pad], [cw - pad, ch - pad], [pad, ch - pad]];
      const xs = loc.map((p) => p.x), ys = loc.map((p) => p.y);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      const size = Math.max(14, Math.min(bx1 - bx0, by1 - by0) * 0.26);

      const T1 = 750, T2 = 1350, T3 = 1950; /* lock-on, sweep, tick */
      const t0 = performance.now();

      function draw(now) {
        const t = now - t0;
        const e = easeOut(clamp01(t / T1));
        const q = loc.map((p, i) => [lerp(start[i][0], p.x, e), lerp(start[i][1], p.y, e)]);
        dim.setAttribute('d', `M0 0H${cw}V${ch}H0Z M${q[0][0]} ${q[0][1]}L${q[1][0]} ${q[1][1]}L${q[2][0]} ${q[2][1]}L${q[3][0]} ${q[3][1]}Z`);
        /* corner brackets */
        const f = 0.22; let dstr = '';
        for (let i = 0; i < 4; i++) {
          const c = q[i], pr = q[(i + 3) % 4], nx = q[(i + 1) % 4];
          dstr += `M${lerp(c[0], pr[0], f)} ${lerp(c[1], pr[1], f)}L${c[0]} ${c[1]}L${lerp(c[0], nx[0], f)} ${lerp(c[1], nx[1], f)}`;
        }
        br.setAttribute('d', dstr);

        if (t > T1 && t < T2) { /* beam sweep */
          const p = (t - T1) / (T2 - T1), y = lerp(by0, by1, p);
          beam.setAttribute('x1', bx0); beam.setAttribute('x2', bx1);
          beam.setAttribute('y1', y); beam.setAttribute('y2', y);
          beam.setAttribute('opacity', Math.sin(p * Math.PI));
        } else beam.setAttribute('opacity', 0);

        if (t >= T2) { /* success */
          const p = clamp01((t - T2) / (T3 - T2));
          br.setAttribute('stroke', '#22c55e');
          tint.setAttribute('points', loc.map((pt) => pt.x + ',' + pt.y).join(' '));
          tint.setAttribute('opacity', Math.min(1, p * 2));
          ok.setAttribute('opacity', Math.min(1, p * 3));
          ok.setAttribute('transform', `translate(${cx} ${cy}) scale(${size * easeBack(Math.min(1, p * 1.6))})`);
        }
        if (t < T3 + 150) af = requestAnimationFrame(draw);
        else { af = 0; resolve(); }
      }
      if (reduce) { draw(t0 + T3); setTimeout(resolve, 250); } else af = requestAnimationFrame(draw);
    });
  }

  /* ---------- public API used by qr-page.js ---------- */
  Q.decodeFile = async (file) => {
    await ensureJsQR();
    const hit = await detectFile(file);
    if (!hit) return '';
    const s = $scan();
    if (s && !s.hidden) await showHit(hit); /* animate only inside the scanner screen */
    return hit.text;
  };

  let stream = null, raf = 0, running = false;
  Q.Scanner = {
    async start(video, onFound) {
      Q.Scanner.stop();
      clearPreview();
      await ensureJsQR();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera not supported');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      video.srcObject = stream;
      video.controls = false;
      video.setAttribute('playsinline', '');
      video.setAttribute('disablepictureinpicture', '');
      video.muted = true;
      await video.play();
      video.style.visibility = 'visible';
      running = true;
      let last = 0;
      const tick = (t) => {
        if (!running) return;
        raf = requestAnimationFrame(tick);
        if (t - last < 120 || video.readyState < 2 || !video.videoWidth) return; /* ~8 scans/sec */
        last = t;
        let hit = null;
        try { hit = detect(video, video.videoWidth, video.videoHeight); } catch (e) {}
        if (hit) {
          Q.Scanner.stop();
          showHit(hit).then(() => onFound(hit.text));
        }
      };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      const v = d.getElementById('cam');
      if (v) { try { v.pause(); } catch (e) {} v.srcObject = null; v.style.visibility = 'hidden'; }
    }
  };
})(window, document);

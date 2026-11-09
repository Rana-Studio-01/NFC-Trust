/* Tap Trust QR – link builders (Instagram, WhatsApp, UPI, Wi-Fi ...) and icons */
(function (w) {
  'use strict';
  const Q = (w.TT_QR = w.TT_QR || {});

  /* ---------- icons ---------- */
  const P = {
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>',
    whatsapp: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/><path d="M9 9.5c.3 2.6 2.9 5.2 5.5 5.5l1.3-1.4-2-1-1 .7c-.8-.4-1.5-1.1-1.9-1.9l.7-1-1-2z"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    youtube: '<path d="M22.5 7.2a2.5 2.5 0 0 0-1.8-1.8C19.1 5 12 5 12 5s-7.1 0-8.7.4A2.5 2.5 0 0 0 1.5 7.2 26 26 0 0 0 1 12a26 26 0 0 0 .5 4.8 2.5 2.5 0 0 0 1.8 1.8C4.9 19 12 19 12 19s7.1 0 8.7-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 23 12a26 26 0 0 0-.5-4.8z"/><path d="m10 15 5-3-5-3z"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><path d="M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".9" fill="currentColor"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    upi: '<path d="M6 4h12M6 9h12M9 4c4.5 0 6 2 6 5s-2 5-6 5H6l8 6"/>',
    store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 20v-5h4v5"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    download: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16"/>',
    paste: '<rect x="6" y="5" width="12" height="16" rx="2.5"/><path d="M9 5a3 3 0 0 1 6 0M9.5 12h5M9.5 16h3"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/>'
  };
  Q.icon = (n, s) => `<svg class="ic" width="${s || 22}" height="${s || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

  /* ---------- helpers ---------- */
  const T = (s) => String(s == null ? '' : s).trim();
  const H = (s) => T(s).replace(/^https?:\/\/(www\.)?[^/]+\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  const D = (s) => T(s).replace(/\D/g, '');
  const fail = (m) => { throw new Error(m); };
  const UPI_ID = /^[\w.\-+]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,63}$/;
  const wifiEsc = (s) => s.replace(/([\\;,:"])/g, '\\$1');

  /** Turn typed text into a usable link. "example.com" -> "https://example.com" */
  Q.normalize = (s) => {
    s = T(s);
    if (!s || /\s/.test(s) && !/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(s)) return 'https://' + s;
    return s;
  };
  Q.kind = (d) => (/^https?:\/\//i.test(d) ? 'web' : /^upi:\/\//i.test(d) ? 'upi' : 'text');

  /* ---------- UPI ---------- */
  const enc = (v) => encodeURIComponent(v).replace(/%40/g, '@');
  Q.parseUpi = (text) => {
    if (!/^upi:\/\/pay\?/i.test(T(text))) return null;
    try {
      const pairs = T(text).split('?').slice(1).join('?').split('&').filter(Boolean).map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i), decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '))];
      });
      const o = {}; pairs.forEach(([k, v]) => { o[k] = v; });
      if (!o.pa) return null;
      return { pa: o.pa, pn: o.pn || '', mc: o.mc || '', extra: pairs.filter(([k]) => !['pa', 'pn', 'mc'].includes(k)) };
    } catch (e) { return null; }
  };
  Q.makeUpi = ({ pa, pn, mc, am, tn, extra = [] }) => {
    const parts = [['pa', pa]];
    if (pn) parts.push(['pn', pn]);
    if (mc) parts.push(['mc', mc]);
    extra.forEach(([k, v]) => { if (!['pa', 'pn', 'mc', 'am', 'tn'].includes(k)) parts.push([k, v]); });
    if (am) parts.push(['am', am]);
    if (tn) parts.push(['tn', tn]);
    if (!parts.some(([k]) => k === 'cu')) parts.push(['cu', 'INR']);
    return 'upi://pay?' + parts.map(([k, v]) => k + '=' + enc(v)).join('&');
  };

  /* ---------- platforms (first one = default) ---------- */
  Q.platforms = [
    { id: 'link', label: 'Paste any link', sub: 'Default · you can skip the list', icon: 'link', paste: true },
    { id: 'instagram', label: 'Instagram', sub: 'Profile link from handle', icon: 'instagram',
      fields: [{ k: 'h', label: 'Instagram handle', ph: 'rana_esports_official' }],
      build(v) { const h = H(v.h); if (!/^[\w.]{1,30}$/.test(h)) fail('Enter a valid Instagram handle.'); return `https://www.instagram.com/${h}/`; } },
    { id: 'whatsapp', label: 'WhatsApp', sub: 'Chat link from number', icon: 'whatsapp', cols: '96px 1fr',
      fields: [{ k: 'cc', label: 'Code', ph: '91', val: '91', mode: 'numeric' },
               { k: 'n', label: 'WhatsApp number', ph: '9876543210', mode: 'tel' },
               { k: 'm', label: 'Ready message', ph: 'Hi, I want to know more', opt: 1, span: 1 }],
      build(v) {
        const cc = D(v.cc) || '91', n = D(v.n).replace(/^0+/, '');
        if (n.length < 6 || cc.length + n.length > 15) fail('Enter a valid WhatsApp number.');
        return `https://wa.me/${cc}${n}` + (T(v.m) ? '?text=' + encodeURIComponent(T(v.m)) : '');
      } },
    { id: 'facebook', label: 'Facebook', sub: 'Profile or page link', icon: 'facebook',
      fields: [{ k: 'h', label: 'Facebook username', ph: 'tap.trust' }],
      build(v) { const h = H(v.h); if (!/^[\w.\-]{3,}$/.test(h)) fail('Enter a valid Facebook username.'); return `https://www.facebook.com/${h}`; } },
    { id: 'youtube', label: 'YouTube', sub: 'Channel link from handle', icon: 'youtube',
      fields: [{ k: 'h', label: 'YouTube handle', ph: 'ranaesports' }],
      build(v) { const h = H(v.h); if (!/^[\w.\-]{3,30}$/.test(h)) fail('Enter a valid YouTube handle.'); return `https://www.youtube.com/@${h}`; } },
    { id: 'wifi', label: 'Wi-Fi', sub: 'Join network on tap', icon: 'wifi',
      fields: [{ k: 'ssid', label: 'Network name (SSID)', ph: 'My Shop WiFi' },
               { k: 'pw', label: 'Password', ph: 'Wi-Fi password', type: 'text' },
               { k: 'sec', label: 'Security', type: 'select', opts: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'No password']] }],
      build(v) {
        const s = T(v.ssid); if (!s) fail('Enter the Wi-Fi name.');
        if (v.sec === 'nopass') return `WIFI:T:nopass;S:${wifiEsc(s)};;`;
        if (!T(v.pw)) fail('Enter the Wi-Fi password.');
        return `WIFI:T:${v.sec};S:${wifiEsc(s)};P:${wifiEsc(T(v.pw))};;`;
      } },
    { id: 'review', label: 'Google Review', sub: 'Review page of your shop', icon: 'star',
      fields: [{ k: 'id', label: 'Place ID or review link', ph: 'ChIJ... or https://g.page/r/...' }],
      build(v) {
        const s = T(v.id); if (!s) fail('Enter your Google Place ID or review link.');
        if (/^https?:\/\//i.test(s)) return s;
        if (!/^[\w-]{20,}$/.test(s)) fail('This does not look like a Place ID.');
        return 'https://search.google.com/local/writereview?placeid=' + s;
      } },
    { id: 'upi', label: 'UPI', sub: 'Personal payment link', icon: 'upi',
      fields: [{ k: 'pa', label: 'UPI ID', ph: 'name@okbank' },
               { k: 'pn', label: 'Name shown to payer', ph: 'Rana Kumar', opt: 1 },
               { k: 'am', label: 'Amount (₹)', ph: '0', mode: 'decimal', opt: 1 },
               { k: 'tn', label: 'Note', ph: 'Payment note', opt: 1 }], cols: '1fr 1fr',
      build(v) {
        if (!UPI_ID.test(T(v.pa))) fail('Enter a valid UPI ID, like name@bank.');
        const am = T(v.am); if (am && !/^\d+(\.\d{1,2})?$/.test(am)) fail('Enter a valid amount.');
        return Q.makeUpi({ pa: T(v.pa), pn: T(v.pn), am: am && +am > 0 ? am : '', tn: T(v.tn) });
      } },
    { id: 'bupi', label: 'Business UPI', sub: 'Shop QR · soundbox ready', icon: 'store', photo: true,
      fields: [{ k: 'pa', label: 'Merchant UPI ID', ph: 'paytmqr1234@paytm' },
               { k: 'pn', label: 'Business name', ph: 'Rana General Store' },
               { k: 'mc', label: 'Merchant code', ph: '5411', mode: 'numeric', opt: 1 }],
      build(v, st) {
        if (!UPI_ID.test(T(v.pa))) fail('Enter a valid merchant UPI ID, or add a photo of your shop QR.');
        if (!T(v.pn)) fail('Enter your business name.');
        return Q.makeUpi({ pa: T(v.pa), pn: T(v.pn), mc: T(v.mc), extra: st.extra || [] });
      } }
  ];
})(window);

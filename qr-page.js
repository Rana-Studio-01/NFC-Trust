/* Tap Trust QR – page controller: tabs, dropdown, forms, results, scanner UI */
(function (w, d) {
  'use strict';
  const Q = w.TT_QR;
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => [...r.querySelectorAll(s)];
  const st = { pf: Q.platforms[0], extra: [] };

  /* result blocks (clone first, then paint icons) */
  $$('.resSlot').forEach((s) => s.append(d.getElementById('resT').content.cloneNode(true)));
  $$('[data-ic]').forEach((e) => e.insertAdjacentHTML('afterbegin', Q.icon(e.dataset.ic, +e.dataset.s || 22)));
  if (Q.inApp) $('#inapp').hidden = false;

  function show(panel, data) {
    const r = $('.res', panel);
    let c;
    try { c = Q.render(data); } catch (e) { Q.toast(e.message, 'err'); return; }
    const fr = $('.qr-frame', r);
    $('canvas', fr).replaceWith(c);
    c.setAttribute('aria-label', 'Generated QR code');
    r._c = c; r._d = data;
    $('.linktxt', r).textContent = data;
    $('.open', r).hidden = Q.kind(data) === 'text';
    r.hidden = false;
    fr.classList.remove('sweep'); void fr.offsetWidth; fr.classList.add('sweep');
    setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }

  $$('.res').forEach((r) => {
    r.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('copy')) Q.toast(await Q.copy(r._d) ? 'Link copied' : 'Could not copy', 'ok');
      else if (b.classList.contains('open')) {
        if (Q.kind(r._d) === 'web') w.open(r._d, '_blank', 'noopener,noreferrer'); else location.href = r._d;
      } else if (b.classList.contains('dl')) {
        try {
          const s = await Q.save(r._c, `tap-trust-qr-${Date.now()}.png`);
          if (s !== 'cancel') Q.toast(s === 'shared' ? 'Choose Save Image to keep it in Photos' : 'QR saved. Check your Gallery or Downloads.', 'ok');
        } catch (err) { Q.toast(err.message, 'err'); }
      }
    });
  });

  /* tabs */
  function tab(i) {
    $('.tabs').dataset.i = i;
    $$('.tab').forEach((b, j) => b.setAttribute('aria-selected', j === i));
    $$('.panel').forEach((p, j) => {
      p.hidden = j !== i;
      if (j === i) { p.classList.remove('in'); void p.offsetWidth; p.classList.add('in'); }
    });
    history.replaceState(null, '', i ? '#generate' : '#tap-trust');
  }
  $$('.tab').forEach((b, i) => b.addEventListener('click', () => tab(i)));

  /* paste inputs (auto-generate on paste or typing) */
  $$('.panel').forEach((p) => {
    const input = $('.linkIn', p), btn = $('.pasteBtn', p); let t;
    const go = () => {
      const v = Q.normalize(input.value);
      if (!v) { $('.res', p).hidden = true; return; }
      show(p, v);
    };
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 450); });
    btn.addEventListener('click', async () => {
      try {
        const s = (await navigator.clipboard.readText()).trim();
        if (!s) return Q.toast('Clipboard is empty. Copy a link first.', 'err');
        input.value = s; go();
      } catch (e) { input.focus(); Q.toast('Long-press the box and tap Paste.', 'err'); }
    });
  });

  /* dropdown */
  const dd = $('#dd'), ddBtn = $('#ddBtn'), ddList = $('#ddList');
  Q.platforms.forEach((p) => {
    const li = d.createElement('li');
    li.innerHTML = `<button type="button" role="option" data-id="${p.id}"><span class="ddi">${Q.icon(p.icon, 20)}</span><span><b>${p.label}</b><small>${p.sub}</small></span></button>`;
    ddList.append(li);
  });
  const toggle = (o) => { ddList.hidden = !o; ddBtn.setAttribute('aria-expanded', o); };
  ddBtn.addEventListener('click', () => toggle(ddList.hidden));
  ddList.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { pick(b.dataset.id); toggle(false); ddBtn.focus(); } });
  d.addEventListener('click', (e) => { if (!dd.contains(e.target)) toggle(false); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); closeScan(); } });

  function pick(id) {
    const p = (st.pf = Q.platforms.find((x) => x.id === id)); st.extra = [];
    $('.ddi', ddBtn).innerHTML = Q.icon(p.icon, 20);
    $('.ddl', ddBtn).textContent = p.label;
    $$('[data-id]', ddList).forEach((b) => b.setAttribute('aria-selected', b.dataset.id === id));
    $('.res', $('#p0')).hidden = true;
    $('#pasteBox').hidden = !p.paste;
    $('#genBtn').hidden = !!p.paste;
    const box = $('#fields'); box.textContent = ''; box.style.gridTemplateColumns = p.cols || '1fr';
    (p.fields || []).forEach((f, i) => {
      const wrap = d.createElement('div');
      wrap.className = 'fld' + (f.span || !p.cols || (p.cols === '1fr 1fr' && i < 2) ? ' span' : '');
      const lb = d.createElement('label'); lb.htmlFor = 'f_' + f.k; lb.textContent = f.label;
      if (f.opt) { const o = d.createElement('i'); o.textContent = ' (optional)'; lb.append(o); }
      let el;
      if (f.type === 'select') { el = d.createElement('select'); f.opts.forEach(([v, t]) => el.add(new Option(t, v))); }
      else { el = d.createElement('input'); el.type = 'text'; el.placeholder = f.ph || ''; }
      el.id = 'f_' + f.k; el.name = f.k;
      if (f.mode) el.inputMode = f.mode;
      if (f.val) el.value = f.val;
      el.autocomplete = 'off'; el.autocapitalize = 'none'; el.spellcheck = false;
      el.addEventListener('input', () => el.classList.remove('bad'));
      wrap.append(lb, el); box.append(wrap);
    });
    const pb = $('#photoBox'); pb.textContent = '';
    if (p.photo) renderPhoto(pb);
  }

  /* business UPI: read an existing shop QR from a photo */
  function renderPhoto(pb) {
    pb.innerHTML = `<div class="photo"><div class="ph-prev" id="phPrev">${Q.icon('qr', 28)}<span>Add a photo of your shop QR (Paytm, PhonePe, BharatPe...). We read it and build a fresh QR with the same payment details.</span></div>
      <div class="ph-btns"><button type="button" class="btn ghost sm" id="phCam">${Q.icon('camera', 18)}Take photo</button><button type="button" class="btn ghost sm" id="phGal">${Q.icon('image', 18)}Gallery</button></div>
      <input type="file" id="fCam" accept="image/*" capture="environment" hidden><input type="file" id="fGal" accept="image/*" hidden></div>`;
    $('#phCam').onclick = () => $('#fCam').click();
    $('#phGal').onclick = () => $('#fGal').click();
    [$('#fCam'), $('#fGal')].forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.value = ''; if (!f) return;
      const prev = $('#phPrev'); const url = URL.createObjectURL(f);
      prev.innerHTML = `<img src="${url}" alt=""><span>Reading QR...</span>`;
      const txt = await Q.decodeFile(f);
      const u = txt && Q.parseUpi(txt);
      if (!u) {
        prev.querySelector('span').textContent = txt ? 'This is not a UPI payment QR.' : 'No QR found. Try a closer, brighter photo.';
        return Q.toast(txt ? 'This QR is not a UPI payment QR.' : 'Could not read a QR in this photo.', 'err');
      }
      st.extra = u.extra;
      $('#f_pa').value = u.pa; $('#f_pn').value = u.pn; $('#f_mc').value = u.mc;
      prev.innerHTML = `<img src="${url}" alt=""><span class="ok">${Q.icon('check', 16)} Shop QR read: ${u.pa}</span>`;
      $('#genBtn').click();
    }));
  }

  /* generate (handle / number / UPI forms) */
  $('#genBtn').addEventListener('click', () => {
    const v = {}; $$('#fields [name]').forEach((e) => { v[e.name] = e.value; });
    try { show($('#p0'), st.pf.build(v, st)); }
    catch (e) {
      Q.toast(e.message, 'err');
      const bad = $$('#fields input').find((i) => !i.value.trim() && !i.closest('.fld').querySelector('label i')); if (bad) { bad.classList.add('bad'); bad.focus(); }
    }
  });
  $('#fields').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#genBtn').click(); });

  /* scanner */
  const sc = $('#scan'), sheet = $('#sheet'); let cur = '';
  function found(v) {
    cur = v; navigator.vibrate && navigator.vibrate(35);
    $('#sheetV').textContent = v;
    const k = Q.kind(v); $('#shVisit').hidden = k === 'text';
    sheet.hidden = false; $('.reticle', sc).hidden = true;
  }
  async function openScan() {
    sc.hidden = false; sheet.hidden = true; $('.reticle', sc).hidden = false; $('#camErr').hidden = true;
    try { await Q.Scanner.start($('#cam'), found); } catch (e) { $('#camErr').hidden = false; }
  }
  function closeScan() { if (sc.hidden) return; Q.Scanner.stop(); sc.hidden = true; }
  $('#scanBtn').addEventListener('click', openScan);
  $('#scanClose').addEventListener('click', closeScan);
  $('#shAgain').addEventListener('click', openScan);
  $('#shCopy').addEventListener('click', async () => Q.toast(await Q.copy(cur) ? 'Copied' : 'Could not copy', 'ok'));
  $('#shVisit').addEventListener('click', () => { if (Q.kind(cur) === 'web') w.open(cur, '_blank', 'noopener,noreferrer'); else location.href = cur; });
  $('#shMake').addEventListener('click', () => { closeScan(); tab(1); const i = $('#link1'); i.value = cur; i.dispatchEvent(new Event('input')); });
  $('#scanGal').addEventListener('click', () => $('#scanFile').click());
  $('#scanFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    Q.Scanner.stop();
    const v = await Q.decodeFile(f);
    if (v) found(v); else { Q.toast('No QR code found in this photo.', 'err'); openScan(); }
  });

  /* start: Tap Trust tab + default option */
  pick('link');
  tab(location.hash === '#generate' ? 1 : 0);
})(window, document);

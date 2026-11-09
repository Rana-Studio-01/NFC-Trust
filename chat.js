/* ==========================================================================
   NFC Trust - chat.js
   Real-time chat का engine। User वाली chat और admin वाली chat दोनों यही इस्तेमाल करती हैं।

   - हर thread = एक Firestore document (orders/{id} या helpThreads/{uid})
   - Messages = उसी document के अंदर "messages" subcollection
   - सिर्फ़ latest 80 messages लोड होते हैं (Firestore reads कम रखने के लिए)
   - "Seen" tick: दूसरी तरफ़ वाले का lastSeen time देखकर दिखता है (हर message पर अलग write नहीं)
   ========================================================================== */
import {
  db, collection, doc, query, orderBy, limit, onSnapshot, writeBatch, updateDoc,
  serverTimestamp, increment
} from "./firebase.js";
import { SITE } from "./config.js";
import { $, escapeHtml, linkify, formatClock, formatDay, toMs, formatPrice, copyText, compressImage } from "./utils.js";
import { toast, openImage, ICONS } from "./ui.js";

const MAX_MESSAGES = 80;

/* opts:
   container   - jis element me chat banani hai
   threadRef   - orders/{id} ya helpThreads/{uid} ka document ref
   mode        - 'order' | 'help'
   role        - 'user' | 'admin'
   me          - { uid, name, photoURL, email, emailMasked }  (user ke liye)
   isBlocked   - () => bool
   onAddCard   - () => void   (user ka "+" button)
   quickReplies- [{ label, text }]  (admin ke liye)  */
export function createChat(opts) {
  const { container, threadRef, mode, role } = opts;
  let thread = null, threadLoaded = false, messages = [], lastSend = 0, destroyed = false;
  let renderedOnce = false, seenLock = false;
  const touchDevice = window.matchMedia("(pointer: coarse)").matches;

  container.innerHTML = `
    <div class="chat">
      <div class="chat-msgs" role="log" aria-live="polite" aria-label="Messages"><div class="chat-empty">Loading messages…</div></div>
      <button class="chat-jump" type="button" hidden aria-label="Jump to latest message">${ICONS.back}</button>
      ${role === "admin" ? `<div class="chat-quick" aria-label="Quick replies"></div>` : ""}
      <div class="chat-notice" hidden></div>
      <form class="chat-compose" autocomplete="off">
        ${role === "user" && mode === "order" ? `<button type="button" class="icon-btn compose-btn" data-act="add" aria-label="Add another card">${ICONS.plus}</button>` : ""}
        <button type="button" class="icon-btn compose-btn" data-act="attach" aria-label="Attach an image">${ICONS.image}</button>
        <input type="file" accept="image/*" hidden>
        <textarea rows="1" maxlength="1000" placeholder="Type your message" aria-label="Type your message"></textarea>
        <button type="submit" class="btn-send" aria-label="Send message">${ICONS.send}</button>
      </form>
    </div>`;

  const msgsEl = $(".chat-msgs", container);
  const jumpBtn = $(".chat-jump", container);
  const noticeEl = $(".chat-notice", container);
  const form = $(".chat-compose", container);
  const ta = $("textarea", form);
  const fileInput = $('input[type="file"]', form);
  const sendBtn = $(".btn-send", form);

  /* ---------- Quick replies (admin) ---------- */
  if (role === "admin" && Array.isArray(opts.quickReplies)) {
    const q = $(".chat-quick", container);
    q.innerHTML = opts.quickReplies.map((r, i) => `<button type="button" class="chip chip--btn" data-q="${i}">${escapeHtml(r.label)}</button>`).join("");
    q.addEventListener("click", (e) => {
      const b = e.target.closest("[data-q]"); if (!b) return;
      const r = opts.quickReplies[Number(b.dataset.q)];
      const text = typeof r.text === "function" ? r.text() : r.text;
      insertText(text);
    });
  }

  /* ---------- Listeners ---------- */
  const unsubThread = onSnapshot(threadRef, (snap) => {
    thread = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
    threadLoaded = true;
    updateComposerState();
    render();
    maybeMarkSeen();
  }, (err) => { console.error("thread listener", err); msgsEl.innerHTML = `<div class="chat-empty">Could not load this chat. Please check your connection.</div>`; });

  const unsubMsgs = onSnapshot(
    query(collection(threadRef, "messages"), orderBy("createdAt", "desc"), limit(MAX_MESSAGES)),
    (snap) => {
      messages = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }), pending: d.metadata.hasPendingWrites })).reverse();
      render();
      maybeMarkSeen();
    },
    (err) => console.error("messages listener", err)
  );

  /* ---------- Render ---------- */
  function render() {
    if (destroyed) return;
    if (!messages.length) {
      msgsEl.innerHTML = threadLoaded
        ? `<div class="chat-empty">${role === "admin" ? "No messages yet." : mode === "help" ? "Hi! Tell us how we can help. We usually reply within a few hours." : "Your order is created. Send us your delivery address and we will reply soon."}</div>`
        : `<div class="chat-empty">Loading messages…</div>`;
      return;
    }
    const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 140;
    const otherSeen = toMs(role === "user" ? thread?.adminLastSeen : thread?.userLastSeen);
    let html = "", lastDay = "";
    messages.forEach((m) => {
      const t = toMs(m.createdAt);
      const day = formatDay(t);
      if (day && day !== lastDay) { html += `<div class="day-sep"><span>${escapeHtml(day)}</span></div>`; lastDay = day; }
      html += bubble(m, t, otherSeen);
    });
    msgsEl.innerHTML = html;
    if (!renderedOnce || nearBottom) { msgsEl.scrollTop = msgsEl.scrollHeight; jumpBtn.hidden = true; }
    else jumpBtn.hidden = false;
    renderedOnce = true;
  }

  function bubble(m, t, otherSeen) {
    if (m.sender === "system" || m.type === "status") {
      return `<div class="sys-msg"><span>${escapeHtml(m.text || "")}</span></div>`;
    }
    const mine = m.sender === role;
    let body = "";
    if (m.type === "image" && m.imageData) {
      body = `<button type="button" class="msg-img" data-mid="${m.id}" aria-label="Open image"><img src="${escapeHtml(m.imageData)}" alt="Attached image" loading="lazy"></button>`;
    } else if (m.type === "order") {
      body = orderCard(m);
    } else if (m.type === "tracking" && m.tracking) {
      body = trackingCard(m);
    } else {
      body = `<div class="msg-text">${linkify(m.text || "")}</div>`;
    }
    const tick = mine
      ? (m.pending ? `<span class="tick" title="Sending">…</span>` : otherSeen >= t && t ? `<span class="tick tick--seen" title="Seen">✓✓</span>` : `<span class="tick" title="Sent">✓</span>`)
      : "";
    const author = !mine && role === "user" && m.sender === "admin" ? `<span class="bubble-author">NFC Trust team</span>` : "";
    const wide = m.type === "order" || m.type === "tracking" ? " bubble--card" : "";
    return `<div class="msg ${mine ? "msg--mine" : "msg--theirs"}">
      <div class="bubble${wide}">${author}${body}<span class="bubble-meta">${formatClock(t)} ${tick}</span></div>
    </div>`;
  }

  function orderCard(m) {
    const o = m.order || {};
    const items = (o.items || []).map((i) => `<li><span>${Number(i.qty)} × ${escapeHtml(i.name)}</span><b>${formatPrice(i.price * i.qty)}</b></li>`).join("");
    const plan = o.plan || {};
    const noPrice = !(Number(o.total) > 0);   // custom order: price admin बाद में chat में बताता है
    const planLine = noPrice
      ? "We will share the price in this chat. You pay after we confirm."
      : plan.type === "bulk"
        ? `Advance ${formatPrice(plan.advance)} now. Balance ${formatPrice(plan.balance)} before shipping.`
        : `Full payment of ${formatPrice(o.total)} before we start.`;
    const custom = o.custom && (o.custom.link || o.custom.brand || o.custom.notes)
      ? `<div class="order-custom"><b>Custom card${o.custom.kind === "wholesale" ? " (wholesale)" : o.custom.kind === "small" ? " (shop or personal)" : ""}</b>${o.custom.brand ? `<div>Card type: ${escapeHtml(o.custom.brand)}</div>` : ""}${o.custom.link ? `<div>Link: ${linkify(o.custom.link)}</div>` : ""}${o.custom.notes ? `<div>Notes: ${escapeHtml(o.custom.notes)}</div>` : ""}</div>`
      : "";
    return `<div class="order-card">
      <div class="order-card-head">${ICONS.box}<strong>${escapeHtml(m.text || "Order request")}</strong></div>
      <ul class="order-card-list">${items}</ul>
      <div class="order-card-total"><span>Total (${Number(o.totalQty) || 0} cards)</span><b>${noPrice ? "To be confirmed" : formatPrice(o.total)}</b></div>
      <p class="order-card-plan">${escapeHtml(planLine)}</p>${custom}
    </div>`;
  }

  function trackingCard(m) {
    const id = escapeHtml(m.tracking.id || "");
    return `<div class="track-card">
      <div class="order-card-head">${ICONS.truck}<strong>Shipped via ${escapeHtml(m.tracking.courier || "India Post")}</strong></div>
      <p class="track-label">Tracking ID</p>
      <div class="track-id"><code>${id}</code><button type="button" class="icon-btn" data-copy="${id}" aria-label="Copy tracking ID">${ICONS.copy}</button></div>
      <a class="btn btn-small btn-primary" href="${escapeHtml(SITE.indiaPostTrackUrl)}" target="_blank" rel="noopener noreferrer">Track on India Post</a>
    </div>`;
  }

  /* ---------- Clicks inside messages ---------- */
  msgsEl.addEventListener("click", async (e) => {
    const img = e.target.closest("[data-mid]");
    if (img) { const m = messages.find((x) => x.id === img.dataset.mid); if (m?.imageData) openImage(m.imageData); return; }
    const cp = e.target.closest("[data-copy]");
    if (cp) { const ok = await copyText(cp.dataset.copy); toast(ok ? "Tracking ID copied." : "Could not copy.", ok ? "success" : "error"); }
  });
  msgsEl.addEventListener("scroll", () => {
    if (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 80) jumpBtn.hidden = true;
  });
  jumpBtn.addEventListener("click", () => { msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: "smooth" }); jumpBtn.hidden = true; });

  /* ---------- Composer ---------- */
  function updateComposerState() {
    const blocked = role === "user" && typeof opts.isBlocked === "function" && opts.isBlocked();
    ta.disabled = blocked; sendBtn.disabled = blocked;
    $$all(form, ".compose-btn").forEach((b) => { b.disabled = blocked; });
    noticeEl.hidden = !blocked;
    if (blocked) noticeEl.textContent = "Your access to chat has been restricted. Contact us on Instagram.";
  }
  function $$all(root, sel) { return Array.from(root.querySelectorAll(sel)); }

  function autosize() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 130) + "px"; }
  ta.addEventListener("input", autosize);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !touchDevice) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    const ok = await sendMessage({ type: "text", text }, text);
    if (ok) { ta.value = ""; autosize(); }
    if (!touchDevice) ta.focus();
  });
  $('[data-act="attach"]', form).addEventListener("click", () => fileInput.click());
  $('[data-act="add"]', form)?.addEventListener("click", () => { if (typeof opts.onAddCard === "function") opts.onAddCard(); });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      await sendMessage({ type: "image", text: "", imageData: dataUrl }, "Photo");
    } catch (err) { toast(err.message || "Could not send this image.", "error"); }
  });

  function insertText(text) {
    ta.value = (ta.value ? ta.value + "\n" : "") + text;
    autosize(); ta.focus();
  }

  /* ---------- Send ---------- */
  async function sendMessage(payload, previewText) {
    if (!threadLoaded) { toast("Connecting. Please try again in a moment.", "info"); return false; }
    if (role === "user" && typeof opts.isBlocked === "function" && opts.isBlocked()) { toast("Your access to chat has been restricted.", "error"); return false; }
    const now = Date.now();
    if (now - lastSend < 900) { toast("Please slow down a little.", "info"); return false; }
    lastSend = now;

    const preview = String(previewText || "").replace(/\s+/g, " ").slice(0, 80);
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(threadRef, "messages")), { sender: role, createdAt: serverTimestamp(), ...payload });

      if (role === "admin") {
        batch.update(threadRef, { lastMessage: preview, updatedAt: serverTimestamp(), unreadUser: increment(1), unreadAdmin: 0, adminLastSeen: serverTimestamp() });
      } else if (thread) {
        batch.update(threadRef, { lastMessage: preview, updatedAt: serverTimestamp(), unreadAdmin: increment(1), userLastSeen: serverTimestamp() });
      } else if (mode === "help") {
        const me = opts.me || {};
        batch.set(threadRef, {
          uid: me.uid, userName: me.name || "Customer", userPhoto: me.photoURL || "", email: me.email || "", emailMasked: me.emailMasked || "",
          status: "open", lastMessage: preview, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          unreadAdmin: 1, unreadUser: 0, userLastSeen: serverTimestamp()
        });
      }
      await batch.commit();
      return true;
    } catch (err) {
      console.error("send message", err);
      toast(err && err.code === "permission-denied" ? "You can't send messages right now." : "Message not sent. Please try again.", "error");
      return false;
    }
  }

  /* ---------- Seen / unread ---------- */
  function maybeMarkSeen() {
    if (destroyed || !thread || !threadLoaded || document.visibilityState !== "visible" || seenLock) return;
    if (role === "user" && typeof opts.isBlocked === "function" && opts.isBlocked()) return;
    const unreadKey = role === "user" ? "unreadUser" : "unreadAdmin";
    const seenKey = role === "user" ? "userLastSeen" : "adminLastSeen";
    let lastOther = 0;
    for (const m of messages) { if (m.sender !== role && m.sender !== "system") lastOther = Math.max(lastOther, toMs(m.createdAt)); }
    const mySeen = toMs(thread[seenKey]);
    if (!(Number(thread[unreadKey]) > 0 || (lastOther && lastOther > mySeen))) return;
    seenLock = true;
    updateDoc(threadRef, { [unreadKey]: 0, [seenKey]: serverTimestamp() })
      .catch(() => { /* ignore */ })
      .finally(() => setTimeout(() => { seenLock = false; }, 1500));
  }
  const onVisible = () => maybeMarkSeen();
  document.addEventListener("visibilitychange", onVisible);

  return {
    insertText,
    getThread: () => thread,
    focus: () => ta.focus(),
    destroy() {
      destroyed = true;
      unsubThread(); unsubMsgs();
      document.removeEventListener("visibilitychange", onVisible);
      container.innerHTML = "";
    }
  };
}

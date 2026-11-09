/* ==========================================================================
   NFC Trust - inbox.js
   User का "Messages" panel: My Orders list, Help chat और हर order की chat।
   - Desktop पर दाईं तरफ़ से panel खुलता है, mobile पर पूरी screen में।
   - Mobile पर keyboard खुलने पर chat अपने आप screen में fit हो जाती है (visualViewport)।
   ========================================================================== */
import { db, doc } from "./firebase.js";
import { SITE } from "./config.js";
import { $, $$, escapeHtml, formatPrice, timeAgo, toMs, copyText } from "./utils.js";
import { toast, lockScroll, unlockScroll, ICONS } from "./ui.js";
import { createChat } from "./chat.js";
import { getUser, getProfile, isBlocked, requireLogin } from "./auth.js";
import { onOrdersChange, getOrders, getHelpThread } from "./unread.js";
import { editExistingOrder } from "./order.js";

let drawer = null, panel = null;
let isOpen = false;
let currentTab = "orders";
let chat = null;                // चल रही chat का controller
let openThreadRef = null;       // { kind: 'order'|'help', id }
let unsubOrders = null;
let vvHandler = null;

function ensureDrawer() {
  if (drawer) return;
  drawer = document.createElement("div");
  drawer.className = "drawer";
  drawer.id = "drawer";
  drawer.hidden = true;
  drawer.innerHTML = `
    <div class="drawer-backdrop" data-act="close"></div>
    <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="Messages">
      <header class="drawer-head">
        <button type="button" class="icon-btn drawer-back" data-act="back" aria-label="Back to list" hidden>${ICONS.back}</button>
        <div class="drawer-title"><h2 id="drawer-title">Messages</h2><p class="drawer-sub" id="drawer-sub"></p></div>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close messages">${ICONS.close}</button>
      </header>
      <div class="drawer-tabs" role="tablist">
        <button type="button" role="tab" data-tab="orders">My orders <i class="count-dot" data-unread-orders></i></button>
        <button type="button" role="tab" data-tab="help">Help <i class="count-dot" data-unread-help></i></button>
      </div>
      <div class="drawer-body">
        <div class="drawer-list" id="drawer-list"></div>
        <div class="drawer-chat" id="drawer-chat" hidden>
          <div class="chat-summary" id="chat-summary"></div>
          <div class="chat-host" id="chat-host"></div>
        </div>
      </div>
    </aside>`;
  document.body.appendChild(drawer);
  panel = $(".drawer-panel", drawer);

  drawer.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a) {
      if (a.dataset.act === "close") closeInbox();
      if (a.dataset.act === "back") showList();
      return;
    }
    const tab = e.target.closest("[data-tab]");
    if (tab) switchTab(tab.dataset.tab);
    const row = e.target.closest("[data-thread]");
    if (row) openThread(row.dataset.kind, row.dataset.thread);
    const shop = e.target.closest("[data-go-shop]");
    if (shop) { closeInbox(); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }
    const cp = e.target.closest("[data-copy-track]");
    if (cp) copyText(cp.dataset.copyTrack).then((ok) => toast(ok ? "Tracking ID copied." : "Could not copy.", ok ? "success" : "error"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen && !$("#modal-root .modal-overlay")) closeInbox();
  });
}

/* ---------- Open / close ---------- */
export async function openInbox({ tab = "orders", orderId = null } = {}) {
  const u = await requireLogin("Please login to see your messages.", { type: "inbox", tab, orderId });
  if (!u) return;
  ensureDrawer();
  if (!isOpen) {
    isOpen = true;
    drawer.hidden = false;
    lockScroll();
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    unsubOrders = onOrdersChange(() => refresh());
    attachViewport();
  }
  if (orderId) { currentTab = "orders"; setTabUi(); openThread("order", orderId); }
  else if (tab === "help") { currentTab = "help"; setTabUi(); openThread("help", u.uid); }
  else { switchTab(tab); }
}

export function closeInbox() {
  if (!isOpen) return;
  isOpen = false;
  destroyChat();
  drawer.classList.remove("is-open");
  unlockScroll();
  if (unsubOrders) { unsubOrders(); unsubOrders = null; }
  detachViewport();
  setTimeout(() => { if (!isOpen) drawer.hidden = true; }, 280);
}
export const isInboxOpen = () => isOpen;

function destroyChat() {
  if (chat) { chat.destroy(); chat = null; }
  openThreadRef = null;
}

/* ---------- Tabs / list ---------- */
function setTabUi() {
  $$("[data-tab]", drawer).forEach((t) => { t.classList.toggle("is-active", t.dataset.tab === currentTab); t.setAttribute("aria-selected", String(t.dataset.tab === currentTab)); });
}
function switchTab(tab) {
  currentTab = tab === "help" ? "help" : "orders";
  setTabUi();
  if (currentTab === "help") { const u = getUser(); if (u) openThread("help", u.uid); }
  else showList();
}
function showList() {
  destroyChat();
  $("#drawer-chat", drawer).hidden = true;
  $("#drawer-list", drawer).hidden = false;
  $(".drawer-back", drawer).hidden = true;
  $("#drawer-title", drawer).textContent = "Messages";
  $("#drawer-sub", drawer).textContent = "";
  $(".drawer-tabs", drawer).hidden = false;
  if (currentTab === "help") { const u = getUser(); if (u) openThread("help", u.uid); return; }
  renderList();
}
function refresh() {
  if (!isOpen) return;
  if (openThreadRef && openThreadRef.kind === "order") renderSummary();
  else if (!openThreadRef) renderList();
}

// Custom order में price अभी तय नहीं होता, तब "TBC" (to be confirmed) दिखाते हैं
const priceText = (n) => (Number(n) > 0 ? formatPrice(n) : "TBC");

function statusChip(status) { return `<span class="chip chip--status" data-status="${escapeHtml(status)}">${escapeHtml(status)}</span>`; }

function renderList() {
  const list = $("#drawer-list", drawer);
  const orders = getOrders();
  if (!orders.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${ICONS.box}</div>
      <h3>No orders yet</h3>
      <p>Pick a card you like and tap Buy now. Your order chat will appear here.</p>
      <button type="button" class="btn btn-primary" data-go-shop>Shop cards</button></div>`;
    return;
  }
  list.innerHTML = orders.map((o) => {
    const unread = Number(o.unreadUser) > 0;
    const summary = (o.items || []).map((i) => `${i.qty} × ${i.name}`).join(", ");
    return `<button type="button" class="thread-row" data-kind="order" data-thread="${escapeHtml(o.id)}">
      <div class="thread-main">
        <div class="thread-top"><strong>Order ${escapeHtml(o.shortId || o.id)}</strong>${statusChip(o.status || "Requested")}</div>
        <p class="thread-sum">${escapeHtml(summary)}</p>
        <p class="thread-last">${escapeHtml(o.lastMessage || "")}</p>
      </div>
      <div class="thread-side"><span>${timeAgo(toMs(o.updatedAt))}</span><b>${priceText(o.total)}</b>${unread ? `<i class="dot-badge" aria-label="Unread message"></i>` : ""}</div>
    </button>`;
  }).join("");
}

/* ---------- Thread (chat view) ---------- */
function openThread(kind, id) {
  const u = getUser();
  if (!u) return;
  destroyChat();
  openThreadRef = { kind, id };
  $("#drawer-list", drawer).hidden = true;
  $("#drawer-chat", drawer).hidden = false;
  $(".drawer-back", drawer).hidden = kind === "help";   // Help में back की ज़रूरत नहीं, tab बदल सकते हैं
  $(".drawer-tabs", drawer).hidden = false;

  const host = $("#chat-host", drawer);
  const prof = getProfile() || {};
  const me = { uid: u.uid, name: prof.name || u.displayName || "Customer", photoURL: prof.photoURL || u.photoURL || "", email: u.email || "", emailMasked: prof.emailMasked || "" };

  if (kind === "order") {
    $("#drawer-title", drawer).textContent = "Order " + id;
    chat = createChat({
      container: host, threadRef: doc(db, "orders", id), mode: "order", role: "user", me,
      isBlocked, onAddCard: () => editExistingOrder(getOrders().find((o) => o.id === id))
    });
    renderSummary();
  } else {
    $("#drawer-title", drawer).textContent = "Help desk";
    $("#drawer-sub", drawer).textContent = "We usually reply within a few hours.";
    $("#chat-summary", drawer).innerHTML = `<div class="help-strip">${ICONS.help}<span>Ask us anything about cards, payment or delivery.</span></div>`;
    chat = createChat({ container: host, threadRef: doc(db, "helpThreads", u.uid), mode: "help", role: "user", me, isBlocked });
  }
}

/* Order के ऊपर की summary strip: items, status, payment, India Post tracking ID */
function renderSummary() {
  if (!openThreadRef || openThreadRef.kind !== "order") return;
  const o = getOrders().find((x) => x.id === openThreadRef.id);
  const box = $("#chat-summary", drawer);
  if (!o) { box.innerHTML = ""; return; }
  $("#drawer-sub", drawer).innerHTML = statusChip(o.status || "Requested");
  const paid = (o.payments || []).reduce((n, p) => n + Number(p.amount || 0), 0);
  const plan = o.paymentPlan || {};
  const items = (o.items || []).map((i) => `${i.qty} × ${escapeHtml(i.name)}`).join(", ");
  box.innerHTML = `
    <div class="sum-row"><span class="sum-items">${items}</span><b>${priceText(o.total)}</b></div>
    <div class="sum-row sum-row--sub">
      <span>${!(Number(o.total) > 0) ? "Price will be shared in this chat" : plan.type === "bulk" ? `Advance ${formatPrice(plan.advance)} + balance ${formatPrice(plan.balance)}` : "Full payment before we start"}</span>
      <span>Paid ${formatPrice(paid)}</span>
    </div>
    ${o.trackingId ? `<div class="sum-track">${ICONS.truck}<span>${escapeHtml(o.courier || "India Post")} tracking ID: <code>${escapeHtml(o.trackingId)}</code></span>
      <button type="button" class="icon-btn" data-copy-track="${escapeHtml(o.trackingId)}" aria-label="Copy tracking ID">${ICONS.copy}</button>
      <a class="btn btn-small btn-ghost" href="${escapeHtml(SITE.indiaPostTrackUrl)}" target="_blank" rel="noopener noreferrer">Track</a></div>` : ""}`;
}

/* ---------- Mobile keyboard fit ---------- */
function attachViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  vvHandler = () => {
    if (window.innerWidth > 700) { panel.style.height = ""; panel.style.transform = ""; return; }
    panel.style.height = vv.height + "px";
    panel.style.transform = `translateY(${vv.offsetTop}px)`;
    const msgs = $(".chat-msgs", drawer);
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  };
  vv.addEventListener("resize", vvHandler);
  vv.addEventListener("scroll", vvHandler);
  vvHandler();
}
function detachViewport() {
  const vv = window.visualViewport;
  if (vv && vvHandler) { vv.removeEventListener("resize", vvHandler); vv.removeEventListener("scroll", vvHandler); }
  vvHandler = null;
  if (panel) { panel.style.height = ""; panel.style.transform = ""; }
}

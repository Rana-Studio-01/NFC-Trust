/* ==========================================================================
   NFC Trust - admin.js  (Police-style Command Center)
   यह file तभी लोड होती है जब owner सही password डालता है (normal users के लिए नहीं).
   असली सुरक्षा Firestore Rules में है; यहाँ का login सिर्फ़ admin account खोलता है।

   Tabs: Dashboard, Orders (case files), Help desk, Users, Products, Reviews, Settings
   ========================================================================== */
import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, increment, writeBatch, arrayUnion
} from "./firebase.js";
import { SITE, STATUS_FULL, STATUS_BULK } from "./config.js";
import {
  $, $$, escapeHtml, formatPrice, formatDateTime, timeAgo, toMs, initials, isValidHttpUrl, debounce, paymentPlan
} from "./utils.js";
import { toast, openModal, confirmDialog, setLoading, ICONS } from "./ui.js";
import { adminSignOut } from "./auth.js";
import { createChat } from "./chat.js";
import { loadProducts, getProducts, offerPercent, clearProductsCache } from "./products.js";
import { reviewCard } from "./reviews.js";

const S = {
  view: "orders",
  orders: [], helps: [], users: [], products: [], reviews: [],
  selectedOrder: null, selectedHelp: null,
  orderFilter: "all", orderSearch: "", helpSearch: "", userSearch: "",
  settings: { banner: "", shopOpen: true, upiId: "" },
  revealed: new Set(),
  chat: null, unsubs: [], lastUnread: 0, mobileTab: "case"
};
let root = null;

/* ---------- Mount / unmount ---------- */
export function mountAdmin() {
  if (root) return;
  root = document.createElement("div");
  root.id = "admin-root";
  root.className = "admin";
  root.innerHTML = `
    <div class="siren" aria-hidden="true"></div>
    <header class="a-head">
      <div class="a-brand">
        <svg viewBox="0 0 48 56" width="30" height="34" aria-hidden="true"><path d="M24 2l19 7v16c0 14-8 24-19 29C13 49 5 39 5 25V9z" fill="#FFC400"/><path d="M24 8l13 5v12c0 10-5 17-13 22-8-5-13-12-13-22V13z" fill="#0a0f1e"/><path d="M24 17l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#FFC400"/></svg>
        <div><strong>NFC Trust Command Center</strong><span>Restricted area. Authorized officer only.</span></div>
      </div>
      <div class="a-head-right">
        <span class="a-clock" id="a-clock"></span>
        <span class="a-alert" id="a-alert" hidden><i></i><b id="a-alert-n">0</b> unread</span>
        <button type="button" class="btn btn-small btn-ghost" id="a-exit">Exit</button>
      </div>
    </header>
    <div class="a-body">
      <nav class="a-nav" aria-label="Admin sections"></nav>
      <main class="a-main" id="a-main"></main>
    </div>`;
  document.body.appendChild(root);
  document.documentElement.classList.add("no-scroll");

  buildNav();
  $("#a-exit", root).addEventListener("click", unmountAdmin);
  tickClock(); S.clockTimer = setInterval(tickClock, 30000);
  document.addEventListener("keydown", escExit);

  startWatchers();
  loadSettings();
  go("orders");
}

function escExit() { /* Esc से panel बंद नहीं होता, गलती से बंद होने से बचाने के लिए */ }

async function unmountAdmin() {
  const ok = await confirmDialog({ title: "Leave command center?", message: "You will be logged out of the admin panel.", confirmText: "Exit", cancelText: "Stay" });
  if (!ok) return;
  destroyChat();
  S.unsubs.forEach((u) => u()); S.unsubs = [];
  clearInterval(S.clockTimer);
  document.removeEventListener("keydown", escExit);
  root.remove(); root = null;
  document.documentElement.classList.remove("no-scroll");
  await adminSignOut();
  toast("Admin session closed.", "success");
}

function tickClock() {
  const el = $("#a-clock", root);
  if (el) el.textContent = new Date().toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

/* ---------- Navigation ---------- */
const NAV = [
  { id: "orders", label: "Orders", icon: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8" },
  { id: "help", label: "Help desk", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.3M12 17.2v.1" },
  { id: "users", label: "Users", icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" },
  { id: "products", label: "Products", icon: "M20 7L12 3 4 7v10l8 4 8-4zM4 7l8 4 8-4M12 11v10" },
  { id: "reviews", label: "Reviews", icon: "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" },
  { id: "settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" }
];
function buildNav() {
  $(".a-nav", root).innerHTML = NAV.map((n) => `
    <button type="button" class="a-nav-btn" data-view="${n.id}">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${n.icon}"/></svg>
      <span>${n.label}</span><i class="a-dot" data-dot="${n.id}"></i>
    </button>`).join("");
  $(".a-nav", root).addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]"); if (b) go(b.dataset.view);
  });
}
function go(view) {
  S.view = view;
  $$(".a-nav-btn", root).forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  if (view !== "orders" && view !== "help") destroyChat();
  render();
}
function render() {
  const main = $("#a-main", root);
  if (!main) return;
  main.onclick = null;
  const fn = { orders: viewOrders, help: viewHelp, users: viewUsers, products: viewProducts, reviews: viewReviews, settings: viewSettings }[S.view];
  fn(main);
}
function destroyChat() { if (S.chat) { S.chat.destroy(); S.chat = null; } }

/* ---------- Live watchers: orders + help threads ---------- */
function startWatchers() {
  S.unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("updatedAt", "desc"), limit(150)), (snap) => {
    S.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    afterLiveUpdate("orders");
  }, (e) => { console.error(e); toast("Could not load orders. Check your Firestore rules and admin UID.", "error", 6000); }));
  S.unsubs.push(onSnapshot(query(collection(db, "helpThreads"), orderBy("updatedAt", "desc"), limit(150)), (snap) => {
    S.helps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    afterLiveUpdate("help");
  }, (e) => console.error(e)));
}
function unreadCounts() {
  return {
    orders: S.orders.filter((o) => Number(o.unreadAdmin) > 0).length,
    help: S.helps.filter((h) => Number(h.unreadAdmin) > 0).length
  };
}
function afterLiveUpdate(which) {
  const c = unreadCounts(), total = c.orders + c.help;
  $('[data-dot="orders"]', root)?.classList.toggle("is-on", c.orders > 0);
  $('[data-dot="help"]', root)?.classList.toggle("is-on", c.help > 0);
  const al = $("#a-alert", root);
  if (al) { al.hidden = total === 0; $("#a-alert-n", root).textContent = total; }
  if (total > S.lastUnread) beep();
  S.lastUnread = total;
  // list वाले views को refresh करो (chat खुली हो तो उसे छुए बिना)
  if (S.view === "orders") { refreshOrderList(); refreshOrderDetail(); }
  if (S.view === "help") { refreshHelpList(); }
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 160);
  } catch (e) { /* sound allowed नहीं तो ignore */ }
}

/* ---------- Loaders ---------- */
async function loadSettings() {
  try { const s = await getDoc(doc(db, "settings", "site")); if (s.exists()) S.settings = { ...S.settings, ...s.data() }; } catch (e) { console.error(e); }
}
/* ---------- Helpers ---------- */
// Custom order में price तय होने तक "TBC" दिखता है
const money = (n) => (Number(n) > 0 ? formatPrice(n) : "TBC");
const statusChip = (s) => `<span class="chip chip--status" data-status="${escapeHtml(s)}">${escapeHtml(s)}</span>`;
const flowFor = (o) => (o.paymentPlan && o.paymentPlan.type === "bulk" ? STATUS_BULK : STATUS_FULL);
const paidSum = (o) => (o.payments || []).reduce((n, p) => n + Number(p.amount || 0), 0);
function avatarHtml(name, photo) {
  return photo ? `<img class="avatar" src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
    : `<span class="avatar avatar--text">${escapeHtml(initials(name))}</span>`;
}
const emailShown = (id, masked, full) => (S.revealed.has(id) ? escapeHtml(full || masked) : escapeHtml(masked || "***"));

/* ==========================================================================
   ORDERS (Case files)
   ========================================================================== */
const FILTERS = [["all", "All"], ["new", "New"], ["progress", "In progress"], ["shipped", "Shipped"], ["done", "Done"], ["unread", "Unread"]];
function matchesFilter(o) {
  const f = S.orderFilter;
  if (f === "new") return o.status === "Requested" || o.status === "Address Confirmed";
  if (f === "progress") return ["Payment Pending", "Advance Paid", "Programming", "Balance Pending", "Paid"].includes(o.status);
  if (f === "shipped") return o.status === "Shipped";
  if (f === "done") return o.status === "Delivered" || o.status === "Cancelled";
  if (f === "unread") return Number(o.unreadAdmin) > 0;
  return true;
}
function viewOrders(main) {
  main.innerHTML = `
    <div class="a-split ${S.selectedOrder ? "has-detail" : ""}">
      <section class="a-list-col">
        <div class="a-title"><h2>Orders</h2><p>Every order is a case file</p></div>
        <input type="search" class="a-search" id="o-search" placeholder="Search by case number or customer" value="${escapeHtml(S.orderSearch)}" aria-label="Search orders">
        <div class="a-filters">${FILTERS.map(([id, l]) => `<button type="button" class="chip chip--btn ${S.orderFilter === id ? "is-active" : ""}" data-f="${id}">${l}</button>`).join("")}</div>
        <div class="a-list" id="o-list"></div>
      </section>
      <section class="a-detail-col" id="o-detail"></section>
    </div>`;
  $("#o-search", main).addEventListener("input", debounce((e) => { S.orderSearch = e.target.value.trim().toLowerCase(); refreshOrderList(); }, 150));
  $$("[data-f]", main).forEach((b) => b.addEventListener("click", () => { S.orderFilter = b.dataset.f; $$("[data-f]", main).forEach((x) => x.classList.toggle("is-active", x === b)); refreshOrderList(); }));
  refreshOrderList();
  S.detailKey = null;
  refreshOrderDetail(true);
}
function refreshOrderList() {
  const list = $("#o-list", root); if (!list) return;
  const q = S.orderSearch;
  const rows = S.orders.filter(matchesFilter).filter((o) => !q || (o.shortId || "").toLowerCase().includes(q) || (o.userName || "").toLowerCase().includes(q));
  list.innerHTML = rows.length ? rows.map((o) => `
    <button type="button" class="a-row ${S.selectedOrder === o.id ? "is-selected" : ""}" data-order="${escapeHtml(o.id)}">
      ${avatarHtml(o.userName, o.userPhoto)}
      <div class="a-row-main"><div class="a-row-top"><b>${escapeHtml(o.shortId || o.id)}</b>${statusChip(o.status)}</div>
        <span>${escapeHtml(o.userName || "")} · ${money(o.total)}</span><em>${escapeHtml(o.lastMessage || "")}</em></div>
      <div class="a-row-side"><span>${timeAgo(toMs(o.updatedAt))}</span>${Number(o.unreadAdmin) > 0 ? `<i class="a-dot is-on"></i>` : ""}</div>
    </button>`).join("") : `<p class="a-empty">No orders match this view.</p>`;
  $$("[data-order]", list).forEach((b) => b.addEventListener("click", () => { S.selectedOrder = b.dataset.order; S.mobileTab = "case"; $(".a-split", root).classList.add("has-detail"); refreshOrderList(); refreshOrderDetail(true); }));
}
function refreshOrderDetail(force = false) {
  const box = $("#o-detail", root); if (!box) return;
  const o = S.orders.find((x) => x.id === S.selectedOrder);
  if (!o) { destroyChat(); box.innerHTML = `<div class="a-placeholder">${ICONS.box}<p>Select an order to open its case file.</p></div>`; S.detailKey = null; return; }
  // chat को बार-बार तोड़ने से बचने के लिए: जब सिर्फ़ order data बदले तो सिर्फ़ left panel redraw
  if (force || S.detailKey !== o.id) {
    destroyChat();
    box.innerHTML = `
      <div class="a-detail">
        <div class="a-detail-bar"><button type="button" class="icon-btn a-back" aria-label="Back to orders">${ICONS.back}</button><b>Case ${escapeHtml(o.shortId || o.id)}</b></div>
        <div class="a-tabs"><button type="button" class="is-active" data-t="case">Case file</button><button type="button" data-t="chat">Chat</button></div>
        <div class="a-detail-grid" data-show="case">
          <div class="a-case" id="o-case"></div>
          <div class="a-chat" id="o-chat"></div>
        </div>
      </div>`;
    $(".a-back", box).addEventListener("click", () => { S.selectedOrder = null; $(".a-split", root).classList.remove("has-detail"); refreshOrderList(); refreshOrderDetail(true); });
    $$(".a-tabs button", box).forEach((b) => b.addEventListener("click", () => {
      $$(".a-tabs button", box).forEach((x) => x.classList.toggle("is-active", x === b));
      $(".a-detail-grid", box).dataset.show = b.dataset.t;
    }));
    S.chat = createChat({
      container: $("#o-chat", box), threadRef: doc(db, "orders", o.id), mode: "order", role: "admin",
      quickReplies: quickRepliesFor(o.id)
    });
    S.detailKey = o.id;
  }
  drawCase(o);
}

function quickRepliesFor(id) {
  const get = () => S.orders.find((x) => x.id === id);
  return [
    { label: "Ask address", text: "Please share your full delivery address with pincode and a phone number." },
    { label: "Payment details", text: () => paymentText(get()) },
    { label: "Payment received", text: "Payment received. Thank you! We are starting your order now." },
    { label: "Ask for link", text: "Please send the link you want programmed on your card." },
    { label: "Programming", text: "Your card is being programmed and tested." },
    { label: "Delivery note", text: "We ship with India Post. We will share the tracking ID here as soon as it is dispatched." }
  ];
}
function paymentText(o) {
  if (!o) return "";
  const upi = S.settings.upiId || "YOUR-UPI-ID";
  const plan = o.paymentPlan || {};
  const due = plan.type === "bulk" ? (paidSum(o) === 0 ? plan.advance : plan.balance) : plan.advance;
  const label = plan.type === "bulk" ? (paidSum(o) === 0 ? "advance (50%)" : "remaining balance") : "full payment";
  return `Please pay ${formatPrice(due)} as ${label} to UPI ID: ${upi}\nAfter paying, send the screenshot and the UTR number here. We verify every payment before we continue.`;
}

/* ---- Case file (left panel) ---- */
function drawCase(o) {
  const el = $("#o-case", root); if (!el) return;
  const flow = flowFor(o);
  const plan = o.paymentPlan || {};
  const paid = paidSum(o);
  const idx = flow.indexOf(o.status);
  const custom = o.custom && (o.custom.link || o.custom.brand || o.custom.notes);
  el.innerHTML = `
    <div class="a-card a-card--id">
      <div class="a-cust">${avatarHtml(o.userName, o.userPhoto)}
        <div><strong>${escapeHtml(o.userName || "Customer")}</strong>
          <span>${emailShown(o.id, o.emailMasked, o.email)}</span></div>
        <button type="button" class="btn btn-small btn-ghost" data-act="reveal">${S.revealed.has(o.id) ? "Hide email" : "Reveal email"}</button>
      </div>
      <div class="a-meta"><span>Opened ${formatDateTime(toMs(o.createdAt))}</span>${statusChip(o.status)}</div>
    </div>

    <div class="a-card"><h4>Status</h4>
      <ol class="stepper-line">${flow.map((s, i) => `<li class="${i < idx ? "done" : i === idx ? "now" : ""}"><span></span>${escapeHtml(s)}</li>`).join("")}</ol>
      ${o.status === "Cancelled" ? `<p class="a-warn">This order was cancelled.</p>` : ""}
      <div class="a-actions">
        <button type="button" class="btn btn-small btn-primary" data-act="next" ${["Delivered", "Cancelled"].includes(o.status) ? "disabled" : ""}>Move to next step</button>
        <button type="button" class="btn btn-small btn-ghost" data-act="payment" ${["Delivered", "Cancelled"].includes(o.status) ? "disabled" : ""}>Record payment</button>
        <button type="button" class="btn btn-small btn-ghost" data-act="settotal" ${["Delivered", "Cancelled"].includes(o.status) ? "disabled" : ""}>Set total price</button>
        <button type="button" class="btn btn-small btn-ghost" data-act="tracking">${o.trackingId ? "Edit tracking ID" : "Add tracking ID"}</button>
        <button type="button" class="btn btn-small btn-danger" data-act="cancel" ${["Delivered", "Cancelled"].includes(o.status) ? "disabled" : ""}>Cancel order</button>
      </div>
    </div>

    <div class="a-card"><h4>Items</h4>
      <ul class="a-items">${(o.items || []).map((i) => `<li><span>${Number(i.qty)} × ${escapeHtml(i.name)}</span><b>${formatPrice(i.price * i.qty)}</b></li>`).join("")}</ul>
      <div class="a-total"><span>Total (${Number(o.totalQty) || 0} cards)</span><b>${money(o.total)}</b></div>
      ${custom ? `<div class="a-custom"><b>Custom card${o.custom.kind === "wholesale" ? " (wholesale)" : o.custom.kind === "small" ? " (shop or personal)" : ""}</b>
        ${o.custom.link ? `<div>Link: <a href="${isValidHttpUrl(o.custom.link) ? escapeHtml(o.custom.link) : "#"}" target="_blank" rel="noopener noreferrer">${escapeHtml(o.custom.link)}</a></div>` : ""}
        ${o.custom.brand ? `<div>Card type: ${escapeHtml(o.custom.brand)}</div>` : ""}${o.custom.notes ? `<div>Notes: ${escapeHtml(o.custom.notes)}</div>` : ""}</div>` : ""}
    </div>

    <div class="a-card"><h4>Payment</h4>
      <p class="a-plan">${plan.type === "bulk" ? `Bulk order: advance ${formatPrice(plan.advance)} + balance ${formatPrice(plan.balance)} before shipping` : `Full payment ${formatPrice(plan.advance)} before starting`}</p>
      <div class="a-total"><span>Verified so far</span><b>${formatPrice(paid)}</b></div>
      <ul class="a-ledger">${(o.payments || []).map((p) => `<li><span>${escapeHtml(p.label || "Payment")}</span><code>UTR ${escapeHtml(p.utr)}</code><b>${formatPrice(p.amount)}</b></li>`).join("") || `<li class="a-empty">No payment recorded yet.</li>`}</ul>
    </div>

    ${o.trackingId ? `<div class="a-card"><h4>Shipping</h4><p>${escapeHtml(o.courier || "India Post")} tracking ID: <code>${escapeHtml(o.trackingId)}</code></p></div>` : ""}

    <div class="a-card"><h4>Private notes</h4>
      <textarea class="a-notes" rows="3" maxlength="500" placeholder="Only you can see these notes">${escapeHtml(o.notes || "")}</textarea>
      <button type="button" class="btn btn-small btn-ghost" data-act="notes">Save notes</button>
    </div>

    <div class="a-card"><h4>Customer access</h4>
      <button type="button" class="btn btn-small btn-danger" data-act="block">Block this user</button>
    </div>`;
  el.onclick = (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "reveal") { S.revealed.has(o.id) ? S.revealed.delete(o.id) : S.revealed.add(o.id); drawCase(o); }
    if (act === "next") nextStep(o);
    if (act === "payment") recordPayment(o);
    if (act === "settotal") setTotal(o);
    if (act === "tracking") editTracking(o);
    if (act === "cancel") cancelOrder(o);
    if (act === "notes") saveNotes(o, $(".a-notes", el).value, b);
    if (act === "block") blockUser(o.uid, o.userName);
  };
}

/* ---- Order actions ---- */
async function postSystem(orderId, text, extra = {}) {
  return { ref: doc(collection(doc(db, "orders", orderId), "messages")), data: { sender: "system", type: "status", text, createdAt: serverTimestamp(), ...extra } };
}
async function setStatus(o, status, systemText, extraFields = {}, extraMsg = null) {
  const batch = writeBatch(db);
  const oref = doc(db, "orders", o.id);
  batch.update(oref, { status, updatedAt: serverTimestamp(), lastMessage: systemText, unreadUser: increment(1), ...extraFields });
  const m = await postSystem(o.id, systemText); batch.set(m.ref, m.data);
  if (extraMsg) batch.set(doc(collection(oref, "messages")), { sender: "admin", createdAt: serverTimestamp(), ...extraMsg });
  await batch.commit();
}

function nextStep(o) {
  const flow = flowFor(o);
  const idx = flow.indexOf(o.status);
  const next = flow[idx + 1];
  if (!next) return;
  // Payment वाले steps सिर्फ़ UTR के साथ होते हैं
  if (next === "Advance Paid" || next === "Paid") { recordPayment(o); return; }
  if (next === "Shipped") { editTracking(o, true); return; }
  runBusy(async () => {
    await setStatus(o, next, `Order status updated: ${next}`);
    toast(`Moved to ${next}.`, "success");
  });
}

function recordPayment(o) {
  if (!(Number(o.total) > 0)) { toast("Set the total price first.", "info"); return; }
  const plan = o.paymentPlan || {}, paid = paidSum(o);
  const isBulk = plan.type === "bulk";
  const suggestion = isBulk ? (paid === 0 ? plan.advance : Math.max(0, plan.balance)) : Math.max(0, (o.total || 0) - paid);
  const label = isBulk ? (paid === 0 ? "Advance (50%)" : "Balance") : "Full payment";
  const m = openModal({
    title: "Record payment", size: "sm", className: "modal--admin",
    content: `<form class="a-form" novalidate>
      <p class="muted">Check your bank or UPI app first. Record a payment only after the money is in your account.</p>
      <label class="field"><span>Amount received (₹)</span><input type="number" inputmode="numeric" min="1" value="${suggestion}" required></label>
      <label class="field"><span>UTR / reference number</span><input type="text" maxlength="30" placeholder="e.g. 412345678901" autocomplete="off" required></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-x>Cancel</button><button type="submit" class="btn btn-primary">Mark payment received</button></div></form>`
  });
  const form = $("form", m.body), err = $(".form-error", form);
  $("[data-x]", form).addEventListener("click", m.close);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = Number($("input[type=number]", form).value);
    const utr = $("input[type=text]", form).value.trim().toUpperCase();
    err.hidden = true;
    if (!(amount > 0)) { err.textContent = "Enter the amount you received."; err.hidden = false; return; }
    if (!/^[A-Z0-9]{8,30}$/.test(utr)) { err.textContent = "Enter a valid UTR (8 to 30 letters or numbers)."; err.hidden = false; return; }
    const btn = $("button[type=submit]", form); setLoading(btn, true, "Checking");
    try {
      const dup = await getDocs(query(collection(db, "orders"), where("utrs", "array-contains", utr), limit(1)));
      if (!dup.empty) { err.textContent = `This UTR is already used on case ${dup.docs[0].data().shortId}. Please check.`; err.hidden = false; setLoading(btn, false); return; }
      const newPaid = paid + amount;
      let status = o.status, text;
      if (isBulk) {
        if (newPaid >= o.total) { status = "Paid"; text = `Payment received: ${formatPrice(amount)}. Your order is fully paid. Thank you!`; }
        else { status = paid === 0 ? "Advance Paid" : o.status; text = `Advance payment received: ${formatPrice(amount)}. We are starting your order.`; }
      } else {
        status = newPaid >= o.total ? "Paid" : o.status;
        text = newPaid >= o.total ? `Payment received: ${formatPrice(amount)}. Thank you! We are starting your order.` : `Part payment received: ${formatPrice(amount)}.`;
      }
      const entry = { label, amount, utr, at: Date.now() };
      await setStatus(o, status, text, { payments: [...(o.payments || []), entry], utrs: arrayUnion(utr) });
      toast("Payment recorded.", "success"); m.close();
    } catch (e2) { console.error(e2); err.textContent = "Something went wrong. Please try again."; err.hidden = false; }
    setLoading(btn, false);
  });
}

/* Order का total price तय करना (custom order में ज़रूरी). Customer को chat में message चला जाता है */
function setTotal(o) {
  const m = openModal({
    title: "Set total price", size: "sm", className: "modal--admin",
    content: `<form class="a-form" novalidate>
      <p class="muted">Total amount for all ${Number(o.totalQty) || 0} cards. The customer sees it in the chat.</p>
      <label class="field"><span>Total amount (₹)</span><input type="number" inputmode="numeric" min="1" value="${Number(o.total) > 0 ? o.total : ""}" required></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-x>Cancel</button><button type="submit" class="btn btn-primary">Save and notify</button></div></form>`
  });
  const form = $("form", m.body), err = $(".form-error", form);
  $("[data-x]", form).addEventListener("click", m.close);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const total = Math.round(Number($("input", form).value));
    if (!(total > 0)) { err.textContent = "Enter the total amount."; err.hidden = false; return; }
    const btn = $("button[type=submit]", form); setLoading(btn, true, "Saving");
    try {
      const plan = paymentPlan(Number(o.totalQty) || 1, total);
      const text = plan.type === "bulk"
        ? `Order total: ${formatPrice(total)}. Please pay ${formatPrice(plan.advance)} in advance to start. The balance ${formatPrice(plan.balance)} is paid before shipping.`
        : `Order total: ${formatPrice(total)}. Please pay the full amount to start your order.`;
      await setStatus(o, o.status, text, { total, paymentPlan: plan });
      toast("Total price saved and sent to the customer.", "success"); m.close();
    } catch (e2) { console.error(e2); err.textContent = "Something went wrong. Please try again."; err.hidden = false; }
    setLoading(btn, false);
  });
}

function editTracking(o, thenShip = false) {
  const m = openModal({
    title: thenShip ? "Ship order" : "India Post tracking ID", size: "sm", className: "modal--admin",
    content: `<form class="a-form" novalidate>
      <p class="muted">${thenShip ? "Enter the India Post tracking ID. The customer will see it in the chat and the order will move to Shipped." : "The tracking ID is shown to the customer in the chat."}</p>
      <label class="field"><span>Tracking ID</span><input type="text" maxlength="20" value="${escapeHtml(o.trackingId || "")}" placeholder="e.g. EE123456789IN" autocomplete="off" required></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-x>Cancel</button><button type="submit" class="btn btn-primary">${thenShip ? "Mark as shipped" : "Save and notify"}</button></div></form>`
  });
  const form = $("form", m.body), err = $(".form-error", form);
  $("[data-x]", form).addEventListener("click", m.close);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("input", form).value.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,20}$/.test(id)) { err.textContent = "Enter a valid tracking ID (8 to 20 letters or numbers)."; err.hidden = false; return; }
    if (thenShip && (o.paymentPlan || {}).type === "bulk" && paidSum(o) < o.total) {
      const ok = await confirmDialog({ title: "Balance not paid", message: "This is a bulk order and the full amount is not recorded yet. Ship anyway?", confirmText: "Ship anyway" });
      if (!ok) return;
    }
    const btn = $("button[type=submit]", form); setLoading(btn, true, "Saving");
    try {
      const status = thenShip || o.status === "Shipped" ? "Shipped" : o.status;
      await setStatus(o, status, `Your order has been shipped. India Post tracking ID: ${id}`, { trackingId: id, courier: "India Post" },
        { type: "tracking", text: "Tracking details", tracking: { id, courier: "India Post" } });
      toast("Tracking ID saved and sent to the customer.", "success"); m.close();
    } catch (e2) { console.error(e2); err.textContent = "Something went wrong. Please try again."; err.hidden = false; }
    setLoading(btn, false);
  });
}

async function cancelOrder(o) {
  const ok = await confirmDialog({ title: "Cancel this order?", message: `Case ${escapeHtml(o.shortId)} will be marked as cancelled. Remember: payments already received are non-refundable as per policy.`, confirmText: "Cancel order", cancelText: "Keep", danger: true });
  if (!ok) return;
  runBusy(async () => { await setStatus(o, "Cancelled", "This order has been cancelled."); toast("Order cancelled.", "success"); });
}
async function saveNotes(o, text, btn) {
  setLoading(btn, true, "Saving");
  try { await updateDoc(doc(db, "orders", o.id), { notes: text.slice(0, 500) }); toast("Notes saved.", "success"); } catch (e) { toast("Could not save notes.", "error"); }
  setLoading(btn, false);
}
async function runBusy(fn) { try { await fn(); } catch (e) { console.error(e); toast("Something went wrong. Please try again.", "error"); } }

async function blockUser(uid, name, unblock = false) {
  const ok = await confirmDialog({
    title: unblock ? "Unblock this user?" : "Block this user?",
    message: unblock ? `${escapeHtml(name || "This user")} will be able to chat and order again.` : `${escapeHtml(name || "This user")} will not be able to send messages, orders or reviews.`,
    confirmText: unblock ? "Unblock" : "Block user", danger: !unblock
  });
  if (!ok) return;
  runBusy(async () => {
    await updateDoc(doc(db, "users", uid), { blocked: !unblock });
    S.users = S.users.map((u) => (u.id === uid ? { ...u, blocked: !unblock } : u));
    toast(unblock ? "User unblocked." : "User blocked.", "success");
    if (S.view === "users") refreshUserList();
  });
}

/* ==========================================================================
   HELP DESK
   ========================================================================== */
function viewHelp(main) {
  main.innerHTML = `
    <div class="a-split ${S.selectedHelp ? "has-detail" : ""}">
      <section class="a-list-col">
        <div class="a-title"><h2>Help desk</h2><p>Customers asking for help</p></div>
        <input type="search" class="a-search" id="h-search" placeholder="Search by customer name" value="${escapeHtml(S.helpSearch)}" aria-label="Search help threads">
        <div class="a-list" id="h-list"></div>
      </section>
      <section class="a-detail-col" id="h-detail"></section>
    </div>`;
  $("#h-search", main).addEventListener("input", debounce((e) => { S.helpSearch = e.target.value.trim().toLowerCase(); refreshHelpList(); }, 150));
  refreshHelpList();
  openHelpDetail();
}
function refreshHelpList() {
  const list = $("#h-list", root); if (!list) return;
  const q = S.helpSearch;
  const rows = S.helps.filter((h) => !q || (h.userName || "").toLowerCase().includes(q));
  list.innerHTML = rows.length ? rows.map((h) => `
    <button type="button" class="a-row ${S.selectedHelp === h.id ? "is-selected" : ""}" data-help="${escapeHtml(h.id)}">
      ${avatarHtml(h.userName, h.userPhoto)}
      <div class="a-row-main"><div class="a-row-top"><b>${escapeHtml(h.userName || "Customer")}</b></div>
        <span>${emailShown("h" + h.id, h.emailMasked, h.email)}</span><em>${escapeHtml(h.lastMessage || "")}</em></div>
      <div class="a-row-side"><span>${timeAgo(toMs(h.updatedAt))}</span>${Number(h.unreadAdmin) > 0 ? `<i class="a-dot is-on"></i>` : ""}</div>
    </button>`).join("") : `<p class="a-empty">No help requests yet.</p>`;
  $$("[data-help]", list).forEach((b) => b.addEventListener("click", () => { S.selectedHelp = b.dataset.help; $(".a-split", root).classList.add("has-detail"); refreshHelpList(); openHelpDetail(); }));
}
function openHelpDetail() {
  const box = $("#h-detail", root); if (!box) return;
  destroyChat();
  const h = S.helps.find((x) => x.id === S.selectedHelp);
  if (!h) { box.innerHTML = `<div class="a-placeholder">${ICONS.help}<p>Select a conversation to reply.</p></div>`; return; }
  box.innerHTML = `
    <div class="a-detail">
      <div class="a-detail-bar"><button type="button" class="icon-btn a-back" aria-label="Back to list">${ICONS.back}</button><b>${escapeHtml(h.userName || "Customer")}</b>
        <button type="button" class="btn btn-small btn-ghost" data-act="block">Block</button></div>
      <div class="a-chat a-chat--solo" id="h-chat"></div>
    </div>`;
  $(".a-back", box).addEventListener("click", () => { S.selectedHelp = null; $(".a-split", root).classList.remove("has-detail"); destroyChat(); refreshHelpList(); openHelpDetail(); });
  $('[data-act="block"]', box).addEventListener("click", () => blockUser(h.id, h.userName));
  S.chat = createChat({
    container: $("#h-chat", box), threadRef: doc(db, "helpThreads", h.id), mode: "help", role: "admin",
    quickReplies: [
      { label: "Greeting", text: "Hi! Thanks for contacting NFC Trust. How can we help you?" },
      { label: "Delivery info", text: "We ship with India Post. Delivery usually takes a few days after dispatch. We share the tracking ID in your order chat." },
      { label: "Warranty info", text: `Every card has a ${SITE.warrantyYears}-year warranty against manufacturing defects.` },
      { label: "Payment rules", text: `For fewer than ${SITE.bulkMinQty} cards, full payment comes first. For ${SITE.bulkMinQty} or more, ${SITE.advancePercent}% advance and the rest before shipping.` }
    ]
  });
}

/* ==========================================================================
   USERS
   ========================================================================== */
async function viewUsers(main) {
  main.innerHTML = `<div class="a-page">
    <div class="a-title"><h2>Users</h2><p>Registered with Google or email link (latest 200)</p></div>
    <input type="search" class="a-search" id="u-search" placeholder="Search by name" value="${escapeHtml(S.userSearch)}" aria-label="Search users">
    <div class="a-list a-list--cards" id="u-list"><p class="a-empty">Loading users…</p></div></div>`;
  $("#u-search", main).addEventListener("input", debounce((e) => { S.userSearch = e.target.value.trim().toLowerCase(); refreshUserList(); }, 150));
  if (!S.users.length) {
    try {
      const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(200)));
      S.users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) { console.error(e); toast("Could not load users.", "error"); }
  }
  refreshUserList();
}
function refreshUserList() {
  const list = $("#u-list", root); if (!list) return;
  const q = S.userSearch;
  const rows = S.users.filter((u) => !q || (u.name || "").toLowerCase().includes(q));
  list.innerHTML = rows.length ? rows.map((u) => `
    <div class="a-row a-row--static">
      ${avatarHtml(u.name, u.photoURL)}
      <div class="a-row-main"><div class="a-row-top"><b>${escapeHtml(u.name || "Customer")}</b>${u.blocked ? `<span class="chip chip--status" data-status="Cancelled">Blocked</span>` : ""}</div>
        <span>${emailShown("u" + u.id, u.emailMasked, u.email)}</span><em>Joined ${formatDateTime(toMs(u.createdAt))} · Last seen ${timeAgo(toMs(u.lastSeen))}</em></div>
      <div class="a-row-actions">
        <button type="button" class="btn btn-small btn-ghost" data-reveal="${escapeHtml(u.id)}">${S.revealed.has("u" + u.id) ? "Hide" : "Reveal"}</button>
        <button type="button" class="btn btn-small ${u.blocked ? "btn-primary" : "btn-danger"}" data-block="${escapeHtml(u.id)}">${u.blocked ? "Unblock" : "Block"}</button>
      </div>
    </div>`).join("") : `<p class="a-empty">No users found.</p>`;
  $$("[data-reveal]", list).forEach((b) => b.addEventListener("click", () => { const k = "u" + b.dataset.reveal; S.revealed.has(k) ? S.revealed.delete(k) : S.revealed.add(k); refreshUserList(); }));
  $$("[data-block]", list).forEach((b) => b.addEventListener("click", () => { const u = S.users.find((x) => x.id === b.dataset.block); blockUser(u.id, u.name, !!u.blocked); }));
}

/* ==========================================================================
   PRODUCTS
   Products index.html में लिखे जाते हैं (नया card वहीं जोड़ें). यहाँ सिर्फ़ बदलाव होते हैं:
   title, old price, new price, warranty और stock. Offer % अपने आप बनता है.
   ========================================================================== */
async function viewProducts(main) {
  main.innerHTML = `<div class="a-page">
    <div class="a-title"><h2>Products</h2><p>Cards come from index.html. Change title, prices, warranty and stock here.</p></div>
    <div class="a-list a-list--cards" id="p-list"><p class="a-empty">Loading products…</p></div></div>`;
  await loadProducts(true);
  S.products = getProducts();
  drawProducts();
}

function drawProducts() {
  const list = $("#p-list", root); if (!list) return;
  list.innerHTML = S.products.length ? S.products.map((p) => {
    const off = offerPercent(p.oldPrice, p.price);
    return `<div class="a-prod ${p.stock ? "" : "is-out"}">
      <div class="a-prod-imgs">${p.images.length
        ? p.images.map((src) => `<img src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.remove()">`).join("")
        : `<span>${escapeHtml(initials(p.name))}</span>`}</div>
      <div class="a-prod-main">
        <b>${escapeHtml(p.name)}</b>
        <div class="a-prod-price"><strong>${formatPrice(p.price)}</strong>${off ? `<s>${formatPrice(p.oldPrice)}</s><span class="off">${off}% off</span>` : ""}</div>
        <span class="a-prod-sub">${escapeHtml(p.warranty)}</span>
        <span class="chip ${p.stock ? "chip--yellow" : ""}">${p.stock ? "In stock" : "Out of stock"}</span>
      </div>
      <div class="a-row-actions">
        <button type="button" class="btn btn-small ${p.stock ? "btn-danger" : "btn-primary"}" data-stock="${escapeHtml(p.id)}">${p.stock ? "Mark out of stock" : "Back in stock"}</button>
        <button type="button" class="btn btn-small btn-ghost" data-edit="${escapeHtml(p.id)}">Edit</button>
      </div>
    </div>`;
  }).join("") : `<p class="a-empty">No products found. Add products inside the product-catalog list in index.html.</p>`;
  $$("[data-edit]", list).forEach((b) => b.addEventListener("click", () => editProduct(S.products.find((p) => p.id === b.dataset.edit))));
  $$("[data-stock]", list).forEach((b) => b.addEventListener("click", () => toggleStock(S.products.find((p) => p.id === b.dataset.stock))));
}

async function toggleStock(p) {
  if (!p) return;
  try {
    await setDoc(doc(db, "products", p.id), { stock: !p.stock }, { merge: true });
    p.stock = !p.stock; clearProductsCache();
    toast(p.stock ? "Back in stock." : "Marked as out of stock.", "success");
    drawProducts();
  } catch (e) { console.error(e); toast("Could not save. Check your Firestore rules and admin UID.", "error"); }
}

function editProduct(p) {
  if (!p) return;
  const m = openModal({
    title: "Edit product", size: "md", className: "modal--admin",
    content: `<form class="a-form" novalidate>
      <label class="field"><span>Title</span><input name="name" maxlength="60" value="${escapeHtml(p.name)}" required></label>
      <div class="a-two">
        <label class="field"><span>Old price (₹)</span><input name="oldPrice" type="number" inputmode="numeric" min="0" value="${p.oldPrice || ""}" placeholder="e.g. 449"></label>
        <label class="field"><span>New price (₹)</span><input name="price" type="number" inputmode="numeric" min="1" value="${p.price || ""}" required></label>
      </div>
      <p class="a-offer" id="offer-preview"></p>
      <label class="field"><span>Warranty text</span><input name="warranty" maxlength="60" value="${escapeHtml(p.warranty)}" placeholder="3-year warranty"></label>
      <div class="field a-switches"><label><input type="checkbox" name="stock" ${p.stock ? "checked" : ""}> In stock</label></div>
      <p class="muted">Photos and the card list are set in index.html.</p>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-reset>Reset to website values</button>
        <button type="button" class="btn btn-ghost" data-x>Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div></form>`
  });
  const form = $("form", m.body), err = $(".form-error", form), prev = $("#offer-preview", form);
  // Old और new price डालते ही offer % अपने आप दिखता है
  const showOffer = () => {
    const off = offerPercent(Number(form.oldPrice.value), Number(form.price.value));
    prev.textContent = off ? `Offer shown to customers: ${off}% off` : "No offer is shown (old price must be higher than the new price).";
    prev.classList.toggle("is-on", !!off);
  };
  form.oldPrice.addEventListener("input", showOffer); form.price.addEventListener("input", showOffer); showOffer();
  $("[data-x]", form).addEventListener("click", m.close);
  $("[data-reset]", form).addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Reset this product?", message: "Title, prices, warranty and stock go back to the values written in index.html.", confirmText: "Reset" });
    if (!ok) return;
    try { await deleteDoc(doc(db, "products", p.id)); clearProductsCache(); toast("Product reset.", "success"); m.close(); await loadProducts(true); S.products = getProducts(); drawProducts(); }
    catch (e) { console.error(e); toast("Could not reset.", "error"); }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: form.name.value.trim(), price: Math.round(Number(form.price.value)),
      oldPrice: Math.round(Number(form.oldPrice.value)) || 0, warranty: form.warranty.value.trim(), stock: form.stock.checked
    };
    err.hidden = true;
    if (!data.name) { err.textContent = "Please enter a title."; err.hidden = false; return; }
    if (!(data.price > 0)) { err.textContent = "Please enter the new price."; err.hidden = false; return; }
    const btn = $("button[type=submit]", form); setLoading(btn, true, "Saving");
    try {
      await setDoc(doc(db, "products", p.id), data, { merge: true });
      clearProductsCache(); toast("Product saved.", "success"); m.close();
      await loadProducts(true); S.products = getProducts(); drawProducts();
    } catch (e2) { console.error(e2); err.textContent = "Could not save. Check your Firestore rules and admin UID."; err.hidden = false; }
    setLoading(btn, false);
  });
}

/* ==========================================================================
   REVIEWS
   ========================================================================== */
async function viewReviews(main) {
  main.innerHTML = `<div class="a-page"><div class="a-title"><h2>Reviews</h2><p>Latest 50 reviews. Delete spam or abusive ones.</p></div>
    <div class="reviews-grid" id="r-list"><p class="a-empty">Loading reviews…</p></div></div>`;
  try {
    const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(50)));
    S.reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error(e); }
  const list = $("#r-list", root); if (!list) return;
  list.innerHTML = S.reviews.length ? S.reviews.map((r) => `<div class="review-wrap">${reviewCard(r)}<button type="button" class="btn btn-small btn-danger" data-del="${escapeHtml(r.id)}">Delete</button></div>`).join("") : `<p class="a-empty">No reviews yet.</p>`;
  $$("[data-del]", list).forEach((b) => b.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Delete review?", message: "This review will be removed from the website.", confirmText: "Delete", danger: true });
    if (!ok) return;
    runBusy(async () => { await deleteDoc(doc(db, "reviews", b.dataset.del)); toast("Review deleted.", "success"); viewReviews(main); });
  }));
}

/* ==========================================================================
   SETTINGS
   ========================================================================== */
function viewSettings(main) {
  const s = S.settings;
  main.innerHTML = `<div class="a-page a-page--narrow"><div class="a-title"><h2>Settings</h2><p>Changes can take up to 10 minutes to reach visitors</p></div>
    <form class="a-form a-card" novalidate>
      <label class="field"><span>Your UPI ID (used in payment messages)</span><input name="upiId" value="${escapeHtml(s.upiId || "")}" placeholder="yourname@bank" autocomplete="off"></label>
      <label class="field"><span>Announcement banner (shown at the top of the website)</span><input name="banner" maxlength="140" value="${escapeHtml(s.banner || "")}" placeholder="Festival offer: free shipping this week"></label>
      <div class="field a-switches"><label><input type="checkbox" name="shopOpen" ${s.shopOpen !== false ? "checked" : ""}> Accept new orders</label></div>
      <button type="submit" class="btn btn-primary">Save settings</button>
    </form>
    <section class="a-card"><h4>Quick facts</h4>
      <ul class="a-items"><li><span>Bulk order starts at</span><b>${SITE.bulkMinQty} cards</b></li><li><span>Advance for bulk orders</span><b>${SITE.advancePercent}%</b></li><li><span>Warranty</span><b>${SITE.warrantyYears} years</b></li></ul>
      <p class="muted">These rules live in config.js.</p></section></div>`;
  const form = $("form", main);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form); setLoading(btn, true, "Saving");
    const next = { upiId: form.upiId.value.trim(), banner: form.banner.value.trim(), shopOpen: form.shopOpen.checked };
    try { await setDoc(doc(db, "settings", "site"), next); S.settings = next; toast("Settings saved.", "success"); }
    catch (err) { console.error(err); toast("Could not save settings.", "error"); }
    setLoading(btn, false);
  });
}

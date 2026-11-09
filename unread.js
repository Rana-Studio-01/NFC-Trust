/* ==========================================================================
   Tap Trust - unread.js
   Push notification इस्तेमाल नहीं होता (वो paid है). Admin का नया message आते ही
   website के अंदर ही लाल dot / number दिखता है: three-dot menu, My Orders, Help।
   सिर्फ़ 2 listeners चलते हैं: user के orders (max 50) और help thread (1 document)।
   ========================================================================== */
import { db, collection, doc, query, where, limit, onSnapshot } from "./firebase.js";
import { $$ } from "./utils.js";

let ordersUnsub = null, helpUnsub = null;
let orders = [];
let help = null;
const orderListeners = new Set();
const unreadListeners = new Set();
let baseTitle = document.title;

export const getOrders = () => orders;
export const getHelpThread = () => help;
export const getUnreadTotals = () => ({
  orders: orders.reduce((n, o) => n + (Number(o.unreadUser) > 0 ? 1 : 0), 0),
  help: help && Number(help.unreadUser) > 0 ? 1 : 0
});

export function onOrdersChange(cb) { orderListeners.add(cb); cb(orders); return () => orderListeners.delete(cb); }
export function onUnreadChange(cb) { unreadListeners.add(cb); cb(getUnreadTotals()); return () => unreadListeners.delete(cb); }

export function startUnread(uid) {
  stopUnread();
  ordersUnsub = onSnapshot(
    query(collection(db, "orders"), where("uid", "==", uid), limit(50)),
    (snap) => {
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
      orderListeners.forEach((cb) => cb(orders));
      apply();
    },
    (err) => console.error("orders listener", err)
  );
  helpUnsub = onSnapshot(
    doc(db, "helpThreads", uid),
    (snap) => { help = snap.exists() ? { id: snap.id, ...snap.data() } : null; apply(); },
    (err) => console.error("help listener", err)
  );
}

export function stopUnread() {
  if (ordersUnsub) ordersUnsub();
  if (helpUnsub) helpUnsub();
  ordersUnsub = helpUnsub = null;
  orders = []; help = null;
  orderListeners.forEach((cb) => cb(orders));
  apply();
}

function ms(ts) { return ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0; }

/* लाल dots और tab title ("(2) Tap Trust") अपडेट करता है */
export function refreshDots() { apply(); }
function apply() {
  const t = getUnreadTotals();
  const total = t.orders + t.help;
  $$("[data-unread-dot]").forEach((el) => el.classList.toggle("is-on", total > 0));
  $$("[data-unread-orders]").forEach((el) => { el.classList.toggle("is-on", t.orders > 0); el.textContent = t.orders > 0 ? String(t.orders) : ""; });
  $$("[data-unread-help]").forEach((el) => { el.classList.toggle("is-on", t.help > 0); el.textContent = t.help > 0 ? "1" : ""; });
  if (!document.title.startsWith("(")) baseTitle = document.title;
  document.title = total > 0 ? `(${total}) ${baseTitle}` : baseTitle;
  unreadListeners.forEach((cb) => cb(t));
}

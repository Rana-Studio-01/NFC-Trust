/* ==========================================================================
   NFC Trust - order.js
   Buy Now -> confirm popup -> (login अगर ज़रूरी) -> Order Builder -> order chat

   Order Builder में user:
   - "+ Add another card" से दूसरे type का card जोड़ सकता है
   - हर card की quantity बढ़ा/घटा सकता है
   - Custom card हो तो अपना link और design notes दे सकता है
   Payment rule (config.js में बदला जा सकता है):
   - 10 से कम cards  -> पूरा payment पहले
   - 10 या ज़्यादा   -> 50% advance, बाकी shipping से पहले
   ========================================================================== */
import {
  db, collection, doc, runTransaction, writeBatch, serverTimestamp, increment
} from "./firebase.js";
import { SITE, STATUS_EDITABLE } from "./config.js";
import { $, $$, escapeHtml, formatPrice, paymentPlan, isValidHttpUrl, clamp } from "./utils.js";
import { openModal, confirmDialog, toast, setLoading, ICONS } from "./ui.js";
import { getProductById, getProducts, cardArt } from "./products.js";
import { requireLogin, getUser, getProfile, isBlocked } from "./auth.js";
import { openInbox } from "./inbox.js";

let shopOpenFn = () => true;
export function setShopOpenGetter(fn) { shopOpenFn = fn; }

/* ---------- Step 1: Buy Now दबाने पर ---------- */
export async function startBuy(productId) {
  const p = getProductById(productId);
  if (!p) { toast("This card is not available right now.", "info"); return; }
  if (!shopOpenFn()) { toast("Orders are paused right now. Please check back soon.", "info"); return; }
  if (!p.stock) { toast("This card is out of stock.", "info"); return; }

  const ok = await confirmDialog({
    title: "Confirm your order",
    message: `Do you really want to buy <strong>${escapeHtml(p.name)}</strong> for <strong>${formatPrice(p.price)}</strong>?`,
    confirmText: "Yes, buy now", cancelText: "Not now"
  });
  if (!ok) return;
  await continueBuy(productId);
}

/* Login के बाद (या redirect-login के बाद) यहीं से आगे बढ़ता है */
export async function continueBuy(productId) {
  const u = await requireLogin("Please login to continue with your order.", { type: "buy", id: productId });
  if (!u) return;
  if (isBlocked()) { toast("Your access to chat has been restricted. Contact us on Instagram.", "error"); return; }
  const p = getProductById(productId);
  if (!p) return;
  openOrderBuilder({ items: [lineFromProduct(p, 1)] });
}

function lineFromProduct(p, qty) {
  return { productId: p.id, qty, name: p.name, price: p.price, style: p.style, category: p.category, imageUrl: p.imageUrl || "" };
}

/* ---------- Step 2: Order Builder ---------- */
export function openOrderBuilder({ items = [], order = null } = {}) {
  const edit = !!order;
  let lines = items.map((i) => ({ ...i }));
  let custom = { brand: "", link: "", notes: "", ...(order && order.custom ? order.custom : {}) };
  let pickerOpen = false;
  let busy = false;

  const modal = openModal({
    title: edit ? `Edit order ${order.shortId}` : "Your order", size: "lg", className: "modal--builder",
    content: `<div class="ob"></div>`
  });
  const root = $(".ob", modal.body);

  const totals = () => {
    const totalQty = lines.reduce((n, l) => n + l.qty, 0);
    const total = lines.reduce((n, l) => n + l.qty * l.price, 0);
    return { totalQty, total, plan: paymentPlan(totalQty, total) };
  };
  const hasCustom = () => lines.some((l) => l.category === "custom");

  function render() {
    const { totalQty, total, plan } = totals();
    const planText = plan.type === "bulk"
      ? `<strong>${SITE.advancePercent}% advance: ${formatPrice(plan.advance)}</strong> to start your order. Pay the remaining <strong>${formatPrice(plan.balance)}</strong> before we ship.`
      : `<strong>Full payment: ${formatPrice(plan.advance)}</strong> before we start your order.`;
    const nearBulk = totalQty < SITE.bulkMinQty;

    root.innerHTML = `
      <ul class="ob-lines">
        ${lines.map((l, i) => `
          <li class="ob-line">
            <div class="ob-art">${cardArt({ ...l, name: l.name })}</div>
            <div class="ob-meta"><strong>${escapeHtml(l.name)}</strong><span>${formatPrice(l.price)} each</span></div>
            <div class="stepper" role="group" aria-label="Quantity">
              <button type="button" data-act="dec" data-i="${i}" aria-label="Decrease quantity">−</button>
              <input type="text" inputmode="numeric" pattern="[0-9]*" value="${l.qty}" data-act="qty" data-i="${i}" aria-label="Quantity">
              <button type="button" data-act="inc" data-i="${i}" aria-label="Increase quantity">+</button>
            </div>
            <b class="ob-sub">${formatPrice(l.price * l.qty)}</b>
            ${lines.length > 1 ? `<button type="button" class="icon-btn" data-act="rm" data-i="${i}" aria-label="Remove ${escapeHtml(l.name)}">${ICONS.close}</button>` : ""}
          </li>`).join("")}
      </ul>

      <button type="button" class="btn btn-ghost btn-block ob-add" data-act="toggle-picker" aria-expanded="${pickerOpen}">
        ${ICONS.plus}<span>${pickerOpen ? "Hide card list" : "Add another card"}</span>
      </button>
      ${pickerOpen ? `<div class="ob-picker">${getProducts().filter((p) => p.stock).map((p) => `
        <div class="ob-pick">
          <div class="ob-art ob-art--sm">${cardArt(p)}</div>
          <div class="ob-meta"><strong>${escapeHtml(p.name)}</strong><span>${formatPrice(p.price)}</span></div>
          <button type="button" class="btn btn-small btn-primary" data-act="pick" data-id="${escapeHtml(p.id)}">Add</button>
        </div>`).join("")}</div>` : ""}

      ${hasCustom() ? `
        <fieldset class="ob-custom">
          <legend>Custom card details</legend>
          <label class="field"><span>Link to program on the card *</span>
            <input type="url" data-f="link" value="${escapeHtml(custom.link)}" placeholder="https://instagram.com/yourname" autocomplete="off"></label>
          <label class="field"><span>Name or brand on the card</span>
            <input type="text" data-f="brand" maxlength="60" value="${escapeHtml(custom.brand)}" placeholder="Your name or brand"></label>
          <label class="field"><span>Design notes (you can share your design image in chat)</span>
            <textarea data-f="notes" rows="2" maxlength="300" placeholder="Colors, style, text on the card">${escapeHtml(custom.notes)}</textarea></label>
        </fieldset>` : ""}

      <div class="ob-summary">
        <div class="ob-row"><span>Total cards</span><b>${totalQty}</b></div>
        <div class="ob-row ob-row--total"><span>Total amount</span><b>${formatPrice(total)}</b></div>
        <div class="ob-plan ob-plan--${plan.type}">${planText}</div>
        ${nearBulk ? `<p class="ob-hint">Order ${SITE.bulkMinQty} or more cards and pay only ${SITE.advancePercent}% in advance.</p>` : ""}
        <ul class="tick-list tick-list--soft">
          <li>${ICONS.check}<span>We confirm your address and payment details in chat.</span></li>
          <li>${ICONS.check}<span>Shipped by India Post. We share the tracking ID in chat.</span></li>
          <li>${ICONS.check}<span>${SITE.warrantyYears}-year warranty. No refund after payment is made.</span></li>
        </ul>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-act="submit">${edit ? "Update order" : "Send order to chat"}</button>
      </div>`;
  }

  /* ---- events (delegation) ---- */
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT") return;
    const act = b.dataset.act, i = Number(b.dataset.i);
    if (act === "inc") lines[i].qty = clamp(lines[i].qty + 1, 1, SITE.maxQtyPerItem);
    else if (act === "dec") lines[i].qty = clamp(lines[i].qty - 1, 1, SITE.maxQtyPerItem);
    else if (act === "rm") lines.splice(i, 1);
    else if (act === "toggle-picker") pickerOpen = !pickerOpen;
    else if (act === "pick") {
      const p = getProductById(b.dataset.id);
      if (p) {
        const found = lines.find((l) => l.productId === p.id);
        if (found) found.qty = clamp(found.qty + 1, 1, SITE.maxQtyPerItem);
        else lines.push(lineFromProduct(p, 1));
        toast(`${p.name} added.`, "success", 1800);
      }
    } else if (act === "cancel") { modal.close(); return; }
    else if (act === "submit") { submit(b); return; }
    else return;
    keepFocusRender();
  });
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.act === "qty") {
      const n = parseInt(String(t.value).replace(/\D/g, ""), 10);
      lines[Number(t.dataset.i)].qty = clamp(Number.isFinite(n) ? n : 1, 1, SITE.maxQtyPerItem);
      keepFocusRender();
    }
  });
  root.addEventListener("input", (e) => {
    const f = e.target.dataset.f;
    if (f) custom[f] = e.target.value; // custom fields: बिना re-render के सीधे save
  });

  function keepFocusRender() {
    const scroll = modal.body.scrollTop;
    render();
    modal.body.scrollTop = scroll;
  }

  /* ---- submit ---- */
  async function submit(btn) {
    if (busy) return;
    const u = getUser(), prof = getProfile();
    if (!u) { toast("Please login again to continue.", "error"); return; }
    if (isBlocked()) { toast("Your access to chat has been restricted.", "error"); return; }
    if (!lines.length) { toast("Please add at least one card.", "error"); return; }

    if (hasCustom()) {
      if (!isValidHttpUrl(custom.link)) { toast("Please enter a valid link starting with https://", "error"); return; }
    }
    const { totalQty, total, plan } = totals();
    const itemsData = lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty, style: l.style || "classic", category: l.category || "cards", imageUrl: l.imageUrl || "" }));
    const customData = hasCustom() ? { link: custom.link.trim(), brand: custom.brand.trim(), notes: custom.notes.trim() } : { link: "", brand: "", notes: "" };
    const snapshot = {
      items: itemsData.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
      total, totalQty, plan, custom: customData
    };

    busy = true; setLoading(btn, true, edit ? "Updating" : "Sending");
    try {
      if (edit) {
        const oref = doc(db, "orders", order.id);
        const batch = writeBatch(db);
        batch.update(oref, {
          items: itemsData, totalQty, total, paymentPlan: plan, custom: customData,
          lastMessage: "Order updated", updatedAt: serverTimestamp(), unreadAdmin: increment(1), userLastSeen: serverTimestamp()
        });
        batch.set(doc(collection(oref, "messages")), { sender: "user", type: "order", text: "Order updated", order: snapshot, createdAt: serverTimestamp() });
        await batch.commit();
        toast("Order updated.", "success");
        modal.close();
        return;
      }

      // नया order: पहले छोटा Order ID (TT-1001, TT-1002 ...) बनाते हैं
      const counterRef = doc(db, "counters", "orders");
      const num = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const next = (snap.exists() ? Number(snap.data().last) : 1000) + 1;
        tx.set(counterRef, { last: next });
        return next;
      });
      const shortId = "TT-" + num;
      const oref = doc(db, "orders", shortId);
      const batch = writeBatch(db);
      batch.set(oref, {
        shortId, uid: u.uid,
        userName: (prof && prof.name) || u.displayName || "Customer",
        userPhoto: (prof && prof.photoURL) || u.photoURL || "",
        email: u.email || "", emailMasked: (prof && prof.emailMasked) || "",
        items: itemsData, totalQty, total, paymentPlan: plan, custom: customData,
        status: "Requested", payments: [], utrs: [], trackingId: "", courier: "", notes: "",
        unreadAdmin: 1, unreadUser: 0, lastMessage: "New order request",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), userLastSeen: serverTimestamp()
      });
      batch.set(doc(collection(oref, "messages")), { sender: "user", type: "order", text: "New order request", order: snapshot, createdAt: serverTimestamp() });
      await batch.commit();

      modal.close();
      toast(`Order request sent! Your Order ID is ${shortId}.`, "success", 4500);
      openInbox({ orderId: shortId });
    } catch (err) {
      console.error("submit order", err);
      toast(err && err.code === "permission-denied"
        ? "We could not place this order. Please logout, login again and try once more."
        : "Something went wrong. Please try again.", "error", 5000);
    } finally {
      busy = false; setLoading(btn, false);
    }
  }

  render();
  return modal;
}

/* Chat के "+" button से: order का status editable हो तभी cards बदलने दो */
export function editExistingOrder(order) {
  if (!order) return;
  if (!STATUS_EDITABLE.includes(order.status)) {
    toast("Cards can't be changed after payment starts. Please message us in this chat.", "info", 4500);
    return;
  }
  const items = (order.items || []).map((i) => ({
    productId: i.productId, qty: i.qty, name: i.name, price: i.price, style: i.style || "classic", category: i.category || "cards", imageUrl: i.imageUrl || ""
  }));
  openOrderBuilder({ items, order });
}

/* ==========================================================================
   CUSTOM CARD ORDER
   "Custom card order" button -> छोटा form:
   1) Wholesale या 1-5 cards (अपनी shop / personal)
   2) किस type का card चाहिए (लिखकर)
   3) कितने cards चाहिए (खुद type करें)
   4) अगर 1 से 5 cards हैं तो card से connect होने वाला link ज़रूरी
   Confirm करते ही order admin panel में पहुँच जाता है और chat खुल जाती है।
   Price admin chat में बताता है (Orders -> Set total price).
   ========================================================================== */
export async function openCustomOrder() {
  if (!shopOpenFn()) { toast("Orders are paused right now. Please check back soon.", "info"); return; }
  const u = await requireLogin("Please login to place a custom card order.", { type: "custom" });
  if (!u) return;
  if (isBlocked()) { toast("Your access to chat has been restricted. Contact us on Instagram.", "error"); return; }

  const m = openModal({
    title: "Custom card order", size: "md", className: "modal--custom",
    content: `<form class="custom-form" novalidate>
      <fieldset class="radio-group">
        <legend>What do you need?</legend>
        <label class="radio-card"><input type="radio" name="kind" value="wholesale" checked>
          <span><strong>Wholesale</strong><em>Many cards for resale or for your business</em></span></label>
        <label class="radio-card"><input type="radio" name="kind" value="small">
          <span><strong>For my shop or personal use</strong><em>A few cards, usually 1 to 5</em></span></label>
      </fieldset>
      <label class="field"><span>What type of card do you want? *</span>
        <input type="text" name="type" maxlength="80" placeholder="e.g. Google review card for my cafe" autocomplete="off"></label>
      <label class="field"><span>How many cards? *</span>
        <input type="text" name="qty" inputmode="numeric" pattern="[0-9]*" value="10" autocomplete="off"></label>
      <label class="field" data-link-field hidden><span>Link to connect on the card *</span>
        <input type="url" name="link" placeholder="https://instagram.com/yourname" autocomplete="off"></label>
      <p class="fineprint" data-link-note>For wholesale orders we will ask for your links in the chat.</p>
      <label class="field"><span>Anything else we should know? (optional)</span>
        <textarea name="notes" rows="2" maxlength="300" placeholder="Colors, logo, design ideas. You can share your design image in the chat."></textarea></label>
      <p class="muted">We will share the price in the chat. You pay by UPI after we confirm.</p>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-x>Cancel</button>
        <button type="submit" class="btn btn-primary">Confirm custom order</button>
      </div></form>`
  });
  const form = $("form", m.body), err = $(".form-error", form);
  const qtyInput = form.elements.qty, linkField = $("[data-link-field]", form), linkNote = $("[data-link-note]", form);
  $("[data-x]", form).addEventListener("click", m.close);

  const qtyNow = () => { const n = parseInt(String(qtyInput.value).replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : 0; };
  // 1 से 5 cards हों तो link माँगते हैं
  const syncLink = () => {
    const needLink = qtyNow() >= 1 && qtyNow() <= 5;
    linkField.hidden = !needLink; linkNote.hidden = needLink;
  };
  qtyInput.addEventListener("input", syncLink);
  form.addEventListener("change", (e) => {
    if (e.target.name === "kind") { qtyInput.value = e.target.value === "small" ? "1" : "10"; syncLink(); }
  });
  syncLink();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const kind = form.elements.kind.value;
    const type = form.elements.type.value.trim();
    const qty = qtyNow();
    const link = form.elements.link.value.trim();
    const notes = form.elements.notes.value.trim();
    const fail = (t) => { err.textContent = t; err.hidden = false; };
    if (type.length < 3) return fail("Please tell us what type of card you want.");
    if (!(qty >= 1 && qty <= 5000)) return fail("Please enter how many cards you need (1 to 5000).");
    if (qty <= 5 && !isValidHttpUrl(link)) return fail("Please enter a valid link starting with https://");

    const btn = $("button[type=submit]", form); setLoading(btn, true, "Sending");
    try {
      const plan = paymentPlan(qty, 0);
      const customData = { kind, brand: type, link: qty <= 5 ? link : "", notes };
      const itemsData = [{ productId: "custom-order", name: "Custom NFC card", price: 0, qty, style: "custom", category: "custom", imageUrl: "" }];
      const snapshot = { items: [{ name: "Custom NFC card", qty, price: 0 }], total: 0, totalQty: qty, plan, custom: customData };
      const shortId = await placeNewOrder({ itemsData, totalQty: qty, total: 0, plan, customData, snapshot, firstText: "New custom card order" });
      m.close();
      toast(`Custom order sent! Your Order ID is ${shortId}.`, "success", 4500);
      openInbox({ orderId: shortId });
    } catch (e2) {
      console.error("custom order", e2);
      fail(e2 && e2.code === "permission-denied" ? "We could not place this order. Please logout, login again and try once more." : "Something went wrong. Please try again.");
    }
    setLoading(btn, false);
  });
}

/* नया order बनाना (Order ID TT-xxxx + पहला chat message). Return: Order ID */
async function placeNewOrder({ itemsData, totalQty, total, plan, customData, snapshot, firstText }) {
  const u = getUser(), prof = getProfile();
  if (!u) throw new Error("not logged in");
  const counterRef = doc(db, "counters", "orders");
  const num = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? Number(snap.data().last) : 1000) + 1;
    tx.set(counterRef, { last: next });
    return next;
  });
  const shortId = "TT-" + num;
  const oref = doc(db, "orders", shortId);
  const batch = writeBatch(db);
  batch.set(oref, {
    shortId, uid: u.uid,
    userName: (prof && prof.name) || u.displayName || "Customer",
    userPhoto: (prof && prof.photoURL) || u.photoURL || "",
    email: u.email || "", emailMasked: (prof && prof.emailMasked) || "",
    items: itemsData, totalQty, total, paymentPlan: plan, custom: customData,
    status: "Requested", payments: [], utrs: [], trackingId: "", courier: "", notes: "",
    unreadAdmin: 1, unreadUser: 0, lastMessage: firstText,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), userLastSeen: serverTimestamp()
  });
  batch.set(doc(collection(oref, "messages")), { sender: "user", type: "order", text: firstText, order: snapshot, createdAt: serverTimestamp() });
  await batch.commit();
  return shortId;
}

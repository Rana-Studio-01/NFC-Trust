/* ==========================================================================
   NFC Trust - app.js
   Website का मुख्य controller: सब modules को यहाँ जोड़ा गया है।
   ========================================================================== */
import { SITE, FIREBASE_CONFIG } from "./config.js";
import { db, doc, getDoc } from "./firebase.js";
import { $, $$, escapeHtml, store, initials } from "./utils.js";
import { toast, showWelcome, initReveal, openModal, setLoading, ICONS } from "./ui.js";
import { initAuth, onAuthChange, getUser, getProfile, logout, openLoginModal, takePending, isBlocked, adminSignIn } from "./auth.js";
import { loadProducts, renderShop, bindShopControls } from "./products.js";
import { startBuy, continueBuy, openCustomOrder, setShopOpenGetter } from "./order.js";
import { openInbox } from "./inbox.js";
import { startUnread, stopUnread, refreshDots } from "./unread.js";
import { initStats } from "./stats.js";
import { loadReviewsPreview, loadRatingSummary, openAllReviews, openWriteReview } from "./reviews.js";

let settings = { banner: "", shopOpen: true };
let lastUid = null;
const shopOpen = () => settings.shopOpen !== false;
setShopOpenGetter(shopOpen);

/* ---------- Start ---------- */
init();

async function init() {
  applyStaticLinks();
  showWelcome();
  initReveal();
  bindMenu();
  bindAdminTrigger();
  bindButtons();
  buildMenu(null);

  // Shop: पहले cache/default products तुरंत दिखाते हैं, फिर Firestore वाले आने पर refresh
  const loading = loadProducts();
  renderShop({ onBuy: startBuy, shopOpen: shopOpen() });
  bindShopControls(shopOpen);
  loading.then(() => renderShop({ onBuy: startBuy, shopOpen: shopOpen() }));

  loadSettings().then(() => { applySettings(); renderShop({ onBuy: startBuy, shopOpen: shopOpen() }); });
  initStats();
  loadReviewsPreview();
  loadRatingSummary();

  onAuthChange(handleAuth);
  await initAuth();
  await loading;
  resumePending();
}

/* ---------- Links / texts जो config.js से आते हैं ---------- */
function applyStaticLinks() {
  $$("[data-insta]").forEach((a) => { a.href = SITE.instagramUrl; a.target = "_blank"; a.rel = "noopener noreferrer"; });
  $$("[data-wa]").forEach((a) => { a.href = SITE.whatsappUrl; a.target = "_blank"; a.rel = "noopener noreferrer"; });
  $$("[data-handle]").forEach((el) => { el.textContent = "@" + SITE.instagramHandle; });
  $$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
  $$("[data-warranty]").forEach((el) => { el.textContent = SITE.warrantyYears; });
  $$("[data-bulk]").forEach((el) => { el.textContent = SITE.bulkMinQty; });
  $$("[data-advance]").forEach((el) => { el.textContent = SITE.advancePercent; });
}

/* ---------- Settings (banner / orders on-off) - 10 मिनट cache ---------- */
async function loadSettings() {
  const cached = store.get("tt_settings");
  if (cached && Date.now() - cached.at < 10 * 60000) { settings = { ...settings, ...cached.data }; return; }
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    if (snap.exists()) {
      const d = snap.data();
      settings = { ...settings, banner: d.banner || "", shopOpen: d.shopOpen !== false };
      store.set("tt_settings", { at: Date.now(), data: settings });
    }
  } catch (err) { console.error("settings", err); }
}
function applySettings() {
  const bar = $("#announce");
  if (!bar) return;
  const text = !shopOpen() ? "Orders are paused for now. You can still browse and chat with us." : settings.banner;
  bar.hidden = !text;
  $("#announce-text", bar).textContent = text || "";
}

/* ---------- Auth state -> UI ---------- */
function handleAuth(user) {
  buildMenu(user);
  const uid = user ? user.uid : null;
  if (uid !== lastUid) {
    lastUid = uid;
    if (uid) startUnread(uid); else stopUnread();
  }
}

/* Login से पहले का अधूरा काम (redirect-login के बाद page दोबारा खुलने पर) */
function resumePending() {
  const user = getUser();
  if (!user) return;
  const p = takePending();
  if (!p) return;
  if (p.type === "buy" && p.id) continueBuy(p.id);
  else if (p.type === "inbox") openInbox({ tab: p.tab, orderId: p.orderId });
  else if (p.type === "review") openWriteReview();
  else if (p.type === "custom") openCustomOrder();
}

/* ---------- Three-dot menu ---------- */
function bindMenu() {
  const btn = $("#menu-btn"), menu = $("#menu");
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  menu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-menu]");
    if (!item) return;
    close();
    const act = item.dataset.menu;
    if (act === "login") openLoginModal("Login or create your account with one tap.");
    else if (act === "logout") await logout();
    else if (act === "orders") openInbox({ tab: "orders" });
    else if (act === "help") openInbox({ tab: "help" });
    else if (act === "review") openWriteReview();
  });
}

/* Login है तो Logout, नहीं है तो Login / Sign up */
function buildMenu(user) {
  const menu = $("#menu"), avatar = $("#menu-avatar");
  if (!menu) return;
  const prof = getProfile() || {};
  if (user) {
    const name = prof.name || user.displayName || "Customer";
    const photo = prof.photoURL || user.photoURL;
    avatar.innerHTML = photo
      ? `<img src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer">`
      : `<span>${escapeHtml(initials(name))}</span>`;
    avatar.hidden = false;
    menu.innerHTML = `
      <div class="menu-user"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(user.email || "")}</span></div>
      <button type="button" role="menuitem" data-menu="orders">${ICONS.box}<span>My orders</span><i class="count-dot" data-unread-orders></i></button>
      <button type="button" role="menuitem" data-menu="help">${ICONS.help}<span>Help</span><i class="count-dot" data-unread-help></i></button>
      <button type="button" role="menuitem" data-menu="review">${ICONS.star}<span>Write a review</span></button>
      <a role="menuitem" href="contact.html">${ICONS.mail}<span>Contact us</span></a>
      <button type="button" role="menuitem" data-menu="logout" class="menu-danger">${ICONS.logout}<span>Logout</span></button>`;
  } else {
    avatar.hidden = true; avatar.innerHTML = "";
    menu.innerHTML = `
      <button type="button" role="menuitem" data-menu="login" class="menu-strong">${ICONS.login}<span>Login / Sign up</span></button>
      <button type="button" role="menuitem" data-menu="help">${ICONS.help}<span>Help</span></button>
      <a role="menuitem" href="#reviews">${ICONS.star}<span>Reviews</span></a>
      <a role="menuitem" href="contact.html">${ICONS.mail}<span>Contact us</span></a>`;
  }
  refreshDots(); // menu दोबारा बनने पर लाल dots फिर से दिखाओ
}

/* ---------- Page buttons ---------- */
function bindButtons() {
  $("#btn-write-review")?.addEventListener("click", openWriteReview);
  $("#btn-all-reviews")?.addEventListener("click", openAllReviews);
  $("#btn-custom")?.addEventListener("click", openCustomOrder);
  $("#btn-help")?.addEventListener("click", () => openInbox({ tab: "help" }));
}

/* ---------- Hidden admin: footer के copyright पर 1 सेकंड में 5 tap ---------- */
function bindAdminTrigger() {
  const el = $("#admin-trigger");
  if (!el) return;
  const taps = [];
  el.addEventListener("click", () => {
    const now = Date.now();
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length === 5 && now - taps[0] <= 1000) { taps.length = 0; openAdminGate(); }
  });
}

function openAdminGate() {
  const lock = store.get("tt_admin_lock", { fails: 0, until: 0 });
  if (lock.until > Date.now()) {
    toast(`Too many attempts. Try again in ${Math.ceil((lock.until - Date.now()) / 1000)} seconds.`, "error");
    return;
  }
  const m = openModal({
    title: "Admin access", size: "sm", className: "modal--gate",
    content: `<form class="gate-form" novalidate>
      <p class="muted">Enter the admin password to continue.</p>
      <label class="field"><span>Password</span>
        <span class="pw-wrap">
          <input type="password" autocomplete="current-password" required>
          <button type="button" class="pw-toggle" aria-label="Show password" aria-pressed="false">Show</button>
        </span>
      </label>
      <p class="form-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary btn-block">Unlock</button></form>`
  });
  const form = $("form", m.body), input = $("input", form), err = $(".form-error", form);
  // Password दिखाने / छुपाने वाला button
  const toggle = $(".pw-toggle", form);
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggle.setAttribute("aria-pressed", String(show));
    input.focus();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = input.value;
    if (!pw) return;
    // Firebase setup अधूरा हो तो पहले ही साफ़ बता दो (पहले यह सब "Incorrect password" दिखाता था)
    const setupProblem = checkAdminSetup();
    if (setupProblem) { err.textContent = setupProblem; err.hidden = false; return; }
    const btn = $("button[type=submit]", form); setLoading(btn, true, "Checking");
    const res = await adminSignIn(pw);
    setLoading(btn, false);
    if (res.ok) {
      store.set("tt_admin_lock", { fails: 0, until: 0 });
      m.close();
      try {
        const mod = await import("./admin.js");
        mod.mountAdmin();
      } catch (e2) { console.error(e2); toast("Could not open the admin panel.", "error"); }
      return;
    }
    if (res.network) { err.textContent = "No internet connection. Please try again."; err.hidden = false; return; }
    // Password के अलावा कोई और वजह हो (key, email, provider) तो असली वजह दिखाओ
    const reason = adminErrorText(res.code);
    if (reason) { err.textContent = reason; err.hidden = false; return; }
    const cur = store.get("tt_admin_lock", { fails: 0, until: 0 });
    const fails = (cur.fails || 0) + 1;
    if (fails >= 5) {
      store.set("tt_admin_lock", { fails: 0, until: Date.now() + 30000 });
      err.textContent = "Too many attempts. Try again in 30 seconds."; m.close();
    } else {
      store.set("tt_admin_lock", { fails, until: 0 });
      err.textContent = "Incorrect password" + (res.code ? ` (${res.code})` : "");
    }
    err.hidden = false; input.value = ""; input.focus();
    form.classList.remove("shake"); void form.offsetWidth; form.classList.add("shake");
  });
}

/* ---------- Admin login की जाँच ---------- */
// config.js में अभी भी "REPLACE_" वाली values हों तो यहीं पकड़ लेते हैं
function checkAdminSetup() {
  if (String(FIREBASE_CONFIG.apiKey).includes("REPLACE_") || String(FIREBASE_CONFIG.projectId).includes("REPLACE_")) {
    return "Firebase is not set up yet. Paste your Firebase keys in config.js.";
  }
  if (String(SITE.adminEmail).includes("REPLACE_")) {
    return "Admin email is not set. Put your Firebase admin email in config.js (adminEmail).";
  }
  return "";
}

// Firebase के error code को आसान English message में बदलता है.
// null लौटाए तो मतलब password ही गलत है.
function adminErrorText(code) {
  if (!code || ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/missing-password"].includes(code)) return null;
  const map = {
    "auth/invalid-api-key": "The Firebase API key in config.js is wrong.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase API key in config.js is wrong.",
    "auth/operation-not-allowed": "Email/Password login is not turned on in Firebase (Authentication > Sign-in method).",
    "auth/invalid-email": "The admin email in config.js is not a valid email.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/user-disabled": "This admin account is disabled in Firebase.",
    "auth/unauthorized-domain": "This website address is not allowed in Firebase (Authentication > Settings > Authorized domains).",
    "auth/internal-error": "Firebase returned an error. Check the Firebase keys in config.js."
  };
  return (map[code] || "Could not sign in.") + ` (${code})`;
}

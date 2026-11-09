/* ==========================================================================
   NFC Trust - auth.js
   Google login / sign up, email-link login (backup), logout, user profile और
   admin का password-login यहाँ है।

   नियम:
   - Website देखने के लिए login नहीं चाहिए।
   - Login popup सिर्फ़ तब आता है जब user order करे, chat खोले, help माँगे या review लिखे।
   - Sign up का अलग button नहीं है; Google से पहली बार login करते ही account बन जाता है।
   ========================================================================== */
import {
  auth, db, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, signInWithEmailAndPassword, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from "./firebase.js";
import { SITE } from "./config.js";
import { $, escapeHtml, maskEmail, store, session, copyText, inAppBrowserName, isAndroid, isValidEmail } from "./utils.js";
import { openModal, toast, setLoading, ICONS } from "./ui.js";

let rawUser = null;          // Firebase का user (admin भी हो सकता है)
let profile = null;          // users/{uid} document
let profileUnsub = null;
let adminActive = false;     // true तभी जब admin ने इसी page पर password डाला हो
let firstStateDone = false;
const listeners = new Set();
let loginWaiters = [];
let loginModalApi = null;

/* ---- helpers ---- */
function isAdminAccount(u) {
  return !!(u && u.email && u.email.toLowerCase() === String(SITE.adminEmail).toLowerCase()
    && u.providerData.some((p) => p.providerId === "password"));
}
export const getUser = () => (rawUser && !isAdminAccount(rawUser) ? rawUser : null);
export const getProfile = () => profile;
export const isBlocked = () => !!(profile && profile.blocked === true);
export const isAdminSession = () => !!(rawUser && isAdminAccount(rawUser) && adminActive);
export function onAuthChange(cb) {
  listeners.add(cb);
  if (firstStateDone) cb(getUser(), profile);
  return () => listeners.delete(cb);
}
function notify() { listeners.forEach((cb) => { try { cb(getUser(), profile); } catch (e) { console.error(e); } }); }

/* Login से पहले का अधूरा काम (जैसे Buy Now) save रखते हैं ताकि login के बाद अपने आप चालू हो */
export const takePending = () => { const p = session.get("tt_pending"); session.del("tt_pending"); return p; };

/* ---- start ---- */
export function initAuth() {
  return new Promise((resolve) => {
    handleEmailLinkReturn();
    getRedirectResult(auth).catch((err) => handleAuthError(err));

    onAuthStateChanged(auth, async (u) => {
      // Admin account हर नए page-load पर अपने आप logout हो जाता है (सुरक्षा के लिए)
      if (u && isAdminAccount(u) && !adminActive) { try { await signOut(auth); } catch (e) { /* ignore */ } return; }
      rawUser = u;

      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      profile = null;
      if (u && !isAdminAccount(u)) {
        await ensureProfile(u);
        profileUnsub = onSnapshot(doc(db, "users", u.uid), (snap) => {
          profile = snap.exists() ? snap.data() : null;
          notify();
        }, (err) => console.error("profile listener", err));
      }
      firstStateDone = true;
      notify();
      if (getUser()) flushWaiters(getUser());
      resolve();
    });
  });
}

/* पहली बार login पर users/{uid} बनाता है (Google से name, email, photo अपने आप आते हैं - कोई form नहीं) */
async function ensureProfile(u) {
  try {
    const ref = doc(db, "users", u.uid);
    const snap = await getDoc(ref);
    const name = String(u.displayName || (u.email || "Customer").split("@")[0]).slice(0, 60);
    const providerId = (u.providerData[0] && u.providerData[0].providerId) || "unknown";
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: u.uid, name, email: u.email || "", emailMasked: maskEmail(u.email),
        photoURL: u.photoURL || "", provider: providerId === "google.com" ? "google" : "emailLink",
        blocked: false, createdAt: serverTimestamp(), lastSeen: serverTimestamp()
      });
    } else if (!session.get("tt_seen")) {
      await updateDoc(ref, { lastSeen: serverTimestamp(), name, photoURL: u.photoURL || "" });
    }
    session.set("tt_seen", true);
  } catch (err) {
    console.error("ensureProfile", err);
    toast("Could not load your profile. Please check your connection and try again.", "error");
  }
}

/* ---- Login waiters ---- */
function flushWaiters(value) {
  const w = loginWaiters; loginWaiters = [];
  if (value && w.length) session.del("tt_pending"); // popup login सफल: काम अभी चलेगा, बाद में दोबारा resume नहीं होना चाहिए
  w.forEach((fn) => fn(value));
  if (value && loginModalApi) loginModalApi.close();
}

/* कोई भी काम जिसमें login चाहिए, उससे पहले ये चलाएँ.
   अगर user login है तो सीधा user मिलता है, नहीं तो login popup खुलता है। */
export function requireLogin(reason = "Please login to continue.", pending = null) {
  const u = getUser();
  if (u) return Promise.resolve(u);
  if (pending) session.set("tt_pending", pending);
  return new Promise((resolve) => { loginWaiters.push(resolve); openLoginModal(reason); });
}

/* ---- Login popup ---- */
export function openLoginModal(reason = "Please login to continue.") {
  if (loginModalApi) return;
  const app = inAppBrowserName();
  const emailOn = SITE.enableEmailLinkLogin;

  const html = `
    <div class="login">
      <p class="login-reason">${escapeHtml(reason)}</p>
      ${app ? `<div class="notice notice--warn" id="inapp-notice">
        <strong>You are using the ${escapeHtml(app)} browser.</strong>
        <p>For secure login, open this page in Chrome or Safari. Google blocks login inside ${escapeHtml(app)}.</p>
        <div class="notice-actions">
          <button type="button" class="btn btn-small btn-primary" id="open-browser">Open in browser</button>
          <button type="button" class="btn btn-small btn-ghost" id="copy-link">Copy link</button>
        </div>
        ${isAndroid() ? "" : `<p class="notice-hint">On iPhone: tap the <b>⋯</b> menu, then choose <b>Open in Safari</b>.</p>`}
      </div>` : ""}
      <button type="button" class="btn btn-google btn-block" id="login-google">${ICONS.google}<span>Continue with Google</span></button>
      ${emailOn ? `
        <div class="divider"><span>or</span></div>
        <button type="button" class="btn btn-ghost btn-block" id="email-toggle">${ICONS.mail}<span>Continue with email link</span></button>
        <form id="email-form" class="email-form" hidden novalidate>
          <label class="field"><span>Your email</span>
            <input type="email" id="login-email" autocomplete="email" inputmode="email" placeholder="you@example.com" required>
          </label>
          <button type="submit" class="btn btn-primary btn-block">Send login link</button>
          <p class="fineprint" id="email-msg" aria-live="polite"></p>
        </form>` : ""}
      <p class="fineprint">New here? Logging in with Google creates your account automatically.<br>
      By continuing you agree to our <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.</p>
    </div>`;

  loginModalApi = openModal({
    title: "Login to NFC Trust", size: "sm", content: html,
    onClose: () => {
      loginModalApi = null;
      if (!getUser()) { flushWaiters(null); session.del("tt_pending"); }
    }
  });
  const root = loginModalApi.body;

  $("#login-google", root).addEventListener("click", async (e) => {
    const btn = e.currentTarget; setLoading(btn, true, "Opening Google");
    await googleLogin();
    setLoading(btn, false);
  });

  $("#open-browser", root)?.addEventListener("click", () => {
    if (isAndroid()) {
      const u = new URL(location.href);
      location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
    } else {
      toast("Tap the ⋯ menu and choose Open in Safari.", "info", 5000);
    }
  });
  $("#copy-link", root)?.addEventListener("click", async () => {
    const ok = await copyText(location.href.split("#")[0]);
    toast(ok ? "Link copied. Paste it in Chrome or Safari." : "Could not copy the link.", ok ? "success" : "error");
  });

  if (emailOn) {
    const form = $("#email-form", root), toggle = $("#email-toggle", root), msg = $("#email-msg", root);
    toggle.addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) $("#login-email", root).focus(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#login-email", root).value.trim();
      if (!isValidEmail(email)) { msg.textContent = "Please enter a valid email address."; return; }
      const last = store.get("tt_link_sent_at", 0);
      if (Date.now() - last < 45000) { msg.textContent = "Please wait a few seconds before requesting another link."; return; }
      const btn = $("button[type=submit]", form); setLoading(btn, true, "Sending");
      try {
        await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
        store.set("tt_email_for_link", email); store.set("tt_link_sent_at", Date.now());
        msg.textContent = "Login link sent. Open your email and tap the link to continue.";
      } catch (err) { handleAuthError(err); msg.textContent = ""; }
      setLoading(btn, false);
    });
  }
}

/* ---- Google login: पहले popup, popup block हो तो redirect ---- */
async function googleLogin() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = err && err.code ? err.code : "";
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"].includes(code)) {
      try { await signInWithRedirect(auth, provider); } catch (e2) { handleAuthError(e2); }
      return;
    }
    handleAuthError(err);
  }
}

/* ---- Email link वापस आने पर login पूरा करना ---- */
async function handleEmailLinkReturn() {
  try {
    if (!SITE.enableEmailLinkLogin || !isSignInWithEmailLink(auth, location.href)) return;
    let email = store.get("tt_email_for_link");
    if (!email) email = window.prompt("Please confirm your email address to finish login.");
    if (!email) return;
    await signInWithEmailLink(auth, String(email).trim(), location.href);
    store.del("tt_email_for_link");
    history.replaceState({}, "", location.pathname);
    toast("You are logged in.", "success");
  } catch (err) { handleAuthError(err); }
}

/* ---- Error messages (सब English में) ---- */
function handleAuthError(err) {
  const code = (err && err.code) || "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
  console.error("auth error", err);
  const map = {
    "auth/unauthorized-domain": "This website address is not authorized in Firebase. Add it under Authentication > Settings > Authorized domains.",
    "auth/network-request-failed": "No internet connection. Please try again.",
    "auth/operation-not-allowed": "This login method is not enabled in Firebase yet.",
    "auth/invalid-action-code": "This login link has expired or was already used. Please request a new one.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/user-disabled": "This account has been disabled. Please contact us on Instagram."
  };
  toast(map[code] || "Login failed. Please try again.", "error", 5200);
}

/* ---- Logout ---- */
export async function logout() {
  try { await signOut(auth); } catch (e) { console.error(e); }
  session.del("tt_seen"); session.del("tt_pending");
  toast("You have been logged out.", "success");
}

/* ---- Admin ---- */
export async function adminSignIn(password) {
  adminActive = true;
  try {
    await signInWithEmailAndPassword(auth, SITE.adminEmail, password);
    return { ok: true };
  } catch (err) {
    adminActive = false;
    const code = (err && err.code) || "";
    if (code === "auth/network-request-failed") return { ok: false, network: true };
    return { ok: false, code };
  }
}
export async function adminSignOut() {
  adminActive = false;
  try { await signOut(auth); } catch (e) { /* ignore */ }
}

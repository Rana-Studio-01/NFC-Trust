/* ==========================================================================
   NFC Trust - utils.js
   छोटे-छोटे helper functions जो पूरी website में इस्तेमाल होते हैं।
   ========================================================================== */
import { SITE } from "./config.js";

/* ---- DOM shortcuts ---- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* user का लिखा text HTML में डालने से पहले हमेशा escape करना ज़रूरी है (सुरक्षा के लिए) */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Text में मौजूद http/https links को clickable बनाता है (नए tab में खुलते हैं) */
export function linkify(text) {
  const safe = escapeHtml(text);
  return safe
    .replace(/(https?:\/\/[^\s<]+)/g, (match) => {
      let url = match, trail = "";
      while (/[).,!?;:]$/.test(url)) { trail = url.slice(-1) + trail; url = url.slice(0, -1); }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
    })
    .replace(/\n/g, "<br>");
}

/* ---- Money ---- */
export function formatPrice(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/* Payment rule:
   10 से कम cards  -> पूरा payment पहले
   10 या ज़्यादा   -> 50% advance, बाकी 50% shipping से पहले */
export function paymentPlan(totalQty, total) {
  if (totalQty >= SITE.bulkMinQty) {
    const advance = Math.round(total * SITE.advancePercent / 100);
    return { type: "bulk", advance, balance: total - advance };
  }
  return { type: "full", advance: total, balance: 0 };
}

/* ---- Email mask: sam.........@gmail.com ---- */
export function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at < 1) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at);
  return local.slice(0, 3) + ".........".slice(0, 9) + domain;
}

/* ---- Time ---- */
export function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number") return ts;
  return 0;
}
export function formatClock(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}
export function formatDay(ms) {
  if (!ms) return "";
  const d = new Date(ms), now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
export function formatDateTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}
export function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60); if (h < 24) return h + " hr ago";
  const d = Math.floor(h / 24); if (d < 30) return d + (d === 1 ? " day ago" : " days ago");
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ---- Validation ---- */
export function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (e) { return false; }
}
export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());
}

/* ---- Safe storage (Instagram browser में storage block हो तो भी crash नहीं होगा) ---- */
function makeStore(getter) {
  return {
    get(key, fallback = null) {
      try { const v = getter().getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) { try { getter().setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ } },
    del(key) { try { getter().removeItem(key); } catch (e) { /* ignore */ } }
  };
}
export const store = makeStore(() => window.localStorage);
export const session = makeStore(() => window.sessionStorage);

/* ---- Misc ---- */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function debounce(fn, wait = 200) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || "").join("").toUpperCase() || "?";
}
export function slugify(text) {
  return String(text).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || ("item-" + Date.now());
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}

/* Instagram / Facebook जैसे in-app browser पहचानने के लिए.
   इनमें Google login "disallowed_useragent" error देता है। */
export function inAppBrowserName() {
  const ua = navigator.userAgent || "";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/Line\//i.test(ua)) return "LINE";
  if (/MicroMessenger/i.test(ua)) return "WeChat";
  if (/Twitter/i.test(ua)) return "X";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  return "";
}
export const isAndroid = () => /Android/i.test(navigator.userAgent || "");

/* ---- Image compress: payment screenshot / design photo को छोटा करके base64 बनाता है.
   (Firebase Storage paid है, इसलिए image सीधे message document में ~150KB के अंदर रखते हैं) ---- */
export function compressImage(file, { maxSide = 900, maxBytes = 150000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Please choose an image file."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio)), h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let q = 0.8, out = canvas.toDataURL("image/jpeg", q);
        while (out.length * 0.75 > maxBytes && q > 0.3) { q -= 0.1; out = canvas.toDataURL("image/jpeg", q); }
        URL.revokeObjectURL(url);
        if (out.length * 0.75 > 220000) return reject(new Error("This image is too large. Please choose a smaller one."));
        resolve(out);
      } catch (e) { URL.revokeObjectURL(url); reject(new Error("Could not read this image.")); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image.")); };
    img.src = url;
  });
}

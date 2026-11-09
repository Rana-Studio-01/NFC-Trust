/* ==========================================================================
   Modal, toast, confirm popup, welcome popup और scroll animation यहाँ हैं।
   ========================================================================== */
import { $, $$, escapeHtml, session } from "./utils.js";

/* ---- Body scroll lock (कई modal एक साथ खुलें तो भी सही चले) ---- */
let lockCount = 0;
export function lockScroll() {
  lockCount++;
  document.documentElement.classList.add("no-scroll");
}
export function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.documentElement.classList.remove("no-scroll");
}

/* ---- Toast ---- */
export function toast(message, type = "info", ms = 3400) {
  const root = $("#toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast toast--" + type;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/* ---- Modal ----
   openModal({ title, content (HTML string या Node), size: 'sm'|'md'|'lg', onClose })
   return: { el, body, close } */
const modalStack = [];
export function openModal({ title = "", content = "", size = "md", closable = true, onClose = null, className = "" } = {}) {
  const root = $("#modal-root");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal modal--${size} ${className}" role="dialog" aria-modal="true" ${title ? `aria-label="${escapeHtml(title)}"` : ""}>
      ${title || closable ? `<header class="modal-head">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        ${closable ? `<button class="icon-btn modal-close" type="button" aria-label="Close">${ICONS.close}</button>` : ""}
      </header>` : ""}
      <div class="modal-body"></div>
    </div>`;
  const body = $(".modal-body", overlay);
  if (typeof content === "string") body.innerHTML = content; else if (content) body.appendChild(content);
  root.appendChild(overlay);
  lockScroll();
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  let closed = false;
  const api = {
    el: overlay, body,
    close() {
      if (closed) return;
      closed = true;
      overlay.classList.remove("is-open");
      const idx = modalStack.indexOf(api); if (idx > -1) modalStack.splice(idx, 1);
      unlockScroll();
      setTimeout(() => overlay.remove(), 260);
      if (typeof onClose === "function") onClose();
    }
  };
  modalStack.push(api);
  if (closable) {
    $(".modal-close", overlay)?.addEventListener("click", api.close);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) api.close(); });
  }
  api.closable = closable;
  const firstInput = $("input, textarea, select, button.btn-primary", body);
  if (firstInput && window.matchMedia("(min-width: 700px)").matches) setTimeout(() => firstInput.focus(), 120);
  return api;
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalStack.length) {
    const top = modalStack[modalStack.length - 1];
    if (top.closable) top.close();
  }
});

/* ---- Confirm popup ---- */
export function confirmDialog({ title = "Please confirm", message = "", confirmText = "Confirm", cancelText = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const m = openModal({
      title, size: "sm",
      content: `<p class="confirm-text">${message}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="no">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="yes">${escapeHtml(confirmText)}</button>
        </div>`,
      onClose: () => { if (!decided) { decided = true; resolve(false); } }
    });
    $('[data-act="yes"]', m.body).addEventListener("click", () => { decided = true; resolve(true); m.close(); });
    $('[data-act="no"]', m.body).addEventListener("click", () => { decided = true; resolve(false); m.close(); });
  });
}

/* ---- Button loading state ---- */
export function setLoading(btn, loading, label) {
  if (!btn) return;
  if (loading) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label || "Please wait")}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/* ---- Welcome popup: सिर्फ़ नया open करने पर 1-2 सेकंड के लिए, refresh पर दोबारा नहीं ---- */
export function showWelcome() {
  if (session.get("tt_welcomed")) return;
  session.set("tt_welcomed", true);
  const el = $("#welcome");
  if (!el) return;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    el.classList.add("is-out");
    setTimeout(() => { el.hidden = true; }, 500);
  }, 1900);
}

/* ---- Scroll reveal (हर section पर नहीं, सिर्फ़ data-reveal वाले elements पर) ---- */
export function initReveal() {
  const items = $$("[data-reveal]");
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((i) => i.classList.add("is-visible")); return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  items.forEach((i) => io.observe(i));
}

/* ---- Count up animation ---- */
export function countUp(el, to, duration = 1200) {
  if (!el) return;
  const target = Number(to) || 0;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target < 2) { el.textContent = target.toLocaleString("en-IN"); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased).toLocaleString("en-IN");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---- Star rating HTML ---- */
export function starsHtml(rating = 0, size = 16) {
  const r = Math.round(Number(rating) || 0);
  let out = `<span class="stars" style="--s:${size}px" aria-label="${r} out of 5 stars">`;
  for (let i = 1; i <= 5; i++) out += `<svg viewBox="0 0 24 24" class="star ${i <= r ? "on" : ""}" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`;
  return out + "</span>";
}

/* ---- Image lightbox ---- */
export function openImage(src) {
  const m = openModal({ title: "", size: "lg", className: "modal--image", content: `<img class="lightbox-img" alt="Attached image" src="${escapeHtml(src)}">` });
  return m;
}

/* ---- Icons (inline SVG, कोई external file नहीं) ---- */
export const ICONS = {
  close: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  send: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3.4 20.4l17.5-7.5a1 1 0 000-1.8L3.4 3.6a.9.9 0 00-1.3 1l2 6.2a.9.9 0 00.8.6l8.3 1.1-8.3 1.1a.9.9 0 00-.8.6l-2 6.2a.9.9 0 001.3 1z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  image: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  google: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8a6 6 0 010-12c1.9 0 3.2.8 3.9 1.5l2.7-2.6A9.9 9.9 0 0012 2a10 10 0 100 20c5.8 0 9.6-4 9.6-9.8 0-.7-.1-1.2-.2-1.8H12z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  insta: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12.04 2a9.9 9.9 0 00-8.5 15l-1.5 5.4 5.5-1.4A9.9 9.9 0 1012.04 2zm5.8 14.1c-.25.7-1.4 1.3-1.95 1.35-.5.05-1.1.07-1.8-.12a11 11 0 01-4.3-2.4 8.6 8.6 0 01-2.1-3.3c-.4-1.1.1-2 .5-2.4.2-.2.4-.3.6-.3h.4c.15 0 .35 0 .5.4l.75 1.8c.05.15.1.3 0 .45l-.3.4-.35.35c-.1.1-.2.25-.1.45a6.3 6.3 0 001.7 2.1 7 7 0 002 1.25c.2.1.35.1.45 0l.7-.85c.15-.2.3-.15.5-.1l1.7.8c.2.1.35.15.4.25.1.2.1.8-.15 1.4z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>`,
  box: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>`,
  help: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.3M12 17.2v.1"/></svg>`,
  star: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`,
  login: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 8l-4 4 4 4M6 12h11"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6h11v10H2zM13 9h4l4 3v4h-8"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>`
};

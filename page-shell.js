/* ==========================================================================
   NFC Trust - page-shell.js
   Policy pages (Terms, Privacy, Contact ...) के लिए छोटा script।
   Instagram / WhatsApp link और साल config.js से भरता है, इसलिए हर page में अलग से कुछ बदलना नहीं पड़ता।
   ========================================================================== */
import { SITE } from "./config.js";

document.querySelectorAll("[data-insta]").forEach((a) => { a.href = SITE.instagramUrl; a.target = "_blank"; a.rel = "noopener noreferrer"; });
document.querySelectorAll("[data-wa]").forEach((a) => { a.href = SITE.whatsappUrl; a.target = "_blank"; a.rel = "noopener noreferrer"; });
document.querySelectorAll("[data-handle]").forEach((el) => { el.textContent = "@" + SITE.instagramHandle; });
document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
document.querySelectorAll("[data-warranty]").forEach((el) => { el.textContent = SITE.warrantyYears; });
document.querySelectorAll("[data-bulk]").forEach((el) => { el.textContent = SITE.bulkMinQty; });
document.querySelectorAll("[data-advance]").forEach((el) => { el.textContent = SITE.advancePercent; });

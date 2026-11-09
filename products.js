/* ==========================================================================
   NFC Trust - products.js
   Products की list अब index.html के <template id="product-catalog"> में लिखी जाती है।
   नया card जोड़ना हो तो वहीं एक नई "p-def" line जोड़ें (index.html में समझाया हुआ है)।

   Admin panel से सिर्फ़ ये बदलते हैं (Firestore "products" में सेव होता है):
   title, old price, new price, warranty और stock (In stock / Out of stock).
   Offer % अपने आप निकलता है: (old - new) / old x 100.
   Bulk line (जैसे "Order 20+ cards: ₹100 each") index.html के data-bulk-line से आती है और warranty के ऊपर दिखती है.

   हर card के photos (जैसे card1.png, card2.png) अपने आप left की तरफ़ सरकते रहते हैं।
   ========================================================================== */
import { db, collection, getDocs } from "./firebase.js";
import { SITE } from "./config.js";
import { $, $$, escapeHtml, formatPrice, store } from "./utils.js";
import { openModal, ICONS } from "./ui.js";

let products = [];
let filter = "all";
let sortBy = "featured";
let onBuyCb = null;
let artCounter = 0;
const CACHE_KEY = "tt_overrides_v2";

export const getProducts = () => products;
export const getProductById = (id) => products.find((p) => p.id === id);

/* Offer % = (पुराना - नया) / पुराना x 100. पुराना price नया से ज़्यादा न हो तो offer नहीं दिखता */
export function offerPercent(oldPrice, price) {
  const o = Number(oldPrice), p = Number(price);
  if (o > p && p > 0) return Math.round(((o - p) / o) * 100);
  return 0;
}

/* ---- index.html की <template id="product-catalog"> से products पढ़ना ---- */
function readCatalog() {
  const tpl = document.getElementById("product-catalog");
  if (!tpl) return [];
  return Array.from(tpl.content.querySelectorAll(".p-def")).map((el, i) => {
    const d = el.dataset;
    const images = String(d.images || "").split(",").map((s) => s.trim()).filter(Boolean);
    return {
      id: String(d.id || ""), name: d.name || "NFC Card", category: d.category || "cards", style: d.style || "classic",
      price: Number(d.price) || 0, oldPrice: Number(d.oldPrice) || 0,
      warranty: d.warranty || `${SITE.warrantyYears}-year warranty`,
      short: d.short || "", desc: d.desc || "", bulkLine: d.bulkLine || "", images, imageUrl: images[0] || "",
      order: i + 1, stock: true
    };
  }).filter((p) => p.id);
}

/* Admin के बदलाव (Firestore) को HTML वाली list के ऊपर लगाना */
function merge(base, over) {
  return base.map((p) => {
    const o = over[p.id];
    if (!o) return p;
    return {
      ...p,
      name: o.name ? String(o.name) : p.name,
      price: Number(o.price) > 0 ? Number(o.price) : p.price,
      oldPrice: o.oldPrice !== undefined ? (Number(o.oldPrice) || 0) : p.oldPrice,
      warranty: o.warranty ? String(o.warranty) : p.warranty,
      stock: o.stock !== false
    };
  });
}

/* पहले cache (तुरंत दिखाने के लिए), फिर Firestore (reads बचाने के लिए 10 मिनट cache) */
export async function loadProducts(force = false) {
  const base = readCatalog();
  const cached = store.get(CACHE_KEY);
  const fresh = cached && cached.over && (Date.now() - cached.at) < SITE.productsCacheMinutes * 60000;
  products = merge(base, cached && cached.over ? cached.over : {});
  if (fresh && !force) return products;
  try {
    const snap = await getDocs(collection(db, "products"));
    const over = {};
    snap.docs.forEach((d) => { over[d.id] = d.data(); });
    store.set(CACHE_KEY, { at: Date.now(), over });
    products = merge(base, over);
  } catch (err) {
    console.error("products load", err); // rules/नेट की दिक्कत हो तो HTML वाली list चलती रहेगी
  }
  return products;
}
export function clearProductsCache() { store.del(CACHE_KEY); }

/* ---- Card artwork (SVG). हर बार unique gradient id बनती है ताकि कई cards एक साथ सही दिखें ---- */
export function cardArt(p) {
  if (p.imageUrl) {
    return `<img class="art-img" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">`;
  }
  const id = "g" + (++artCounter);
  const waves = (x, y, c) => `<g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity=".9">
      <path d="M${x} ${y - 10}a14 14 0 010 20"/><path d="M${x + 9} ${y - 17}a24 24 0 010 34"/><path d="M${x + 18} ${y - 24}a34 34 0 010 48"/></g>`;
  const chip = (x, y, c1, c2) => `<rect x="${x}" y="${y}" width="40" height="30" rx="6" fill="url(#${id}c)"/>
      <path d="M${x + 13} ${y}v30M${x + 27} ${y}v30M${x} ${y + 10}h40M${x} ${y + 20}h40" stroke="${c2}" stroke-width="1.2" opacity=".55"/>`;
  const defs = (a, b, chipA = "#FFE27A", chipB = "#C8940A") =>
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
     <linearGradient id="${id}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${chipA}"/><stop offset="1" stop-color="${chipB}"/></linearGradient></defs>`;
  const label = escapeHtml(p.name.length > 26 ? p.name.slice(0, 25) + "…" : p.name);
  const frame = (inner) => `<svg class="art" viewBox="0 0 320 200" role="img" aria-label="${escapeHtml(p.name)}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

  switch (p.style) {
    case "matte":
      return frame(`${defs("#1c1c1e", "#050505")}
        <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#${id})" stroke="#FFC400" stroke-opacity=".5"/>
        <rect x="8" y="150" width="304" height="3" fill="#FFC400" opacity=".7"/>
        ${chip(30, 34, "", "#7a5a00")}${waves(262, 100, "#FFC400")}
        <text x="30" y="128" fill="#fff" font-family="Sora,sans-serif" font-weight="700" font-size="17">NFC Trust</text>
        <text x="30" y="176" fill="#FFC400" font-family="Manrope,sans-serif" font-size="11" letter-spacing="2">PREMIUM MATTE</text>`);
    case "metal":
      return frame(`${defs("#e8e8ea", "#6c6c72", "#FFE27A", "#C8940A")}
        <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#${id})"/>
        ${Array.from({ length: 16 }, (_, i) => `<path d="M8 ${20 + i * 11}h304" stroke="#fff" stroke-opacity=".14"/>`).join("")}
        ${chip(30, 34, "", "#7a5a00")}${waves(262, 100, "#2b2b2e")}
        <text x="30" y="128" fill="#1a1a1c" font-family="Sora,sans-serif" font-weight="700" font-size="17">YOUR NAME</text>
        <text x="30" y="176" fill="#2b2b2e" font-family="Manrope,sans-serif" font-size="11" letter-spacing="2">LASER ENGRAVED</text>`);
    case "wood":
      return frame(`${defs("#b07a45", "#6b4423", "#FFE27A", "#C8940A")}
        <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#${id})"/>
        ${Array.from({ length: 12 }, (_, i) => `<path d="M8 ${24 + i * 14}c60 -8 120 8 180 0s90 -6 124 2" fill="none" stroke="#3b2310" stroke-opacity=".28" stroke-width="1.4"/>`).join("")}
        ${chip(30, 34, "", "#7a5a00")}${waves(262, 100, "#2a1808")}
        <text x="30" y="128" fill="#2a1808" font-family="Sora,sans-serif" font-weight="700" font-size="17">NFC Trust</text>
        <text x="30" y="176" fill="#2a1808" font-family="Manrope,sans-serif" font-size="11" letter-spacing="2">NATURAL WOOD</text>`);
    case "sticker":
      return frame(`${defs("#FFD84D", "#FFB300")}
        <circle cx="160" cy="100" r="86" fill="url(#${id})"/>
        <circle cx="160" cy="100" r="86" fill="none" stroke="#050505" stroke-opacity=".25" stroke-width="2" stroke-dasharray="3 6"/>
        <circle cx="160" cy="100" r="52" fill="#050505"/>
        ${waves(142, 100, "#FFC400")}`);
    case "stand":
      return frame(`${defs("#ffffff", "#9aa0ab")}
        <path d="M92 188h136l-10-18H102z" fill="#2a2a2e"/>
        <rect x="82" y="26" width="156" height="148" rx="14" fill="url(#${id})" opacity=".22" stroke="#fff" stroke-opacity=".6"/>
        <rect x="96" y="40" width="128" height="120" rx="10" fill="#0e0e10" stroke="#FFC400" stroke-opacity=".6"/>
        <g fill="#fff">${[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => ((r * 7 + c * 3) % 3 !== 0 ? `<rect x="${114 + c * 18}" y="${54 + r * 18}" width="12" height="12" rx="2"/>` : "")).join("")).join("")}</g>
        ${waves(224, 100, "#FFC400")}
        <text x="160" y="22" text-anchor="middle" fill="#FFC400" font-family="Manrope,sans-serif" font-size="11" letter-spacing="2">TAP OR SCAN</text>`);
    case "review":
      return frame(`${defs("#fff8dc", "#FFD84D")}
        <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#${id})"/>
        ${[0, 1, 2, 3, 4].map((i) => `<path transform="translate(${34 + i * 34} 36) scale(1.15)" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#E8A700"/>`).join("")}
        <text x="30" y="108" fill="#1a1a1c" font-family="Sora,sans-serif" font-weight="700" font-size="20">Loved it? Tap to</text>
        <text x="30" y="134" fill="#1a1a1c" font-family="Sora,sans-serif" font-weight="700" font-size="20">leave a review</text>
        ${chip(30, 150, "", "#7a5a00")}${waves(262, 100, "#1a1a1c")}`);
    case "upi":
      return frame(`${defs("#17171a", "#050505")}
        <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#${id})" stroke="#FFC400" stroke-opacity=".45"/>
        <circle cx="64" cy="70" r="30" fill="#FFC400"/>
        <text x="64" y="82" text-anchor="middle" fill="#050505" font-family="Sora,sans-serif" font-weight="800" font-size="34">₹</text>
        <text x="30" y="132" fill="#fff" font-family="Sora,sans-serif" font-weight="700" font-size="19">Tap to pay</text>
        <text x="30" y="160" fill="#a3a3ab" font-family="Manrope,sans-serif" font-size="12">Works with any UPI app</text>
        ${waves(262, 100, "#FFC400")}`);
    case "custom":
      return frame(`${defs("#1a1a1d", "#08080a")}
        <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#${id})" stroke="#FFC400" stroke-width="2" stroke-dasharray="8 7"/>
        <circle cx="160" cy="84" r="26" fill="#FFC400"/>
        <path d="M160 70v28M146 84h28" stroke="#050505" stroke-width="5" stroke-linecap="round"/>
        <text x="160" y="140" text-anchor="middle" fill="#fff" font-family="Sora,sans-serif" font-weight="700" font-size="17">Your design</text>
        <text x="160" y="164" text-anchor="middle" fill="#a3a3ab" font-family="Manrope,sans-serif" font-size="12">Your logo, your link</text>`);
    default: // classic
      return frame(`${defs("#222226", "#0a0a0b")}
        <rect x="8" y="8" width="304" height="184" rx="18" fill="url(#${id})" stroke="#FFC400" stroke-opacity=".4"/>
        <path d="M8 150h304v24a18 18 0 01-18 18H26a18 18 0 01-18-18z" fill="#FFC400"/>
        ${chip(30, 34, "", "#7a5a00")}${waves(262, 100, "#FFC400")}
        <text x="30" y="128" fill="#fff" font-family="Sora,sans-serif" font-weight="700" font-size="18">${label}</text>
        <text x="30" y="176" fill="#050505" font-family="Manrope,sans-serif" font-weight="700" font-size="12" letter-spacing="1.5">NFC TRUST</text>`);
  }
}

/* ---- Slider (हर card के photos अपने आप left की तरफ़ सरकते हैं) ---- */
function slidesHtml(p) {
  if (!p.images.length) return `<div class="slide">${cardArt({ ...p, imageUrl: "" })}</div>`;
  return p.images.map((src) => `<div class="slide"><img class="art-img" src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async" data-fallback></div>`).join("");
}
function sliderHtml(p) {
  const many = p.images.length > 1;
  return `<div class="slider"><div class="slides">${slidesHtml(p)}</div>${many ? `<div class="dots" aria-hidden="true">${p.images.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>` : ""}</div>`;
}

/* Photo न मिले तो drawn card दिखा देते हैं (कभी खाली जगह नहीं दिखेगी) */
function bindImageFallback(root) {
  $$("img[data-fallback]", root).forEach((img) => {
    img.addEventListener("error", () => {
      const id = img.closest("[data-id]")?.dataset.id;
      const p = getProductById(id);
      const slide = img.closest(".slide");
      if (p && slide) slide.innerHTML = cardArt({ ...p, imageUrl: "" });
    }, { once: true });
  });
}

function initSliders(root) {
  root._gen = (root._gen || 0) + 1;      // पुराने timers अपने आप बंद हो जाते हैं
  const gen = root._gen;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $$(".slider", root).forEach((sl) => {
    const track = $(".slides", sl), slides = $$(".slide", sl), dots = $$(".dots i", sl);
    if (slides.length < 2) return;
    let idx = 0, paused = false, visible = true, resumeT = null;
    const go = (i) => { idx = (i + slides.length) % slides.length; track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" }); };
    track.addEventListener("scroll", () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      idx = i; dots.forEach((d, k) => d.classList.toggle("on", k === i));
    }, { passive: true });
    const pause = () => { paused = true; clearTimeout(resumeT); resumeT = setTimeout(() => { paused = false; }, 5000); };
    track.addEventListener("pointerdown", pause);
    track.addEventListener("touchstart", pause, { passive: true });
    sl.addEventListener("mouseenter", () => { paused = true; });
    sl.addEventListener("mouseleave", () => { paused = false; });
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.3 }).observe(sl);
    if (reduce) return;
    setTimeout(() => {
      const h = setInterval(() => {
        if (gen !== root._gen || !document.body.contains(sl)) { clearInterval(h); return; }
        if (paused || !visible || document.hidden) return;
        go(idx + 1);
      }, 2000);
    }, Math.random() * 1200);
  });
}

function priceHtml(p) {
  const off = offerPercent(p.oldPrice, p.price);
  return `<div class="product-price"><strong>${formatPrice(p.price)}</strong>${off ? `<s>${formatPrice(p.oldPrice)}</s><span class="off">${off}% off</span>` : ""}</div>`;
}

/* ---- Shop grid ---- */
export function renderShop({ onBuy, shopOpen = true }) {
  onBuyCb = onBuy;
  const grid = $("#shop-grid");
  if (!grid) return;

  let list = products.filter((p) => filter === "all" || p.category === filter);
  if (sortBy === "low") list = [...list].sort((a, b) => a.price - b.price);
  if (sortBy === "high") list = [...list].sort((a, b) => b.price - a.price);

  if (!list.length) { grid.innerHTML = `<p class="empty">No products in this category yet.</p>`; return; }

  grid.innerHTML = list.map((p) => {
    const off = offerPercent(p.oldPrice, p.price);
    return `<article class="product ${p.stock ? "" : "is-soldout"}" data-id="${escapeHtml(p.id)}">
      <div class="product-media" data-act="details" role="button" tabindex="0" aria-label="View details of ${escapeHtml(p.name)}">
        ${sliderHtml(p)}
        ${off ? `<span class="chip chip--yellow offer-chip">${off}% OFF</span>` : ""}
        ${p.stock ? "" : `<span class="soldout-tag">Out of stock</span>`}
      </div>
      <div class="product-info">
        <h3 class="product-name">${escapeHtml(p.name)}</h3>
        <p class="product-short">${escapeHtml(p.short)}</p>
        ${priceHtml(p)}
        ${p.bulkLine ? `<p class="product-bulk">${escapeHtml(p.bulkLine)}</p>` : ""}
        <p class="product-warranty">${ICONS.check}<span>${escapeHtml(p.warranty)}</span></p>
        <div class="product-actions">
          <button type="button" class="btn btn-primary" data-act="buy" ${p.stock && shopOpen ? "" : "disabled"}>${p.stock ? "Buy now" : "Out of stock"}</button>
          <button type="button" class="btn btn-ghost" data-act="details">Details</button>
        </div>
      </div>
    </article>`;
  }).join("");
  bindImageFallback(grid);
  initSliders(grid);
}

/* Filter / sort / click events एक बार जोड़ते हैं */
export function bindShopControls(getShopOpen) {
  $$("#shop-filters [data-filter]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    $$("#shop-filters [data-filter]").forEach((x) => x.classList.toggle("is-active", x === b));
    renderShop({ onBuy: onBuyCb, shopOpen: getShopOpen() });
  }));
  $("#shop-sort")?.addEventListener("change", (e) => {
    sortBy = e.target.value;
    renderShop({ onBuy: onBuyCb, shopOpen: getShopOpen() });
  });
  $("#shop-grid")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const id = btn.closest(".product")?.dataset.id;
    if (!id) return;
    if (btn.dataset.act === "details") openDetails(id, getShopOpen());
    if (btn.dataset.act === "buy" && onBuyCb) onBuyCb(id);
  });
  $("#shop-grid")?.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".product-media")) {
      e.preventDefault(); const id = e.target.closest(".product")?.dataset.id; if (id) openDetails(id, getShopOpen());
    }
  });
}

/* ---- Details popup ---- */
export function openDetails(id, shopOpen = true) {
  const p = getProductById(id);
  if (!p) return;
  const off = offerPercent(p.oldPrice, p.price);
  const m = openModal({
    title: p.name, size: "lg", className: "modal--product",
    content: `<div class="detail" data-id="${escapeHtml(p.id)}">
      <div class="detail-art product-media">${sliderHtml(p)}${off ? `<span class="chip chip--yellow offer-chip">${off}% OFF</span>` : ""}${p.stock ? "" : `<span class="soldout-tag">Out of stock</span>`}</div>
      <div class="detail-info">
        ${p.desc || p.short ? `<p class="detail-desc">${escapeHtml(p.desc || p.short)}</p>` : ""}
        ${priceHtml(p)}
        <ul class="tick-list">
          ${p.bulkLine ? `<li>${ICONS.check}<span><strong class="bulk-text">${escapeHtml(p.bulkLine)}</strong></span></li>` : ""}
          <li>${ICONS.check}<span>${escapeHtml(p.warranty)}</span></li>
          <li>${ICONS.check}<span>Works with Android and iPhone. No app needed.</span></li>
          <li>${ICONS.check}<span>Full payment first for fewer than ${SITE.bulkMinQty} cards. ${SITE.advancePercent}% advance for ${SITE.bulkMinQty} or more.</span></li>
          <li>${ICONS.check}<span>Shipped by India Post. We share the tracking ID in your order chat.</span></li>
        </ul>
        <button type="button" class="btn btn-primary btn-block" id="detail-buy" ${p.stock && shopOpen ? "" : "disabled"}>${p.stock ? "Buy now" : "Out of stock"}</button>
      </div>
    </div>`
  });
  bindImageFallback(m.body);
  initSliders(m.body);
  $("#detail-buy", m.body)?.addEventListener("click", () => { m.close(); if (onBuyCb) onBuyCb(p.id); });
}

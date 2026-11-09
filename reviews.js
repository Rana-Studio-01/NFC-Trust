/* ==========================================================================
   NFC Trust - reviews.js
   - Home page पर सिर्फ़ latest 3 reviews (3 reads)
   - "View all reviews" में 10-10 करके और reviews
   - Review लिखने के लिए login ज़रूरी; public में सिर्फ़ masked email दिखता है (sam.........@gmail.com)
   - Average rating Firestore के aggregate query से आता है (बहुत सस्ता)
   ========================================================================== */
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, orderBy, limit, startAfter,
  serverTimestamp, getAggregateFromServer, count, average
} from "./firebase.js";
import { $, escapeHtml, formatDay, toMs, initials, maskEmail } from "./utils.js";
import { openModal, toast, setLoading, starsHtml, countUp } from "./ui.js";
import { requireLogin, getUser, getProfile, isBlocked } from "./auth.js";

export function reviewCard(r) {
  const t = toMs(r.createdAt);
  const avatar = r.photoURL
    ? `<img class="avatar" src="${escapeHtml(r.photoURL)}" alt="" referrerpolicy="no-referrer" loading="lazy">`
    : `<span class="avatar avatar--text" aria-hidden="true">${escapeHtml(initials(r.name))}</span>`;
  return `<article class="review">
    <header class="review-head">${avatar}
      <div class="review-who"><strong>${escapeHtml(r.name || "Customer")}</strong><span>${escapeHtml(r.emailMasked || "")}</span></div>
      ${starsHtml(r.rating, 16)}
    </header>
    <p class="review-text">${escapeHtml(r.text)}</p>
    <time class="review-date">${escapeHtml(formatDay(t))}</time>
  </article>`;
}

/* ---- Home page: latest 3 ---- */
export async function loadReviewsPreview() {
  const box = $("#reviews-list");
  if (!box) return;
  try {
    const snap = await getDocs(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(3)));
    if (snap.empty) {
      box.innerHTML = `<div class="empty-state empty-state--inline"><h3>No reviews yet</h3><p>Be the first to share your experience with NFC Trust.</p></div>`;
      return;
    }
    box.innerHTML = snap.docs.map((d) => reviewCard(d.data())).join("");
  } catch (err) {
    console.error("reviews preview", err);
    box.innerHTML = `<div class="empty-state empty-state--inline"><p>Reviews could not be loaded right now.</p></div>`;
  }
}

/* ---- Average rating + total count (top bar और reviews section) ---- */
export async function loadRatingSummary() {
  try {
    const snap = await getAggregateFromServer(collection(db, "reviews"), { total: count(), avg: average("rating") });
    const total = snap.data().total || 0;
    const avg = snap.data().avg;
    const pill = $("#rating-pill");
    if (pill) {
      pill.hidden = total === 0;
      $("#rating-avg", pill).textContent = avg ? avg.toFixed(1) : "0.0";
      $("#rating-count", pill).textContent = total.toLocaleString("en-IN");
    }
    const big = $("#reviews-avg");
    if (big) { big.textContent = total ? avg.toFixed(1) : "–"; }
    const sub = $("#reviews-total");
    if (sub) sub.textContent = total ? `${total.toLocaleString("en-IN")} ${total === 1 ? "review" : "reviews"}` : "No reviews yet";
    const stars = $("#reviews-stars");
    if (stars) stars.innerHTML = starsHtml(avg || 0, 20);
  } catch (err) { console.error("rating summary", err); }
}

/* ---- View all ---- */
export function openAllReviews() {
  const m = openModal({
    title: "All reviews", size: "lg",
    content: `<div class="reviews-all"><div class="reviews-grid" id="all-reviews"></div>
      <div class="center"><button type="button" class="btn btn-ghost" id="more-reviews">Load more</button></div></div>`
  });
  const list = $("#all-reviews", m.body), more = $("#more-reviews", m.body);
  let last = null, done = false, loading = false;
  async function loadPage() {
    if (loading || done) return;
    loading = true; setLoading(more, true, "Loading");
    try {
      const q = last
        ? query(collection(db, "reviews"), orderBy("createdAt", "desc"), startAfter(last), limit(10))
        : query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(10));
      const snap = await getDocs(q);
      list.insertAdjacentHTML("beforeend", snap.docs.map((d) => reviewCard(d.data())).join(""));
      if (snap.docs.length) last = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < 10) { done = true; more.hidden = true; }
      if (!list.children.length) list.innerHTML = `<p class="empty">No reviews yet.</p>`;
    } catch (err) { console.error(err); toast("Could not load reviews. Please try again.", "error"); }
    loading = false; setLoading(more, false);
  }
  more.addEventListener("click", loadPage);
  loadPage();
}

/* ---- Write a review ---- */
export async function openWriteReview() {
  const u = await requireLogin("Please login to write a review.", { type: "review" });
  if (!u) return;
  if (isBlocked()) { toast("Your access to chat has been restricted. Contact us on Instagram.", "error"); return; }

  let existing = null;
  try { const s = await getDoc(doc(db, "reviews", u.uid)); if (s.exists()) existing = s.data(); } catch (e) { /* ignore */ }

  let rating = existing ? Number(existing.rating) : 0;
  const m = openModal({
    title: existing ? "Edit your review" : "Write a review", size: "sm",
    content: `<form class="review-form" novalidate>
      <p class="muted">Your name and a hidden version of your email (like sam.........@gmail.com) will be shown with your review.</p>
      <div class="rate-input" role="radiogroup" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" class="rate-star" data-r="${n}" aria-checked="false" aria-label="${n} star${n > 1 ? "s" : ""}">
          <svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg></button>`).join("")}
      </div>
      <label class="field"><span>Your review</span>
        <textarea rows="4" maxlength="400" placeholder="Tell others about your card and our service (10 to 400 characters)">${escapeHtml(existing ? existing.text : "")}</textarea>
      </label>
      <p class="fineprint"><span id="rv-count">0</span>/400</p>
      <p class="form-error" id="rv-error" role="alert" hidden></p>
      <div class="modal-actions">
        ${existing ? `<button type="button" class="btn btn-ghost" id="rv-delete">Delete</button>` : ""}
        <button type="submit" class="btn btn-primary">${existing ? "Update review" : "Post review"}</button>
      </div></form>`
  });
  const form = $("form", m.body), ta = $("textarea", form), err = $("#rv-error", form), counter = $("#rv-count", form);
  const stars = Array.from(form.querySelectorAll(".rate-star"));
  const paint = () => stars.forEach((s) => { const on = Number(s.dataset.r) <= rating; s.classList.toggle("on", on); s.setAttribute("aria-checked", String(Number(s.dataset.r) === rating)); });
  stars.forEach((s) => s.addEventListener("click", () => { rating = Number(s.dataset.r); paint(); }));
  const upd = () => { counter.textContent = ta.value.length; };
  ta.addEventListener("input", upd); upd(); paint();

  $("#rv-delete", form)?.addEventListener("click", async () => {
    try { await deleteDoc(doc(db, "reviews", u.uid)); toast("Your review was deleted.", "success"); m.close(); loadReviewsPreview(); loadRatingSummary(); }
    catch (e) { toast("Something went wrong. Please try again.", "error"); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    err.hidden = true;
    if (!rating) { err.textContent = "Please select a star rating."; err.hidden = false; return; }
    if (text.length < 10) { err.textContent = "Please write at least 10 characters."; err.hidden = false; return; }
    const btn = $("button[type=submit]", form); setLoading(btn, true, "Posting");
    try {
      const prof = getProfile() || {};
      await setDoc(doc(db, "reviews", u.uid), {
        uid: u.uid, name: (prof.name || u.displayName || "Customer").slice(0, 60),
        emailMasked: prof.emailMasked || maskEmail(u.email), photoURL: prof.photoURL || u.photoURL || "",
        rating, text, createdAt: serverTimestamp()
      });
      toast("Thanks! Your review is live.", "success");
      m.close(); loadReviewsPreview(); loadRatingSummary();
    } catch (e2) {
      console.error(e2);
      err.textContent = "We could not post your review. Please try again."; err.hidden = false;
    }
    setLoading(btn, false);
  });
}

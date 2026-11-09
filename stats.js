/* ==========================================================================
   NFC Trust - stats.js
   Live visitor counter। हर नया browser सिर्फ़ एक बार गिना जाता है।
   Reads बचाने के लिए listener नहीं लगाया; हर 2 मिनट में एक बार नया number लाते हैं।
   ========================================================================== */
import { db, doc, getDoc, setDoc, updateDoc, increment } from "./firebase.js";
import { $, store } from "./utils.js";
import { countUp } from "./ui.js";

let shown = false;

function show(n) {
  const el = $("#visit-count");
  if (!el) return;
  const wrap = $("#visit-pill");
  if (wrap) wrap.hidden = false;
  if (!shown) { countUp(el, n, 1300); shown = true; }
  else el.textContent = Number(n).toLocaleString("en-IN");
}

async function fetchCount() {
  const snap = await getDoc(doc(db, "stats", "site"));
  return snap.exists() ? Number(snap.data().visits) || 0 : 0;
}

export async function initStats() {
  const ref = doc(db, "stats", "site");
  try {
    let visits = await fetchCount();
    if (!store.get("tt_counted")) {
      if (visits > 0) { await updateDoc(ref, { visits: increment(1) }); visits += 1; }
      else { await setDoc(ref, { visits: 1 }); visits = 1; }
      store.set("tt_counted", true);
    }
    show(visits);
  } catch (err) {
    console.error("stats", err); // rules publish न हुए हों तो counter बस छुपा रहेगा
  }
  // 2 मिनट में एक बार refresh (सिर्फ़ जब tab दिख रहा हो)
  setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    try { show(await fetchCount()); } catch (e) { /* ignore */ }
  }, 120000);
}

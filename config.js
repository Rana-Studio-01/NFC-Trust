export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCwn6VOsOKT2IhixlYLV33HZ8wH1FMMmFE",
  authDomain: "tap-trust-87e92.firebaseapp.com",
  projectId: "tap-trust-87e92",
  storageBucket: "tap-trust-87e92.firebasestorage.app",
  messagingSenderId: "702417591532",
  appId: "1:702417591532:web:9a4e911a0b6899530b99c9",
  measurementId: "G-EMHVHY2ZBF"
};

/* 2) Site settings */
export const SITE = {
  brand: "NFC Trust",
  tagline: "Tap. Connect. Trust.",

  // आपकी live website का address (अभी लोकल टेस्टिंग के लिए)
  siteUrl: "https://nfctrust.online",

  // Instagram: सिर्फ़ ID (बिना @ के)
  instagramHandle: "tap_trust_10k", // अगर आपका असली हैंडल कुछ और है तो यहाँ बदल लें
  get instagramUrl() { return "https://instagram.com/" + this.instagramHandle; },

  // WhatsApp
  whatsappNumber: "919915916704",
  get whatsappUrl() { return "https://wa.me/" + this.whatsappNumber + "?text=" + encodeURIComponent("Hi NFC Trust, I need help with NFC cards."); },

  // Admin login के लिए Firebase में बनाया हुआ email
  adminEmail: "sameerrajput1230321@gmail.com",

  // Order rules
  bulkMinQty: 10,
  advancePercent: 50,
  maxQtyPerItem: 500,
  warrantyYears: 3,

  // India Post tracking page
  indiaPostTrackUrl: "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx",

  // Firestore reads बचाने के लिए products को इतने मिनट browser में cache रखते हैं
  productsCacheMinutes: 10,

  // Instagram/Facebook के अंदर Google login block होता है
  enableEmailLinkLogin: true
};

/* 3) Order status flow */
export const STATUS_FULL = ["Requested", "Address Confirmed", "Payment Pending", "Paid", "Programming", "Shipped", "Delivered"];
export const STATUS_BULK = ["Requested", "Address Confirmed", "Payment Pending", "Advance Paid", "Programming", "Balance Pending", "Paid", "Shipped", "Delivered"];
export const STATUS_EDITABLE = ["Requested", "Address Confirmed", "Payment Pending"];

/* ==========================================================================
   NFC Trust - firebase.js
   Firebase को start करता है और बाकी फ़ाइलों को ज़रूरी functions देता है।
   SDK सीधे Google के CDN से आता है, इसलिए npm install की ज़रूरत नहीं।
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);

/* Firestore: offline cache चालू रखते हैं (reads कम होते हैं).
   अगर browser (जैसे Instagram का in-app browser) cache allow न करे तो normal mode पर चला जाता है। */
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true
    });
  } catch (e1) {
    try {
      return initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch (e2) {
      return getFirestore(app);
    }
  }
}
export const db = createDb();

/* ---- Auth functions ---- */
export {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ---- Firestore functions ---- */
export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, onSnapshot, serverTimestamp,
  increment, runTransaction, writeBatch, Timestamp, arrayUnion,
  getAggregateFromServer, getCountFromServer, count, average
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

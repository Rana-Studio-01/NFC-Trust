# Tap Trust – पूरा Setup Guide (हिंदी)

यह guide आपको बताती है कि Firebase में क्या-क्या करना है, कौन सा code कहाँ paste करना है, कौन सी setting ON करनी है, और terminal में कौन से command चलाने हैं (और कौन से **नहीं**)।

> **ज़रूरी:** Website का पूरा text, button, popup और error **English** में है। इस guide और code के अंदर के comments सिर्फ़ आपको समझाने के लिए हिंदी में हैं।

---

## 0. शुरू करने से पहले (2 मिनट)

- **Firebase का Free (Spark) plan ही रखें।** कोई भी जगह "Upgrade" या "Blaze" पर click न करें।
- इस website में **ये चीज़ें इस्तेमाल नहीं होतीं** (क्योंकि ये paid हैं): Cloud Functions, Cloud Storage, Cloud Messaging (push), Trigger Email extension।
- जो चीज़ें इस्तेमाल होती हैं (सब free): **Authentication**, **Firestore Database**, (और चाहें तो **Hosting**)।
- Notification system सिर्फ़ website के अंदर है: admin का message आते ही three-dot menu, My orders और Help पर **लाल dot** दिखता है।

---

## 1. सिर्फ़ इन जगहों पर अपनी value डालनी है

> **सारी files एक ही folder (`Tap Trust`) में हैं; कोई sub-folder नहीं है।** HTML, CSS और JavaScript सब एक-दूसरे को सीधे file के नाम से जोड़ते हैं (जैसे `app.js`, `layout.css`), इसलिए folder का नाम किसी link में नहीं है। `Tap Trust` folder सिर्फ़ files को इकट्ठा रखने के लिए है।

| # | कौन सी file | क्या बदलना है |
|---|-------------|----------------|
| 1 | `config.js` → `FIREBASE_CONFIG` | Firebase की 6 values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) |
| 2 | `config.js` → `instagramHandle` | अपना Instagram ID (बिना `@` के) |
| 3 | `config.js` → `whatsappNumber` | Country code के साथ number, जैसे `919876543210` (बिना `+` और space के) |
| 4 | `config.js` → `adminEmail` | Firebase में बनाया admin email (Step 3 देखें) |
| 5 | `config.js` → `siteUrl` | आपकी live website का address |
| 6 | `firestore.rules` → `PASTE_ADMIN_UID_HERE` | Admin account की UID (Step 4 देखें) |
| 7 | `sitemap.xml` और `robots.txt` | `REPLACE_YOUR_DOMAIN.com` की जगह असली domain |

बाकी कुछ भी बदलने की ज़रूरत नहीं है। Products, prices, UPI ID और banner admin panel से बदल जाएँगे।

---

## 2. Firebase project बनाना

1. https://console.firebase.google.com पर जाएँ और Google account से login करें।
2. **Add project** → नाम डालें (जैसे `tap-trust`) → **Continue**।
3. **Google Analytics**: OFF कर दें (ज़रूरत नहीं) → **Create project**।
4. Project बन जाने पर left menu में देखें कि plan **Spark (No cost)** लिखा है।

### Web app जोड़ना (config पाने के लिए)

1. Project Overview पर **`</>` (Web)** icon दबाएँ।
2. App nickname: `Tap Trust Web` डालें।
3. **"Also set up Firebase Hosting" का tick हटा दें** (अभी नहीं चाहिए, बाद में Step 8 में बता दिया है)।
4. **Register app** दबाएँ।
5. जो `firebaseConfig = { ... }` दिखे, उसकी 6 values copy करके `config.js` में `FIREBASE_CONFIG` के अंदर paste करें।

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIza....",
  authDomain: "tap-trust.firebaseapp.com",
  projectId: "tap-trust",
  storageBucket: "tap-trust.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

> Firebase का `apiKey` public होता है, इसे छुपाना ज़रूरी नहीं। असली सुरक्षा `firestore.rules` से होती है।

---

## 3. Authentication (login) setup

Left menu: **Build → Authentication → Get started**।

### 3.1 Google login ON करना
1. **Sign-in method** tab → **Google** → **Enable** ON करें।
2. **Project support email** में अपना email चुनें → **Save**।

### 3.2 Email/Password ON करना (admin के लिए + email link के लिए)
1. **Sign-in method** → **Email/Password** → **Enable** ON करें।
2. उसी के नीचे **"Email link (passwordless sign-in)"** भी **ON** करें। (यह Instagram browser में Google login न चले तब backup है।)
3. **Save**।

### 3.3 Admin account बनाना
1. **Users** tab → **Add user**।
2. Email: कोई email जो सिर्फ़ आपका हो (जैसे `owner@yourdomain.com`)।
3. Password: **अपना मज़बूत password** डालें (इसी password से 5 बार tap करने के बाद admin panel खुलेगा)।
4. **Add user** दबाएँ।
5. इस email को `config.js` में `adminEmail` की जगह लिखें।

> Password कभी भी code में, GitHub पर या किसी file में न लिखें। वह सिर्फ़ Firebase में रहता है।

### 3.4 Authorized domains
1. **Authentication → Settings → Authorized domains**।
2. `localhost` पहले से होगा। अगर आप VS Code Live Server (`127.0.0.1`) इस्तेमाल करें तो **Add domain** से `127.0.0.1` भी जोड़ें।
3. Website live करने के बाद अपना domain भी जोड़ें:
   - GitHub Pages: `आपकायूज़रनेम.github.io`
   - Firebase Hosting: `प्रोजेक्टid.web.app` और `प्रोजेक्टid.firebaseapp.com` (पहले से होते हैं)
   - अपना custom domain: जैसे `taptrust.in`

> अगर यह जोड़ना भूले तो Google login पर error आएगा: *"This website address is not authorized in Firebase."*

---

## 4. Firestore Database और Rules

### 4.1 Database बनाना
1. Left menu: **Build → Firestore Database → Create database**।
2. **Location**: `asia-south1 (Mumbai)` चुनें (भारत के लिए सबसे तेज़)।
3. Mode: **Start in production mode** → **Create**।

### 4.2 Admin की UID निकालना
1. **Authentication → Users** में admin वाली row देखें।
2. **User UID** column की लंबी value copy करें (जैसे `k3J9x...`)।

### 4.3 Rules paste करना
1. `firestore.rules` file खोलें।
2. `PASTE_ADMIN_UID_HERE` को हटाकर अपनी UID paste करें (double quotes के अंदर ही रहे):

```
return signedIn() && request.auth.uid == "k3J9xYourRealUidHere";
```

3. Firebase में: **Firestore Database → Rules** tab।
4. पुराना सारा code हटाकर `firestore.rules` का **पूरा** code paste करें।
5. **Publish** दबाएँ। ("Publish" के बाद 1 मिनट तक rules लगने में लग सकते हैं।)

### 4.4 Indexes
इस project को **कोई composite index नहीं चाहिए**। कुछ भी बनाने की ज़रूरत नहीं।

---

## 5. Firebase में क्या ON नहीं करना (paid / ज़रूरत नहीं)

- ❌ Storage (अब नए projects में यह paid है; हम photos को compress करके chat में ही रखते हैं)
- ❌ Functions
- ❌ Cloud Messaging / Push
- ❌ Extensions (Trigger Email)
- ❌ Blaze plan / billing

---

## 6. पहली बार चलाकर देखना (laptop पर)

**तरीका A (सबसे आसान, terminal नहीं चाहिए):**
1. VS Code खोलें → `Tap Trust` folder open करें।
2. Extension **Live Server** install करें।
3. `index.html` पर right click → **Open with Live Server**।
4. Browser में `http://localhost:5500` (या 127.0.0.1) खुलेगा।

**तरीका B (terminal से):**
```bash
cd "Tap Trust"
npx serve .
```
फिर जो address दिखे (जैसे `http://localhost:3000`) browser में खोलें।

> ⚠️ `index.html` को double-click करके (file://) न खोलें। Modules सिर्फ़ http server पर चलते हैं।

### Admin panel पहली बार
1. Website के सबसे नीचे **"© 2025 Tap Trust"** वाले text पर **1 सेकंड में 5 बार** tap/click करें।
2. Password पूछेगा → Step 3.3 में बनाया password डालें।
3. **Products** tab → **Import sample products** दबाएँ → फिर हर product का price/photo अपने हिसाब से बदलें।
4. **Settings** tab → अपनी **UPI ID** डालें, banner चाहें तो लिखें → **Save settings**।
5. **Exit** दबाने पर admin session बंद हो जाता है। (Page refresh करने पर भी admin अपने आप logout हो जाता है।)

---

## 7. Website को online डालना (दो में से एक तरीका)

### तरीका 1: GitHub Pages (सबसे आसान, free)

#### 7.1 GitHub पर upload

**सबसे आसान:** repository खोलकर **Add file → Upload files** दबाएँ, फिर `Tap Trust` folder के **अंदर की सारी files** select करके drag करें (folder खुद नहीं, उसके अंदर की files)। क्योंकि सब files एक ही जगह हैं, इसलिए upload में कोई दिक्कत नहीं आती। `.gitignore` जैसी छुपी file न दिखे तो कोई बात नहीं।

Terminal से करना हो तो (पहले GitHub पर नया **repository** बनाएँ, जैसे `tap-trust`; फिर `Tap Trust` folder के अंदर):

```bash
git init
git add .
git commit -m "Tap Trust website"
git branch -M main
git remote add origin https://github.com/आपकायूज़रनेम/tap-trust.git
git push -u origin main
```

#### 7.2 GitHub Pages ON करना
1. Repository → **Settings → Pages**।
2. **Source**: *Deploy from a branch* → Branch: `main` → Folder: `/ (root)` → **Save**।
3. 1–2 मिनट बाद address मिलेगा: `https://आपकायूज़रनेम.github.io/tap-trust/`
4. इस address का domain (`आपकायूज़रनेम.github.io`) Step 3.4 में **Authorized domains** में जोड़ें।

> Project-site होने पर address में `/tap-trust/` आता है। यह code ऐसे ही चलता है (सारे links relative हैं)।

### तरीका 2: Firebase Hosting (free, Spark plan में चलता है)

Terminal में (एक बार):

```bash
npm install -g firebase-tools
firebase login
cd "Tap Trust"
firebase use --add
```
(`firebase use --add` में अपना project चुनें और alias `default` रखें।)

Live करने के लिए:

```bash
firebase deploy --only hosting
```

Address मिलेगा: `https://प्रोजेक्टid.web.app`

अगर आप rules भी terminal से डालना चाहें (वैसे Step 4.3 के तरीके से console में paste करना काफ़ी है):

```bash
firebase deploy --only firestore:rules
```

---

## 8. Terminal में कौन से command चलाने हैं / नहीं

### ✅ चला सकते हैं (ज़रूरी होने पर)
| Command | कब |
|---------|-----|
| `npx serve .` | laptop पर test करने के लिए (Live Server नहीं चाहें तो) |
| `git init`, `git add .`, `git commit`, `git push` | GitHub पर upload के लिए |
| `npm install -g firebase-tools` | सिर्फ़ Firebase Hosting इस्तेमाल करना हो तो |
| `firebase login`, `firebase use --add` | सिर्फ़ Firebase Hosting के लिए |
| `firebase deploy --only hosting` | Firebase Hosting पर update डालने के लिए |

### ❌ ये कभी न चलाएँ (paid features या ज़रूरत नहीं)
| Command | क्यों नहीं |
|---------|-------------|
| `firebase init functions` / `firebase deploy --only functions` | Cloud Functions paid हैं |
| `firebase init storage` / `firebase deploy --only storage` | Storage paid है |
| `npm install` (इस project में) | कोई package install नहीं होता, सब कुछ CDN से आता है |
| `npm run build` | कोई build step नहीं है |
| `firebase init` (पूरा) | इससे हमारी `firebase.json` बदल सकती है |

---

## 9. Free plan में 400–500 users आराम से चल सकें, इसके लिए क्या किया गया है

Firebase Free (Spark) की रोज़ की सीमा (लगभग): **50,000 reads, 20,000 writes, 1 GiB storage**।

इस website में reads/writes कम रखने के लिए:

- Products 10 मिनट के लिए browser में cache होते हैं (हर visit पर database नहीं पढ़ता)।
- Home page पर सिर्फ़ **3 reviews** लोड होते हैं; बाकी "View all" दबाने पर 10-10 करके।
- Average rating **aggregate query** से आती है (बहुत सस्ता)।
- Visitor counter में listener नहीं है; हर नया browser 1 बार गिना जाता है और number हर 2 मिनट में एक बार refresh होता है।
- Chat में सिर्फ़ **latest 80 messages** लोड होते हैं।
- "Seen" tick के लिए हर message पर अलग write नहीं होता।
- Chat की photo **compress** होकर (लगभग 150 KB से कम) message में रखी जाती है, ताकि Storage की ज़रूरत न पड़े।
- Admin panel सिर्फ़ latest 150 orders और 150 help chats को live देखता है।

> यह मोटा अनुमान है। Firebase Console → **Usage** tab में रोज़ देखते रहें। अगर किसी दिन limit के पास पहुँचें तो पहले पुराने chats/photos साफ़ करें।

---

## 10. Admin panel कैसे इस्तेमाल करना है

| Tab | क्या करता है |
|-----|--------------|
| **Dashboard** | नए orders, unread chats, verified revenue, visitors, users, rating |
| **Orders** | हर order एक "case file": customer, items, payment, status, tracking ID, private notes और उसी जगह chat |
| **Help desk** | जो users help माँगते हैं उनकी chats |
| **Users** | सारे users, email Reveal करना, **Block / Unblock** |
| **Products** | card जोड़ना/बदलना/हटाना, "Import sample products" |
| **Reviews** | बुरे/spam reviews delete करना |
| **Settings** | UPI ID, banner, "Accept new orders" ON/OFF |

### Order का सामान्य flow
1. User order भेजता है → आपके पास **लाल alert** आता है (साथ में हल्की beep)।
2. Chat में **Ask address** quick reply दबाकर address माँगें।
3. **Payment details** quick reply से UPI ID और सही रकम भेज दें।
4. User UTR और screenshot भेजे तो पहले **अपने bank/UPI app में पैसा देखें**।
5. **Record payment** दबाकर amount और **UTR** डालें (बिना UTR के order "Paid" नहीं होता; वही UTR दोबारा डालने पर चेतावनी आती है)।
6. **Move to next step** से Programming तक ले जाएँ।
7. India Post से भेजने के बाद **Add tracking ID** (या Shipped step) पर tracking ID डालें। यह अपने आप user की chat में **Track on India Post** button के साथ चली जाती है।
8. Delivered होने पर status Delivered कर दें।

### Payment नियम (आपके बताए अनुसार)
- **10 से कम cards:** पूरा payment पहले।
- **10 या ज़्यादा cards:** 50% advance, बाकी **shipping से पहले**।
- कुछ भी payment होने के बाद **refund नहीं**।
- हर card पर **3 साल की warranty**।

> मैंने "10 से ऊपर" को "10 या उससे ज़्यादा" माना है। इसे बदलना हो तो `config.js` में `bulkMinQty` बदलें (जैसे 11)।

---

## 11. Test checklist (live करने से पहले ज़रूर देखें)

- [ ] Website laptop और mobile दोनों में बिना कटे दिख रही है।
- [ ] नया tab खोलने पर welcome popup 2 सेकंड के लिए आता है; refresh पर दोबारा नहीं आता।
- [ ] बिना login के products, reviews, FAQ दिख रहे हैं।
- [ ] Buy now → confirm popup → Google login popup → Order builder खुलता है।
- [ ] Order builder में "Add another card" और quantity (+/−) चल रहे हैं; 10 cards करने पर 50% advance वाला message आता है।
- [ ] "Send order to chat" दबाने पर Order ID (जैसे `TT-1001`) मिलता है और chat खुलती है।
- [ ] Admin panel में वह order दिखता है; admin जवाब दे तो user के three-dot menu पर **लाल dot** आता है।
- [ ] Chat में link क्लिक होने लायक है; फोटो भेज सकते हैं।
- [ ] Admin ने user को Block किया तो user मैसेज नहीं भेज पाता।
- [ ] UTR के बिना "Paid" नहीं होता; tracking ID डालने पर user को India Post link दिखता है।
- [ ] Footer पर 5 tap (1 सेकंड में) से password prompt खुलता है; गलत password पर "Incorrect password" आता है।
- [ ] Mobile पर chat में keyboard खुलने पर message box screen में ही रहता है।
- [ ] असली फ़ोन पर **Instagram के अंदर** link खोलकर login test करें: "Open in browser" वाला बॉक्स दिखना चाहिए।

---

## 12. आम error और उनका हल

| Error / दिक्कत | हल |
|----------------|-----|
| Google login पर *"not authorized in Firebase"* | Step 3.4: Authorized domains में अपना domain जोड़ें |
| Console में `permission-denied` | Rules publish नहीं हुए, या `PASTE_ADMIN_UID_HERE` बदला नहीं गया |
| Admin panel खुलकर "Could not load orders" | Rules में admin की सही UID नहीं है |
| "Incorrect password" | Password वही डालें जो Firebase Authentication में admin user का है |
| Products नहीं दिख रहे | Sample products दिखेंगे; अपने डालने हों तो Admin → Products → Import |
| Page खाली / कुछ नहीं चल रहा | `index.html` को file:// से न खोलें; Live Server / `npx serve .` इस्तेमाल करें |
| Instagram browser में Google login 403 | सामान्य है (Google की रोक)। "Open in browser" या email-link login इस्तेमाल करें |
| Email link नहीं आया | Spam folder देखें; Step 3.2 में Email link ON है या नहीं देखें |
| Config बदलने के बाद भी पुराना दिख रहा | Browser में hard refresh (Ctrl + Shift + R) |

---

## 13. सुरक्षा के नियम (याद रखें)

1. Admin का password मज़बूत रखें और किसी को न बताएँ।
2. `firestore.rules` में UID बदलना न भूलें।
3. GitHub पर password, UPI की private जानकारी या कोई secret न डालें।
4. समय-समय पर Firebase Console → Usage और Authentication → Users देखते रहें।
5. Spam करने वाले को Admin → Users से **Block** करें।
6. Privacy Policy/Terms में अपनी असली जानकारी (नाम, GST हो तो) जोड़ने से पहले किसी जानकार से एक बार पढ़वा लें।

# NFC Trust – NFC Card Website

Black + yellow, mobile और desktop दोनों पर fit होने वाली website।
**Stack:** HTML + CSS + JavaScript + Firebase (Authentication + Firestore, Free Spark plan)।

> पूरा setup (Firebase settings, rules paste करना, terminal commands) **`SETUP-GUIDE.md`** में है। पहले वही पढ़ें।

## सारी files एक ही folder में

`NFC Trust` folder में कोई sub-folder नहीं है। सारी files सीधे एक-दूसरे को नाम से जोड़ती हैं, इसलिए GitHub पर upload करते समय कोई दिक्कत नहीं आती।

| Type | Files |
|------|-------|
| मुख्य page | `index.html`, `404.html` |
| Policy / info pages | `help.html`, `terms.html`, `privacy.html`, `refund-policy.html`, `shipping-policy.html`, `warranty.html`, `about.html`, `contact.html` |
| Design (CSS) | `variables.css` (colors, fonts), `base.css`, `layout.css`, `components.css`, `animations.css`, `chat.css`, `admin.css` |
| Setup | `config.js` ⭐ (यहाँ अपनी Firebase key, Instagram ID, WhatsApp number डालें), `firebase.js` |
| Main code | `app.js`, `auth.js`, `products.js`, `default-products.js`, `order.js`, `inbox.js`, `chat.js`, `unread.js`, `reviews.js`, `stats.js`, `ui.js`, `utils.js`, `page-shell.js` |
| Admin panel | `admin.js` (password के बाद ही load होता है), `admin.css` |
| Firebase | `firestore.rules`, `firestore.indexes.json`, `firebase.json` |
| बाकी | `favicon.svg`, `logo.svg`, `manifest.json`, `robots.txt`, `sitemap.xml`, `.gitignore`, `README.md`, `SETUP-GUIDE.md` |

## क्या-क्या है

- Google login (website देखने के लिए login नहीं; order / chat / help / review पर ही login popup)
- Card catalog, Buy now → confirm → Order builder (+ दूसरा card, quantity, custom card) → order chat
- Real-time chat (text, photo, clickable links), इन-साइट लाल dot (unread)
- India Post tracking ID admin डालता है और user की chat में दिखता है
- Payment rule: 10 से कम cards = पूरा payment पहले; 10+ = 50% advance, बाकी shipping से पहले; payment के बाद refund नहीं
- Reviews (masked email, latest 3), visitor counter, 3-year warranty
- Hidden admin "Command Center": footer पर 1 सेकंड में 5 tap → password (Show / Hide button के साथ)

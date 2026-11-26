# SF360 सेलर डैशबोर्ड

आपके Shadowfax 360 (SF 360) सेलर अकाउंट को एक ही जगह से चलाने के लिए एक प्राइवेट वेब ऐप। यह फ़ोन और कंप्यूटर दोनों पर चलता है।
Shadowfax के सारे API कॉल सर्वर (Firebase Cloud Functions) से होते हैं। आपकी API key ब्राउज़र में कभी नहीं जाती।

## यह ऐप क्या करता है

| काम | कहाँ |
|---|---|
| लाइव डैशबोर्ड: Booked, Pickup pending, In transit, Out for delivery, Delivered, NDR, RTO, Cancelled की गिनती। COD बनाम प्रीपेड का हिसाब और आज के पिकअप | **Dashboard** |
| नया ऑर्डर: पहले तीनों पिनकोड (पिकअप, डिलीवरी, रिटर्न) की जाँच, फिर बुकिंग। AWB अपने आप सेव होता है। चाहें तो शिपिंग चार्ज का अनुमान भी देख सकते हैं | **New** |
| CSV या Excel (.xlsx) से एक साथ कई ऑर्डर, हर लाइन का अलग नतीजा, और फ़ेल हुई लाइनें दोबारा डाउनलोड करने की सुविधा | **Bulk upload** |
| ऑर्डर लिस्ट: नाम, फ़ोन, ऑर्डर ID या AWB से खोज। स्टेटस और तारीख से फ़िल्टर। लाइव अपडेट और CSV एक्सपोर्ट | **Orders** |
| ऑर्डर का पूरा टाइमलाइन, डिस्पैच से पहले एडिट, कन्फ़र्म करके कैंसल, डिलीवरी फ़ेल होने पर दोबारा भेजना या वापस मँगाना (NDR), लेबल PDF, और POD | ऑर्डर पर टैप करें |
| पिकअप का इंतज़ार कर रहे ऑर्डर, तारीख के हिसाब से | **Pickups** |
| रिटर्न (रिवर्स पिकअप) बुक करना और ट्रैक करना | **Returns** |
| पिकअप और रिटर्न के पते, डिफ़ॉल्ट सेटिंग, और वेबहुक की जानकारी | **Settings** |

स्टेटस दो तरह से अपडेट होता है:

- **Webhook:** Shadowfax स्टेटस बदलते ही ऐप को बता देता है।
- **बैकअप सिंक:** हर 2 घंटे में ऐप खुद चालू शिपमेंट की ट्रैकिंग लाता है। यह इसलिए है क्योंकि Shadowfax फ़ेल हुआ वेबहुक दोबारा नहीं भेजता।

### जो Shadowfax API में नहीं है

वॉलेट और बैलेंस, बिलिंग और इनवॉइस, COD रेमिटेंस, वेट डिस्प्यूट, और API key या वेबहुक की सेटिंग। इनके लिए ऐप में **"Open in Shadowfax panel"** बटन है, जो https://shadowfax360.in/ खोलता है। इनके लिए ऐप कोई नकली डेटा नहीं दिखाता।

Shadowfax में पिकअप "शेड्यूल" करने का अलग API भी नहीं है। पिकअप की तारीख और स्लॉट ऑर्डर बुक करते समय ही दिए जाते हैं, और यह सिर्फ़ Seller pickup (marketplace) ऑर्डर में होता है।

## लॉग इन कैसे करें

1. Firebase console → **Authentication → Users → Add user** में अपना ई-मेल और पासवर्ड डालें। यह वही ई-मेल हो जो `SF360_ALLOWED_EMAILS` में है।
2. ऐप खोलें (`https://<project-id>.web.app`) और लॉग इन करें।
3. पहली बार ऐप ई-मेल वेरिफ़िकेशन माँगेगा। **Send verification link** दबाएँ, ई-मेल में आया लिंक खोलें, फिर **I have verified** दबाएँ।
4. पासवर्ड भूल जाएँ तो लॉग इन पेज पर **Forgot password** दबाएँ।

कोई दूसरा ई-मेल लॉग इन करे तो उसे "This account cannot use the dashboard" दिखेगा। उसके लिए डेटाबेस भी पूरी तरह बंद रहता है।

## पहली बार सेटअप

1. **Blaze प्लान ज़रूरी है।** Cloud Functions, Secret Manager और Cloud Scheduler सिर्फ़ Blaze (pay-as-you-go) प्लान पर चलते हैं। Firebase console → ⚙️ → Usage and billing → प्लान बदलें। एक सेलर के इस्तेमाल में खर्च आम तौर पर बहुत कम या मुफ़्त सीमा के अंदर रहता है।
2. Firebase console में **Firestore Database** बनाएँ (Native mode, region `asia-south1`)।
3. **Authentication** → Get started → Sign-in method → **Email/Password** चालू करें। GitHub वाला deploy इसे खुद चालू करने की कोशिश भी करता है।
4. Shadowfax का token Secret Manager में डालें (अगला सेक्शन देखें)।
5. नीचे दिए तरीके से GitHub से deploy करें।

### GitHub से auto-deploy

`.github/workflows/sf360-deploy.yml` हर बार `main` ब्रांच पर `sf360-dashboard/` में बदलाव पुश होने पर टेस्ट चलाता है और deploy करता है। Actions टैब से हाथ से भी चला सकते हैं।

GitHub repo → **Settings → Secrets and variables → Actions** में ये डालें:

| नाम | किस टैब में | क्या डालें |
|---|---|---|
| `SF360_FIREBASE_PROJECT_ID` | Variables | आपका Firebase project ID |
| `SF360_SHADOWFAX_ENV` | Variables | `staging` (शुरुआत में) या `production` |
| `SF360_ALLOWED_EMAILS` | Secrets | वह ई-मेल जिससे लॉग इन करना है। एक से ज़्यादा हों तो कॉमा से अलग करें |
| `SF360_FIREBASE_SERVICE_ACCOUNT` | Secrets | सर्विस-अकाउंट की JSON key (नीचे देखें) |
| `SF360_SHADOWFAX_API_TOKEN` | Secrets | *(ज़रूरी नहीं)* अगर token GitHub से Secret Manager में भेजना है |

**सर्विस-अकाउंट कैसे बनाएँ:**

1. Google Cloud console → IAM → Service Accounts → नया अकाउंट बनाएँ।
2. उसे ये रोल दें: *Firebase Admin, Cloud Functions Admin, Service Account User, Secret Manager Admin, Cloud Scheduler Admin, Artifact Registry Administrator, Cloud Build Editor, Service Usage Admin, Datastore Owner*।
3. Keys → Add key → JSON डाउनलोड करें।
4. उस फ़ाइल का पूरा टेक्स्ट ऊपर वाले secret में चिपका दें।
5. JSON फ़ाइल को कभी git में न डालें। `.gitignore` उसे पहले से रोकता है।

## Shadowfax key बदलना

Token सिर्फ़ **Firebase Secret Manager** में रहता है। वह कोड या GitHub में नहीं दिखता, और ऐप उसे कभी दिखाता या लॉग नहीं करता। दो में से कोई एक तरीका अपनाएँ।

**तरीका 1 — Firebase CLI से (सबसे सीधा):**

```bash
npm install -g firebase-tools
firebase login
firebase functions:secrets:set SHADOWFAX_API_TOKEN --project <project-id>
# token पेस्ट करें (स्क्रीन पर नहीं दिखेगा), फिर दोबारा deploy करें:
#   GitHub → Actions → "SF360 dashboard deploy" → Run workflow
```

**तरीका 2 — GitHub secret से:**

1. `SF360_SHADOWFAX_API_TOKEN` secret को नई key से अपडेट करें।
2. Workflow दोबारा चलाएँ। वह नई key Secret Manager में डाल देगा।

ध्यान दें: staging और production की key अलग होती हैं। key उसी environment की होनी चाहिए जो `SF360_SHADOWFAX_ENV` में चुना है। Key SFX 360 पोर्टल (https://shadowfax360.in/) से मिलती है।

### Staging से production पर जाना

ऐप पहले **staging** (टेस्ट) से जुड़ा है। ऊपर पीली पट्टी "TEST MODE" दिखती है, और वहाँ के ऑर्डर असली नहीं होते। staging में सब (बुकिंग, ट्रैकिंग, कैंसल) जाँचने के बाद production पर जाने के लिए:

1. `SHADOWFAX_API_TOKEN` में **production** वाली key डालें।
2. `SF360_SHADOWFAX_ENV` variable को `production` करें।
3. Workflow चलाएँ।

Staging वाले ऑर्डर और उनकी गिनती अलग रहती है, production में नहीं मिलती।

## Webhook (लाइव स्टेटस)

1. ऐप में **Settings → Live status updates** में URL मिलेगा: `https://<project-id>.web.app/api/shadowfax-webhook`
2. वहीं **Show header to paste** दबाने पर header दिखेगा: `Authorization: Token …`
3. SFX 360 पोर्टल → **Webhook** टैब में यह URL और header, forward और reverse दोनों के लिए डालें। staging और production के लिए अलग-अलग डालना होता है।

बिना सही header के आया हर कॉल 401 से रिजेक्ट होता है। आखिरी 5 वेबहुक Settings पेज पर दिखते हैं। पुराने लॉग 30 दिन बाद अपने आप मिट जाते हैं।

## सुरक्षा

- Firestore rules: सिर्फ़ allow-list वाला और **वेरिफ़ाइड** ई-मेल पढ़ सकता है। शिपमेंट सिर्फ़ Cloud Functions लिखते हैं, बाकी सब के लिए सब कुछ बंद है।
- हर Cloud Function सबसे पहले Firebase Auth token, allow-list और ई-मेल वेरिफ़िकेशन जाँचता है, फिर हर input को validate करता है।
- `firestore.rules` और `functions/.env` deploy के समय `scripts/prepare-deploy.mjs` से बनते हैं, इसलिए आपका ई-मेल git में नहीं जाता।
- Hosting पर सख़्त security headers (CSP, HSTS, X-Frame-Options) लगे हैं।

## डेवलपर नोट्स

```
sf360-dashboard/
  functions/   Cloud Functions (TypeScript) — Shadowfax client, callables, webhook, 2-घंटे वाला sync
  web/         React + Vite + TypeScript + Tailwind
  e2e/         Firebase emulators + नकली Shadowfax सर्वर + Playwright से पूरा टेस्ट
  docs/SHADOWFAX_API.md   कौन-सा endpoint कहाँ इस्तेमाल हुआ (official docs के हिसाब से)
```

- यूनिट टेस्ट: `npm --prefix functions test` और `npm --prefix web test`
- पूरा end-to-end टेस्ट (असली Shadowfax या Firebase को नहीं छूता): `bash e2e/run.sh`। इसके लिए पहले `npm install --prefix e2e` चलाएँ। Java भी चाहिए।
- लोकल चलाने के लिए `web/.env.example` को `web/.env.local` में कॉपी करें, उसमें Firebase web config भरें, फिर `npm --prefix web run dev`।

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

1. ऐप खोलें: `https://naamdevseets-sf360.web.app`। अगर दूसरा project या site चुना है, तो उसका पता GitHub Actions की deploy summary में दिखता है।
2. **पहली बार:** **Create your account** दबाएँ। वही ई-मेल डालें जो `SF360_ALLOWED_EMAILS` में है, और एक नया पासवर्ड (कम से कम 8 अक्षर)।
   - अगर इस ई-मेल से NAAMDEV में पहले से अकाउंट है, तो सीधे उसी पासवर्ड से **Log in** करें।
3. ऐप ई-मेल वेरिफ़िकेशन माँगेगा। **Send verification link** दबाएँ, ई-मेल में आया लिंक खोलें, फिर **I have verified** दबाएँ।
4. पासवर्ड भूल जाएँ तो लॉग इन पेज पर **Forgot password** दबाएँ।

कोई भी अकाउंट बना सकता है, पर डैशबोर्ड सिर्फ़ allow-list वाले, वेरिफ़ाइड ई-मेल के लिए खुलता है। किसी और को "This account cannot use the dashboard" दिखेगा, और उसके लिए डेटाबेस भी पूरी तरह बंद रहता है।

## पहली बार सेटअप

यह ऐप आपके मौजूदा **NAAMDEV वाले Firebase project (`naamdevseets`)** में, पर उससे बिल्कुल अलग चलता है:

- इसका अपना Firestore database `sf360` है।
- इसकी अपनी website है: `naamdevseets-sf360.web.app`।
- इसके अपने Cloud Functions हैं (codebase `sf360`)।

NAAMDEV का डेटा, rules, sites और Render वाला API इससे नहीं बदलते। GitHub पहले से इस project में बिना key के deploy कर सकता है (NAAMDEV वाला keyless setup), इसलिए कोई service-account key नहीं चाहिए।

आपको बस ये करना है:

1. **Blaze प्लान:** Cloud Functions सिर्फ़ Blaze (pay-as-you-go) पर चलते हैं।
   - https://console.firebase.google.com/project/naamdevseets/usage/details खोलें → **Modify plan** → **Blaze** → पेमेंट का तरीका जोड़ें।
   - एक सेलर के इस्तेमाल में खर्च आम तौर पर मुफ़्त सीमा के अंदर रहता है।
   - सुरक्षा के लिए वहीं ₹100 जैसा **budget alert** लगा दें।
2. **दो GitHub secrets** (repo → Settings → Secrets and variables → Actions → New repository secret):

   | Name | Value |
   |---|---|
   | `SF360_SHADOWFAX_API_TOKEN` | Shadowfax पोर्टल → Integrations → **Get Testing Token** |
   | `SF360_ALLOWED_EMAILS` | वह ई-मेल जिससे लॉग इन करना है। एक से ज़्यादा हों तो कॉमा से अलग करें |

3. **Deploy:** `main` पर push होते ही अपने आप होता है। Actions टैब → **SF360 dashboard deploy** → **Run workflow** से हाथ से भी चला सकते हैं।
   - Workflow ख़ुद ये सब करता है: Blaze की जाँच, ज़रूरी Google APIs चालू करना, `sf360` database और site बनाना, token को Secret Manager में डालना, फिर deploy।

**ज़रूरी नहीं (अलग project चाहिए तो):** Variables में ये डालें:
- `SF360_FIREBASE_PROJECT_ID` और `SF360_FIREBASE_PROJECT_NUMBER`
- चाहें तो `SF360_HOSTING_SITE`

साथ में एक service-account JSON को secret `SF360_FIREBASE_SERVICE_ACCOUNT` में डालें। उस account को ये roles दें: Firebase Admin, Cloud Functions Admin, Service Account User, Secret Manager Admin, Cloud Scheduler Admin, Artifact Registry Administrator, Cloud Build Editor, Service Usage Admin, Datastore Owner। या उस project में भी NAAMDEV वाली keyless सेटिंग चलाएँ।

## Shadowfax key बदलना

Token कोड में कभी नहीं जाता, और ऐप उसे कभी दिखाता या लॉग नहीं करता। Cloud Functions उसे **Firebase Secret Manager** से पढ़ते हैं। दो में से कोई एक तरीका अपनाएँ।

ध्यान दें: अगर GitHub secret `SF360_SHADOWFAX_API_TOKEN` मौजूद है, तो हर deploy उसी की key Secret Manager में डाल देता है। इसलिए key बदलनी हो तो GitHub secret बदलें (तरीका 2)। अगर तरीका 1 इस्तेमाल करना है, तो पहले वह GitHub secret हटा दें।

**तरीका 1 — Firebase CLI से (सबसे सीधा):**

```bash
npm install -g firebase-tools
firebase login
firebase functions:secrets:set SHADOWFAX_API_TOKEN --project naamdevseets
# token पेस्ट करें (स्क्रीन पर नहीं दिखेगा), फिर दोबारा deploy करें:
#   GitHub → Actions → "SF360 dashboard deploy" → Run workflow
```

**तरीका 2 — GitHub secret से:**

1. `SF360_SHADOWFAX_API_TOKEN` secret को नई key से अपडेट करें।
2. Workflow दोबारा चलाएँ। वह नई key Secret Manager में डाल देगा।

ध्यान दें: staging और production की key अलग होती हैं। key उसी environment की होनी चाहिए जो `SF360_SHADOWFAX_ENV` में चुना है। Key SFX 360 पोर्टल (https://shadowfax360.in/) से मिलती है।

### Staging से production पर जाना

ऐप पहले **staging** (टेस्ट) से जुड़ा है। ऊपर पीली पट्टी "TEST MODE" दिखती है, और वहाँ के ऑर्डर असली नहीं होते। staging में सब (बुकिंग, ट्रैकिंग, कैंसल) जाँचने के बाद production पर जाने के लिए:

1. Shadowfax पोर्टल → Integrations → **Get Production Token** से key लें और GitHub secret `SF360_SHADOWFAX_API_TOKEN` में डालें (या ऊपर का तरीका 1)।
2. `SF360_SHADOWFAX_ENV` variable को `production` करें।
3. Workflow चलाएँ।

Staging वाले ऑर्डर और उनकी गिनती अलग रहती है, production में नहीं मिलती।

## Webhook (लाइव स्टेटस)

1. ऐप में **Settings → Live status updates** में URL मिलेगा: `https://naamdevseets-sf360.web.app/api/shadowfax-webhook`
2. वहीं **Show header to paste** दबाने पर header दिखेगा: `Authorization: Token …`
3. SFX 360 पोर्टल → **Webhook** टैब में यह URL और header, forward और reverse दोनों के लिए डालें। staging और production के लिए अलग-अलग डालना होता है।

बिना सही header के आया हर कॉल 401 से रिजेक्ट होता है। आखिरी 5 वेबहुक Settings पेज पर दिखते हैं। पुराने लॉग 30 दिन बाद अपने आप मिट जाते हैं।

## सुरक्षा

- SF360 का डेटा अलग Firestore database (`sf360`) में है, NAAMDEV के डेटा से अलग।
- Firestore rules: सिर्फ़ allow-list वाला और **वेरिफ़ाइड** ई-मेल पढ़ सकता है। शिपमेंट सिर्फ़ Cloud Functions लिखते हैं, बाकी सब के लिए सब कुछ बंद है।
- हर Cloud Function सबसे पहले Firebase Auth token, allow-list और ई-मेल वेरिफ़िकेशन जाँचता है, फिर हर input को validate करता है।
- `firestore.rules`, `functions/.env` और `.firebaserc` deploy के समय `scripts/prepare-deploy.mjs` से बनते हैं, इसलिए आपका ई-मेल git में नहीं जाता।
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

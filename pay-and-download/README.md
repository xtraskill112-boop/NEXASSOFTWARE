# Pay & Download — UPI स्कैनर से पेमेंट, जाँच के बाद फ़ाइल डाउनलोड

आप एडमिन पैनल से **अलग-अलग पेमेंट लिंक** बनाते हैं — हर लिंक की अपनी फ़ाइल, अपनी कीमत और अपना QR।
ग्राहक लिंक खोलकर UPI से पेमेंट करता है और UTR डालता है। फ़ाइल **तभी** मिलती है जब आप एडमिन पैनल में
**✓ Received** दबाते हैं; तब तक ग्राहक को **Under Checking — kindly wait for 120 sec, don't close this page** दिखता है।

| पेज | पता | किसके लिए |
|---|---|---|
| पेमेंट लिंक | `/p/<code>` | ग्राहक: QR स्कैन → पेमेंट → UTR → Under Checking → डाउनलोड |
| होम पेज | `/` | Settings में चुना गया लिंक खोलता है (या "अपना पेमेंट लिंक खोलें" संदेश) |
| एडमिन पैनल | `/admin` | आप: पेमेंट जाँचना, लिंक बनाना, सेटिंग |

## ग्राहक को क्या दिखता है

1. **Pay** — QR (लिंक की कीमत भरी हुई), UPI ID और कीमत। फ़ोन पर "Pay ₹… with UPI app" बटन सीधे UPI ऐप खोलता है।
2. **UTR** — 12 अंकों का UTR / UPI Ref. No. (नाम और मोबाइल वैकल्पिक)। एक UTR सिर्फ़ एक बार इस्तेमाल हो सकता है।
3. **Under Checking** — 120 सेकंड की उलटी गिनती, "Kindly wait for 120 sec. Don't close this page" (हिंदी में भी)।
   पेज हर 4 सेकंड में अपने-आप देखता है; 120 सेकंड बाद भी "Still checking… keep this page open" के साथ इंतज़ार करता रहता है।
4. **Download** — आपने **✓ Received** दबाया कि पेज अपने-आप "Payment Successful" और **Download Your File** दिखाता है।
   **✗ Not received** दबाने पर ग्राहक को "Payment not received" दिखता है।

उसी फ़ोन पर लिंक दोबारा खोलने पर उसी पेमेंट की स्थिति (जाँच / डाउनलोड) फिर से दिखती है।
Received से पहले डाउनलोड का पता अंदाज़े से खोलने पर भी फ़ाइल नहीं मिलती।

## एडमिन पैनल

- **Payments**: "Waiting for you" (जाँचने बाकी), आज/कुल मिली रकम, डाउनलोड; हर पेमेंट के साथ लिंक का नाम और
  "waiting 45 s" जैसा समय; **✓ Received** / **✗ Not received** / Undo / Delete; लिंक और स्थिति से फ़िल्टर; खोज;
  **Export CSV**। हर 5 सेकंड में अपने-आप ताज़ा होता है और नई पेमेंट पर **आवाज़** + सूचना देता है (🔔 बटन से बंद/चालू)।
- **Links**: **+ New link** → नाम, कीमत, विवरण, UPI नोट, फ़ाइल (और चाहें तो अपनी स्कैनर इमेज) → **Create link**।
  हर लिंक पर **Copy link**, **WhatsApp**, Open, Edit (कीमत/फ़ाइल बदलें), Payments, Pause/Resume, Delete;
  साथ में उस लिंक की पेमेंट और कमाई की गिनती। लिंक का कोड अंदाज़े से नहीं निकाला जा सकता (8 अक्षर)।
- **Settings**: UPI ID और नाम (सब लिंक के लिए), और होम पेज (`/`) कौन-सा लिंक खोले।

पहले वाला एक-प्रोडक्ट सेटअप (GST Registration Certificate, ₹1,000, आपका स्कैनर, आपकी PDF) अपने-आप
पहला लिंक बन जाता है और होम पेज पर रहता है, इसलिए पहले भेजा गया पता भी चलता रहता है।
**फ़ाइलें रिपॉज़िटरी में नहीं रखी जातीं** — वे एडमिन पैनल से अपलोड होती हैं।

## चलाना (अपने कंप्यूटर पर)

Node.js 18 या नया चाहिए।

```bash
cd pay-and-download
npm install
ADMIN_PASSWORD='अपना-पासवर्ड' npm start
```

- पेमेंट पेज: http://localhost:3000/
- एडमिन: http://localhost:3000/admin — **ID: `admin`**, पासवर्ड: जो `ADMIN_PASSWORD` में दिया

पासवर्ड जानबूझकर कोड में नहीं लिखा गया है (यह GitHub repo public है, कोड में लिखा पासवर्ड कोई भी पढ़ सकता है)।
उसे हमेशा सर्वर की environment setting `ADMIN_PASSWORD` में डालें। न डालें तो सर्वर खुद एक पासवर्ड बनाकर
टर्मिनल में दिखा देता है।

## Live (अभी कैसे चल रहा है)

GitHub Actions का workflow **Pay & Download deploy** (`.github/workflows/pay-and-download-deploy.yml`)
इस फ़ोल्डर में बदलाव push होते ही ऐप को लाइव करता है — NAAMDEV वाले ही खातों से, free plans पर:

- **Render free web service** पर ऐप चलता है (`pay-and-download`)।
- **Cloud Firestore** (Firebase प्रोजेक्ट) में पेमेंट, सेटिंग और फ़ाइलें रहती हैं (`payDownload_*` collections,
  अपना अलग service account `paydl-run`)। Render का free सर्वर restart पर डिस्क मिटा देता है, पर डेटा Firestore
  में सुरक्षित रहता है।
- Free सर्वर ~15 मिनट कोई न आए तो सो जाता है; अगली बार खुलने में लगभग 1 मिनट लगता है।

यह repo public है, इसलिए एडमिन पासवर्ड और ग्राहकों वाली फ़ाइल यहाँ कभी नहीं रखी जाती। वे
`deploy/setup.enc` में **encrypted** आते हैं: workflow एक deploy key बनाता है (उसकी private key सिर्फ़ Firestore में
रहती है और public key log में छपती है), `scripts/encrypt-setup.js` उस public key से पासवर्ड का hash और फ़ाइल
encrypt करता है, और अगला deploy उसे लागू करके private key मिटा देता है — उसके बाद वह फ़ाइल कभी खुल नहीं सकती।
हर deploy के अंत में एक अस्थायी लिंक पर पूरी खरीदारी जाँची जाती है (UTR → डाउनलोड बंद → Received → सही फ़ाइल), फिर वह लिंक और पेमेंट मिटा दिए जाते हैं।

Local टेस्ट Firestore के साथ: `firebase emulators:start --only firestore --project demo-paydl` और फिर
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm test`।

## अपने सर्वर पर लगाना

बिना Firestore के सारा डेटा `data/` फ़ोल्डर में रहता है, इसलिए ऐसा होस्ट चुनें जिसमें **स्थायी डिस्क / volume** हो
(कोई VPS, या Disk/Volume वाला होस्ट)। Firestore इस्तेमाल करना हो तो `FIREBASE_PROJECT_ID` और
`FIREBASE_SERVICE_ACCOUNT_BASE64` (service account key JSON, base64) सेट करें।

Docker से:

```bash
docker build -t pay-and-download .
docker run -d -p 3000:3000 -e ADMIN_PASSWORD='अपना-पासवर्ड' -e TRUST_PROXY=1 \
  -v pay-data:/app/data pay-and-download
```

| Environment variable | मतलब | Default |
|---|---|---|
| `ADMIN_USERNAME` | एडमिन पैनल की ID | `admin` |
| `ADMIN_PASSWORD` | एडमिन पैनल का पासवर्ड | अपने-आप बनता है और टर्मिनल में दिखता है |
| `PORT` | पोर्ट | `3000` |
| `DATA_DIR` | डेटा और फ़ाइलों का फ़ोल्डर | `./data` |
| `MAX_FILE_MB` | अपलोड फ़ाइल की अधिकतम साइज़ | `200` (Firestore के साथ `25`) |
| `FIREBASE_PROJECT_ID` | सेट हो तो डेटा Cloud Firestore में रहता है | बंद (local disk) |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Firestore के लिए service account key (base64) | Google default credentials |
| `TRUST_PROXY` | होस्ट के proxy/HTTPS के पीछे चलने पर `1` रखें (सही IP और secure cookie के लिए) | बंद |

HTTPS वाला डोमेन इस्तेमाल करें ताकि एडमिन लॉगिन सुरक्षित रहे।

## टेस्ट

```bash
npm test
```

पूरा फ़्लो जाँचता है: लिंक बनाना, हर लिंक की अपनी फ़ाइल/कीमत, UTR जमा करना, Received से पहले डाउनलोड बंद, Received/Not received, Pause, होम पेज, पुराने सेटअप का अपग्रेड।

## फ़ाइलें

| फ़ाइल | काम |
|---|---|
| `server.js` | सर्वर (Express): पेमेंट, डाउनलोड, एडमिन API |
| `lib/store.js` | डेटा कहाँ रहे: local disk या Cloud Firestore |
| `lib/auth.js`, `lib/state.js` | एडमिन लॉगिन (scrypt hash, signed cookie), लिंक और शुरुआती सेटिंग, पुराने सेटअप का लिंक में बदलना |
| `scripts/deploy-setup.js`, `scripts/encrypt-setup.js` | encrypted setup (एडमिन पासवर्ड, फ़ाइल) deploy के समय लागू करना |
| `public/pay.html`, `public/app.js` | ग्राहक का पेमेंट पेज (`/p/<code>`) |
| `public/home.html` | होम पेज जब कोई लिंक चुना न हो |
| `public/admin.html`, `public/admin.js` | एडमिन पैनल |
| `public/styles.css` | डिज़ाइन (लाइट और डार्क मोड, मोबाइल) |
| `test/server.test.js` | टेस्ट |

# Pay & Download — UPI स्कैनर से पेमेंट, फिर फ़ाइल डाउनलोड

एक पेज जिस पर ग्राहक आपके UPI स्कैनर से एक बार (one-time) पेमेंट करता है, UTR नंबर डालता है,
तुरंत **Payment Successful** देखता है और **Download Your File** बटन से आपकी फ़ाइल डाउनलोड कर लेता है।
आपके लिए अलग **एडमिन पैनल** है जिसमें हर पेमेंट (UTR, नाम, मोबाइल, समय, डाउनलोड) दिखता है।

| पेज | पता | किसके लिए |
|---|---|---|
| पेमेंट पेज | `/` | ग्राहक: QR स्कैन → पेमेंट → UTR → डाउनलोड |
| एडमिन पैनल | `/admin` | आप: पेमेंट लिस्ट, कीमत/UPI सेटिंग, फ़ाइल अपलोड |

## ग्राहक को क्या दिखता है

1. **Pay** — आपका स्कैनर (QR), UPI ID और कीमत। फ़ोन पर "Pay ₹1,000 with UPI app" बटन सीधे UPI ऐप खोलता है।
2. **UTR** — ग्राहक 12 अंकों का UTR / UPI Ref. No. डालता है (नाम और मोबाइल वैकल्पिक)।
3. **Download** — तुरंत "Payment Successful" और **Download Your File** बटन।
   उसी फ़ोन पर पेज दोबारा खोलने पर डाउनलोड बटन फिर से मिल जाता है।

**पेमेंट चेक नहीं होता** (जैसा आपने कहा): कोई भी सही फ़ॉर्मेट का 12 अंकों का UTR फ़ाइल खोल देता है।
बस एक ही UTR दो बार इस्तेमाल नहीं हो सकता। एडमिन पैनल में हर UTR अपने UPI ऐप की history से मिला लें —
**✓ Received** दबाकर चेक किया हुआ मार्क करें, और नकली UTR पर **Block** दबाएँ तो उस ग्राहक का डाउनलोड लिंक बंद हो जाता है।

## एडमिन पैनल

- **Payments**: आज की और कुल कमाई, कितने UTR चेक करने बाकी हैं, कुल डाउनलोड; UTR/नाम/मोबाइल से खोज;
  New / Received / Blocked फ़िल्टर; हर 8 सेकंड में अपने-आप नई पेमेंट दिखती है; **Export CSV** (Excel में खोलें)।
- **Settings**: प्रोडक्ट का नाम, विवरण, कीमत, UPI ID, नाम, पेमेंट नोट; **फ़ाइल अपलोड** (यही फ़ाइल ग्राहक डाउनलोड करते हैं;
  नई फ़ाइल डालने पर पुरानी बदल जाती है); **स्कैनर इमेज** अपलोड करें या "Use auto QR" से UPI ID से बना QR दिखाएँ
  (auto QR में कीमत अपने-आप भरी होती है)।

पहले से भरी सेटिंग आपके स्कैनर से ली गई है: UPI ID `7620721565@ybl`, नाम PRINCE TAILOR, कीमत ₹1,000,
नोट "GST FEES", और स्कैनर इमेज `seed/upi-qr.png`।
**फ़ाइल रिपॉज़िटरी में नहीं रखी गई है** (उसमें किसी व्यक्ति की GST जानकारी है) — चालू करने के बाद
एडमिन पैनल → Settings → **Upload file** से एक बार अपलोड करें। तब तक पेमेंट पेज "Coming soon" दिखाता है।

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
हर deploy के अंत में एक असली खरीदारी (UTR → डाउनलोड → फ़ाइल मिलान) जाँची जाती है और वह test entry मिटा दी जाती है।

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

पूरा फ़्लो जाँचता है: फ़ाइल अपलोड, UTR जमा करना, डाउनलोड, वही UTR दोबारा रोकना, Block, सेटिंग और QR।

## फ़ाइलें

| फ़ाइल | काम |
|---|---|
| `server.js` | सर्वर (Express): पेमेंट, डाउनलोड, एडमिन API |
| `lib/store.js` | डेटा कहाँ रहे: local disk या Cloud Firestore |
| `lib/auth.js`, `lib/state.js` | एडमिन लॉगिन (scrypt hash, signed cookie), शुरुआती सेटिंग |
| `scripts/deploy-setup.js`, `scripts/encrypt-setup.js` | encrypted setup (एडमिन पासवर्ड, फ़ाइल) deploy के समय लागू करना |
| `public/index.html`, `public/app.js` | ग्राहक का पेमेंट पेज |
| `public/admin.html`, `public/admin.js` | एडमिन पैनल |
| `public/styles.css` | डिज़ाइन (लाइट और डार्क मोड, मोबाइल) |
| `seed/upi-qr.png` | आपका स्कैनर — पहली बार चलने पर दिखाया जाता है |
| `test/server.test.js` | टेस्ट |

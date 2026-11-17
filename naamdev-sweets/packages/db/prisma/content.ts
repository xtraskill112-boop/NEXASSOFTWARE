/**
 * Default storefront content. Policies are sensible starting templates — the business must
 * review them with its legal advisor and edit them from Admin → Content → Pages.
 */
export const CONTENT_PAGES = [
  {
    slug: "about",
    title: "About NAAMDEV SWEETS",
    titleHi: "NAAMDEV SWEETS के बारे में",
    seoDescription: "The story of NAAMDEV SWEETS — traditional Indian mithai made fresh every day with pure desi ghee.",
    body: `## Mithaas that feels like home

NAAMDEV SWEETS began with a simple promise: make every sweet the way it was made at home — slowly, honestly and with the best ingredients we can find.

### What makes us different

- **Made fresh every day.** Our kitchen starts at dawn. Fresh sweets are cooked in small batches so they reach you at their best.
- **Pure desi ghee.** We never compromise on the fat that gives Indian sweets their soul.
- **Batch-level freshness tracking.** Every box is linked to a production batch and expiry date, and our system never ships an expired batch.
- **Hygienic, sealed packaging.** Sweets are packed in food-grade, tamper-evident boxes.

### Our kitchen

Our flagship kitchen in Jaipur blends the craft of experienced halwais with modern food-safety practices. From kaju katli to winter gond laddu, every recipe has been perfected over years.

Thank you for making us a part of your celebrations.`,
  },
  {
    slug: "contact",
    title: "Contact us",
    titleHi: "संपर्क करें",
    seoDescription: "Get in touch with NAAMDEV SWEETS for orders, bulk gifting and support.",
    body: `## We'd love to hear from you

For help with an order, the fastest way is to raise a ticket from **Account → Help & support** — it links your order automatically.

- **Customer care:** care@naamdevsweets.com
- **Bulk & corporate gifting:** gifting@naamdevsweets.com
- **Hours:** 8:00 AM – 10:00 PM, all days

You can also use the contact form on this page and our team will respond within one business day.`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy policy",
    titleHi: "गोपनीयता नीति",
    seoDescription: "How NAAMDEV SWEETS collects, uses and protects your personal information.",
    body: `## Privacy policy

This policy explains how NAAMDEV SWEETS ("we", "us") collects and uses personal information when you use our website and apps.

### Information we collect
- **Account information:** name, mobile number, email address and password (stored only as a secure one-way hash).
- **Order information:** delivery addresses, order history and preferences.
- **Payment information:** payments are processed by our payment partner (Razorpay). **We never store your card numbers, CVV or UPI PIN.** We only keep payment reference IDs and status.
- **Location:** your delivery location (only when you choose to share it) and, for delivery partners, live location during active deliveries.
- **Device information:** push-notification tokens and basic technical logs used for security.

### How we use it
To process and deliver orders, provide customer support, send order updates, prevent fraud, and — only if you opt in — send offers.

### Sharing
We share only what's necessary with delivery partners (name, address, phone for your order), payment processors, and messaging providers. We do not sell your data.

### Your choices
You can edit your profile, manage notification preferences, and request account deletion from **Account → Delete account**.

### Security
We use encryption in transit (HTTPS), hashed passwords, role-based access for staff and audit logging of sensitive actions.

### Contact
Questions about privacy: care@naamdevsweets.com.`,
  },
  {
    slug: "terms",
    title: "Terms & conditions",
    titleHi: "नियम और शर्तें",
    seoDescription: "Terms and conditions for using the NAAMDEV SWEETS website and apps.",
    body: `## Terms & conditions

By using NAAMDEV SWEETS you agree to these terms.

1. **Orders.** An order is confirmed when you receive an order confirmation. We may cancel orders affected by stock, pricing errors or delivery constraints, with a full refund of any amount paid.
2. **Pricing.** All prices are in Indian Rupees and inclusive of applicable GST unless stated otherwise. Final amounts are calculated at checkout.
3. **Coupons & points.** Coupons and Mithaas points are subject to their stated conditions and cannot be exchanged for cash.
4. **Delivery.** Delivery times are estimates. Please ensure someone is available to receive perishable items.
5. **Product information.** We describe ingredients and allergens accurately, but sweets are prepared in a kitchen that handles nuts, dairy, gluten and sesame.
6. **Accounts.** You are responsible for keeping your login credentials secure.
7. **Governing law.** These terms are governed by the laws of India, with courts at Jaipur having jurisdiction.`,
  },
  {
    slug: "refund-policy",
    title: "Refund & cancellation policy",
    titleHi: "रिफंड और रद्दीकरण नीति",
    seoDescription: "Cancellation, return and refund policy for NAAMDEV SWEETS orders.",
    body: `## Refund & cancellation policy

### Cancellations
- You can cancel an order yourself until the kitchen starts preparing it (status *Confirmed* or *Processing*).
- After preparation begins, please contact support — perishable items may not be cancellable.

### Returns
Because sweets are perishable, we don't accept returns of opened items. If your order arrives **damaged, incorrect or with a quality issue**, request a return from the order page within **24 hours of delivery** with a short description.

### Refunds
- Online payments are refunded to the original payment method. Banks typically credit refunds within **5–7 working days**.
- Cash-on-delivery refunds are made by bank transfer or UPI after verification.
- Mithaas points used on a cancelled order are restored to your account.`,
  },
  {
    slug: "shipping-policy",
    title: "Shipping & delivery policy",
    titleHi: "शिपिंग और डिलीवरी नीति",
    seoDescription: "Delivery areas, charges and timelines for NAAMDEV SWEETS.",
    body: `## Shipping & delivery policy

- **Delivery areas:** we currently deliver to serviceable PIN codes in Jaipur. Check your PIN code on any product page.
- **Delivery charges:** a small delivery fee applies below the free-delivery threshold shown in your cart. Orders above the threshold ship free.
- **Timelines:** most orders are delivered the same day. Freshly fried items are prepared after you order.
- **Packaging:** all sweets travel in sealed, food-grade boxes; syrup-based sweets are packed in leak-proof tins.
- **Delivery OTP:** to keep your order safe, share the 4-digit delivery OTP with the delivery partner only at your doorstep.`,
  },
];

export const FAQS = [
  { category: "Orders", question: "How fresh are your sweets?", answer: "Fresh sweets are made daily in small batches. Every box is linked to a production batch, and our inventory system automatically blocks expired stock from being sold." },
  { category: "Orders", question: "Can I cancel my order?", answer: "Yes — you can cancel from the order page until the kitchen starts preparing your order. After that, contact support and we'll do our best to help." },
  { category: "Delivery", question: "Where do you deliver?", answer: "We deliver to serviceable PIN codes in Jaipur. Enter your PIN code on any product page to check delivery availability and estimated time." },
  { category: "Delivery", question: "What is the delivery OTP?", answer: "When your order is dispatched we generate a 4-digit OTP. Share it with the delivery partner only when you receive your order — it confirms delivery to the right person." },
  { category: "Delivery", question: "Is delivery free?", answer: "Orders above the free-delivery threshold shown in your cart ship free. Below that, a small delivery fee applies depending on your area." },
  { category: "Payments", question: "Which payment methods do you accept?", answer: "UPI, credit and debit cards and net banking via Razorpay, plus cash on delivery for eligible orders." },
  { category: "Payments", question: "Do you store my card details?", answer: "Never. Payments are processed securely by Razorpay; we only store a payment reference and its status." },
  { category: "Products", question: "Are your sweets vegetarian?", answer: "All our sweets are vegetarian. Our cakes are eggless. Each product page shows a clear veg indicator." },
  { category: "Products", question: "Do your sweets contain nuts?", answer: "Many do. Allergens are listed on every product page. Our kitchen handles nuts, dairy, gluten and sesame, so trace amounts may be present." },
  { category: "Rewards", question: "How do Mithaas points work?", answer: "Earn points on every delivered order and redeem them at checkout for instant discounts. Higher tiers earn points faster." },
  { category: "Gifting", question: "Do you do bulk or corporate orders?", answer: "Yes! Our gift hampers and shagun boxes come in bulk packs. For custom branding or large orders, write to gifting@naamdevsweets.com." },
];

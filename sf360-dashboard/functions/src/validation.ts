import { z } from "zod";
import { HttpsError } from "firebase-functions/https";

/** Shadowfax: 10-14 characters, digits with an optional leading + (CustomerDetails.contact). */
const phone = z
  .string()
  .transform((s) => s.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{10,13}$/, "Phone must be 10-14 digits (an optional + in front)"));

/** Shadowfax: 6-digit Indian pincode starting with 1-9. */
const pincode = z.coerce
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().regex(/^[1-9][0-9]{5}$/, "Pincode must be 6 digits and not start with 0"))
  .transform((s) => Number(s));

const text = (max: number) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .optional()
    .transform((s) => (s ? s : undefined));
const money = z.coerce.number().min(0, "Cannot be negative").max(10_000_000);
const optMoney = z.preprocess((v) => (v === "" || v === null ? undefined : v), money.optional());
const optKg = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().positive("Must be more than 0").max(1000, "Weight is in kg").optional(),
);
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const addressSchema = z.object({
  name: text(100),
  contact: phone,
  alternateContact: z.preprocess((v) => (v === "" || v === null ? undefined : v), phone.optional()),
  address1: text(500),
  address2: optText(250),
  city: text(50),
  state: optText(40),
  pincode,
  email: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.email().max(100).optional()),
  uniqueCode: optText(255),
});
export type AddressInput = z.infer<typeof addressSchema>;

/** Pickup and return addresses: contact person and phone are optional for warehouse / origin legs. */
const looseAddressSchema = addressSchema.extend({
  name: optText(100),
  contact: z.preprocess((v) => (v === "" || v === null ? undefined : v), phone.optional()),
});

export const productSchema = z.object({
  name: text(250),
  skuId: text(100),
  price: money,
  quantity: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(1).max(10_000).optional()),
  category: optText(200),
  hsnCode: optText(100),
  invoiceNo: optText(50),
});

export const forwardOrderSchema = z
  .object({
    orderType: z.enum(["marketplace", "warehouse"]).default("marketplace"),
    clientOrderId: text(100),
    paymentMode: z.enum(["prepaid", "cod"]),
    codAmount: money.default(0),
    productValue: money,
    totalAmount: optMoney,
    actualWeightKg: optKg,
    volumetricWeightKg: optKg,
    ewayBill: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s ? s : undefined))
      .pipe(z.string().regex(/^[0-9]{12}$/, "E-way bill must be exactly 12 digits").optional()),
    sellerGstin: optText(50),
    customer: addressSchema.extend({
      locationType: z.enum(["residential", "commercial"]).optional(),
    }),
    pickup: looseAddressSchema.extend({
      pickupDate: dateStr,
      pickupSlot: optText(50),
    }),
    returnType: z.enum(["seller", "origin"]).default("seller"),
    returnAddress: looseAddressSchema,
    products: z.array(productSchema).min(1, "Add at least one product").max(50),
  })
  .superRefine((o, ctx) => {
    if (o.paymentMode === "prepaid" && o.codAmount !== 0) {
      ctx.addIssue({ code: "custom", path: ["codAmount"], message: "COD amount must be 0 for prepaid orders" });
    }
    if (o.paymentMode === "cod" && !(o.codAmount > 0)) {
      ctx.addIssue({ code: "custom", path: ["codAmount"], message: "COD amount must be more than 0" });
    }
    if (o.productValue >= 50_000 && !o.ewayBill) {
      ctx.addIssue({ code: "custom", path: ["ewayBill"], message: "E-way bill is required when product value is ₹50,000 or more" });
    }
    if (o.productValue >= 50_000 && !o.sellerGstin) {
      ctx.addIssue({ code: "custom", path: ["sellerGstin"], message: "Seller GSTIN is required when product value is ₹50,000 or more" });
    }
    if (o.orderType === "marketplace" && (!o.pickup.name || !o.pickup.contact)) {
      ctx.addIssue({ code: "custom", path: ["pickup", "contact"], message: "Pickup name and phone are required for marketplace orders" });
    }
    if (o.returnType === "seller" && (!o.returnAddress.name || !o.returnAddress.contact)) {
      ctx.addIssue({ code: "custom", path: ["returnAddress", "contact"], message: "Return name and phone are required when returning to seller" });
    }
  });
export type ForwardOrderInput = z.infer<typeof forwardOrderSchema>;

export const reverseOrderSchema = z
  .object({
    clientOrderId: text(200),
    customer: addressSchema.extend({
      locationType: z.enum(["residential", "commercial"]).optional(),
    }),
    returnType: z.enum(["seller", "origin"]),
    returnAddress: looseAddressSchema,
    price: optMoney,
    totalAmount: optMoney,
    ewayBill: z
      .string()
      .trim()
      .optional()
      .transform((s) => (s ? s : undefined))
      .pipe(z.string().regex(/^[0-9]{12}$/, "E-way bill must be exactly 12 digits").optional()),
    actualWeightKg: optKg,
    items: z
      .array(
        z.object({
          name: text(250),
          price: money,
          skuId: optText(100),
          returnReason: optText(200),
          qcRequired: z.boolean().default(false),
          quantity: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(1).max(10_000).optional()),
          brand: optText(200),
          category: optText(200),
          color: optText(200),
          size: optText(200),
        }),
      )
      .min(1, "Add at least one item")
      .max(50),
  })
  .superRefine((o, ctx) => {
    if ((o.price ?? 0) >= 50_000 && !o.ewayBill) {
      ctx.addIssue({ code: "custom", path: ["ewayBill"], message: "E-way bill is required when value is ₹50,000 or more" });
    }
    if (o.returnType === "seller" && (!o.returnAddress.name || !o.returnAddress.contact)) {
      ctx.addIssue({ code: "custom", path: ["returnAddress", "contact"], message: "Seller name and phone are required for return to seller" });
    }
  });
export type ReverseOrderInput = z.infer<typeof reverseOrderSchema>;

const awb = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{4,40}$/, "Invalid AWB number");

export const awbOnlySchema = z.object({ awb });

export const cancelSchema = z.object({
  awb,
  remarks: text(200),
});

const optPhone = z.preprocess((v) => (v === "" || v === null ? undefined : v), phone.optional());
const optPincode = z.preprocess((v) => (v === "" || v === null ? undefined : v), pincode.optional());

export const updateSchema = z
  .object({
    awb,
    delivery: z
      .object({
        contact: optPhone,
        alternateContact: optPhone,
        address: optText(500),
        pincode: optPincode,
      })
      .optional(),
    pickup: z
      .object({
        contact: optPhone,
        alternateContact: optPhone,
        address: optText(500),
        pincode: optPincode,
      })
      .optional(),
    returnDetails: z
      .object({
        contact: optPhone,
        address: optText(500),
        pincode: optPincode,
        email: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.email().max(100).optional()),
      })
      .optional(),
    order: z
      .object({
        codAmount: optMoney,
        ewayBillNumber: optText(12),
        invoiceNumber: optText(50),
        actualWeightKg: optKg,
        volumetricWeightKg: optKg,
      })
      .optional(),
  })
  .refine(
    (u) =>
      [u.delivery, u.pickup, u.returnDetails, u.order].some(
        (section) => section && Object.values(section).some((v) => v !== undefined),
      ),
    "Nothing to update",
  );
export type UpdateInput = z.infer<typeof updateSchema>;

export const ndrSchema = z.object({
  awb,
  action: z.enum(["reopen_ndr", "rts", "rto"]),
  delivery: z
    .object({
      contact: optPhone,
      address: optText(500),
      pincode: optPincode,
    })
    .optional(),
});

export const serviceabilitySchema = z.object({
  kind: z.enum(["forward", "reverse"]),
  orderType: z.enum(["marketplace", "warehouse"]).default("marketplace"),
  returnType: z.enum(["seller", "origin"]).default("seller"),
  pickupPincode: optPincode,
  customerPincode: pincode,
  returnPincode: optPincode,
});

export const rateSchema = z.object({
  originPincode: pincode,
  destinationPincode: pincode,
  service: z.enum(["forward", "reverse", "reverse_qc"]),
  weightKg: optKg,
});

export const labelSchema = z.object({
  awb,
  fileType: z.enum(["pdf", "prn"]).default("pdf"),
});

export const bulkSchema = z.object({
  fileName: optText(200),
  orders: z.array(z.unknown()).min(1, "The file has no rows").max(500, "At most 500 rows per upload"),
});

/**
 * The Firebase callable SDK sends `undefined` object fields as `null`.
 * Treat null as "not provided" everywhere before validating.
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== null && v !== undefined) out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

/** Parses callable input or throws an "invalid-argument" error listing every problem. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(stripNulls(data));
  if (!result.success) {
    throw new HttpsError("invalid-argument", describeIssues(result.error), { issues: issueList(result.error) });
  }
  return result.data;
}

export function issueList(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function describeIssues(error: z.ZodError): string {
  return issueList(error)
    .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
    .join("; ");
}

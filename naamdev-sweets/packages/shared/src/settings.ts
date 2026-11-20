/** Typed business settings stored in the `Setting` table (key → JSON). */
export interface CheckoutSettings {
  minOrderPaise: number;
  freeDeliveryThresholdPaise: number;
  baseDeliveryFeePaise: number;
  codEnabled: boolean;
  codMaxOrderPaise: number;
  onlinePaymentsEnabled: boolean;
  pricesIncludeTax: boolean;
  defaultGstRate: number;
  reservationMinutes: number;
  maxQtyPerItem: number;
  preparationMinutes: number;
}

export interface LoyaltySettings {
  enabled: boolean;
  pointsPer100: number;
  pointValuePaise: number;
  maxRedeemPercent: number;
  minRedeemPoints: number;
  signupBonus: number;
  referrerBonus: number;
  refereeBonus: number;
}

export interface DeliverySettings {
  partnerBaseFeePaise: number;
  partnerPerKmPaise: number;
  offerTimeoutSeconds: number;
  dailyIncentiveTarget: number;
  dailyIncentivePaise: number;
  serviceRadiusKm: number;
  restrictToZones: boolean;
}

export interface StoreProfileSettings {
  name: string;
  legalName: string;
  gstin: string;
  fssaiLicense: string;
  phone: string;
  whatsapp: string;
  email: string;
  supportHours: string;
  address: string;
}

export interface SocialSettings {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  x?: string;
  whatsapp?: string;
}

export interface ReturnSettings {
  enabled: boolean;
  windowHours: number;
}

export interface AnnouncementSettings {
  active: boolean;
  text: string;
  textHi?: string;
  link?: string;
}

export interface NotificationSettings {
  adminAlertEmails: string[];
  lowStockAlerts: boolean;
  expiryAlertDays: number;
}

/**
 * Direct UPI payments to the shop's own UPI ID. The customer pays from their UPI app; there is no
 * gateway callback, so staff confirm each payment against the shop's UPI account before the order
 * is accepted.
 */
export interface UpiSettings {
  enabled: boolean;
  /** UPI ID (VPA) that receives the money, e.g. a Paytm merchant QR ID. */
  vpa: string;
  /** Payee name shown in the customer's UPI app. */
  payeeName: string;
  /** Transaction note; {ORDER_NUMBER} is replaced with the order number. */
  noteTemplate: string;
  /** How long the customer has to pay and submit the UPI reference. */
  payWithinMinutes: number;
}

export interface SettingsMap {
  checkout: CheckoutSettings;
  loyalty: LoyaltySettings;
  delivery: DeliverySettings;
  storeProfile: StoreProfileSettings;
  social: SocialSettings;
  returns: ReturnSettings;
  upi: UpiSettings;
  announcement: AnnouncementSettings;
  notifications: NotificationSettings;
}

export type SettingKey = keyof SettingsMap;

export const DEFAULT_SETTINGS: SettingsMap = {
  checkout: {
    minOrderPaise: 0,
    freeDeliveryThresholdPaise: 10000,
    baseDeliveryFeePaise: 2000,
    codEnabled: true,
    codMaxOrderPaise: 500000,
    onlinePaymentsEnabled: true,
    pricesIncludeTax: true,
    defaultGstRate: 0,
    reservationMinutes: 15,
    maxQtyPerItem: 20,
    preparationMinutes: 25,
  },
  loyalty: {
    enabled: true,
    pointsPer100: 5,
    pointValuePaise: 25,
    maxRedeemPercent: 20,
    minRedeemPoints: 100,
    signupBonus: 50,
    referrerBonus: 200,
    refereeBonus: 100,
  },
  delivery: {
    partnerBaseFeePaise: 3000,
    partnerPerKmPaise: 800,
    offerTimeoutSeconds: 90,
    dailyIncentiveTarget: 10,
    dailyIncentivePaise: 15000,
    serviceRadiusKm: 15,
    restrictToZones: true,
  },
  storeProfile: {
    name: "NAAMDEV SWEETS",
    legalName: "Naamdev Sweets Private Limited",
    gstin: "",
    fssaiLicense: "",
    phone: "",
    whatsapp: "",
    email: "care@naamdevsweets.com",
    supportHours: "8:00 AM – 10:00 PM, all days",
    address: "",
  },
  social: {},
  returns: { enabled: true, windowHours: 24 },
  upi: { enabled: true, vpa: "paytmqr6rgzn2@ptys", payeeName: "RAKESH TAILOR", noteTemplate: "ORDER #{ORDER_NUMBER}", payWithinMinutes: 30 },
  announcement: { active: false, text: "" },
  notifications: { adminAlertEmails: [], lowStockAlerts: true, expiryAlertDays: 2 },
};

export const PUBLIC_SETTING_KEYS: SettingKey[] = ["checkout", "loyalty", "storeProfile", "social", "returns", "announcement"];

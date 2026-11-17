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

export interface SettingsMap {
  checkout: CheckoutSettings;
  loyalty: LoyaltySettings;
  delivery: DeliverySettings;
  storeProfile: StoreProfileSettings;
  social: SocialSettings;
  returns: ReturnSettings;
  announcement: AnnouncementSettings;
  notifications: NotificationSettings;
}

export type SettingKey = keyof SettingsMap;

export const DEFAULT_SETTINGS: SettingsMap = {
  checkout: {
    minOrderPaise: 19900,
    freeDeliveryThresholdPaise: 99900,
    baseDeliveryFeePaise: 4900,
    codEnabled: true,
    codMaxOrderPaise: 500000,
    onlinePaymentsEnabled: true,
    pricesIncludeTax: true,
    defaultGstRate: 5,
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
  announcement: { active: false, text: "" },
  notifications: { adminAlertEmails: [], lowStockAlerts: true, expiryAlertDays: 2 },
};

export const PUBLIC_SETTING_KEYS: SettingKey[] = ["checkout", "loyalty", "storeProfile", "social", "returns", "announcement"];

/**
 * GET /v1/clients/serviceability/?service=<service>&pincodes=<csv>
 * developer.shadowfax.in → Reference → Serviceability: every leg is checked separately,
 * and the tier to look for depends on whether the account is a Regular or Surface client.
 */
import type { SfEnv } from "../config";
import { sfRequest } from "./http";

export type Service =
  | "customer_pickup"
  | "customer_delivery"
  | "seller_pickup"
  | "seller_delivery"
  | "warehouse_pickup"
  | "warehouse_return";

export type SupplyChain = "regular" | "surface";

/** "Which tier to look for" table from the docs. */
export const TIER: Record<Service, Record<SupplyChain, string>> = {
  customer_delivery: { regular: "Regular", surface: "Surface" },
  customer_pickup: { regular: "Regular", surface: "Surface" },
  seller_pickup: { regular: "Marketplace", surface: "Surface_Mkt" },
  seller_delivery: { regular: "RTS", surface: "Surface_RTS" },
  warehouse_pickup: { regular: "dc_pickup", surface: "surface_dc_pickup" },
  warehouse_return: { regular: "RTO", surface: "surface_RTO" },
};

export interface Leg {
  leg: "pickup" | "delivery" | "return";
  service: Service;
  pincode: number;
}

export interface LegResult extends Leg {
  tiers: string[];
  expectedTier: string;
  serviceable: boolean;
}

/** "Which services to check" table from the docs. */
export function legsFor(input: {
  kind: "forward" | "reverse";
  orderType: "marketplace" | "warehouse";
  returnType: "seller" | "origin";
  pickupPincode?: number;
  customerPincode: number;
  returnPincode?: number;
}): Leg[] {
  const legs: Leg[] = [];
  if (input.kind === "forward") {
    const marketplace = input.orderType === "marketplace";
    if (input.pickupPincode) {
      legs.push({ leg: "pickup", service: marketplace ? "seller_pickup" : "warehouse_pickup", pincode: input.pickupPincode });
    }
    legs.push({ leg: "delivery", service: "customer_delivery", pincode: input.customerPincode });
    const returnPin = input.returnPincode ?? input.pickupPincode;
    if (returnPin) {
      const toSeller = marketplace && input.returnType === "seller";
      legs.push({ leg: "return", service: toSeller ? "seller_delivery" : "warehouse_return", pincode: returnPin });
    }
  } else {
    legs.push({ leg: "pickup", service: "customer_pickup", pincode: input.customerPincode });
    if (input.returnPincode) {
      legs.push({
        leg: "return",
        service: input.returnType === "seller" ? "seller_delivery" : "warehouse_return",
        pincode: input.returnPincode,
      });
    }
  }
  return legs;
}

/** Response: [{ code: 560017, services: ["Regular","Surface"] }]. Pincodes that are not covered are simply missing. */
export function tiersFromResponse(data: unknown, pincode: number): string[] {
  if (!Array.isArray(data)) return [];
  for (const row of data) {
    if (row && typeof row === "object" && Number((row as Record<string, unknown>).code) === pincode) {
      const services = (row as Record<string, unknown>).services;
      return Array.isArray(services) ? services.filter((s): s is string => typeof s === "string") : [];
    }
  }
  return [];
}

export function evaluateLeg(leg: Leg, tiers: string[], supplyChain: SupplyChain): LegResult {
  const expectedTier = TIER[leg.service][supplyChain];
  const serviceable = tiers.some((t) => t.toLowerCase() === expectedTier.toLowerCase());
  return { ...leg, tiers, expectedTier, serviceable };
}

export async function fetchTiers(env: SfEnv, service: Service, pincode: number): Promise<string[]> {
  const res = await sfRequest({
    env,
    method: "GET",
    path: "/v1/clients/serviceability/",
    query: { service, pincodes: String(pincode), page: 1, count: 25 },
    retry: "safe",
    budgetMs: 30_000,
  });
  if (res.status !== 200) return [];
  return tiersFromResponse(res.data, pincode);
}

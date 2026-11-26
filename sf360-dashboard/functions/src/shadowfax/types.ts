export interface TrackEvent {
  /** ISO timestamp (UTC). */
  at: string;
  statusId: string;
  status: string;
  location: string | null;
  remarks: string | null;
  source: "track" | "webhook" | "app";
}

/** What we learn about a shipment from one tracking response or webhook. */
export interface TrackSnapshot {
  awb: string;
  clientOrderId: string | null;
  statusId: string | null;
  statusDisplay: string | null;
  events: TrackEvent[];
  trackUrl: string | null;
  paymentMode: "cod" | "prepaid" | null;
  codAmount: number | null;
  productValue: number | null;
  orderDate: string | null;
  deliveryCity: string | null;
  deliveryPincode: number | null;
  returnType: "seller" | "origin" | null;
}

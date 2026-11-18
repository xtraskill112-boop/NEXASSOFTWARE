import { C, db, FieldValue } from "@naamdev/db";
import { logger } from "./logger";

/**
 * Real-time updates without an always-on socket server: the API writes small "live" documents and
 * browsers listen to them with Firestore (security rules decide who may read which document).
 * Each write bumps `version`, so a listener can simply re-fetch the data it shows.
 */
function write(path: string, id: string, data: Record<string, unknown>) {
  db.collection(path)
    .doc(id)
    .set({ ...data, version: FieldValue.increment(1), updatedAt: new Date() }, { merge: true })
    .catch((err) => logger.warn({ err, path, id }, "live update failed"));
}

export const live = {
  /** Order status / assignment changes (read by the customer, the assigned rider and staff). */
  order(orderId: string, data: { userId: string; partnerId?: string | null; status?: string; event: string; [k: string]: unknown }) {
    write(C.liveOrders, orderId, data);
  },
  /** The rider's latest position for a customer's tracking page. */
  orderLocation(orderId: string, data: { lat: number; lng: number; heading: number | null; etaMinutes: number | null; assignmentStatus: string }) {
    write(C.liveOrders, orderId, { event: "location", location: { ...data, at: new Date() } });
  },
  /** A new in-app notification for one user. */
  user(uid: string, notification: { title: string; body: string; link: string | null; type: string }) {
    write(C.liveUsers, uid, { event: "notification", last: { ...notification, at: new Date() } });
  },
  /** New offers / assignment changes for one rider. */
  partner(uid: string, event: "offer" | "withdrawn" | "assignment", data: Record<string, unknown> = {}) {
    write(C.livePartners, uid, { event, last: { ...data, event, at: new Date() } });
  },
  /** Console feed: new orders (chime), order updates and rider positions. */
  staff(event: "new-order" | "order-updated" | "partner-location", data: Record<string, unknown>) {
    write(C.liveStaff, event === "partner-location" ? "partners" : "orders", { event, last: { ...data, event, at: new Date() } });
  },
};

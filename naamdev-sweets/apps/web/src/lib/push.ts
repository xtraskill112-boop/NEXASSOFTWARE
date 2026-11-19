"use client";
import { firebaseApp, firebaseConfig } from "@naamdev/api-client/firebase";
import { api, errorMessage } from "./api";

// Web push needs a VAPID key from Firebase console → Project settings → Cloud Messaging → Web Push certificates.
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window && !!vapidKey;

/** Registers this browser for Firebase Cloud Messaging and stores the token on the account. */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) return "Push notifications are not configured for this site yet.";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "Notifications are blocked in your browser settings.";
    const { apiKey, projectId, messagingSenderId, appId } = firebaseConfig;
    const qs = new URLSearchParams({ apiKey, projectId, messagingSenderId, appId }).toString();
    const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
    const { getMessaging, getToken } = await import("firebase/messaging");
    const token = await getToken(getMessaging(firebaseApp()), { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return "Couldn't get a push token from your browser.";
    await api.post("/account/devices", { token, platform: "web" });
    return "Push notifications enabled on this device ✓";
  } catch (e) {
    return errorMessage(e, "Couldn't enable push notifications.");
  }
}

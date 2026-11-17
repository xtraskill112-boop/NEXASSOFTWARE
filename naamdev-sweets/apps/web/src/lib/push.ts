"use client";
import { api, errorMessage } from "./api";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window && !!cfg.apiKey && !!cfg.projectId && !!vapidKey;

/** Registers this browser for Firebase Cloud Messaging and stores the token on the account. */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) return "Push notifications are not configured for this site yet.";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "Notifications are blocked in your browser settings.";
    const qs = new URLSearchParams(cfg as Record<string, string>).toString();
    const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`);
    const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
    const app = getApps()[0] ?? initializeApp(cfg as Record<string, string>);
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return "Couldn't get a push token from your browser.";
    await api.post("/account/devices", { token, platform: "web" });
    return "Push notifications enabled on this device ✓";
  } catch (e) {
    return errorMessage(e, "Couldn't enable push notifications.");
  }
}

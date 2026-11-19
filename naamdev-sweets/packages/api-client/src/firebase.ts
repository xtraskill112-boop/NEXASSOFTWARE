import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence, connectAuthEmulator, createUserWithEmailAndPassword, EmailAuthProvider, getAuth, indexedDBLocalPersistence, initializeAuth,
  reauthenticateWithCredential, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword,
  verifyBeforeUpdateEmail, type Auth, type User,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot, type Firestore } from "firebase/firestore";

/**
 * Firebase web configuration. These values identify the project to the Firebase SDK; they are
 * public by design (access is enforced by Firebase Auth and the Firestore security rules), and can be
 * overridden per environment with NEXT_PUBLIC_FIREBASE_* variables.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBX1iMZlblRmkRgZIc_C7TQrDPtarYLCtw",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "naamdevseets.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "naamdevseets",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "naamdevseets.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1008791450524",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1008791450524:web:766014b132cc32f0d4ce59",
};

const AUTH_EMULATOR = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_EMULATOR = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;

let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function firebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const app = firebaseApp();
  try {
    authInstance = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  } catch {
    authInstance = getAuth(app);
  }
  if (AUTH_EMULATOR) connectAuthEmulator(authInstance, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  return authInstance;
}

function firestore(): Firestore {
  if (dbInstance) return dbInstance;
  dbInstance = getFirestore(firebaseApp());
  if (FIRESTORE_EMULATOR) {
    const [host, port] = FIRESTORE_EMULATOR.split(":");
    connectFirestoreEmulator(dbInstance, host!, Number(port));
  }
  return dbInstance;
}

/** The current user's ID token, waiting for Firebase to restore a saved sign-in on page load. */
export async function currentIdToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const auth = firebaseAuth();
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export const signIn = (email: string, password: string) => signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);

export async function signUp(email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  // Firebase emails a verification link; the account works immediately either way.
  sendEmailVerification(cred.user).catch(() => undefined);
  return cred;
}

export const sendPasswordReset = (email: string) => sendPasswordResetEmail(firebaseAuth(), email.trim());
export const signOutFirebase = () => signOut(firebaseAuth());

/** Changing the password needs the current one (Firebase requires a recent sign-in). */
export async function changePassword(currentPassword: string, newPassword: string) {
  const user = firebaseAuth().currentUser;
  if (!user?.email) throw new Error("Please sign in again.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  await updatePassword(user, newPassword);
}

/** Sends a confirmation link to the new address; the email changes once it's clicked. */
export async function changeEmail(currentPassword: string, newEmail: string) {
  const user = firebaseAuth().currentUser;
  if (!user?.email) throw new Error("Please sign in again.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  await verifyBeforeUpdateEmail(user, newEmail.trim());
}

export const resendVerification = async () => {
  const user = firebaseAuth().currentUser;
  if (user && !user.emailVerified) await sendEmailVerification(user);
};

export function onFirebaseUser(cb: (user: User | null) => void) {
  return firebaseAuth().onIdTokenChanged(cb);
}

/** Human-friendly messages for Firebase Auth errors. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Log in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Choose a stronger password (at least 8 characters with letters and numbers).";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/network-request-failed":
      return "You appear to be offline. Please check your connection.";
    case "auth/requires-recent-login":
      return "For your security, please log in again and retry.";
    case "auth/missing-password":
      return "Enter your password.";
    default:
      return (err as Error | null)?.message?.replace(/^Firebase: /, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "") || "Something went wrong. Please try again.";
  }
}

export interface LiveSignal {
  version?: number;
  event?: string;
  [k: string]: unknown;
}

/**
 * Listens to one of the API's live signal documents (liveOrders, liveUsers, livePartners, liveStaff).
 * Calls `onChange` with each new version; re-attaches after transient errors (e.g. token refresh).
 */
export function watchLive(collection: "liveOrders" | "liveUsers" | "livePartners" | "liveStaff", id: string, onChange: (data: LiveSignal | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  let stopped = false;
  let unsub: (() => void) | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const attach = () => {
    unsub = onSnapshot(
      doc(firestore(), collection, id),
      (snap) => onChange(snap.exists() ? (snap.data() as LiveSignal) : null),
      () => {
        unsub?.();
        unsub = null;
        if (!stopped) retry = setTimeout(attach, 5000);
      },
    );
  };
  attach();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    unsub?.();
  };
}

export type { User as FirebaseUser };

/**
 * Credentials for the NAAMDEV Partner Android app's background GPS service: the Firebase refresh
 * token lets it mint fresh ID tokens while the rider navigates in another app. Null when signed out.
 */
export function nativeAuthHandoff(): string | null {
  const user = typeof window === "undefined" ? null : firebaseAuth().currentUser;
  if (!user) return null;
  return JSON.stringify({
    apiKey: firebaseConfig.apiKey,
    refreshToken: user.refreshToken,
    tokenUrl: AUTH_EMULATOR ? `http://${AUTH_EMULATOR}/securetoken.googleapis.com/v1/token` : "https://securetoken.googleapis.com/v1/token",
  });
}

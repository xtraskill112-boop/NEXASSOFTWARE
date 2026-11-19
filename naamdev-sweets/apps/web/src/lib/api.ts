import { ApiError, createApiClient } from "@naamdev/api-client";
import { currentIdToken } from "@naamdev/api-client/firebase";

const CART_KEY = "nd_cart_token";

/** Guest-cart token: the API issues it on first add and clears it once the cart joins an account. */
const cartToken = {
  get: () => {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(CART_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) window.localStorage.setItem(CART_KEY, token);
      else window.localStorage.removeItem(CART_KEY);
    } catch {
      /* storage unavailable (private mode) — the cart lasts for this page only */
    }
  },
};

export const api = createApiClient({ app: "web", getToken: currentIdToken, cartToken });
export { ApiError };

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

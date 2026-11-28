import { CheckCircle2, XCircle } from "lucide-react";
import type { ServiceabilityResult } from "../api";

const LEG_LABEL = { pickup: "Pickup", delivery: "Delivery", return: "Return" } as const;

export function ServiceabilityView({ result }: { result: ServiceabilityResult }) {
  return (
    <div className="rounded-lg ring-1 ring-line">
      <p className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${result.serviceable ? "bg-good-soft text-good" : "bg-critical-soft text-critical"}`}>
        {result.serviceable ? "All legs are serviceable" : "Not serviceable — Shadowfax will reject this order"}
      </p>
      <ul className="divide-y divide-line text-sm">
        {result.legs.map((l) => (
          <li key={`${l.leg}-${l.service}`} className="flex items-start gap-2 px-3 py-2">
            {l.serviceable ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-label="Serviceable" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-critical" aria-label="Not serviceable" />
            )}
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {LEG_LABEL[l.leg]} · {l.pincode}
              </p>
              <p className="text-xs text-ink-3">
                {l.service} — needs “{l.expectedTier}” ({result.supplyChain}); available: {l.tiers.length ? l.tiers.join(", ") : "none"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

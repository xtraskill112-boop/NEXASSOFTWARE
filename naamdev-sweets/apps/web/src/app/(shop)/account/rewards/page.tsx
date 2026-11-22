"use client";
import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { formatINR, type LoyaltyTier } from "@naamdev/shared";
import { Card, Pagination, Skeleton, cn } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { api } from "@/lib/api";

interface Loyalty {
  balance: number; lifetimePoints: number; valuePaise: number; tier: LoyaltyTier; next: { tier: LoyaltyTier; pointsNeeded: number } | null; tiers: LoyaltyTier[];
  settings: { pointsPer100: number; pointValuePaise: number; maxRedeemPercent: number; minRedeemPoints: number };
  items: { id: string; type: string; points: number; balanceAfter: number; description: string; createdAt: string }[]; meta: { totalPages: number };
}

export default function RewardsPage() {
  const [d, setD] = useState<Loyalty | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { api.get<Loyalty>("/account/loyalty", { query: { page } }).then(setD); }, [page]);
  if (!d) return <Skeleton className="h-96" />;
  const progress = d.next ? Math.min(100, (d.lifetimePoints / d.next.tier.minLifetime) * 100) : 100;
  return (
    <div className="max-w-3xl">
      <PageTitle title="Mithaas Rewards" subtitle={`Earn ${d.settings.pointsPer100} points per ₹100 · 1 point = ${formatINR(d.settings.pointValuePaise)}`} />
      <Card className="relative overflow-hidden border-0 bg-[#F4E6BE] p-6 text-maroon-950 sm:p-8">
        <div className="nd-pattern absolute inset-0 opacity-30" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[13px] font-semibold">Your balance</p>
            <p className="mt-1 font-display text-5xl font-semibold">{d.balance.toLocaleString("en-IN")} <span className="text-xl">pts</span></p>
            <p className="mt-1 text-sm font-semibold">Worth {formatINR(d.valuePaise)} on your next order</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-maroon-900 px-3 py-1.5 text-xs font-bold text-gold-300"><Crown className="h-4 w-4" />{d.tier.name}</span>
        </div>
        {d.next && (
          <div className="relative mt-6">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/40"><div className="h-full rounded-full bg-maroon-800" style={{ width: `${progress}%` }} /></div>
            <p className="mt-2 text-xs font-semibold">{d.next.pointsNeeded} more lifetime points to unlock {d.next.tier.name}</p>
          </div>
        )}
      </Card>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {d.tiers.map((t) => (
          <Card key={t.key} className={cn("p-4", t.key === d.tier.key && "ring-2 ring-maroon-700")}>
            <p className="font-display text-lg font-semibold" style={{ color: t.color }}>{t.name}</p>
            <p className="text-xs text-muted">{t.minLifetime ? `${t.minLifetime}+ lifetime points` : "Starting tier"}</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">{t.perks.map((p) => <li key={p}>• {p}</li>)}</ul>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Redeem up to {d.settings.maxRedeemPercent}% of an order (minimum {d.settings.minRedeemPoints} points) at checkout. Points are credited once your order is delivered.</p>
      <Card className="mt-6 p-5">
        <h2 className="mb-3 font-display text-xl font-semibold text-ink">Points history</h2>
        {d.items.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
          <ul className="divide-y divide-line-soft">
            {d.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div><p className="font-medium text-ink">{i.description}</p><p className="text-xs text-muted">{new Date(i.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p></div>
                <span className={cn("font-bold tabular-nums", i.points > 0 ? "text-pista-600" : "text-maroon-600")}>{i.points > 0 ? "+" : ""}{i.points}</span>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} totalPages={d.meta.totalPages} onChange={setPage} className="mt-3" />
      </Card>
    </div>
  );
}

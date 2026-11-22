"use client";
import { useEffect, useState } from "react";
import { Copy, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Skeleton } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { SITE_URL, api } from "@/lib/api";

interface Ref { code: string; referrerBonus: number; refereeBonus: number; totalEarned: number; referrals: { id: string; name: string; status: string; rewardPoints: number; joinedAt: string }[] }

export default function ReferralsPage() {
  const [d, setD] = useState<Ref | null>(null);
  useEffect(() => { api.get<Ref>("/account/referrals").then(setD); }, []);
  if (!d) return <Skeleton className="h-80" />;
  const msg = `Order fresh sweets from NAAMDEV SWEETS! Use my code ${d.code} when you sign up and get ${d.refereeBonus} bonus Mithaas points. ${SITE_URL}/login`;
  return (
    <div className="max-w-3xl">
      <PageTitle title="Refer & earn" />
      <Card className="nd-gradient-maroon relative overflow-hidden border-0 p-6 text-cream-100 sm:p-8">
        <div className="nd-pattern absolute inset-0 opacity-25" />
        <Gift className="relative h-10 w-10 text-cream-300" />
        <p className="relative mt-3 font-display text-3xl font-semibold">Share mithaas, earn {d.referrerBonus} points</p>
        <p className="relative mt-2 text-sm text-cream-200/80">Your friend gets {d.refereeBonus} points after their first delivered order — and so do you.</p>
        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-2xl border-2 border-dashed border-line bg-white/10 px-5 py-3 font-mono text-2xl font-bold tracking-[0.2em]">{d.code}</span>
          <Button variant="white" onClick={async () => { await navigator.clipboard?.writeText(d.code); toast.success("Code copied"); }}><Copy className="h-4 w-4" />Copy</Button>
          <Button variant="white" onClick={async () => { if (navigator.share) await navigator.share({ title: "NAAMDEV SWEETS", text: msg }).catch(() => undefined); else { await navigator.clipboard?.writeText(msg); toast.success("Invite message copied"); } }}><Share2 className="h-4 w-4" />Share</Button>
        </div>
      </Card>
      <Card className="mt-6 p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-semibold text-ink">Your referrals</h2><span className="text-sm font-semibold text-pista-600">{d.totalEarned} pts earned</span></div>
        {d.referrals.length === 0 ? <p className="text-sm text-muted">No referrals yet — share your code to get started.</p> : (
          <ul className="divide-y divide-line-soft">{d.referrals.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-3 text-sm"><div><p className="font-semibold text-ink">{r.name}</p><p className="text-xs text-muted">Joined {new Date(r.joinedAt).toLocaleDateString("en-IN")}</p></div><Badge tone={r.status === "COMPLETED" ? "success" : "warning"}>{r.status === "COMPLETED" ? `+${r.rewardPoints} pts` : "Awaiting first order"}</Badge></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}

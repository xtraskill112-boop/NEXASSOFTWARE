"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { tierFor, nextTier, formatINR } from "@naamdev/shared";
import { Avatar, Card, InlineAlert } from "@naamdev/ui";
import { useAccountLinks } from "@/components/account/nav";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle, ThemeToggle } from "@/components/layout/header";

export default function AccountHome() {
  const { user, logout, wishlist } = useAuth();
  const { t } = useI18n();
  const links = useAccountLinks();
  const [orders, setOrders] = useState<number | null>(null);
  useEffect(() => { api.get<{ meta: { total: number } }>("/orders", { query: { pageSize: 1 } }).then((r) => setOrders(r.meta.total)).catch(() => undefined); }, []);
  if (!user) return null;
  const tier = tierFor(user.lifetimePoints);
  const nxt = nextTier(user.lifetimePoints);
  return (
    <div className="mx-auto max-w-4xl">
      <Card className="nd-gradient-royal relative overflow-hidden border-0 p-6 text-cream-100 sm:p-8">
        <div className="nd-pattern absolute inset-0 opacity-25" />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar name={user.name} src={user.avatarUrl} size={72} className="ring-4 ring-white/20" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold">{user.name}</h1>
            <p className="text-sm text-cream-200/80">{user.phone} {user.email && `· ${user.email}`}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ color: tier.color === "#9CA3AF" ? "#F5E9D3" : tier.color }}>👑 {tier.name}</span>
          </div>
          <Link href="/account/profile" className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">Edit profile</Link>
        </div>
        <div className="relative mt-6 grid grid-cols-3 gap-3 text-center">
          {[["Orders", orders ?? "—", "/account/orders"], ["Mithaas points", user.loyaltyPoints, "/account/rewards"], ["Wishlist", wishlist.size, "/account/wishlist"]].map(([l, v, h]) => (
            <Link key={l as string} href={h as string} className="rounded-2xl bg-white/10 px-2 py-3 transition hover:bg-white/20"><p className="font-display text-2xl font-semibold">{v}</p><p className="text-[11px] font-semibold uppercase tracking-wider text-cream-200/75">{l}</p></Link>
          ))}
        </div>
        {nxt && <p className="relative mt-4 text-center text-xs text-cream-200/75">Earn {nxt.pointsNeeded} more points to unlock {nxt.tier.name} · worth {formatINR(user.loyaltyPoints * 25)} today</p>}
      </Card>
      {user.status === "DELETION_REQUESTED" && <InlineAlert tone="warning" className="mt-4">Your account deletion request is pending. <Link href="/account/security" className="font-semibold underline">Cancel request</Link></InlineAlert>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="group flex items-center gap-4 rounded-2xl border border-line-soft bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-saffron-50 text-saffron-700 dark:bg-saffron-500/10 dark:text-saffron-300"><Icon className="h-5 w-5" /></span>
            <span className="flex-1 font-semibold text-ink">{label}</span>
            <ChevronRight className="h-5 w-5 text-muted transition group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between rounded-2xl border border-line-soft bg-surface p-3">
        <div className="flex items-center gap-1"><LanguageToggle /><ThemeToggle /></div>
        <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-maroon-700 hover:bg-maroon-50 dark:text-maroon-300"><LogOut className="h-4 w-4" />{t("common.logout")}</button>
      </div>
    </div>
  );
}

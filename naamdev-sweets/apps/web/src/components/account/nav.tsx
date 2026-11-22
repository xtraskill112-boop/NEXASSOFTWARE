"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bookmark, Crown, Gift, Heart, LifeBuoy, LogOut, MapPin, Package, ShieldCheck, Star, TicketPercent, User } from "lucide-react";
import { cn } from "@naamdev/ui";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";

export function useAccountLinks() {
  const { t } = useI18n();
  return [
    { href: "/account/orders", label: t("account.orders"), icon: Package },
    { href: "/account/profile", label: t("account.profile"), icon: User },
    { href: "/account/addresses", label: t("account.addresses"), icon: MapPin },
    { href: "/account/wishlist", label: t("account.wishlist"), icon: Heart },
    { href: "/account/saved", label: t("account.savedCart"), icon: Bookmark },
    { href: "/account/rewards", label: t("account.loyalty"), icon: Crown },
    { href: "/account/coupons", label: t("account.coupons"), icon: TicketPercent },
    { href: "/account/referrals", label: t("account.referral"), icon: Gift },
    { href: "/account/reviews", label: t("account.reviews"), icon: Star },
    { href: "/account/notifications", label: t("account.notifications"), icon: Bell },
    { href: "/account/support", label: t("account.support"), icon: LifeBuoy },
    { href: "/account/security", label: t("account.security"), icon: ShieldCheck },
  ];
}

export function AccountNav() {
  const pathname = usePathname();
  const links = useAccountLinks();
  const { logout } = useAuth();
  const { unread } = useRealtime();
  const { t } = useI18n();
  return (
    <nav aria-label="Account" className="rounded-3xl border border-line-soft bg-surface p-2 shadow-card">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition", active ? "bg-surface-2 text-maroon-800  dark:text-maroon-200" : "text-ink-soft hover:bg-surface-2")}>
            <Icon className="h-[18px] w-[18px]" />{label}
            {href === "/account/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-maroon-700 px-2 text-[10px] font-bold text-white">{unread}</span>}
          </Link>
        );
      })}
      <button type="button" onClick={() => void logout()} className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-maroon-700 hover:bg-maroon-50 dark:text-maroon-300 dark:hover:bg-maroon-500/10"><LogOut className="h-[18px] w-[18px]" />{t("common.logout")}</button>
    </nav>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link href="/account" className="mb-2 inline-block text-xs font-semibold text-muted hover:text-ink lg:hidden">← My account</Link>
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

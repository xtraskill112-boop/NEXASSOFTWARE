"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Search, TicketPercent, UserRound } from "lucide-react";
import { cn } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  if (pathname.startsWith("/checkout")) return null;
  const items = [
    { href: "/", label: t("nav.home"), icon: Home, match: (p: string) => p === "/" },
    { href: "/categories", label: t("nav.categories"), icon: LayoutGrid, match: (p: string) => p.startsWith("/categor") || p.startsWith("/collections") },
    { href: "/search", label: t("nav.search"), icon: Search, match: (p: string) => p.startsWith("/search") },
    { href: "/offers", label: t("nav.offers"), icon: TicketPercent, match: (p: string) => p.startsWith("/offers") },
    { href: "/account", label: t("nav.account"), icon: UserRound, match: (p: string) => p.startsWith("/account") || p.startsWith("/login") },
  ];
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg-elevated pb-[env(safe-area-inset-bottom)] md:hidden no-print">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link href={href} className="relative flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-semibold" aria-current={active ? "page" : undefined}>
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-maroon-700 dark:bg-maroon-200" />}
                <Icon className={cn("h-[21px] w-[21px]", active ? "text-maroon-700 dark:text-maroon-200" : "text-muted")} strokeWidth={active ? 2.2 : 1.8} />
                <span className={active ? "text-ink" : "text-muted"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

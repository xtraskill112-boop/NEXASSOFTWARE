"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
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
    <nav aria-label="Primary" className="nd-glass fixed inset-x-0 bottom-0 z-50 border-t border-line-soft pb-[env(safe-area-inset-bottom)] md:hidden no-print">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link href={href} className="relative flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-semibold" aria-current={active ? "page" : undefined}>
                {active && <motion.span layoutId="bn-pill" className="absolute top-1 h-8 w-14 rounded-full bg-saffron-100 dark:bg-saffron-500/15" transition={{ type: "spring", damping: 30, stiffness: 380 }} />}
                <Icon className={cn("relative h-[22px] w-[22px] transition", active ? "text-saffron-700 dark:text-saffron-300" : "text-muted")} strokeWidth={active ? 2.4 : 1.9} />
                <span className={cn("relative", active ? "text-ink" : "text-muted")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

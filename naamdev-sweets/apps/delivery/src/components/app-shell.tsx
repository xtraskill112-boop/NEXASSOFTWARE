"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Home, User, Wallet } from "lucide-react";
import { BrandLoader, Logo, cn } from "@naamdev/ui";
import { usePartner } from "@/lib/partner";

const TABS = [["/", "Home", Home], ["/earnings", "Earnings", Wallet], ["/history", "History", History], ["/profile", "Profile", User]] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, partner } = usePartner();
  const pathname = usePathname();
  if (!me) return <BrandLoader className="min-h-dvh" label="Loading" />;
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg-elevated px-4 py-3">
        <Logo size="sm" subtitle="Partner" />
        {partner && <span className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", partner.isOnline ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-surface-2 text-muted")}>{partner.isOnline ? "● Online" : "Offline"}</span>}
      </header>
      <main className="px-4 py-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg-elevated pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(([href, label, Icon]) => {
            const on = href === "/" ? pathname === "/" || pathname.startsWith("/delivery") : pathname.startsWith(href);
            return <li key={href}><Link href={href} className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold", on ? "text-maroon-700 dark:text-maroon-200" : "text-muted")}><Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.4 : 1.9} />{label}</Link></li>;
          })}
        </ul>
      </nav>
    </div>
  );
}

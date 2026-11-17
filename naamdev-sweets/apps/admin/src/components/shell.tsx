"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BadgeIndianRupee, BarChart3, Bell, Boxes, ClipboardList, FileText, FolderTree, Gauge, Image as ImageIcon, LayoutGrid, LifeBuoy, LogOut, Menu, Megaphone,
  Moon, Package, Percent, ScrollText, Settings, ShieldCheck, Star, Store, Sun, Truck, UserCog, Users, X, Undo2, Layers, MapPinned, Factory, CalendarClock,
} from "lucide-react";
import type { PermissionKey } from "@naamdev/shared";
import { Avatar, BrandLoader, Logo, cn } from "@naamdev/ui";
import { useAdmin } from "@/lib/auth";
import { useAdminRealtime } from "@/lib/realtime";
import { STOREFRONT_URL } from "@/lib/api";

type Item = { href: string; label: string; icon: typeof Gauge; any: PermissionKey[] };
const NAV: { group: string; items: Item[] }[] = [
  { group: "Overview", items: [
    { href: "/", label: "Dashboard", icon: Gauge, any: ["dashboard.view"] },
    { href: "/reports", label: "Reports", icon: BarChart3, any: ["analytics.view", "reports.export"] },
  ] },
  { group: "Operations", items: [
    { href: "/orders", label: "Orders", icon: ClipboardList, any: ["orders.view"] },
    { href: "/kitchen", label: "Kitchen board", icon: Store, any: ["orders.process"] },
    { href: "/delivery/live", label: "Live delivery", icon: MapPinned, any: ["delivery.manage"] },
    { href: "/delivery/partners", label: "Delivery partners", icon: Truck, any: ["partners.manage", "delivery.manage"] },
    { href: "/returns", label: "Refunds & returns", icon: Undo2, any: ["refunds.manage"] },
    { href: "/payments", label: "Payments", icon: BadgeIndianRupee, any: ["payments.view"] },
  ] },
  { group: "Catalog", items: [
    { href: "/products", label: "Products", icon: Package, any: ["products.view"] },
    { href: "/categories", label: "Categories", icon: FolderTree, any: ["categories.manage"] },
    { href: "/collections", label: "Collections", icon: Layers, any: ["categories.manage", "content.manage"] },
  ] },
  { group: "Inventory", items: [
    { href: "/inventory", label: "Stock", icon: Boxes, any: ["inventory.view"] },
    { href: "/inventory/expiry", label: "Expiry", icon: CalendarClock, any: ["inventory.view"] },
    { href: "/inventory/purchases", label: "Purchases", icon: FileText, any: ["inventory.view"] },
    { href: "/inventory/suppliers", label: "Suppliers", icon: Factory, any: ["inventory.view"] },
  ] },
  { group: "Customers", items: [
    { href: "/customers", label: "Customers", icon: Users, any: ["customers.view"] },
    { href: "/reviews", label: "Reviews", icon: Star, any: ["reviews.moderate"] },
    { href: "/support", label: "Support tickets", icon: LifeBuoy, any: ["support.view"] },
  ] },
  { group: "Marketing & content", items: [
    { href: "/coupons", label: "Coupons", icon: Percent, any: ["coupons.manage"] },
    { href: "/content/banners", label: "Banners", icon: ImageIcon, any: ["content.manage"] },
    { href: "/content/home", label: "Home sections", icon: LayoutGrid, any: ["content.manage"] },
    { href: "/content/pages", label: "Pages & FAQs", icon: ScrollText, any: ["content.manage"] },
    { href: "/broadcast", label: "Notifications", icon: Megaphone, any: ["notifications.send"] },
  ] },
  { group: "Administration", items: [
    { href: "/staff", label: "Staff & roles", icon: UserCog, any: ["staff.manage", "roles.manage"] },
    { href: "/settings", label: "Settings", icon: Settings, any: ["settings.manage"] },
    { href: "/audit", label: "Audit log", icon: ShieldCheck, any: ["audit.view"] },
  ] },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { canAny } = useAdmin();
  return (
    <nav aria-label="Console" className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5"><Logo size="sm" tone="light" subtitle="Console" /></div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => {
          const items = g.items.filter((i) => canAny(...i.any));
          if (!items.length) return null;
          return (
            <div key={g.group} className="mt-4">
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cream-200/45">{g.group}</p>
              {items.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname === href || (pathname.startsWith(href + "/") && !NAV.some((x) => x.items.some((y) => y.href !== href && y.href.startsWith(href + "/") && pathname.startsWith(y.href))));
                return (
                  <Link key={href} href={href} onClick={onNavigate} className={cn("group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition", active ? "bg-gradient-to-r from-saffron-500/90 to-saffron-600/80 text-white shadow-glow" : "text-cream-200/75 hover:bg-white/8 hover:text-white")}>
                    <Icon className="h-[17px] w-[17px]" />{label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAdmin();
  const { unread } = useAdminRealtime();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (me === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [me, router, pathname]);
  if (!me) return <BrandLoader className="min-h-dvh" label="Opening console" />;
  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="nd-gradient-royal fixed inset-y-0 left-0 z-40 hidden w-64 lg:block no-print"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="nd-gradient-royal absolute inset-y-0 left-0 w-72"><button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-4 text-cream-100"><X /></button><Sidebar onNavigate={() => setOpen(false)} /></aside>
        </div>
      )}
      <header className="nd-glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line-soft px-4 sm:px-6 no-print">
        <button type="button" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">Namaste, {me.name.split(" ")[0]} 🙏</p>
          <p className="truncate text-xs text-muted">{me.role.name}{me.staff ? ` · ${me.staff.designation}` : ""}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <a href={STOREFRONT_URL} target="_blank" rel="noreferrer" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-2 sm:block">View store ↗</a>
          <button type="button" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="grid h-10 w-10 place-items-center rounded-xl text-ink-soft hover:bg-surface-2">{mounted && resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          <Link href="/notifications" aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-xl text-ink-soft hover:bg-surface-2"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-maroon-700 px-1 text-[9px] font-bold text-white">{unread}</span>}</Link>
          <Avatar name={me.name} src={me.avatarUrl} size={36} className="ml-1" />
          <button type="button" aria-label="Log out" onClick={() => void logout()} className="grid h-10 w-10 place-items-center rounded-xl text-ink-soft hover:bg-surface-2"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

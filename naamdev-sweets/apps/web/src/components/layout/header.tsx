"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Heart, MapPin, Moon, Search, ShoppingBag, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, Emblem, Logo, buttonStyles, cn } from "@naamdev/ui";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { useLocation } from "@/lib/location";
import { useRealtime } from "@/lib/realtime";
import { useSettings } from "@/lib/settings";
import { LocationSheet } from "./location-sheet";

export function IconButton({ href, label, children, badge, onClick, className }: { href?: string; label: string; children: React.ReactNode; badge?: number; onClick?: () => void; className?: string }) {
  const cls = cn("relative grid h-10 w-10 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink", className);
  const b = badge ? (
    <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-maroon-700 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg-elevated">
      {badge > 99 ? "99+" : badge}
    </span>
  ) : null;
  return href ? (
    <Link href={href} aria-label={label} className={cls}>{children}{b}</Link>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>{children}{b}</button>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <IconButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(dark ? "light" : "dark")} className={className}>
      {dark ? <Sun className="h-[19px] w-[19px]" /> : <Moon className="h-[19px] w-[19px]" />}
    </IconButton>
  );
}

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  return (
    <IconButton label={locale === "en" ? "हिन्दी में देखें" : "View in English"} onClick={() => { setLocale(locale === "en" ? "hi" : "en"); router.refresh(); }} className={className}>
      <span className="text-[14px] font-bold">{locale === "en" ? "हि" : "EN"}</span>
    </IconButton>
  );
}

export function SearchTrigger({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Link href="/search" className={cn("flex h-12 min-w-0 items-center gap-3 rounded-xl border border-line bg-surface px-4 text-muted shadow-[0_2px_8px_rgb(16_16_24/0.06)] transition-colors hover:border-ink-soft/40", className)} aria-label={t("common.search")}>
      <Search className="h-5 w-5 shrink-0 text-maroon-700 dark:text-maroon-200" />
      <span className="truncate text-[15px]">{t("common.searchPlaceholder")}</span>
    </Link>
  );
}

function LocationButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  const { t } = useI18n();
  const { location } = useLocation();
  const place = location ? `${location.area ?? location.city ?? ""} ${location.pincode}`.trim() : t("common.selectLocation");
  if (compact)
    return (
      <button type="button" onClick={onClick} aria-label={`${t("common.deliverTo")}: ${place}`} className="flex min-w-0 items-center gap-2 text-left">
        <MapPin className="h-5 w-5 shrink-0 text-maroon-700 dark:text-maroon-200" fill="currentColor" fillOpacity={0.12} />
        <span className="min-w-0 leading-tight">
          <span className="flex items-center gap-0.5 text-[16px] font-extrabold text-ink">
            <span className="truncate">{location ? location.area ?? location.city ?? location.pincode : t("common.selectLocation")}</span>
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          </span>
          <span className="block truncate text-[12px] text-muted">{location ? `${t("common.deliverTo")} ${location.pincode}` : t("common.deliverTo")}</span>
        </span>
      </button>
    );
  return (
    <button type="button" onClick={onClick} className="ml-2 hidden max-w-[220px] shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 md:flex">
      <MapPin className="h-[18px] w-[18px] shrink-0 text-maroon-700 dark:text-maroon-200" />
      <span className="min-w-0 leading-tight">
        <span className="block text-[12px] text-muted">{t("common.deliverTo")}</span>
        <span className="flex items-center gap-1 text-[14px] font-semibold text-ink">
          <span className="truncate">{place}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </span>
      </span>
    </button>
  );
}

export function Header() {
  const { user } = useAuth();
  const { count, bump } = useCart();
  const { unread } = useRealtime();
  const { t } = useI18n();
  const settings = useSettings();
  const pathname = usePathname();
  const [locOpen, setLocOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  // Publish the header's height so sticky bars below it (menu, filters) and anchor jumps line up.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--nd-header-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hideSearch = pathname.startsWith("/search") || pathname.startsWith("/checkout");
  const announcement = settings?.announcement?.active ? settings.announcement : null;

  return (
    <>
      {announcement && (
        <div className="bg-maroon-800 px-4 py-2 text-center text-[13px] font-medium text-cream-100 no-print">
          {announcement.link ? <Link href={announcement.link} className="underline underline-offset-2">{announcement.text}</Link> : announcement.text}
        </div>
      )}
      <header ref={headerRef} className="sticky top-0 z-50 bg-bg-elevated shadow-[0_1px_0_var(--nd-line)] no-print">
        <div className="mx-auto flex h-[60px] max-w-7xl items-center gap-2.5 px-4 sm:h-16 sm:px-6">
          <Link href="/" aria-label="NAAMDEV SWEETS home" className="shrink-0">
            <Emblem size={32} className="sm:hidden" />
            <Logo size="md" className="hidden sm:inline-flex" />
          </Link>
          <div className="min-w-0 flex-1 sm:hidden"><LocationButton compact onClick={() => setLocOpen(true)} /></div>
          <LocationButton onClick={() => setLocOpen(true)} />
          {!hideSearch && <SearchTrigger className="mx-3 hidden max-w-xl flex-1 lg:flex" />}
          <div className="ml-auto flex items-center gap-0.5">
            <nav className="mr-2 hidden items-center xl:flex">
              {[["/categories", t("nav.categories")], ["/offers", t("nav.offers")], ["/category/namkeen", t("nav.namkeen")]].map(([href, label]) => (
                <Link key={href} href={href!} className={cn("rounded-md px-3 py-2 text-[15px] font-semibold transition-colors hover:text-maroon-700 dark:hover:text-maroon-200", pathname === href ? "text-maroon-700 dark:text-maroon-200" : "text-ink-soft")}>{label}</Link>
              ))}
            </nav>
            <LanguageToggle className="hidden sm:grid" />
            <ThemeToggle className="hidden sm:grid" />
            {user && <IconButton href="/account/notifications" label="Notifications" badge={unread} className="hidden sm:grid"><Bell className="h-[19px] w-[19px]" /></IconButton>}
            <IconButton href="/account/wishlist" label={t("nav.wishlist")} className="hidden sm:grid"><Heart className="h-[19px] w-[19px]" /></IconButton>
            <motion.div key={bump} animate={bump ? { scale: [1, 1.1, 1] } : undefined} transition={{ duration: 0.25 }}>
              <IconButton href="/cart" label={t("nav.cart")} badge={count}><ShoppingBag className="h-[19px] w-[19px]" /></IconButton>
            </motion.div>
            {user ? (
              <Link href="/account" className="ml-1.5 hidden rounded-full sm:block" aria-label={t("nav.account")}>
                <Avatar name={user.name} src={user.avatarUrl} size={34} />
              </Link>
            ) : user === null ? (
              <Link href="/login" className={buttonStyles({ size: "sm", className: "ml-1.5 hidden sm:inline-flex" })}><User className="h-4 w-4" />{t("common.login")}</Link>
            ) : null}
          </div>
        </div>
        {!hideSearch && (
          <div className="px-4 pb-3 sm:px-6 lg:hidden">
            <SearchTrigger />
          </div>
        )}
      </header>
      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
    </>
  );
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, Heart, Languages, MapPin, Moon, Search, ShoppingBag, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, Logo, buttonStyles, cn } from "@naamdev/ui";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { useLocation } from "@/lib/location";
import { useRealtime } from "@/lib/realtime";
import { useSettings } from "@/lib/settings";
import { LocationSheet } from "./location-sheet";

const PLACEHOLDERS = ["kaju katli", "motichoor laddu", "gulab jamun", "jalebi", "dal kachori", "moth bhujia"];

export function IconButton({ href, label, children, badge, onClick, className }: { href?: string; label: string; children: React.ReactNode; badge?: number; onClick?: () => void; className?: string }) {
  const cls = cn("relative grid h-11 w-11 place-items-center rounded-2xl text-ink-soft transition hover:bg-surface-2 hover:text-ink", className);
  const b = badge ? (
    <motion.span key={badge} initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-maroon-700 px-1 text-[10px] font-bold text-white ring-2 ring-bg">
      {badge > 99 ? "99+" : badge}
    </motion.span>
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
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </IconButton>
  );
}

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  return (
    <IconButton label={locale === "en" ? "हिन्दी में देखें" : "View in English"} onClick={() => { setLocale(locale === "en" ? "hi" : "en"); router.refresh(); }} className={className}>
      <span className="flex items-center gap-0.5 text-[13px] font-bold"><Languages className="h-4 w-4" />{locale === "en" ? "हि" : "EN"}</span>
    </IconButton>
  );
}

export function SearchTrigger({ className }: { className?: string }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % PLACEHOLDERS.length), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <Link href="/search" className={cn("group flex h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-muted shadow-sm transition hover:border-saffron-300 hover:shadow-card", className)} aria-label={t("common.search")}>
      <Search className="h-5 w-5 text-saffron-600" />
      <span className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[15px]">
        <span className="shrink-0">Search for</span>
        <span className="relative inline-block h-6 w-40 overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.span key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: 0.35 }} className="absolute left-0 font-medium text-ink-soft">
              &ldquo;{PLACEHOLDERS[i]}&rdquo;
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
    </Link>
  );
}

export function Header() {
  const { user } = useAuth();
  const { count, bump } = useCart();
  const { unread } = useRealtime();
  const { location } = useLocation();
  const { t } = useI18n();
  const settings = useSettings();
  const pathname = usePathname();
  const [locOpen, setLocOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    h();
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  const hideSearch = pathname.startsWith("/search") || pathname.startsWith("/checkout");
  const announcement = settings?.announcement?.active ? settings.announcement : null;

  return (
    <>
      {announcement && (
        <div className="nd-gradient-maroon px-4 py-2 text-center text-xs font-semibold text-saffron-100 no-print">
          {announcement.link ? <Link href={announcement.link} className="underline-offset-2 hover:underline">{announcement.text}</Link> : announcement.text}
        </div>
      )}
      <header className={cn("sticky top-0 z-50 transition-shadow no-print", scrolled ? "nd-glass shadow-[0_8px_30px_-18px_rgba(110,21,40,0.35)]" : "bg-bg")}>
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="NAAMDEV SWEETS home" className="shrink-0">
            <Logo size="sm" className="sm:hidden" />
            <Logo size="md" className="hidden sm:inline-flex" />
          </Link>
          <button type="button" onClick={() => setLocOpen(true)} className="ml-1 hidden max-w-[240px] shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left transition hover:bg-surface-2 md:flex">
            <MapPin className="h-5 w-5 shrink-0 text-saffron-600" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted">{t("common.deliverTo")}</span>
              <span className="flex items-center gap-1 whitespace-nowrap text-sm font-bold text-ink">
                {location ? `${location.area ?? location.city ?? ""} ${location.pincode}`.trim() : t("common.selectLocation")}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
              </span>
            </span>
          </button>
          {!hideSearch && <SearchTrigger className="mx-2 hidden flex-1 lg:flex" />}
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <nav className="mr-2 hidden items-center gap-1 xl:flex">
              {[["/categories", t("nav.categories")], ["/offers", t("nav.offers")], ["/category/namkeen", t("nav.namkeen")]].map(([href, label]) => (
                <Link key={href} href={href!} className={cn("rounded-xl px-3 py-2 text-sm font-semibold transition hover:bg-surface-2", pathname === href ? "text-saffron-700" : "text-ink-soft")}>{label}</Link>
              ))}
            </nav>
            <LanguageToggle className="hidden sm:grid" />
            <ThemeToggle className="hidden sm:grid" />
            {user && <IconButton href="/account/notifications" label="Notifications" badge={unread} className="hidden sm:grid"><Bell className="h-5 w-5" /></IconButton>}
            <IconButton href="/account/wishlist" label={t("nav.wishlist")} className="hidden sm:grid"><Heart className="h-5 w-5" /></IconButton>
            <motion.div key={bump} animate={bump ? { scale: [1, 1.18, 1] } : undefined} transition={{ duration: 0.35 }}>
              <IconButton href="/cart" label={t("nav.cart")} badge={count}><ShoppingBag className="h-5 w-5" /></IconButton>
            </motion.div>
            {user ? (
              <Link href="/account" className="ml-1 hidden rounded-full ring-2 ring-transparent transition hover:ring-saffron-300 sm:block" aria-label={t("nav.account")}>
                <Avatar name={user.name} src={user.avatarUrl} size={38} />
              </Link>
            ) : user === null ? (
              <Link href="/login" className={buttonStyles({ size: "sm", className: "ml-1 hidden sm:inline-flex" })}><User className="h-4 w-4" />{t("common.login")}</Link>
            ) : null}
          </div>
        </div>
        {!hideSearch && (
          <div className="px-4 pb-3 lg:hidden">
            <button type="button" onClick={() => setLocOpen(true)} className="mb-2 flex items-center gap-1.5 text-left md:hidden">
              <MapPin className="h-4 w-4 text-saffron-600" />
              <span className="text-xs font-semibold text-muted">{t("common.deliverTo")}</span>
              <span className="truncate text-xs font-bold text-ink">{location ? `${location.area ?? ""} ${location.pincode}` : t("common.selectLocation")}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted" />
            </button>
            <SearchTrigger />
          </div>
        )}
      </header>
      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
    </>
  );
}

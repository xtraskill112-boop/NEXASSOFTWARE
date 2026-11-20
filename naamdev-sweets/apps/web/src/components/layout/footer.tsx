"use client";
import Link from "next/link";
import { Clock, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { Logo } from "@naamdev/ui";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { FacebookIcon, InstagramIcon, WhatsappIcon, XIcon, YoutubeIcon } from "../common/social-icons";
import { LanguageToggle, ThemeToggle } from "./header";

export function Footer() {
  const { t } = useI18n();
  const s = useSettings();
  const social = s?.social ?? {};
  const cols = [
    { title: t("footer.company"), links: [["/pages/about", t("footer.about")], ["/contact", t("footer.contact")], ["/faqs", t("footer.faqs")]] },
    { title: "Shop", links: [["/categories", t("nav.categories")], ["/offers", t("nav.offers")], ["/category/gift-hampers", t("nav.hampers")], ["/collections/winter-specials", "Winter specials"]] },
    { title: t("footer.policies"), links: [["/pages/privacy-policy", t("footer.privacy")], ["/pages/terms", t("footer.terms")], ["/pages/refund-policy", t("footer.refund")], ["/pages/shipping-policy", t("footer.shipping")], ["/photo-credits", "Photo credits"]] },
  ];
  const socials = [
    [social.instagram, InstagramIcon, "Instagram"],
    [social.facebook, FacebookIcon, "Facebook"],
    [social.youtube, YoutubeIcon, "YouTube"],
    [social.x, XIcon, "X"],
    [social.whatsapp ? `https://wa.me/${social.whatsapp.replace(/\D/g, "")}` : undefined, WhatsappIcon, "WhatsApp"],
  ] as const;
  return (
    <footer className="nd-gradient-royal relative mt-16 overflow-hidden pb-28 text-cream-200 md:pb-0 no-print">
      <div className="nd-pattern pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Logo size="lg" tone="light" />
            <p className="mt-5 max-w-sm font-display text-xl italic text-saffron-200/90">&ldquo;{t("footer.madeWith")}&rdquo;</p>
            <ul className="mt-6 space-y-2.5 text-sm text-cream-200/80">
              {s?.storeProfile.address && <li className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-saffron-300" />{s.storeProfile.address}</li>}
              {s?.storeProfile.phone && <li className="flex gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-saffron-300" /><a href={`tel:${s.storeProfile.phone}`}>{s.storeProfile.phone}</a></li>}
              {s?.storeProfile.email && <li className="flex gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-saffron-300" /><a href={`mailto:${s.storeProfile.email}`}>{s.storeProfile.email}</a></li>}
              {s?.storeProfile.supportHours && <li className="flex gap-2.5"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-saffron-300" />{s.storeProfile.supportHours}</li>}
            </ul>
            <div className="mt-6 flex gap-2">
              {socials.filter(([href]) => !!href).map(([href, Icon, label]) => (
                <a key={label} href={href!} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-cream-100 transition hover:bg-saffron-500 hover:text-white">
                  <Icon className="h-[18px] w-[18px]" />
                </a>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {cols.map((c) => (
              <div key={c.title}>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-saffron-300">{c.title}</h3>
                <ul className="mt-4 space-y-3 text-sm">
                  {c.links.map(([href, label]) => (
                    <li key={href}><Link href={href!} className="text-cream-200/80 transition hover:text-white">{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-cream-200/60 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} {s?.storeProfile.legalName || "Naamdev Sweets"}</span>
            {s?.storeProfile.fssaiLicense && <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />FSSAI {s.storeProfile.fssaiLicense}</span>}
            {s?.storeProfile.gstin && <span>GSTIN {s.storeProfile.gstin}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-2">Secure payments: UPI · Cards · Net banking · COD</span>
            <LanguageToggle className="text-cream-100 hover:bg-white/10 hover:text-white" />
            <ThemeToggle className="text-cream-100 hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </div>
    </footer>
  );
}

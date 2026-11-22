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
    { title: "Shop", links: [["/categories", t("nav.categories")], ["/offers", t("nav.offers")], ["/category/namkeen", t("nav.namkeen")], ["/category/snacks", t("nav.snacks")]] },
    { title: t("footer.policies"), links: [["/pages/privacy-policy", t("footer.privacy")], ["/pages/terms", t("footer.terms")], ["/pages/refund-policy", t("footer.refund")], ["/pages/shipping-policy", t("footer.shipping")], ["/photo-credits", "Photo credits"]] },
  ];
  const socials = [
    [social.instagram, InstagramIcon, "Instagram"],
    [social.facebook, FacebookIcon, "Facebook"],
    [social.youtube, YoutubeIcon, "YouTube"],
    [social.x, XIcon, "X"],
    [social.whatsapp ? `https://wa.me/${social.whatsapp.replace(/\D/g, "")}` : undefined, WhatsappIcon, "WhatsApp"],
  ] as const;
  const payWith = s?.payments.razorpayEnabled ? "UPI · Cards · Net banking · Cash on delivery" : "UPI · Cash on delivery";
  return (
    <footer className="mt-16 border-t border-line bg-surface-2 pb-28 text-ink-soft md:pb-0 no-print">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo size="md" />
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed">{t("footer.madeWith")}</p>
            <ul className="mt-5 space-y-2 text-[14px]">
              {s?.storeProfile.address && <li className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{s.storeProfile.address}</li>}
              {s?.storeProfile.phone && <li className="flex gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><a href={`tel:${s.storeProfile.phone}`} className="hover:text-ink">{s.storeProfile.phone}</a></li>}
              {s?.storeProfile.email && <li className="flex gap-2.5"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><a href={`mailto:${s.storeProfile.email}`} className="hover:text-ink">{s.storeProfile.email}</a></li>}
              {s?.storeProfile.supportHours && <li className="flex gap-2.5"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{s.storeProfile.supportHours}</li>}
            </ul>
            <div className="mt-5 flex gap-1.5">
              {socials.filter(([href]) => !!href).map(([href, Icon, label]) => (
                <a key={label} href={href!} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface text-ink-soft transition-colors hover:text-maroon-700">
                  <Icon className="h-[17px] w-[17px]" />
                </a>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {cols.map((c) => (
              <div key={c.title}>
                <h3 className="text-[14px] font-bold text-ink">{c.title}</h3>
                <ul className="mt-3 space-y-2.5 text-[14px]">
                  {c.links.map(([href, label]) => (
                    <li key={href}><Link href={href!} className="transition-colors hover:text-maroon-700 dark:hover:text-maroon-200">{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-5 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} {s?.storeProfile.legalName || "Naamdev Sweets"}</span>
            {s?.storeProfile.fssaiLicense && <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />FSSAI {s.storeProfile.fssaiLicense}</span>}
            {s?.storeProfile.gstin && <span>GSTIN {s.storeProfile.gstin}</span>}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2">Pay with {payWith}</span>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}

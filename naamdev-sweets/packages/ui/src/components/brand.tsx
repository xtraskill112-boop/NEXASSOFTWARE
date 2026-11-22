"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useState } from "react";
import { cn } from "../cn";

const DOTS = [
  [-40, -30, 6], [-12, -46, 5], [22, -38, 6], [44, -12, 5], [36, 22, 6], [10, 40, 5], [-24, 34, 6], [-46, 6, 5],
  [-16, -12, 5], [14, -10, 6], [0, 14, 5], [-30, 14, 4], [28, 2, 4], [-4, -28, 4], [20, 22, 4],
] as const;

/** The NAAMDEV emblem: a Rajasthani jharokha arch framing a golden laddu on a lotus. */
export function Emblem({ size = 40, className, framed = true }: { size?: number; className?: string; framed?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#8F1D34" />
          <stop offset="1" stopColor="#52101F" />
        </linearGradient>
        <radialGradient id={`s${id}`} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFD39C" />
          <stop offset="0.5" stopColor="#F59E1B" />
          <stop offset="1" stopColor="#B24C08" />
        </radialGradient>
      </defs>
      <path
        d="M256 28 C 300 70, 372 86, 400 150 C 424 206, 424 250, 424 300 L 424 470 Q 424 484 410 484 L 102 484 Q 88 484 88 470 L 88 300 C 88 250, 88 206, 112 150 C 140 86, 212 70, 256 28 Z"
        fill={framed ? `url(#m${id})` : "none"}
        stroke="#F3C969"
        strokeWidth="12"
      />
      <path d="M256 70 C 292 104, 350 118, 372 168 C 392 214, 392 254, 392 300 L 392 452 L 120 452 L 120 300 C 120 254, 120 214, 140 168 C 162 118, 220 104, 256 70 Z" fill="none" stroke="#F3C969" strokeWidth="4" opacity="0.55" />
      <circle cx="256" cy="268" r="92" fill={`url(#s${id})`} />
      {DOTS.map(([x, y, r], i) => (
        <circle key={i} cx={256 + x} cy={268 + y} r={r} fill={i % 2 ? "#FFC46B" : "#D9760C"} opacity="0.6" />
      ))}
      <ellipse cx="226" cy="232" rx="26" ry="14" fill="#fff" opacity="0.45" transform="rotate(-30 226 232)" />
      <path d="M150 400 Q 200 340 256 380 Q 312 340 362 400 Q 306 420 256 404 Q 206 420 150 400 Z" fill="#F3C969" />
      <path d="M206 392 Q 256 318 306 392 Q 256 410 206 392 Z" fill="#FFE7A8" />
      <path d="M120 436 L 392 436" stroke="#F3C969" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = "md", className, tone = "auto", subtitle }: { size?: "sm" | "md" | "lg" | "xl"; className?: string; tone?: "auto" | "light" | "dark"; subtitle?: string }) {
  const s = { sm: { e: 30, t: "text-[17px]", st: "text-[8px] tracking-[0.42em]" }, md: { e: 38, t: "text-xl", st: "text-[9px] tracking-[0.46em]" }, lg: { e: 52, t: "text-[28px]", st: "text-[11px] tracking-[0.5em]" }, xl: { e: 84, t: "text-[44px]", st: "text-sm tracking-[0.6em]" } }[size];
  const word = tone === "light" ? "text-saffron-200" : tone === "dark" ? "text-maroon-800" : "text-maroon-800 dark:text-saffron-200";
  const sub = tone === "light" ? "text-cream-200/80" : tone === "dark" ? "text-saffron-700" : "text-saffron-700 dark:text-cream-300/80";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Emblem size={s.e} className="shrink-0" />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display font-extrabold tracking-[0.06em]", s.t, word)}>NAAMDEV</span>
        <span className={cn("mt-1 font-sans font-bold uppercase", s.st, sub)}>{subtitle ?? "Sweets"}</span>
      </span>
    </span>
  );
}

/** Branded loading indicator: emblem with a rotating saffron ring. */
export function BrandLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <Emblem size={44} />
      <div className="h-0.5 w-24 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full w-1/3 rounded-full bg-maroon-700 dark:bg-maroon-300" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} />
      </div>
      <p className="text-sm text-muted">{label}…</p>
    </div>
  );
}

/** First-visit splash screen (once per browser session): the logo on the shop's paper colour. */
export function SplashScreen({ tagline = "Mithaas that feels like home", storageKey = "nd_splash" }: { tagline?: string; storageKey?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      return;
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 1100);
    return () => clearTimeout(t);
  }, [storageKey]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-[200] grid place-items-center bg-bg" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} onClick={() => setShow(false)}>
          <div className="flex flex-col items-center gap-4">
            <Logo size="lg" />
            <p className="text-sm text-muted">{tagline}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

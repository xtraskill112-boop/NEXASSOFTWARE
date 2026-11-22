"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, UserPlus } from "lucide-react";
import type { Me } from "@naamdev/api-client";
import { authErrorMessage, signIn, signOutFirebase, signUp } from "@naamdev/api-client/firebase";
import { Button, Divider, Field, InlineAlert, Input } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

type Step = "login" | "signup" | "profile";

function LoginInner() {
  const { t } = useI18n();
  const { setUser, needsProfile, firebaseEmail, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const [step, setStep] = useState<Step>(params.get("mode") === "signup" ? "signup" : "login");
  const [cred, setCred] = useState({ email: "", password: "" });
  const [profile, setProfile] = useState({ name: "", phone: "", referralCode: params.get("ref")?.toUpperCase() ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Signed in with Firebase but the profile was never completed (e.g. the tab closed mid sign-up).
  useEffect(() => {
    if (needsProfile) setStep("profile");
  }, [needsProfile]);
  useEffect(() => {
    if (user) router.replace(safeNext);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (u: Me) => {
    setUser(u);
    router.replace(safeNext);
    router.refresh();
  };
  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        if (Object.keys(e.fieldErrors).length) setFieldErrors(e.fieldErrors);
        setError(errorMessage(e));
      } else setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const completeProfile = async () => {
    const r = await api.post<{ user: Me }>("/auth/register", { name: profile.name, phone: profile.phone, referralCode: profile.referralCode });
    done(r.user);
  };

  const login = () =>
    wrap(async () => {
      await signIn(cred.email, cred.password);
      const r = await api.post<{ user: Me | null; needsProfile?: boolean }>("/auth/session");
      if (r.user) done(r.user);
      else setStep("profile");
    });

  const signup = () =>
    wrap(async () => {
      if (profile.name.trim().length < 2) {
        setFieldErrors({ name: "Enter your name" });
        throw new Error("Please tell us your name.");
      }
      await signUp(cred.email, cred.password);
      try {
        await completeProfile();
      } catch (e) {
        setStep("profile");
        throw e;
      }
    });

  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
          {step === "login" && (
            <>
              <h1 className="font-display text-4xl font-semibold text-ink">{t("auth.welcome")}</h1>
              <p className="mt-2 text-muted">{t("auth.subtitle")}</p>
              <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void login(); }}>
                <Field label={t("auth.email")}>{(p) => <Input {...p} type="email" value={cred.email} onChange={(e) => setCred({ ...cred, email: e.target.value })} autoComplete="email" inputMode="email" leading={<Mail className="h-4 w-4 text-muted" />} autoFocus />}</Field>
                <Field label={t("auth.password")}>{(p) => <Input {...p} type="password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} autoComplete="current-password" />}</Field>
                <div className="text-right"><Link href={`/forgot-password${cred.email ? `?email=${encodeURIComponent(cred.email)}` : ""}`} className="text-sm font-semibold text-maroon-700">{t("auth.forgot")}</Link></div>
                <Button type="submit" size="xl" block loading={busy} disabled={!cred.email || !cred.password}>{t("common.login")}</Button>
              </form>
              <Divider label={t("auth.newHere")} className="my-6" />
              <Button variant="outline" size="lg" block onClick={() => { setError(null); setStep("signup"); }}><UserPlus className="h-4 w-4" />{t("auth.createAccount")}</Button>
            </>
          )}
          {step === "signup" && (
            <>
              <h1 className="font-display text-4xl font-semibold text-ink">{t("auth.signupTitle")}</h1>
              <p className="mt-2 text-muted">{t("auth.signupSubtitle")}</p>
              <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void signup(); }}>
                <Field label="Full name" required error={fieldErrors.name}>{(p) => <Input {...p} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} autoComplete="name" autoFocus />}</Field>
                <Field label={t("auth.email")} required>{(p) => <Input {...p} type="email" value={cred.email} onChange={(e) => setCred({ ...cred, email: e.target.value })} autoComplete="email" inputMode="email" />}</Field>
                <Field label={t("auth.password")} required hint="At least 8 characters with a letter and a number">{(p) => <Input {...p} type="password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} autoComplete="new-password" />}</Field>
                <Field label="Mobile number (optional)" hint="So your delivery partner can reach you" error={fieldErrors.phone}>{(p) => <Input {...p} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/[^\d+ ]/g, "").slice(0, 14) })} inputMode="tel" autoComplete="tel" placeholder="98765 43210" leading={<span className="text-sm font-bold text-ink-soft">+91</span>} />}</Field>
                <Field label="Referral code (optional)" error={fieldErrors.referralCode}>{(p) => <Input {...p} value={profile.referralCode} onChange={(e) => setProfile({ ...profile, referralCode: e.target.value.toUpperCase() })} className="font-mono uppercase" />}</Field>
                <Button type="submit" size="xl" block loading={busy} disabled={!cred.email || cred.password.length < 8 || profile.name.trim().length < 2}>{t("auth.createAccount")}</Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted">{t("auth.haveAccount")} <button type="button" className="font-semibold text-maroon-700" onClick={() => { setError(null); setStep("login"); }}>{t("common.login")}</button></p>
            </>
          )}
          {step === "profile" && (
            <>
              <h1 className="font-display text-3xl font-semibold text-ink">Almost there! 🎉</h1>
              <p className="mt-2 text-muted">Finish your profile{firebaseEmail ? <> for <b className="text-ink">{firebaseEmail}</b></> : null}. You&apos;ll get welcome Mithaas points on signup.</p>
              <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void wrap(completeProfile); }}>
                <Field label="Full name" required error={fieldErrors.name}>{(p) => <Input {...p} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} autoComplete="name" autoFocus />}</Field>
                <Field label="Mobile number (optional)" error={fieldErrors.phone}>{(p) => <Input {...p} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value.replace(/[^\d+ ]/g, "").slice(0, 14) })} inputMode="tel" autoComplete="tel" leading={<span className="text-sm font-bold text-ink-soft">+91</span>} />}</Field>
                <Field label="Referral code (optional)" error={fieldErrors.referralCode}>{(p) => <Input {...p} value={profile.referralCode} onChange={(e) => setProfile({ ...profile, referralCode: e.target.value.toUpperCase() })} className="font-mono uppercase" />}</Field>
                <Button type="submit" size="xl" block loading={busy} disabled={profile.name.trim().length < 2}>{t("auth.createAccount")}</Button>
              </form>
              <button type="button" className="mt-6 w-full text-center text-sm font-semibold text-muted hover:text-ink" onClick={() => void signOutFirebase().then(() => setStep("login"))}>Use a different account</button>
            </>
          )}
          {error && <InlineAlert tone="danger" className="mt-5">{error}</InlineAlert>}
        </motion.div>
      </AnimatePresence>
      <Divider label={t("common.or")} className="my-6 opacity-0" />
      <p className="text-center text-xs text-muted">By continuing you agree to our <Link href="/pages/terms" className="underline">Terms</Link> and <Link href="/pages/privacy-policy" className="underline">Privacy Policy</Link>.</p>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}

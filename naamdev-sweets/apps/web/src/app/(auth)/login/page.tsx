"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, KeyRound, Phone } from "lucide-react";
import type { Me } from "@naamdev/api-client";
import { Button, Divider, Field, InlineAlert, Input, OtpInput } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

type Step = "phone" | "otp" | "profile" | "password";

function LoginInner() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [regToken, setRegToken] = useState("");
  const [profile, setProfile] = useState({ name: "", email: "", referralCode: "" });
  const [cred, setCred] = useState({ identifier: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cooldown, setCooldown] = useState(0);

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
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setFieldErrors(e.fieldErrors);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = () => wrap(async () => {
    const r = await api.post<{ devCode?: string }>("/auth/otp/request", { phone, purpose: "LOGIN" });
    setDevCode(r.devCode ?? null);
    setOtp("");
    setStep("otp");
    setCooldown(30);
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(id), 0) : c - 1)), 1000);
  });

  const verify = (code = otp) => wrap(async () => {
    const r = await api.post<{ user?: Me; registrationRequired?: boolean; registrationToken?: string }>("/auth/otp/verify", { phone, otp: code });
    if (r.registrationRequired && r.registrationToken) {
      setRegToken(r.registrationToken);
      setStep("profile");
    } else if (r.user) done(r.user);
  });

  const register = () => wrap(async () => {
    const r = await api.post<{ user: Me }>("/auth/register", { name: profile.name, email: profile.email, referralCode: profile.referralCode, registrationToken: regToken });
    done(r.user);
  });

  const passwordLogin = () => wrap(async () => {
    const r = await api.post<{ user: Me }>("/auth/login", cred);
    done(r.user);
  });

  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
          {step !== "phone" && step !== "password" && (
            <button type="button" onClick={() => setStep("phone")} className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />{t("common.back")}</button>
          )}
          {step === "phone" && (
            <>
              <h1 className="font-display text-4xl font-semibold text-ink">{t("auth.welcome")}</h1>
              <p className="mt-2 text-muted">{t("auth.subtitle")}</p>
              <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void sendOtp(); }}>
                <Field label={t("auth.phone")} error={fieldErrors.phone}>
                  {(p) => <Input {...p} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))} inputMode="tel" autoComplete="tel" placeholder="98765 43210" leading={<span className="text-sm font-bold text-ink-soft">+91</span>} autoFocus />}
                </Field>
                <Button type="submit" size="xl" block loading={busy} disabled={phone.replace(/\D/g, "").length < 10}>{t("auth.sendOtp")}</Button>
              </form>
              <Divider label={t("common.or")} className="my-6" />
              <Button variant="outline" size="lg" block onClick={() => setStep("password")}><KeyRound className="h-4 w-4" />{t("auth.usePassword")}</Button>
            </>
          )}
          {step === "otp" && (
            <>
              <h1 className="font-display text-3xl font-semibold text-ink">Enter verification code</h1>
              <p className="mt-2 text-muted">Sent via SMS to <b className="text-ink">+91 {phone.replace(/^\+?91/, "")}</b></p>
              {devCode && <InlineAlert tone="info" className="mt-4">Development mode: your OTP is <b className="font-mono">{devCode}</b>. (SMS provider not configured.)</InlineAlert>}
              <div className="mt-8"><OtpInput value={otp} autoFocus onChange={(v) => { setOtp(v); if (v.length === 6) void verify(v); }} /></div>
              <Button size="xl" block className="mt-6" loading={busy} disabled={otp.length !== 6} onClick={() => verify()}>{t("auth.verifyOtp")}</Button>
              <p className="mt-4 text-center text-sm text-muted">
                Didn&apos;t get it? {cooldown > 0 ? <span>Resend in {cooldown}s</span> : <button type="button" className="font-semibold text-saffron-700" onClick={() => void sendOtp()}>Resend OTP</button>}
              </p>
            </>
          )}
          {step === "profile" && (
            <>
              <h1 className="font-display text-3xl font-semibold text-ink">Almost there! 🎉</h1>
              <p className="mt-2 text-muted">Tell us your name to finish creating your account. You&apos;ll get welcome Mithaas points on signup.</p>
              <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void register(); }}>
                <Field label="Full name" required error={fieldErrors.name}>{(p) => <Input {...p} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} autoComplete="name" autoFocus />}</Field>
                <Field label="Email (optional)" hint="For order receipts and offers" error={fieldErrors.email}>{(p) => <Input {...p} type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} autoComplete="email" />}</Field>
                <Field label="Referral code (optional)" error={fieldErrors.referralCode}>{(p) => <Input {...p} value={profile.referralCode} onChange={(e) => setProfile({ ...profile, referralCode: e.target.value.toUpperCase() })} className="font-mono uppercase" />}</Field>
                <Button type="submit" size="xl" block loading={busy} disabled={profile.name.trim().length < 2}>{t("auth.createAccount")}</Button>
              </form>
            </>
          )}
          {step === "password" && (
            <>
              <h1 className="font-display text-4xl font-semibold text-ink">{t("auth.welcome")}</h1>
              <p className="mt-2 text-muted">Log in with your email or mobile number and password.</p>
              <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void passwordLogin(); }}>
                <Field label="Email or mobile number">{(p) => <Input {...p} value={cred.identifier} onChange={(e) => setCred({ ...cred, identifier: e.target.value })} autoComplete="username" autoFocus />}</Field>
                <Field label={t("auth.password")}>{(p) => <Input {...p} type="password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} autoComplete="current-password" />}</Field>
                <div className="text-right"><Link href="/forgot-password" className="text-sm font-semibold text-saffron-700">{t("auth.forgot")}</Link></div>
                <Button type="submit" size="xl" block loading={busy} disabled={!cred.identifier || !cred.password}>{t("common.login")}</Button>
              </form>
              <Divider label={t("common.or")} className="my-6" />
              <Button variant="outline" size="lg" block onClick={() => setStep("phone")}><Phone className="h-4 w-4" />{t("auth.useOtp")}</Button>
            </>
          )}
          {error && <InlineAlert tone="danger" className="mt-5">{error}</InlineAlert>}
        </motion.div>
      </AnimatePresence>
      <p className="mt-10 text-center text-xs text-muted">By continuing you agree to our <Link href="/pages/terms" className="underline">Terms</Link> and <Link href="/pages/privacy-policy" className="underline">Privacy Policy</Link>.</p>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}

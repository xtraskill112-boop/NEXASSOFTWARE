"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, InlineAlert, Input, OtpInput } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "reset" | "done">("request");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setFe({});
    try { await fn(); } catch (e) { if (e instanceof ApiError) setFe(e.fieldErrors); setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="font-display text-4xl font-semibold text-ink">Reset password</h1>
      {step === "request" && (
        <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await api.post<{ devCode?: string }>("/auth/password/forgot", { identifier }); setDevCode(r.devCode ?? null); setStep("reset"); }); }}>
          <p className="text-muted">Enter the email or mobile number on your account. We&apos;ll send a verification code.</p>
          <Field label="Email or mobile number">{(p) => <Input {...p} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus />}</Field>
          <Button type="submit" size="xl" block loading={busy} disabled={identifier.length < 5}>Send code</Button>
        </form>
      )}
      {step === "reset" && (
        <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.post("/auth/password/reset", { identifier, otp, password }); setStep("done"); }); }}>
          <p className="text-muted">If an account exists for <b className="text-ink">{identifier}</b>, a 6-digit code has been sent.</p>
          {devCode && <InlineAlert tone="info">Development mode: your code is <b className="font-mono">{devCode}</b>.</InlineAlert>}
          <OtpInput value={otp} onChange={setOtp} autoFocus />
          <Field label="New password" hint="At least 8 characters with a letter and a number" error={fe.password}>{(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}</Field>
          <Button type="submit" size="xl" block loading={busy} disabled={otp.length !== 6 || password.length < 8}>Update password</Button>
        </form>
      )}
      {step === "done" && (
        <div className="mt-8 space-y-5">
          <InlineAlert tone="success">Your password has been updated and other sessions were signed out.</InlineAlert>
          <Button size="xl" block onClick={() => router.push("/login")}>Log in</Button>
        </div>
      )}
      {error && <InlineAlert tone="danger" className="mt-5">{error}</InlineAlert>}
      <p className="mt-8 text-center text-sm text-muted"><Link href="/login" className="font-semibold text-saffron-700">Back to login</Link></p>
    </div>
  );
}

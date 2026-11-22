"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Me } from "@naamdev/api-client";
import { authErrorMessage, sendPasswordReset, signIn, signOutFirebase } from "@naamdev/api-client/firebase";
import { Button, Field, InlineAlert, Input, Logo } from "@naamdev/ui";
import { ApiError, api } from "@/lib/api";
import { usePartner } from "@/lib/partner";

export default function PartnerLogin() {
  const { setMe } = usePartner();
  const router = useRouter();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      await signIn(f.email, f.password);
      const r = await api.post<{ user: Me | null; needsProfile?: boolean }>("/auth/session");
      if (!r.user) return router.replace("/register?complete=1"); // signed up but never finished registration
      setMe(r.user);
      router.replace("/");
    } catch (x) {
      if (x instanceof ApiError) await signOutFirebase().catch(() => undefined);
      setErr(x instanceof ApiError ? x.message : authErrorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr("Enter your email above first.");
    await sendPasswordReset(f.email).catch(() => undefined);
    setInfo(`If ${f.email} is registered, a password reset link is on its way.`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-6 pt-12 text-center">
        <Logo size="lg" subtitle="Partner" />
        <p className="mt-4 max-w-xs text-[15px] text-ink-soft">Sign in to see delivery requests, your route and your earnings.</p>
      </div>
      <div className="mx-auto w-full max-w-md border-t border-line bg-surface p-6 pb-10 sm:mb-10 sm:rounded-xl sm:border">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="Email">{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" inputMode="email" />}</Field>
          <Field label="Password">{(p) => <Input {...p} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />}</Field>
          {err && <InlineAlert tone="danger">{err}</InlineAlert>}
          {info && <InlineAlert tone="success">{info}</InlineAlert>}
          <Button type="submit" size="xl" block loading={busy} disabled={!f.email || !f.password}>Log in</Button>
        </form>
        <p className="mt-4 text-center text-sm"><button type="button" className="font-semibold text-muted hover:text-ink" onClick={() => void forgot()}>Forgot password?</button></p>
        <p className="mt-4 text-center text-sm text-muted">New partner? <Link href="/register" className="font-bold text-maroon-700">Register here</Link></p>
      </div>
    </div>
  );
}

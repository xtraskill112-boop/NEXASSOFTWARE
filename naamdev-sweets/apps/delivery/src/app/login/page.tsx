"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Me } from "@naamdev/api-client";
import { authErrorMessage, sendPasswordReset, signIn, signOutFirebase } from "@naamdev/api-client/firebase";
import { Button, Emblem, Field, InlineAlert, Input } from "@naamdev/ui";
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
    <div className="nd-gradient-royal relative flex min-h-dvh flex-col justify-end">
      <div className="nd-pattern absolute inset-0 opacity-30" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center text-cream-100">
        <Emblem size={88} />
        <p className="mt-4 font-display text-4xl font-bold tracking-[0.1em] text-saffron-200">NAAMDEV</p>
        <p className="text-xs font-bold uppercase tracking-[0.5em] text-cream-200/80">Delivery partner</p>
        <p className="mt-4 max-w-xs text-sm text-cream-200/80">Deliver happiness across the city. Flexible hours, weekly payouts and daily bonuses.</p>
      </div>
      <div className="relative mx-auto w-full max-w-md rounded-t-[2rem] bg-bg-elevated p-6 pb-10">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="Email">{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" inputMode="email" />}</Field>
          <Field label="Password">{(p) => <Input {...p} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />}</Field>
          {err && <InlineAlert tone="danger">{err}</InlineAlert>}
          {info && <InlineAlert tone="success">{info}</InlineAlert>}
          <Button type="submit" size="xl" block loading={busy} disabled={!f.email || !f.password}>Log in</Button>
        </form>
        <p className="mt-4 text-center text-sm"><button type="button" className="font-semibold text-muted hover:text-ink" onClick={() => void forgot()}>Forgot password?</button></p>
        <p className="mt-4 text-center text-sm text-muted">New partner? <Link href="/register" className="font-bold text-saffron-700">Register here</Link></p>
      </div>
    </div>
  );
}

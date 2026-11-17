"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Me } from "@naamdev/api-client";
import { Button, Emblem, Field, InlineAlert, Input } from "@naamdev/ui";
import { api, errorMessage } from "@/lib/api";
import { usePartner } from "@/lib/partner";

export default function PartnerLogin() {
  const { setMe } = usePartner();
  const router = useRouter();
  const [f, setF] = useState({ identifier: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { const r = await api.post<{ user: Me }>("/auth/login", f); setMe(r.user); router.replace("/"); } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
        }}>
          <Field label="Mobile number or email">{(p) => <Input {...p} value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} autoComplete="username" />}</Field>
          <Field label="Password">{(p) => <Input {...p} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />}</Field>
          {err && <InlineAlert tone="danger">{err}</InlineAlert>}
          <Button type="submit" size="xl" block loading={busy}>Log in</Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">New partner? <Link href="/register" className="font-bold text-saffron-700">Register here</Link></p>
      </div>
    </div>
  );
}

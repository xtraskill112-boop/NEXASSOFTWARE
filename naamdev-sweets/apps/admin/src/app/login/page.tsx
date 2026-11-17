"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Me } from "@naamdev/api-client";
import { Button, Emblem, Field, InlineAlert, Input, Logo } from "@naamdev/ui";
import { api, errorMessage } from "@/lib/api";
import { useAdmin } from "@/lib/auth";

function Login() {
  const { setMe } = useAdmin();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [f, setF] = useState({ identifier: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="nd-gradient-royal relative grid min-h-dvh place-items-center p-4">
      <div className="nd-pattern absolute inset-0 opacity-25" />
      <div className="relative w-full max-w-md rounded-[2rem] bg-bg-elevated p-8 shadow-lift sm:p-10">
        <div className="flex flex-col items-center text-center">
          <Emblem size={64} />
          <Logo size="md" subtitle="Console" className="mt-3 [&>svg]:hidden" />
          <p className="mt-3 text-sm text-muted">Staff sign-in for store owners, managers and team members.</p>
        </div>
        <form className="mt-8 space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          try { const r = await api.post<{ user: Me }>("/auth/login", f); setMe(r.user); router.replace(next.startsWith("/") ? next : "/"); }
          catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
        }}>
          <Field label="Email or mobile">{(p) => <Input {...p} value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} autoComplete="username" autoFocus />}</Field>
          <Field label="Password">{(p) => <Input {...p} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />}</Field>
          {err && <InlineAlert tone="danger">{err}</InlineAlert>}
          <Button type="submit" size="lg" block loading={busy}>Sign in</Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted">Access is logged. Forgot your password? Ask a store owner to reset it from Staff &amp; roles.</p>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Login /></Suspense>; }

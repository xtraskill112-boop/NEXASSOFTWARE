"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Me } from "@naamdev/api-client";
import { authErrorMessage, sendPasswordReset, signIn, signOutFirebase } from "@naamdev/api-client/firebase";
import { Button, Field, InlineAlert, Input, Logo } from "@naamdev/ui";
import { ApiError, api } from "@/lib/api";
import { useAdmin } from "@/lib/auth";

function Login() {
  const { setMe } = useAdmin();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
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
      // The API checks this account is active staff before the console opens.
      const r = await api.post<{ user: Me | null }>("/auth/session");
      if (!r.user?.role.isStaff) throw new ApiError(403, "FORBIDDEN", "This console is for NAAMDEV staff only.");
      setMe(r.user);
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (x) {
      await signOutFirebase().catch(() => undefined);
      setErr(x instanceof ApiError ? x.message : authErrorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr("Enter your work email above first.");
    try {
      await sendPasswordReset(f.email);
    } catch {
      /* same message either way */
    }
    setInfo(`If ${f.email} has a console account, a password reset link is on its way.`);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size="md" subtitle="Console" />
          <p className="mt-3 text-sm text-muted">Staff sign-in for store owners, managers and team members.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 sm:p-7">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="Work email">{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" inputMode="email" autoFocus />}</Field>
          <Field label="Password">{(p) => <Input {...p} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />}</Field>
          {err && <InlineAlert tone="danger">{err}</InlineAlert>}
          {info && <InlineAlert tone="success">{info}</InlineAlert>}
          <Button type="submit" size="lg" block loading={busy} disabled={!f.email || !f.password}>Sign in</Button>
        </form>
        </div>
        <p className="mt-5 text-center text-xs leading-relaxed text-muted">
          Access is logged. <button type="button" className="font-semibold text-maroon-700" onClick={() => void forgot()}>Forgot password?</button> You can also ask a store owner to reset it from Staff &amp; roles.
        </p>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Login /></Suspense>; }

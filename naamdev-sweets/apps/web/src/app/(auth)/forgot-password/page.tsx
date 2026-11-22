"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authErrorMessage, sendPasswordReset } from "@naamdev/api-client/firebase";
import { Button, Field, InlineAlert, Input } from "@naamdev/ui";

function ForgotInner() {
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      // Don't reveal whether an account exists for this address.
      if ((e as { code?: string }).code === "auth/user-not-found") setSent(true);
      else setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-4xl font-semibold text-ink">Reset password</h1>
      {!sent ? (
        <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <p className="text-muted">Enter the email address on your account and we&apos;ll email you a link to choose a new password.</p>
          <Field label="Email address">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoFocus />}</Field>
          <Button type="submit" size="xl" block loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)}>Email me a reset link</Button>
        </form>
      ) : (
        <div className="mt-8 space-y-5">
          <InlineAlert tone="success">If an account exists for <b>{email}</b>, a password reset link is on its way. Check your inbox (and spam folder).</InlineAlert>
          <Link href="/login" className="block"><Button size="xl" block>Back to login</Button></Link>
        </div>
      )}
      {error && <InlineAlert tone="danger" className="mt-5">{error}</InlineAlert>}
      <p className="mt-8 text-center text-sm text-muted"><Link href="/login" className="font-semibold text-maroon-700">Back to login</Link></p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return <Suspense><ForgotInner /></Suspense>;
}

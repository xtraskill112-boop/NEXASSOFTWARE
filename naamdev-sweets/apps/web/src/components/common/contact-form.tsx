"use client";
import { useState } from "react";
import { Button, Field, InlineAlert, Input, Textarea } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function ContactForm() {
  const { user } = useAuth();
  const [f, setF] = useState({ name: user?.name ?? "", email: user?.email ?? "", phone: "", subject: "", message: "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done) return <InlineAlert tone="success">Thank you! Your reference number is <b>{done}</b>. We&apos;ll reply by email within one business day.</InlineAlert>;
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setFe({}); setErr(null);
      try { const r = await api.post<{ ticket: { ticketNumber: string } }>("/support/contact", f); setDone(r.ticket.ticketNumber); }
      catch (x) { if (x instanceof ApiError) setFe(x.fieldErrors); setErr(errorMessage(x)); } finally { setBusy(false); }
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required error={fe.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />}</Field>
        <Field label="Email" required error={fe.email}>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />}</Field>
      </div>
      <Field label="Phone (optional)">{(p) => <Input {...p} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />}</Field>
      <Field label="Subject" required error={fe.subject}>{(p) => <Input {...p} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />}</Field>
      <Field label="Message" required error={fe.message}>{(p) => <Textarea {...p} rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />}</Field>
      {err && <InlineAlert tone="danger">{err}</InlineAlert>}
      <Button type="submit" size="lg" loading={busy}>Send message</Button>
    </form>
  );
}

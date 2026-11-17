"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Me } from "@naamdev/api-client";
import { VEHICLE_TYPES } from "@naamdev/shared";
import { Button, Field, InlineAlert, Input, Logo, OtpInput, Select } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { usePartner } from "@/lib/partner";

export default function PartnerRegister() {
  const { setMe } = usePartner();
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "details">("phone");
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "", otp: "", city: "Jaipur", vehicleType: "SCOOTER", vehicleNumber: "", licenseNumber: "" });
  const [dev, setDev] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <Logo size="md" subtitle="Partner" />
      <h1 className="mt-8 font-display text-3xl font-semibold text-ink">Become a delivery partner</h1>
      <p className="mt-1 text-sm text-muted">Register in 2 minutes. You&apos;ll upload documents after signing up.</p>
      {step === "phone" ? (
        <form className="mt-8 space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { const r = await api.post<{ devCode?: string }>("/auth/otp/request", { phone: f.phone, purpose: "REGISTER" }); setDev(r.devCode ?? null); setStep("details"); } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); } }}>
          <Field label="Mobile number">{(p) => <Input {...p} value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" leading={<span className="text-sm font-bold">+91</span>} autoFocus />}</Field>
          {err && <InlineAlert tone="danger">{err}</InlineAlert>}
          <Button type="submit" size="xl" block loading={busy}>Send OTP</Button>
        </form>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null); setFe({});
          try { const r = await api.post<{ user: Me }>("/delivery/register", { ...f, email: f.email || undefined, vehicleNumber: f.vehicleNumber || undefined, licenseNumber: f.licenseNumber || undefined }); setMe(r.user); router.replace("/profile"); }
          catch (x) { if (x instanceof ApiError) setFe(x.fieldErrors); setErr(errorMessage(x)); } finally { setBusy(false); }
        }}>
          {dev && <InlineAlert>Development mode: OTP is <b className="font-mono">{dev}</b></InlineAlert>}
          <div><p className="mb-2 text-[13px] font-semibold text-ink-soft">OTP sent to +91 {f.phone}</p><OtpInput value={f.otp} onChange={(v) => set("otp", v)} autoFocus /></div>
          <Field label="Full name" error={fe.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />}</Field>
          <Field label="Email (optional)" error={fe.email}>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />}</Field>
          <Field label="Password" hint="8+ characters with a letter and a number" error={fe.password}>{(p) => <Input {...p} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" error={fe.city}>{(p) => <Input {...p} value={f.city} onChange={(e) => set("city", e.target.value)} />}</Field>
            <Field label="Vehicle">{(p) => <Select {...p} value={f.vehicleType} onChange={(e) => set("vehicleType", e.target.value)}>{VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v.replace("_", " ").toLowerCase()}</option>)}</Select>}</Field>
            <Field label="Vehicle number">{(p) => <Input {...p} value={f.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value.toUpperCase())} />}</Field>
            <Field label="Licence number">{(p) => <Input {...p} value={f.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value.toUpperCase())} />}</Field>
          </div>
          {err && <InlineAlert tone="danger">{err}</InlineAlert>}
          <Button type="submit" size="xl" block loading={busy} disabled={f.otp.length !== 6}>Create partner account</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">Already registered? <Link href="/login" className="font-bold text-saffron-700">Log in</Link></p>
    </div>
  );
}

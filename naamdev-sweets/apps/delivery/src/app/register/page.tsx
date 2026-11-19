"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Me } from "@naamdev/api-client";
import { authErrorMessage, firebaseAuth, signUp } from "@naamdev/api-client/firebase";
import { VEHICLE_TYPES } from "@naamdev/shared";
import { Button, Field, InlineAlert, Input, Logo, Select } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { usePartner } from "@/lib/partner";

function Register() {
  const { setMe } = usePartner();
  const router = useRouter();
  // Signed in already (e.g. the app closed mid-registration): only the details are needed.
  const completing = useSearchParams().get("complete") === "1";
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "", city: "Jaipur", vehicleType: "SCOOTER", vehicleNumber: "", licenseNumber: "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
    setBusy(true);
    setErr(null);
    setFe({});
    try {
      if (!(completing && firebaseAuth().currentUser)) await signUp(f.email, f.password);
      const r = await api.post<{ user: Me }>("/delivery/register", {
        name: f.name, phone: f.phone, city: f.city, vehicleType: f.vehicleType,
        vehicleNumber: f.vehicleNumber || undefined, licenseNumber: f.licenseNumber || undefined,
      });
      setMe(r.user);
      router.replace("/profile");
    } catch (x) {
      if (x instanceof ApiError) {
        setFe(x.fieldErrors);
        setErr(errorMessage(x));
        // The login exists now; finishing the form again only needs the details.
        if (firebaseAuth().currentUser && !completing) router.replace("/register?complete=1");
      } else setErr(authErrorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <Logo size="md" subtitle="Partner" />
      <h1 className="mt-8 font-display text-3xl font-semibold text-ink">{completing ? "Finish your registration" : "Become a delivery partner"}</h1>
      <p className="mt-1 text-sm text-muted">Register in 2 minutes. You&apos;ll upload documents after signing up.</p>
      <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Full name" error={fe.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" autoFocus />}</Field>
        <Field label="Mobile number" error={fe.phone}>{(p) => <Input {...p} value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^\d+ ]/g, "").slice(0, 14))} inputMode="tel" autoComplete="tel" leading={<span className="text-sm font-bold">+91</span>} />}</Field>
        {!completing && (
          <>
            <Field label="Email" hint="You'll log in with this">{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" inputMode="email" />}</Field>
            <Field label="Password" hint="8+ characters with a letter and a number">{(p) => <Input {...p} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />}</Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" error={fe.city}>{(p) => <Input {...p} value={f.city} onChange={(e) => set("city", e.target.value)} />}</Field>
          <Field label="Vehicle">{(p) => <Select {...p} value={f.vehicleType} onChange={(e) => set("vehicleType", e.target.value)}>{VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v.replace("_", " ").toLowerCase()}</option>)}</Select>}</Field>
          <Field label="Vehicle number" error={fe.vehicleNumber}>{(p) => <Input {...p} value={f.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value.toUpperCase())} />}</Field>
          <Field label="Licence number" error={fe.licenseNumber}>{(p) => <Input {...p} value={f.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value.toUpperCase())} />}</Field>
        </div>
        {err && <InlineAlert tone="danger">{err}</InlineAlert>}
        <Button type="submit" size="xl" block loading={busy} disabled={f.name.trim().length < 2 || f.phone.replace(/\D/g, "").length < 10 || (!completing && (!f.email || f.password.length < 8))}>Create partner account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">Already registered? <Link href="/login" className="font-bold text-saffron-700">Log in</Link></p>
    </div>
  );
}

export default function PartnerRegister() {
  return <Suspense><Register /></Suspense>;
}

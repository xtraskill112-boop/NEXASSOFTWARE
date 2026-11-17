"use client";
import { useState } from "react";
import { Briefcase, Home, MapPinned } from "lucide-react";
import type { Address } from "@naamdev/api-client";
import { Button, Checkbox, Field, Input, Textarea, cn } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { MapPinPicker } from "./map-pin";

type Draft = Omit<Address, "id" | "isDefault" | "serviceable"> & { isDefault?: boolean };

const EMPTY: Draft = { type: "HOME", label: null, fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "Jaipur", state: "Rajasthan", pincode: "", lat: null, lng: null, instructions: "" };

export function AddressForm({ initial, onSaved, onCancel, defaultName, defaultPhone }: { initial?: Address | null; onSaved: (a: Address) => void; onCancel?: () => void; defaultName?: string; defaultPhone?: string | null }) {
  const [d, setD] = useState<Draft>(() => initial ? { ...initial } : { ...EMPTY, fullName: defaultName ?? "", phone: defaultPhone?.replace(/^\+91/, "") ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const body = { ...d, line2: d.line2 || null, landmark: d.landmark || null, instructions: d.instructions || null, label: d.type === "OTHER" ? d.label || null : null };
      const r = initial ? await api.patch<{ address: Address }>(`/account/addresses/${initial.id}`, body) : await api.post<{ address: Address }>("/account/addresses", body);
      onSaved(r.address);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const types = [["HOME", "Home", Home], ["OFFICE", "Office", Briefcase], ["OTHER", "Other", MapPinned]] as const;
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex gap-2">
        {types.map(([v, label, Icon]) => (
          <button key={v} type="button" onClick={() => set("type", v)} className={cn("inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition", d.type === v ? "border-saffron-500 bg-saffron-50 text-saffron-800 dark:bg-saffron-500/15 dark:text-saffron-200" : "border-line text-ink-soft")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {d.type === "OTHER" && <Field label="Save as" error={errors.label}>{(p) => <Input {...p} value={d.label ?? ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Parents' home" />}</Field>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName}>{(p) => <Input {...p} value={d.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" />}</Field>
        <Field label="Mobile number" required error={errors.phone}>{(p) => <Input {...p} value={d.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" autoComplete="tel" leading={<span className="text-sm font-semibold">+91</span>} />}</Field>
      </div>
      <Field label="Flat / House no. / Building" required error={errors.line1}>{(p) => <Input {...p} value={d.line1} onChange={(e) => set("line1", e.target.value)} autoComplete="address-line1" />}</Field>
      <Field label="Area / Street / Sector" error={errors.line2}>{(p) => <Input {...p} value={d.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} autoComplete="address-line2" />}</Field>
      <Field label="Landmark" error={errors.landmark}>{(p) => <Input {...p} value={d.landmark ?? ""} onChange={(e) => set("landmark", e.target.value)} placeholder="Near…" />}</Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="PIN code" required error={errors.pincode}>{(p) => <Input {...p} value={d.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="postal-code" />}</Field>
        <Field label="City" required error={errors.city}>{(p) => <Input {...p} value={d.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />}</Field>
        <Field label="State" required error={errors.state}>{(p) => <Input {...p} value={d.state} onChange={(e) => set("state", e.target.value)} autoComplete="address-level1" />}</Field>
      </div>
      <MapPinPicker lat={d.lat} lng={d.lng} onChange={(pt) => setD((x) => ({ ...x, lat: pt.lat, lng: pt.lng }))} />
      <Field label="Delivery instructions" hint="e.g. Ring the bell twice, leave with the guard" error={errors.instructions}>{(p) => <Textarea {...p} rows={2} value={d.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} />}</Field>
      <Checkbox checked={!!d.isDefault} onChange={(v) => set("isDefault", v)} label="Make this my default address" />
      {formError && <p className="text-sm font-medium text-maroon-600">{formError}</p>}
      <div className="flex gap-3 pt-2">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={busy} block>Save address</Button>
      </div>
    </form>
  );
}

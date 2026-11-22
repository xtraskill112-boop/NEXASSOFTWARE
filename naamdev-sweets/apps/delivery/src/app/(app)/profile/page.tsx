"use client";
import { useState } from "react";
import { FileUp, LifeBuoy, LogOut, Star } from "lucide-react";
import { toast } from "sonner";
import { REQUIRED_PARTNER_DOCUMENTS, VEHICLE_TYPES } from "@naamdev/shared";
import { Avatar, Badge, Button, Card, Field, Input, Select, Spinner } from "@naamdev/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { usePartner } from "@/lib/partner";

const DOCS = [...REQUIRED_PARTNER_DOCUMENTS, "VEHICLE_RC", "PAN", "BANK_PROOF"] as const;

export default function ProfilePage() {
  const { partner, refresh, logout, me } = usePartner();
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  if (!partner) return null;
  const form = f ?? { vehicleType: partner.vehicleType, vehicleNumber: partner.vehicleNumber ?? "", licenseNumber: partner.licenseNumber ?? "", city: partner.city, bankAccountName: partner.bankAccountName ?? "", bankAccountNumber: "", bankIfsc: partner.bankIfsc ?? "", upiId: partner.upiId ?? "", emergencyContact: partner.emergencyContact ?? "" };
  const set = (k: string, v: string) => setF({ ...form, [k]: v });
  const upload = async (type: string, file: File) => {
    setUploading(type);
    try { await api.upload("/delivery/documents", file, { type }); toast.success("Uploaded — awaiting verification"); await refresh(); } catch (e) { toast.error(errorMessage(e)); } finally { setUploading(null); }
  };
  const save = async () => {
    setFe({});
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? null : v]));
    if (!form.bankAccountNumber) delete body.bankAccountNumber;
    try { await api.patch("/delivery/me", body); toast.success("Profile saved"); setF(null); await refresh(); } catch (e) { if (e instanceof ApiError) setFe(e.fieldErrors); toast.error(errorMessage(e)); }
  };
  const support = process.env.NEXT_PUBLIC_SUPPORT_PHONE;
  return (
    <div className="space-y-5">
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={partner.user.name} src={partner.user.avatarUrl} size={60} />
        <div className="min-w-0 flex-1"><p className="font-display text-xl font-semibold text-ink">{partner.user.name}</p><p className="text-sm text-muted">{partner.user.phone}</p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted"><Badge tone={partner.status === "APPROVED" ? "success" : "warning"}>{partner.status.toLowerCase()}</Badge><Star className="h-3 w-3 fill-gold-400 text-gold-400" />{partner.rating.toFixed(1)} · {partner.totalDeliveries} deliveries</p></div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">Documents</h2>
        <p className="mb-4 text-xs text-muted">Required: Aadhaar, driving licence, profile photo. Files are stored privately and only visible to verification staff.</p>
        <ul className="space-y-2">
          {DOCS.map((t) => {
            const d = partner.documents.find((x) => x.type === t);
            const required = (REQUIRED_PARTNER_DOCUMENTS as readonly string[]).includes(t);
            return (
              <li key={t} className="flex items-center justify-between gap-3 rounded-2xl border border-line-soft p-3">
                <div className="min-w-0"><p className="text-sm font-semibold capitalize text-ink">{t.replace("_", " ").toLowerCase()}{required && <span className="text-maroon-600"> *</span>}</p>
                  {d ? <p className="text-xs"><Badge tone={d.status === "VERIFIED" ? "success" : d.status === "REJECTED" ? "danger" : "warning"}>{d.status.toLowerCase()}</Badge>{d.rejectionReason && <span className="ml-1 text-maroon-600">{d.rejectionReason}</span>}</p> : <p className="text-xs text-muted">Not uploaded</p>}</div>
                {d?.status !== "VERIFIED" && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold text-maroon-800 dark:text-maroon-200">
                    {uploading === t ? <Spinner className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}{d ? "Replace" : "Upload"}
                    <input type="file" accept="image/*,application/pdf" capture={t === "PROFILE_PHOTO" ? "user" : "environment"} className="hidden" onChange={(e) => e.target.files?.[0] && void upload(t, e.target.files[0])} />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Vehicle & payout details</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vehicle">{(p) => <Select {...p} value={form.vehicleType} onChange={(e) => set("vehicleType", e.target.value)}>{VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v.replace("_", " ").toLowerCase()}</option>)}</Select>}</Field>
          <Field label="Vehicle number">{(p) => <Input {...p} value={form.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value)} />}</Field>
          <Field label="Licence number">{(p) => <Input {...p} value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} />}</Field>
          <Field label="City">{(p) => <Input {...p} value={form.city} onChange={(e) => set("city", e.target.value)} />}</Field>
        </div>
        <Field label="Account holder name">{(p) => <Input {...p} value={form.bankAccountName} onChange={(e) => set("bankAccountName", e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account number" hint={partner.bankAccountLast4 ? `Saved: ••••${partner.bankAccountLast4}` : "Stored encrypted"} error={fe.bankAccountNumber}>{(p) => <Input {...p} inputMode="numeric" value={form.bankAccountNumber} onChange={(e) => set("bankAccountNumber", e.target.value)} placeholder="Enter to update" />}</Field>
          <Field label="IFSC" error={fe.bankIfsc}>{(p) => <Input {...p} value={form.bankIfsc} onChange={(e) => set("bankIfsc", e.target.value.toUpperCase())} />}</Field>
        </div>
        <Field label="UPI ID" error={fe.upiId}>{(p) => <Input {...p} value={form.upiId} onChange={(e) => set("upiId", e.target.value)} placeholder="name@bank" />}</Field>
        <Field label="Emergency contact">{(p) => <Input {...p} value={form.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} />}</Field>
        <Button block onClick={save} disabled={!f}>Save details</Button>
      </Card>

      <Card className="space-y-2 p-5">
        {support && <a href={`tel:${support}`} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold text-ink hover:bg-surface-2"><LifeBuoy className="h-5 w-5 text-maroon-700" />Call partner support</a>}
        <p className="px-2 text-xs text-muted">Signed in as {me?.email ?? me?.phone}</p>
        <Button variant="ghost" block className="text-maroon-700" onClick={() => void logout()}><LogOut className="h-4 w-4" />Log out</Button>
      </Card>
    </div>
  );
}

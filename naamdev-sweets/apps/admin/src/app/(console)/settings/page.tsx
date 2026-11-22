"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, MapPin, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Input, Modal, Pagination, Segmented, Skeleton, Switch } from "@naamdev/ui";
import { DataTable, Guard, PageHeader, confirmAction } from "@/components/kit";
import { ApiError, api, dt, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

type Val = string | number | boolean | string[] | undefined;
const TABS = [["checkout", "Checkout & payments"], ["upi", "UPI payments"], ["delivery", "Delivery & partners"], ["loyalty", "Rewards"], ["storeProfile", "Business profile"], ["returns", "Returns"], ["announcement", "Announcement bar"], ["social", "Social links"], ["notifications", "Alerts"]] as const;
const LABELS: Record<string, string> = {
  minOrderPaise: "Minimum order value (₹)", freeDeliveryThresholdPaise: "Free delivery above (₹)", baseDeliveryFeePaise: "Standard delivery fee (₹)", codEnabled: "Cash on delivery enabled",
  codMaxOrderPaise: "COD allowed up to (₹)", onlinePaymentsEnabled: "Online payments enabled", pricesIncludeTax: "Prices include GST", defaultGstRate: "Default GST rate (%)",
  reservationMinutes: "Online payment window (minutes)", maxQtyPerItem: "Max quantity per item", preparationMinutes: "Kitchen preparation time (minutes)",
  partnerBaseFeePaise: "Partner base pay per delivery (₹)", partnerPerKmPaise: "Partner pay per km (₹)", offerTimeoutSeconds: "Offer timeout (seconds)", dailyIncentiveTarget: "Daily incentive target (deliveries)",
  dailyIncentivePaise: "Daily incentive bonus (₹)", serviceRadiusKm: "Partner search radius (km)", restrictToZones: "Deliver only to listed PIN codes",
  enabled: "Enabled", pointsPer100: "Points earned per ₹100", pointValuePaise: "Value of 1 point (₹)", maxRedeemPercent: "Max % of order payable with points", minRedeemPoints: "Minimum points to redeem",
  signupBonus: "Signup bonus (points)", referrerBonus: "Referrer reward (points)", refereeBonus: "New customer referral reward (points)",
  name: "Brand name", legalName: "Legal entity name", gstin: "GSTIN", fssaiLicense: "FSSAI licence no.", phone: "Support phone", whatsapp: "WhatsApp number", email: "Support email", supportHours: "Support hours", address: "Registered address",
  windowHours: "Return window (hours after delivery)", active: "Show announcement", text: "Announcement text", textHi: "Announcement (Hindi)", link: "Announcement link",
  vpa: "Shop UPI ID (receives the money)", payeeName: "Payee name shown in UPI apps", noteTemplate: "Payment note ({ORDER_NUMBER} = order number)", payWithinMinutes: "Time to pay by UPI (minutes)",
  instagram: "Instagram URL", facebook: "Facebook URL", youtube: "YouTube URL", x: "X (Twitter) URL", adminAlertEmails: "Alert emails (comma separated)", lowStockAlerts: "Low-stock alerts", expiryAlertDays: "Expiry alert window (days)",
};
const SOCIAL_KEYS = ["instagram", "facebook", "youtube", "x", "whatsapp"];

function SettingForm({ k, value, onSaved }: { k: string; value: Record<string, Val>; onSaved: () => void }) {
  const keys = k === "social" ? SOCIAL_KEYS : k === "announcement" ? ["active", "text", "textHi", "link"] : Object.keys(value);
  const [v, setV] = useState<Record<string, string | boolean>>(() => Object.fromEntries(keys.map((x) => {
    const raw = value[x];
    return [x, typeof raw === "boolean" ? raw : Array.isArray(raw) ? raw.join(", ") : x.endsWith("Paise") ? String(Number(raw ?? 0) / 100) : String(raw ?? "")];
  })));
  const [fe, setFe] = useState<Record<string, string>>({});
  const save = async () => {
    setFe({});
    const out: Record<string, unknown> = {};
    for (const x of keys) {
      const cur = v[x];
      const orig = value[x];
      if (typeof cur === "boolean") out[x] = cur;
      else if (Array.isArray(orig) || x === "adminAlertEmails") out[x] = String(cur).split(",").map((s) => s.trim()).filter(Boolean);
      else if (x.endsWith("Paise")) out[x] = Math.round(Number(cur) * 100);
      else if (typeof orig === "number") out[x] = Number(cur);
      else if (SOCIAL_KEYS.includes(x) || x === "textHi" || x === "link") { if (cur) out[x] = cur; else if (x !== "whatsapp" && k === "social") out[x] = ""; }
      else out[x] = cur;
    }
    try { await api.put(`/admin/settings/${k}`, out); toast.success("Settings saved"); onSaved(); } catch (e) { if (e instanceof ApiError) setFe(e.fieldErrors); toast.error(errorMessage(e)); }
  };
  return (
    <Card className="max-w-3xl p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {keys.map((x) => typeof v[x] === "boolean" ? (
          <div key={x} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 sm:col-span-1"><span className="text-sm font-semibold text-ink-soft">{LABELS[x] ?? x}</span><Switch checked={v[x] as boolean} onChange={(b) => setV({ ...v, [x]: b })} label={LABELS[x] ?? x} /></div>
        ) : (
          <Field key={x} label={LABELS[x] ?? x} error={fe[x]}>{(p) => <Input {...p} value={v[x] as string} type={typeof value[x] === "number" ? "number" : "text"} step="any" onChange={(e) => setV({ ...v, [x]: e.target.value })} />}</Field>
        ))}
      </div>
      <Button className="mt-6" onClick={save}>Save changes</Button>
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<string>("checkout");
  const { data, reload } = useResource<{ settings: Record<string, Record<string, Val>>; integrations: Record<string, boolean | string | null> }>("/admin/settings");
  return (
    <Guard any={["settings.manage"]}>
      <PageHeader title="Settings" subtitle="Changes apply to the storefront within a minute." />
      <Segmented value={tab} onChange={setTab} size="sm" className="mb-6" options={[...TABS.map(([v, l]) => ({ value: v as string, label: l })), { value: "store", label: "Store location" }, { value: "zones", label: "Delivery zones" }, { value: "integrations", label: "Integrations" }]} />
      {!data ? <Skeleton className="h-96" /> : tab === "store" ? <StoreForm /> : tab === "zones" ? <Zones /> : tab === "integrations" ? <Integrations status={data.integrations} /> : (
        <SettingForm key={tab} k={tab} value={data.settings[tab] ?? {}} onSaved={() => void reload()} />
      )}
    </Guard>
  );
}

const STORE_FIELDS = ["name", "phone", "addressLine", "city", "state", "pincode", "lat", "lng", "openingTime", "closingTime", "email"] as const;
type StoreDraft = Record<(typeof STORE_FIELDS)[number], string>;

/**
 * The kitchen's address and map position. Every box keeps exactly what is typed (a number box that
 * converts on each key press would drop the "." while typing 26.91…); values are checked on save.
 */
function StoreForm() {
  const { data, reload } = useResource<{ store: Record<string, unknown> | null }>("/admin/store");
  const [s, setS] = useState<StoreDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    if (data?.store) setS(Object.fromEntries(STORE_FIELDS.map((k) => [k, data.store![k] == null ? "" : String(data.store![k])])) as StoreDraft);
  }, [data]);
  if (data && !data.store) return <Card className="max-w-3xl p-6 text-sm text-ink-soft">No store record yet. Run the deploy once to create it.</Card>;
  if (!s) return <Skeleton className="h-64" />;

  const field = (k: keyof StoreDraft, label: string, extra: Partial<React.ComponentProps<typeof Input>> = {}, hint?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>{(p) => <Input {...p} {...extra} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />}</Field>
  );
  const lat = Number(s.lat);
  const lng = Number(s.lng);
  const validPoint = s.lat.trim() !== "" && s.lng.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  const useMyLocation = () => {
    if (!navigator.geolocation) return void toast.error("Location isn't available on this device");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setS((x) => x && { ...x, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
        setLocating(false);
        toast.success("Filled in your current location — check it on the map, then save");
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === 1 ? "Location permission was denied" : "Couldn't get your location — type the coordinates instead");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const save = async () => {
    const local: Record<string, string> = {};
    if (s.lat.trim() === "" || !Number.isFinite(lat) || Math.abs(lat) > 90) local.lat = "Enter a latitude such as 26.915700";
    if (s.lng.trim() === "" || !Number.isFinite(lng) || Math.abs(lng) > 180) local.lng = "Enter a longitude such as 75.806900";
    setErrors(local);
    if (Object.keys(local).length) return void toast.error("Check the highlighted fields");
    setSaving(true);
    try {
      await api.put("/admin/store", {
        name: s.name.trim(), addressLine: s.addressLine.trim(), city: s.city.trim(), state: s.state.trim(), pincode: s.pincode.trim(), lat, lng,
        phone: s.phone.trim(), email: s.email.trim() || null, openingTime: s.openingTime, closingTime: s.closingTime, isActive: data?.store?.isActive !== false,
      });
      toast.success("Store updated");
      void reload();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-3xl p-6">
      <p className="mb-4 text-sm text-muted">The kitchen location anchors delivery distance, partner pay and ETAs. At the shop, tap <b>Use my current location</b>; otherwise right-click the spot in Google Maps and copy the two numbers.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Store name")}
        {field("phone", "Phone", { type: "tel", inputMode: "tel" })}
        {field("addressLine", "Address")}
        {field("city", "City")}
        {field("state", "State")}
        {field("pincode", "PIN code", { inputMode: "numeric", maxLength: 6 })}
        {field("lat", "Latitude", { inputMode: "decimal", placeholder: "26.915700" })}
        {field("lng", "Longitude", { inputMode: "decimal", placeholder: "75.806900" })}
        {field("openingTime", "Opens at", { type: "time" })}
        {field("closingTime", "Closes at", { type: "time" })}
        {field("email", "Email (optional)", { type: "email" })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" loading={locating} onClick={useMyLocation}><MapPin className="h-4 w-4" />Use my current location</Button>
        {validPoint && <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-maroon-700 hover:underline">Check on Google Maps<ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
      <Button className="mt-6" loading={saving} onClick={() => void save()}>Save store</Button>
    </Card>
  );
}

interface Zone { id: string; pincode: string; area: string; city: string; deliveryFeePaise: number | null; etaMinutes: number; isActive: boolean }
function Zones() {
  const { data, loading, reload } = useResource<{ zones: Zone[] }>("/admin/zones");
  const [z, setZ] = useState<Partial<Zone> & { fee?: string } | null>(null);
  return (
    <div className="max-w-4xl">
      <div className="mb-3 flex justify-end"><Button onClick={() => setZ({ isActive: true, etaMinutes: 45, city: "" })}><Plus className="h-4 w-4" />Add PIN code</Button></div>
      <DataTable<Zone> loading={loading} rows={data?.zones} onRowClick={(r) => setZ({ ...r, fee: r.deliveryFeePaise == null ? "" : String(r.deliveryFeePaise / 100) })} columns={[
        { key: "p", header: "PIN code", cell: (r) => <b className="font-mono text-ink">{r.pincode}</b> }, { key: "a", header: "Area", cell: (r) => `${r.area}, ${r.city}` },
        { key: "f", header: "Delivery fee", cell: (r) => (r.deliveryFeePaise == null ? "Standard" : `₹${r.deliveryFeePaise / 100}`) }, { key: "e", header: "ETA", align: "right", cell: (r) => `${r.etaMinutes} min` },
        { key: "s", header: "Status", cell: (r) => <Badge tone={r.isActive ? "success" : "neutral"}>{r.isActive ? "Serviceable" : "Paused"}</Badge> },
        { key: "d", header: "", align: "right", cell: (r) => <button type="button" aria-label="Delete zone" className="p-2 text-muted hover:text-maroon-600" onClick={async (e) => { e.stopPropagation(); if (confirmAction(`Remove ${r.pincode}?`)) { await api.del(`/admin/zones/${r.id}`); void reload(); } }}><Trash2 className="h-4 w-4" /></button> },
      ]} />
      <Modal open={!!z} onClose={() => setZ(null)} title={z?.id ? `Edit ${z.pincode}` : "Add delivery PIN code"} footer={<div className="flex justify-end"><Button onClick={async () => { if (!z) return; const body = { pincode: z.pincode, area: z.area, city: z.city, deliveryFeePaise: z.fee ? Math.round(Number(z.fee) * 100) : null, etaMinutes: Number(z.etaMinutes), isActive: z.isActive ?? true }; try { if (z.id) await api.put(`/admin/zones/${z.id}`, body); else await api.post("/admin/zones", body); toast.success("Zone saved"); setZ(null); void reload(); } catch (e) { toast.error(errorMessage(e)); } }}>Save</Button></div>}>
        {z && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PIN code">{(p) => <Input {...p} value={z.pincode ?? ""} onChange={(e) => setZ({ ...z, pincode: e.target.value })} />}</Field>
          <Field label="Area">{(p) => <Input {...p} value={z.area ?? ""} onChange={(e) => setZ({ ...z, area: e.target.value })} />}</Field>
          <Field label="City">{(p) => <Input {...p} value={z.city ?? ""} onChange={(e) => setZ({ ...z, city: e.target.value })} />}</Field>
          <Field label="ETA (minutes)">{(p) => <Input {...p} type="number" value={z.etaMinutes ?? 45} onChange={(e) => setZ({ ...z, etaMinutes: Number(e.target.value) })} />}</Field>
          <Field label="Delivery fee override (₹)" hint="Blank = standard fee">{(p) => <Input {...p} type="number" value={z.fee ?? ""} onChange={(e) => setZ({ ...z, fee: e.target.value })} />}</Field>
          <div className="flex items-end pb-3"><Switch checked={z.isActive ?? true} onChange={(v) => setZ({ ...z, isActive: v })} label="Serviceable" /><span className="ml-3 text-sm">Serviceable</span></div>
        </div>}
      </Modal>
    </div>
  );
}

function Integrations({ status }: { status: Record<string, boolean | string | null> }) {
  const [page, setPage] = useState(1);
  const logs = useResource<{ items: { id: string; channel: string; template: string; recipient: string; status: string; provider: string; error: string | null; createdAt: string }[]; meta: { totalPages: number } }>("/admin/notification-logs", { page });
  type State = "ok" | "dev" | "off";
  const state = (ok: boolean, provider?: unknown): State => (!ok ? "off" : provider === "console" ? "dev" : "ok");
  const devNote = "Development mode: messages are written to the API log, not delivered";
  const rows: [string, State, string][] = [
    ["Razorpay payments", state(!!status.razorpay), status.razorpayMode ? `${status.razorpayMode} mode` : "Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET"],
    ["Razorpay webhooks", state(!!status.razorpayWebhook), "Set RAZORPAY_WEBHOOK_SECRET and add the webhook URL in the Razorpay dashboard"],
    ["Firebase Storage", state(!!status.storage), "Product images, avatars and private partner documents"],
    ["Order emails", state(!!status.email, status.emailProvider), status.emailProvider === "console" ? devNote : status.email ? `Provider: ${status.emailProvider}` : "Set EMAIL_PROVIDER=smtp and SMTP_* (sign-in emails are sent by Firebase Auth)"],
    ["SMS updates", state(!!status.sms, status.smsProvider), status.smsProvider === "console" ? devNote : status.sms ? `Provider: ${status.smsProvider}` : "Optional: set SMS_PROVIDER and its keys"],
    ["Push (Firebase Cloud Messaging)", state(!!status.push), status.push ? "Enabled" : "Set PUSH_ENABLED=true and the web VAPID key"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(([l, st, h]) => <Card key={l} className="flex items-start gap-3 p-4">{st === "ok" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-pista-600" /> : st === "dev" ? <AlertTriangle className="h-5 w-5 shrink-0 text-maroon-700" /> : <XCircle className="h-5 w-5 shrink-0 text-maroon-500" />}<div><p className="font-semibold text-ink">{l}{st === "dev" && <span className="ml-2 text-xs font-medium text-maroon-700">dev only</span>}</p><p className="text-xs text-muted">{h}</p></div></Card>)}</div>
      <p className="text-xs text-muted">Credentials are configured as server environment variables (never in this console). See docs/INTEGRATIONS.md.</p>
      <h2 className="font-display text-xl font-semibold text-ink">Notification delivery log</h2>
      <DataTable loading={logs.loading} rows={logs.data?.items} columns={[
        { key: "d", header: "When", cell: (r) => <span className="text-xs">{dt(r.createdAt)}</span> }, { key: "c", header: "Channel", cell: (r) => r.channel }, { key: "t", header: "Template", cell: (r) => <code className="text-xs">{r.template}</code> },
        { key: "r", header: "Recipient", cell: (r) => <span className="text-xs">{r.recipient}</span> }, { key: "p", header: "Provider", cell: (r) => r.provider },
        { key: "s", header: "Result", cell: (r) => <Badge tone={r.status === "SENT" ? "success" : r.status === "FAILED" ? "danger" : "neutral"}>{r.status.toLowerCase()}</Badge> }, { key: "e", header: "Note", cell: (r) => <span className="text-xs text-muted">{r.error}</span> },
      ]} />
      <Pagination page={page} totalPages={logs.data?.meta.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}

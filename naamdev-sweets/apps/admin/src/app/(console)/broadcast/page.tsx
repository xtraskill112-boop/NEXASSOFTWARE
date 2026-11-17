"use client";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Checkbox, Field, InlineAlert, Input, Select, Textarea } from "@naamdev/ui";
import { Guard, PageHeader } from "@/components/kit";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

export default function BroadcastPage() {
  const integ = useResource<{ integrations: { email: boolean; sms: boolean; push: boolean; emailProvider?: string; smsProvider?: string } }>("/admin/settings");
  const [f, setF] = useState({ title: "", body: "", link: "", audience: "MARKETING_OPT_IN", channels: ["IN_APP"] as string[] });
  const [busy, setBusy] = useState(false);
  const toggle = (c: string) => setF({ ...f, channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c] });
  const i = integ.data?.integrations;
  return (
    <Guard any={["notifications.send"]}>
      <PageHeader title="Promotional notifications" subtitle="Send offers and announcements. Customers' opt-out preferences are always respected." />
      <Card className="max-w-2xl space-y-4 p-6">
        <Field label="Title">{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Weekend special: 15% off kaju sweets" maxLength={80} />}</Field>
        <Field label="Message">{(p) => <Textarea {...p} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={240} />}</Field>
        <Field label="Link (optional)" hint="Storefront path, e.g. /offers">{(p) => <Input {...p} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />}</Field>
        <Field label="Audience">{(p) => <Select {...p} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="MARKETING_OPT_IN">Customers who opted in to offers</option><option value="ALL">All active customers (in-app only respects preferences per channel)</option></Select>}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Checkbox checked={f.channels.includes("IN_APP")} onChange={() => toggle("IN_APP")} label="In-app" />
          <Checkbox checked={f.channels.includes("PUSH")} onChange={() => toggle("PUSH")} label="Push" description={i && !i.push ? "Firebase not configured" : undefined} />
          <Checkbox checked={f.channels.includes("EMAIL")} onChange={() => toggle("EMAIL")} label="Email" description={i && !i.email ? "Email provider not configured" : i?.emailProvider === "console" ? "Dev mode: written to API log only" : undefined} />
          <Checkbox checked={f.channels.includes("SMS")} onChange={() => toggle("SMS")} label="SMS" description={i && !i.sms ? "SMS provider not configured" : i?.smsProvider === "console" ? "Dev mode: written to API log only" : "Requires a DLT-approved promotional template"} />
        </div>
        <InlineAlert>Delivery results for every channel are recorded in Settings → Notification log.</InlineAlert>
        <Button size="lg" loading={busy} disabled={f.title.length < 3 || f.body.length < 5 || !f.channels.length} onClick={async () => {
          setBusy(true);
          try { const r = await api.post<{ queued: number }>("/admin/marketing/notifications/broadcast", { ...f, link: f.link || null }); toast.success(`Queued for ${r.queued} customers`); setF({ ...f, title: "", body: "" }); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
        }}><Megaphone className="h-4 w-4" />Send notification</Button>
      </Card>
    </Guard>
  );
}

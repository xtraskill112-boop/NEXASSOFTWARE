"use client";
import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import type { Me } from "@naamdev/api-client";
import { Avatar, Button, Card, Checkbox, Field, Input, Select } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState(() => ({
    name: user?.name ?? "", email: user?.email ?? "", preferredLanguage: user?.preferredLanguage ?? "en",
    dateOfBirth: user?.profile?.dateOfBirth?.slice(0, 10) ?? "", anniversary: user?.profile?.anniversary?.slice(0, 10) ?? "", gender: user?.profile?.gender ?? "",
    marketingOptIn: user?.profile?.marketingOptIn ?? true, smsOptIn: user?.profile?.smsOptIn ?? true, emailOptIn: user?.profile?.emailOptIn ?? true, pushOptIn: user?.profile?.pushOptIn ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const [fe, setFe] = useState<Record<string, string>>({});
  if (!user) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setFe({});
    try {
      const r = await api.patch<{ user: Me }>("/account/profile", { ...f, email: f.email || undefined, dateOfBirth: f.dateOfBirth || null, anniversary: f.anniversary || null, gender: f.gender || null });
      setUser(r.user);
      toast.success("Profile updated");
    } catch (err) {
      if (err instanceof ApiError) setFe(err.fieldErrors);
      toast.error(errorMessage(err));
    } finally { setBusy(false); }
  };

  const uploadAvatar = async (file: File) => {
    try {
      const up = await api.upload<{ file: { url: string } }>("/uploads/avatar", file);
      const r = await api.patch<{ user: Me }>("/account/avatar", { url: up.file.url });
      setUser(r.user);
      toast.success("Photo updated");
    } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <div className="max-w-2xl">
      <PageTitle title="Profile" subtitle="Personal details and communication preferences" />
      <Card className="p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="relative">
            <Avatar name={user.name} src={user.avatarUrl} size={76} />
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-saffron-500 text-white shadow" aria-label="Change photo"><Camera className="h-4 w-4" /></button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadAvatar(e.target.files[0])} />
          </div>
          <div><p className="font-semibold text-ink">{user.phone}</p><p className="text-xs text-muted">Mobile number {user.phoneVerified ? "verified ✓" : "not verified"} · change it in Password & security</p></div>
        </div>
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name" error={fe.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Email" hint={user.email && !user.emailVerified ? "Not verified — verify it from Password & security" : undefined} error={fe.email}>{(p) => <Input {...p} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Birthday" hint="For a birthday surprise 🎂">{(p) => <Input {...p} type="date" value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} />}</Field>
            <Field label="Anniversary">{(p) => <Input {...p} type="date" value={f.anniversary} onChange={(e) => setF({ ...f, anniversary: e.target.value })} />}</Field>
            <Field label="Gender">{(p) => <Select {...p} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>}</Field>
          </div>
          <Field label="Preferred language">{(p) => <Select {...p} value={f.preferredLanguage} onChange={(e) => setF({ ...f, preferredLanguage: e.target.value })}><option value="en">English</option><option value="hi">हिन्दी (Hindi)</option></Select>}</Field>
          <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
            <p className="text-sm font-bold text-ink">Communication preferences</p>
            <Checkbox checked={f.marketingOptIn} onChange={(v) => setF({ ...f, marketingOptIn: v })} label="Offers and festive announcements" description="Order updates are always sent." />
            <Checkbox checked={f.emailOptIn} onChange={(v) => setF({ ...f, emailOptIn: v })} label="Email" />
            <Checkbox checked={f.smsOptIn} onChange={(v) => setF({ ...f, smsOptIn: v })} label="SMS" />
            <Checkbox checked={f.pushOptIn} onChange={(v) => setF({ ...f, pushOptIn: v })} label="Push notifications" />
          </div>
          <Button type="submit" size="lg" loading={busy}>Save changes</Button>
        </form>
      </Card>
    </div>
  );
}

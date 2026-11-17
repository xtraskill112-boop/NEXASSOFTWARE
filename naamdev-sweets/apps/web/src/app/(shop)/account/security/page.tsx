"use client";
import { useEffect, useState } from "react";
import { Laptop, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Me } from "@naamdev/api-client";
import { Badge, Button, Card, Field, InlineAlert, Input, Modal, OtpInput, Textarea } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface S { id: string; app: string; userAgent: string | null; ip: string | null; lastSeenAt: string; current: boolean }

export default function SecurityPage() {
  const { user, setUser, logout } = useAuth();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<S[]>([]);
  const [verify, setVerify] = useState<null | { kind: "email" | "phone"; value: string; sent: boolean; otp: string; dev?: string }>(null);
  const [del, setDel] = useState(false);
  const [reason, setReason] = useState("");
  const loadSessions = () => api.get<{ sessions: S[] }>("/auth/sessions").then((r) => setSessions(r.sessions));
  useEffect(() => { void loadSessions(); }, []);
  if (!user) return null;

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setFe({});
    try { await api.post("/auth/password/change", user.hasPassword ? pw : { newPassword: pw.newPassword }); toast.success("Password updated. Other devices were signed out."); setPw({ currentPassword: "", newPassword: "" }); setUser({ ...user, hasPassword: true }); void loadSessions(); }
    catch (err) { if (err instanceof ApiError) setFe(err.fieldErrors); toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  const sendVerify = async () => {
    if (!verify) return;
    try { const r = await api.post<{ devCode?: string }>(`/auth/verify/${verify.kind}/request`, verify.kind === "email" ? { email: verify.value } : { phone: verify.value }); setVerify({ ...verify, sent: true, dev: r.devCode }); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  const confirmVerify = async () => {
    if (!verify) return;
    try { const r = await api.post<{ user: Me }>(`/auth/verify/${verify.kind}/confirm`, { [verify.kind]: verify.value, otp: verify.otp }); setUser(r.user); setVerify(null); toast.success("Verified ✓"); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle title="Password & security" />
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink">{user.hasPassword ? "Change password" : "Set a password"}</h2>
        <p className="mb-4 text-sm text-muted">{user.hasPassword ? "Changing your password signs you out on other devices." : "You currently log in with OTP. Add a password for faster login."}</p>
        <form onSubmit={changePw} className="space-y-4">
          {user.hasPassword && <Field label="Current password" error={fe.currentPassword}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>}
          <Field label="New password" hint="At least 8 characters, with a letter and a number" error={fe.newPassword}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}</Field>
          <Button type="submit" loading={busy} disabled={pw.newPassword.length < 8}>Save password</Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Contact verification</h2>
        {[["phone", user.phone, user.phoneVerified], ["email", user.email, user.emailVerified]].map(([kind, value, ok]) => (
          <div key={kind as string} className="flex items-center justify-between gap-3 border-b border-line-soft py-3 last:border-0">
            <div><p className="text-sm font-semibold capitalize text-ink">{kind as string}</p><p className="text-sm text-muted">{(value as string) || "Not added"}</p></div>
            <div className="flex items-center gap-2">
              {value && <Badge tone={ok ? "success" : "warning"}>{ok ? "Verified" : "Unverified"}</Badge>}
              <Button variant="outline" size="sm" onClick={() => setVerify({ kind: kind as "email" | "phone", value: (value as string)?.replace(/^\+91/, "") ?? "", sent: false, otp: "" })}>{value ? (ok ? "Change" : "Verify") : "Add"}</Button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Active sessions</h2>
        <ul className="space-y-3">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <Laptop className="h-5 w-5 text-muted" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-ink">{s.userAgent?.split(") ")[0]?.replace("(", "· ") ?? "Unknown device"}</p><p className="text-xs text-muted">{s.app} · last active {new Date(s.lastSeenAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></div>
              {s.current ? <Badge tone="success">This device</Badge> : <Button variant="ghost" size="sm" onClick={async () => { await api.del(`/auth/sessions/${s.id}`); void loadSessions(); }}><LogOut className="h-4 w-4" />Sign out</Button>}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="border-maroon-200 p-6 dark:border-maroon-500/30">
        <h2 className="font-display text-xl font-semibold text-maroon-800 dark:text-maroon-200">Delete account</h2>
        {user.status === "DELETION_REQUESTED" ? (
          <>
            <InlineAlert tone="warning" className="mt-3">Deletion requested on {new Date(user.deletionRequestedAt!).toLocaleDateString("en-IN")}. Our team will permanently anonymise your data within 30 days.</InlineAlert>
            <Button variant="outline" className="mt-4" onClick={async () => { const r = await api.del<{ user: Me }>("/account/deletion-request"); setUser(r.user); toast.success("Deletion request cancelled"); }}>Cancel deletion request</Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Your personal data will be anonymised. Order records are retained as required for tax compliance. Unused points will be lost.</p>
            <Button variant="danger" className="mt-4" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Request account deletion</Button>
          </>
        )}
      </Card>

      <Modal open={!!verify} onClose={() => setVerify(null)} title={`Verify ${verify?.kind ?? ""}`}>
        {verify && (
          <div className="space-y-4">
            <Field label={verify.kind === "email" ? "Email address" : "Mobile number"}>{(p) => <Input {...p} value={verify.value} onChange={(e) => setVerify({ ...verify, value: e.target.value, sent: false })} type={verify.kind === "email" ? "email" : "tel"} />}</Field>
            {!verify.sent ? <Button block onClick={sendVerify}>Send code</Button> : (
              <>
                {verify.dev && <InlineAlert>Development mode: code <b className="font-mono">{verify.dev}</b></InlineAlert>}
                <OtpInput value={verify.otp} onChange={(otp) => setVerify({ ...verify, otp })} autoFocus />
                <Button block disabled={verify.otp.length !== 6} onClick={confirmVerify}>Verify</Button>
              </>
            )}
          </div>
        )}
      </Modal>
      <Modal open={del} onClose={() => setDel(false)} title="Delete your account?" description="This can't be undone once processed."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(false)}>Keep account</Button><Button variant="danger" onClick={async () => { try { const r = await api.post<{ user: Me }>("/account/deletion-request", { reason }); setUser(r.user); setDel(false); toast.success("Deletion requested"); } catch (e) { toast.error(errorMessage(e)); } }}>Request deletion</Button></div>}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell us why (optional)" />
      </Modal>
      <div className="text-center"><Button variant="ghost" onClick={() => void logout()}><LogOut className="h-4 w-4" />Log out</Button></div>
    </div>
  );
}

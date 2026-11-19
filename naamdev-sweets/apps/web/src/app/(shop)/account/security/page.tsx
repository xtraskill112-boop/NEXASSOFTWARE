"use client";
import { useState } from "react";
import { LogOut, MailCheck, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Me } from "@naamdev/api-client";
import { authErrorMessage, changeEmail, changePassword, resendVerification, signOutFirebase } from "@naamdev/api-client/firebase";
import { Badge, Button, Card, Field, InlineAlert, Input, Modal, Textarea } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SecurityPage() {
  const { user, setUser, logout } = useAuth();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState(false);
  const [emailModal, setEmailModal] = useState<null | { email: string; password: string; sent: boolean }>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [del, setDel] = useState(false);
  const [reason, setReason] = useState("");
  if (!user) return null;

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await changePassword(pw.currentPassword, pw.newPassword);
      toast.success("Password updated. Other devices will need to log in again.");
      setPw({ currentPassword: "", newPassword: "" });
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async () => {
    setPhoneError(undefined);
    try {
      const r = await api.patch<{ user: Me }>("/account/phone", { phone });
      setUser(r.user);
      setPhone(null);
      toast.success("Mobile number updated");
    } catch (err) {
      if (err instanceof ApiError) setPhoneError(err.fieldErrors.phone ?? err.message);
      else toast.error(errorMessage(err));
    }
  };

  const submitEmail = async () => {
    if (!emailModal) return;
    try {
      await changeEmail(emailModal.password, emailModal.email);
      setEmailModal({ ...emailModal, sent: true });
    } catch (err) {
      toast.error(authErrorMessage(err));
    }
  };

  const signOutEverywhere = async () => {
    try {
      await api.post("/auth/sign-out-everywhere");
      await signOutFirebase();
      setUser(null);
      toast.success("Signed out on all devices");
      window.location.href = "/login";
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle title="Password & security" />
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Change password</h2>
        <p className="mb-4 text-sm text-muted">Forgot your current password? Log out and use &ldquo;Forgot password&rdquo; to get a reset link by email.</p>
        <form onSubmit={savePassword} className="space-y-4">
          <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>
          <Field label="New password" hint="At least 8 characters, with a letter and a number">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}</Field>
          <Button type="submit" loading={busy} disabled={!pw.currentPassword || pw.newPassword.length < 8}>Save password</Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Login email & mobile</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft py-3">
          <div><p className="text-sm font-semibold text-ink">Email (used to log in)</p><p className="text-sm text-muted">{user.email}</p></div>
          <div className="flex items-center gap-2">
            <Badge tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Verified" : "Unverified"}</Badge>
            {!user.emailVerified && <Button variant="ghost" size="sm" onClick={() => void resendVerification().then(() => toast.success("Verification email sent"), (e) => toast.error(authErrorMessage(e)))}><MailCheck className="h-4 w-4" />Resend link</Button>}
            <Button variant="outline" size="sm" onClick={() => setEmailModal({ email: "", password: "", sent: false })}>Change</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Mobile number</p>
            {phone === null ? <p className="text-sm text-muted">{user.phone ?? "Not added"}</p> : (
              <Field label="" error={phoneError}>{(p) => <Input {...p} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, "").slice(0, 14))} inputMode="tel" autoFocus leading={<span className="text-sm font-bold text-ink-soft">+91</span>} />}</Field>
            )}
          </div>
          {phone === null ? <Button variant="outline" size="sm" onClick={() => setPhone(user.phone?.replace(/^\+91/, "") ?? "")}>{user.phone ? "Change" : "Add"}</Button> : (
            <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setPhone(null)}>Cancel</Button><Button size="sm" onClick={() => void savePhone()}>Save</Button></div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold text-ink">Sign out everywhere</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Lost a phone or used a shared computer? This signs your account out on every device, including this one.</p>
        <Button variant="outline" onClick={() => void signOutEverywhere()}><ShieldCheck className="h-4 w-4" />Sign out of all devices</Button>
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
            <p className="mt-1 text-sm text-muted">Your personal data will be anonymised and your login removed. Order records are retained as required for tax compliance. Unused points will be lost.</p>
            <Button variant="danger" className="mt-4" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Request account deletion</Button>
          </>
        )}
      </Card>

      <Modal open={!!emailModal} onClose={() => setEmailModal(null)} title="Change login email">
        {emailModal && (emailModal.sent ? (
          <InlineAlert tone="success">We sent a confirmation link to <b>{emailModal.email}</b>. Your login email changes once you click it.</InlineAlert>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submitEmail(); }}>
            <Field label="New email address">{(p) => <Input {...p} type="email" value={emailModal.email} onChange={(e) => setEmailModal({ ...emailModal, email: e.target.value })} autoComplete="email" autoFocus />}</Field>
            <Field label="Current password" hint="Needed to confirm it's you">{(p) => <Input {...p} type="password" value={emailModal.password} onChange={(e) => setEmailModal({ ...emailModal, password: e.target.value })} autoComplete="current-password" />}</Field>
            <Button type="submit" block disabled={!emailModal.email || !emailModal.password}>Send confirmation link</Button>
          </form>
        ))}
      </Modal>
      <Modal open={del} onClose={() => setDel(false)} title="Delete your account?" description="This can't be undone once processed."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(false)}>Keep account</Button><Button variant="danger" onClick={async () => { try { const r = await api.post<{ user: Me }>("/account/deletion-request", { reason }); setUser(r.user); setDel(false); toast.success("Deletion requested"); } catch (e) { toast.error(errorMessage(e)); } }}>Request deletion</Button></div>}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell us why (optional)" />
      </Modal>
      <div className="text-center"><Button variant="ghost" onClick={() => void logout()}><LogOut className="h-4 w-4" />Log out</Button></div>
    </div>
  );
}

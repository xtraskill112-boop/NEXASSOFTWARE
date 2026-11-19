"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Field, Input, Modal } from "@naamdev/ui";
import { authErrorMessage, changePassword } from "@naamdev/api-client/firebase";

/** Lets any staff member change their own console password (Firebase signs other devices out). */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const close = () => {
    setF({ currentPassword: "", newPassword: "", confirm: "" });
    setErrors({});
    onClose();
  };
  const submit = async () => {
    if (f.newPassword !== f.confirm) return setErrors({ confirm: "Passwords don't match" });
    setBusy(true);
    setErrors({});
    try {
      await changePassword(f.currentPassword, f.newPassword);
      toast.success("Password changed. Other devices will need to sign in again.");
      close();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") setErrors({ currentPassword: "Current password is incorrect" });
      else toast.error(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title="Change password"
      description="At least 8 characters, with a letter and a number."
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button loading={busy} disabled={!f.currentPassword || f.newPassword.length < 8 || !f.confirm} onClick={() => void submit()}>Update password</Button></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Current password" error={errors.currentPassword}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} autoFocus />}</Field>
        <Field label="New password" error={errors.newPassword}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />}</Field>
        <Field label="Confirm new password" error={errors.confirm}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />}</Field>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

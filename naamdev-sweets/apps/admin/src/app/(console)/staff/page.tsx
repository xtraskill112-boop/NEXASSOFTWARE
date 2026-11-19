"use client";
import { useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, Segmented, Select } from "@naamdev/ui";
import { Can, DataTable, Guard, PageHeader } from "@/components/kit";
import { ApiError, api, dt, errorMessage } from "@/lib/api";
import { useAdmin } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

interface St { id: string; name: string; email: string | null; phone: string | null; status: string; lastLoginAt: string | null; role: { id: string; key: string; name: string }; staffProfile: { designation: string; employeeCode: string; isActive: boolean } | null }
interface Role { id: string; key: string; name: string; description: string | null; isSystem: boolean; isStaff: boolean; userCount: number; permissions: string[] }

export default function StaffPage() {
  const { can, me } = useAdmin();
  const [tab, setTab] = useState<"staff" | "roles">(can("staff.manage") ? "staff" : "roles");
  const staff = useResource<{ staff: St[] }>(can("staff.manage") ? "/admin/people/staff" : null);
  const roles = useResource<{ roles: Role[]; permissions: { key: string; group: string; description: string }[] }>("/admin/people/roles");
  const [nu, setNu] = useState<null | { name: string; email: string; phone: string; password: string; roleId: string; designation: string }>(null);
  const [ed, setEd] = useState<St | null>(null);
  const [role, setRole] = useState<Partial<Role> | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const staffRoles = roles.data?.roles.filter((r) => r.isStaff) ?? [];
  const groups = [...new Set(roles.data?.permissions.map((p) => p.group))];
  return (
    <Guard any={["staff.manage", "roles.manage"]}>
      <PageHeader title="Staff & roles" actions={tab === "staff" ? <Can any={["staff.manage"]}><Button onClick={() => setNu({ name: "", email: "", phone: "", password: "", roleId: "", designation: "" })}><Plus className="h-4 w-4" />Add staff</Button></Can> : <Can any={["roles.manage"]}><Button onClick={() => setRole({ name: "", permissions: [] })}><Plus className="h-4 w-4" />New role</Button></Can>} />
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[...(can("staff.manage") ? [{ value: "staff" as const, label: "Team" }] : []), { value: "roles" as const, label: "Roles & permissions" }]} />
      {tab === "staff" ? (
        <DataTable<St> loading={staff.loading} rows={staff.data?.staff} onRowClick={(s) => setEd(s)} columns={[
          { key: "n", header: "Name", cell: (s) => <div><p className="font-semibold text-ink">{s.name}{s.id === me?.id && " (you)"}</p><p className="text-xs text-muted">{s.email} · {s.phone}</p></div> },
          { key: "r", header: "Role", cell: (s) => <Badge tone="brand">{s.role.name}</Badge> },
          { key: "d", header: "Designation", cell: (s) => `${s.staffProfile?.designation ?? "—"} · ${s.staffProfile?.employeeCode ?? ""}` },
          { key: "l", header: "Last login", cell: (s) => <span className="text-xs">{dt(s.lastLoginAt)}</span> },
          { key: "a", header: "Access", cell: (s) => <Badge tone={s.staffProfile?.isActive ? "success" : "danger"}>{s.staffProfile?.isActive ? "Active" : "Deactivated"}</Badge> },
        ]} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.data?.roles.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="font-display text-lg font-semibold text-ink">{r.name}</p><p className="text-xs text-muted">{r.description}</p></div><div className="flex items-center gap-2">{r.isSystem && <Badge>System</Badge>}<Badge tone="info">{r.userCount} users</Badge></div></div>
              <p className="mt-3 text-xs text-ink-soft">{r.isStaff ? (r.permissions.length ? r.permissions.join(" · ") : "No console permissions") : "Not a console role"}</p>
              {r.isStaff && r.key !== "SUPER_ADMIN" && <Can any={["roles.manage"]}><Button size="sm" variant="outline" className="mt-3" onClick={() => setRole(r)}>Edit permissions</Button></Can>}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!nu} onClose={() => setNu(null)} title="Add staff member" footer={<div className="flex justify-end"><Button onClick={async () => { setFe({}); try { await api.post("/admin/people/staff", nu); toast.success("Staff account created"); setNu(null); void staff.reload(); } catch (e) { if (e instanceof ApiError) setFe(e.fieldErrors); toast.error(errorMessage(e)); } }}>Create account</Button></div>}>
        {nu && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={fe.name}>{(p) => <Input {...p} value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />}</Field>
          <Field label="Designation" error={fe.designation}>{(p) => <Input {...p} value={nu.designation} onChange={(e) => setNu({ ...nu, designation: e.target.value })} />}</Field>
          <Field label="Email" error={fe.email}>{(p) => <Input {...p} type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />}</Field>
          <Field label="Mobile" error={fe.phone}>{(p) => <Input {...p} value={nu.phone} onChange={(e) => setNu({ ...nu, phone: e.target.value })} />}</Field>
          <Field label="Role" error={fe.roleId}>{(p) => <Select {...p} value={nu.roleId} onChange={(e) => setNu({ ...nu, roleId: e.target.value })}><option value="">Choose…</option>{staffRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>
          <Field label="Temporary password" error={fe.password} hint="Share securely; they can change it later">{(p) => <Input {...p} type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} autoComplete="new-password" />}</Field>
        </div>}
      </Modal>
      <Modal open={!!ed} onClose={() => setEd(null)} title={ed?.name} footer={<div className="flex flex-wrap justify-between gap-2"><Button variant="ghost" onClick={async () => { const pw = prompt("New password (min 8 chars, letters + numbers)"); if (!pw || !ed) return; try { await api.post(`/admin/people/staff/${ed.id}/password`, { password: pw }); toast.success("Password reset; sessions signed out"); } catch (e) { toast.error(errorMessage(e)); } }}><KeyRound className="h-4 w-4" />Reset password</Button><Button onClick={async () => { if (!ed) return; try { await api.patch(`/admin/people/staff/${ed.id}`, { roleId: ed.role.id, designation: ed.staffProfile?.designation, isActive: ed.staffProfile?.isActive }); toast.success("Saved"); setEd(null); void staff.reload(); } catch (e) { toast.error(errorMessage(e)); } }}>Save</Button></div>}>
        {ed && <div className="space-y-4">
          <Field label="Role">{(p) => <Select {...p} value={ed.role.id} onChange={(e) => setEd({ ...ed, role: { ...ed.role, id: e.target.value } })}>{staffRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>
          <Field label="Designation">{(p) => <Input {...p} value={ed.staffProfile?.designation ?? ""} onChange={(e) => setEd({ ...ed, staffProfile: { ...ed.staffProfile!, designation: e.target.value } })} />}</Field>
          <Checkbox checked={!!ed.staffProfile?.isActive} onChange={(v) => setEd({ ...ed, staffProfile: { ...ed.staffProfile!, isActive: v } })} label="Console access active" description="Deactivating signs them out immediately." />
        </div>}
      </Modal>
      <Modal open={!!role} onClose={() => setRole(null)} title={role?.id ? `Edit ${role.name}` : "New role"} size="xl" footer={<div className="flex justify-end"><Button onClick={async () => { if (!role) return; try { if (role.id) await api.put(`/admin/people/roles/${role.id}`, { name: role.name, description: role.description, permissions: role.permissions }); else await api.post("/admin/people/roles", { name: role.name, description: role.description, permissions: role.permissions }); toast.success("Role saved"); setRole(null); void roles.reload(); } catch (e) { toast.error(errorMessage(e)); } }}>Save role</Button></div>}>
        {role && <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Name">{(p) => <Input {...p} value={role.name ?? ""} onChange={(e) => setRole({ ...role, name: e.target.value })} />}</Field><Field label="Description">{(p) => <Input {...p} value={role.description ?? ""} onChange={(e) => setRole({ ...role, description: e.target.value })} />}</Field></div>
          <div className="grid gap-4 sm:grid-cols-2">{groups.map((g) => (
            <div key={g} className="rounded-2xl border border-line p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{g}</p>
              {roles.data?.permissions.filter((p) => p.group === g).map((p) => <Checkbox key={p.key} className="py-1" checked={!!role.permissions?.includes(p.key)} label={p.description} description={p.key} onChange={(v) => setRole({ ...role, permissions: v ? [...(role.permissions ?? []), p.key] : role.permissions?.filter((x) => x !== p.key) })} />)}
            </div>
          ))}</div>
        </div>}
      </Modal>
    </Guard>
  );
}

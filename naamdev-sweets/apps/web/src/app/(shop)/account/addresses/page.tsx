"use client";
import { useEffect, useState } from "react";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Address } from "@naamdev/api-client";
import { Badge, Button, Card, EmptyState, Modal, Skeleton } from "@naamdev/ui";
import { PageTitle } from "@/components/account/nav";
import { AddressForm } from "@/components/checkout/address-form";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AddressesPage() {
  const { user } = useAuth();
  const [list, setList] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | null | "new">(null);
  const load = () => api.get<{ addresses: Address[] }>("/account/addresses").then((r) => setList(r.addresses));
  useEffect(() => { void load(); }, []);
  const del = async (a: Address) => {
    if (!confirm("Delete this address?")) return;
    try { await api.del(`/account/addresses/${a.id}`); toast.success("Address deleted"); void load(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const makeDefault = async (a: Address) => { await api.patch(`/account/addresses/${a.id}`, { isDefault: true }); void load(); };

  return (
    <div className="max-w-3xl">
      <PageTitle title="Saved addresses" action={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Add address</Button>} />
      {!list ? <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : list.length === 0 ? (
        <EmptyState icon={<MapPin className="h-8 w-8" />} title="No saved addresses" description="Add an address to check out faster." action={<Button onClick={() => setEditing("new")}>Add address</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((a) => (
            <Card key={a.id} className="flex flex-col p-5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink">{a.type === "OTHER" ? a.label ?? "Other" : a.type === "HOME" ? "Home" : "Office"}</span>
                {a.isDefault && <Badge tone="brand">Default</Badge>}
                {a.serviceable === false && <Badge tone="danger">Not serviceable</Badge>}
              </div>
              <p className="mt-2 text-sm font-medium text-ink-soft">{a.fullName} · {a.phone}</p>
              <p className="mt-1 flex-1 text-sm text-muted">{[a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ")}</p>
              {a.instructions && <p className="mt-2 text-xs italic text-muted">“{a.instructions}”</p>}
              <div className="mt-4 flex gap-1 border-t border-line-soft pt-3">
                <Button variant="ghost" size="sm" onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
                {!a.isDefault && <Button variant="ghost" size="sm" onClick={() => void makeDefault(a)}><Star className="h-3.5 w-3.5" />Set default</Button>}
                <Button variant="ghost" size="sm" className="ml-auto text-maroon-700" onClick={() => void del(a)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add address" : "Edit address"} size="lg">
        {editing !== null && <AddressForm initial={editing === "new" ? null : editing} defaultName={user?.name} defaultPhone={user?.phone} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); toast.success("Address saved"); void load(); }} />}
      </Modal>
    </div>
  );
}

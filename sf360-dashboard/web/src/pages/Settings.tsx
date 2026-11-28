import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "../firebase";
import { useAppInfo } from "../auth";
import { api, errorMessage } from "../api";
import { useAddresses, useRecentWebhooks, useSettings } from "../hooks/data";
import { AddressFields, draftFromSaved, emptyDraft, type AddressDraft } from "../components/AddressFields";
import { Alert, Button, Card, Modal, PageHeader, PanelLink, Segmented, Select, Spinner, TextInput } from "../components/ui";
import { useToast } from "../components/Toast";
import { fmtDateTime } from "../lib/format";
import type { AppSettings, SavedAddress } from "../types";

function AddressEditor({ initial, onClose }: { initial: SavedAddress | null; onClose: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [draft, setDraft] = useState<AddressDraft>(initial ? draftFromSaved(initial) : emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const pin = Number(draft.pincode);
    if (!label.trim() || !draft.address1.trim() || !draft.city.trim() || !/^[1-9][0-9]{5}$/.test(draft.pincode.trim())) {
      return setError("Label, address, city and a valid 6-digit pincode are required.");
    }
    if (draft.contact && !/^\+?[0-9]{10,13}$/.test(draft.contact.replace(/[\s()-]/g, ""))) return setError("Phone must be 10-14 digits.");
    const data: Record<string, unknown> = { label: label.trim(), address1: draft.address1.trim(), city: draft.city.trim(), pincode: pin, updatedAt: serverTimestamp() };
    for (const k of ["name", "contact", "alternateContact", "address2", "state", "email", "uniqueCode"] as const) {
      const v = draft[k].trim();
      data[k] = v ? (k === "contact" || k === "alternateContact" ? v.replace(/[\s()-]/g, "") : v) : null;
    }
    setBusy(true);
    try {
      if (initial) await setDoc(doc(db, "addresses", initial.id), data);
      else await addDoc(collection(db, "addresses"), data);
      toast("good", "Address saved");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit address" : "New address"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput label="Label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} placeholder="e.g. Main warehouse" />
        <AddressFields value={draft} onChange={setDraft} requireContact={false} showEmail showCode />
        {error && <Alert tone="critical">{error}</Alert>}
      </div>
    </Modal>
  );
}

function WebhookCard() {
  const toast = useToast();
  const recent = useRecentWebhooks(5);
  const [header, setHeader] = useState<{ headerName: string; headerValue: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `${window.location.origin}/api/shadowfax-webhook`;
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast("good", "Copied"));
  return (
    <Card title="Live status updates (webhook)">
      <p className="mb-3 text-sm text-ink-3">
        In the SFX 360 panel open <b>Webhook</b>, add this URL for forward and return orders, and add the header below. Statuses then arrive here instantly. A
        backup sync also runs every 2 hours.
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2">
          <code className="min-w-0 flex-1 truncate">{url}</code>
          <button type="button" aria-label="Copy URL" onClick={() => copy(url)} className="text-ink-3">
            <Copy className="size-4" />
          </button>
        </div>
        {header ? (
          <div className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2">
            <code className="min-w-0 flex-1 truncate">
              {header.headerName}: {header.headerValue}
            </code>
            <button type="button" aria-label="Copy header value" onClick={() => copy(header.headerValue)} className="text-ink-3">
              <Copy className="size-4" />
            </button>
          </div>
        ) : (
          <Button
            icon={<Eye className="size-4" />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setHeader(await api.getWebhookInfo({}));
              } catch (err) {
                toast("critical", errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Show header to paste
          </Button>
        )}
      </div>
      <p className="mt-4 mb-1 text-xs font-medium text-ink-3 uppercase">Last webhook calls</p>
      {recent.length ? (
        <ul className="divide-y divide-line text-sm">
          {recent.map((w) => (
            <li key={w.id} className="flex justify-between gap-2 py-1.5">
              <span>
                {w.awb ?? "unknown AWB"} · {w.statusId ?? "—"} {!w.matched && <span className="text-warn">(not matched)</span>}
              </span>
              <span className="text-xs text-ink-3">{fmtDateTime(w.receivedAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">None received yet.</p>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const info = useAppInfo();
  const toast = useToast();
  const { settings, loading } = useSettings();
  const addresses = useAddresses();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [slotsText, setSlotsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null | "new">(null);
  const [recounting, setRecounting] = useState(false);

  useEffect(() => {
    if (!loading) {
      setDraft(settings);
      setSlotsText(settings.pickupSlots.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const save = async () => {
    setSaving(true);
    try {
      const slots = slotsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      await setDoc(doc(db, "settings", "app"), {
        supplyChain: draft.supplyChain,
        defaultOrderType: draft.defaultOrderType,
        defaultReturnType: draft.defaultReturnType,
        defaultPickupId: draft.defaultPickupId || null,
        defaultReturnId: draft.defaultReturnId || null,
        pickupSlots: slots,
        sellerGstin: draft.sellerGstin?.trim() || null,
        updatedAt: serverTimestamp(),
      });
      toast("good", "Settings saved");
    } catch (err) {
      toast("critical", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={`Signed in as ${info.email}`} />

      <Card title="Shadowfax connection">
        <p className="text-sm">
          Environment:{" "}
          <b className={info.env === "production" ? "text-good" : "text-warn"}>{info.env === "production" ? "Production (live orders)" : "Staging (test orders)"}</b>
        </p>
        <p className="mt-1 text-sm text-ink-3">
          The API key lives only in Firebase Secret Manager. To change the key or switch to production, follow the README (“Shadowfax key badalna”).
        </p>
      </Card>

      <Card title="Pickup & return addresses" actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add address</Button>}>
        {addresses.error && <Alert tone="critical">{addresses.error}</Alert>}
        {addresses.items.length ? (
          <ul className="divide-y divide-line text-sm">
            {addresses.items.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{a.label}</p>
                  <p className="text-xs text-ink-3">
                    {[a.name, a.contact].filter(Boolean).join(" · ")} — {a.address1}, {a.city} {a.pincode}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" aria-label={`Edit ${a.label}`} onClick={() => setEditing(a)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete ${a.label}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete “${a.label}”?`)) return;
                      try {
                        await deleteDoc(doc(db, "addresses", a.id));
                      } catch (err) {
                        toast("critical", errorMessage(err));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">No saved addresses. Add your warehouse / pickup point so booking is one tap.</p>
        )}
      </Card>

      <Card title="Booking defaults">
        {loading ? <Spinner /> : <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-ink-2">Default order type</p>
            <Segmented label="Default order type" value={draft.defaultOrderType} onChange={(v) => setDraft({ ...draft, defaultOrderType: v })} options={[{ value: "marketplace", label: "Seller pickup" }, { value: "warehouse", label: "Warehouse" }]} />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-ink-2">Failed deliveries return to</p>
            <Segmented label="Default return type" value={draft.defaultReturnType} onChange={(v) => setDraft({ ...draft, defaultReturnType: v })} options={[{ value: "seller", label: "Seller (RTS)" }, { value: "origin", label: "Warehouse (RTO)" }]} />
          </div>
          <Select label="Default pickup address" value={draft.defaultPickupId ?? ""} onChange={(e) => setDraft({ ...draft, defaultPickupId: e.target.value || null })}>
            <option value="">None</option>
            {addresses.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <Select label="Default return address" value={draft.defaultReturnId ?? ""} onChange={(e) => setDraft({ ...draft, defaultReturnId: e.target.value || null })}>
            <option value="">Same as pickup</option>
            {addresses.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <Select
            label="Shadowfax supply chain"
            value={draft.supplyChain}
            onChange={(e) => setDraft({ ...draft, supplyChain: e.target.value as AppSettings["supplyChain"] })}
            hint="Regular = small parcels, Surface = large. Ask Shadowfax if unsure — it decides how pincodes are checked."
          >
            <option value="regular">Regular</option>
            <option value="surface">Surface</option>
          </Select>
          <TextInput label="Pickup slot keys" value={slotsText} onChange={(e) => setSlotsText(e.target.value)} placeholder="slot_1, slot_2" hint="Comma separated, as configured on your Shadowfax account" />
          <TextInput label="Seller GSTIN" value={draft.sellerGstin ?? ""} onChange={(e) => setDraft({ ...draft, sellerGstin: e.target.value })} maxLength={50} hint="Needed for orders of ₹50,000 or more" />
        </div>
        <div className="mt-4">
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save defaults
          </Button>
        </div>
        </>}
      </Card>

      <WebhookCard />

      <Card title="Done in the Shadowfax panel">
        <p className="mb-3 text-sm text-ink-3">The Shadowfax API does not offer these, so they open the official panel.</p>
        <div className="flex flex-wrap gap-2">
          <PanelLink url={info.panelUrl}>Wallet & recharge</PanelLink>
          <PanelLink url={info.panelUrl}>Invoices & billing</PanelLink>
          <PanelLink url={info.panelUrl}>COD remittance</PanelLink>
          <PanelLink url={info.panelUrl}>Weight disputes</PanelLink>
          <PanelLink url={info.panelUrl}>API keys & webhooks</PanelLink>
        </div>
      </Card>

      <Card title="Maintenance">
        <p className="mb-3 text-sm text-ink-3">If dashboard numbers ever look wrong, rebuild them from the shipments.</p>
        <Button
          loading={recounting}
          onClick={async () => {
            setRecounting(true);
            try {
              const r = await api.recountStats({});
              toast("good", `Recounted ${r.shipments} shipments`);
            } catch (err) {
              toast("critical", errorMessage(err));
            } finally {
              setRecounting(false);
            }
          }}
        >
          Recount dashboard
        </Button>
      </Card>

      {editing && <AddressEditor initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

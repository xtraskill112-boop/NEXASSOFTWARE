import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Ban, Copy, ExternalLink, FileText, Pencil, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { api, errorMessage } from "../api";
import { useAppInfo } from "../auth";
import { useShipment } from "../hooks/data";
import { canCancel, canEditDelivery, canPrintLabel } from "../lib/status";
import { fmtDateTime, money, relative } from "../lib/format";
import { Alert, Button, Card, Empty, KeyValue, Modal, PanelLink, Spinner, StatusBadge, TextArea, TextInput } from "../components/ui";
import { useToast } from "../components/Toast";
import type { PartyAddress, Shipment } from "../types";

function AddressBlock({ a }: { a: PartyAddress | null }) {
  if (!a || (!a.address1 && !a.city)) return <p className="text-sm text-ink-3">Not available (Shadowfax hides addresses in tracking data).</p>;
  return (
    <address className="text-sm not-italic text-ink-2">
      {a.name && <p className="font-medium text-ink">{a.name}</p>}
      {a.contact && (
        <p>
          <a href={`tel:${a.contact}`} className="text-brand">
            {a.contact}
          </a>
          {a.alternateContact ? ` · ${a.alternateContact}` : ""}
        </p>
      )}
      <p>{[a.address1, a.address2].filter(Boolean).join(", ")}</p>
      <p>{[a.city, a.state, a.pincode].filter(Boolean).join(", ")}</p>
    </address>
  );
}

function Timeline({ s }: { s: Shipment }) {
  const events = [...(s.events ?? [])].reverse();
  if (!events.length) return <p className="text-sm text-ink-3">No tracking events yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e, i) => (
        <li key={`${e.statusId}-${e.at}-${i}`} className="relative">
          <span className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface ${i === 0 ? "bg-brand" : "bg-line"}`} aria-hidden />
          <p className="text-sm font-medium text-ink">{e.status}</p>
          <p className="text-xs text-ink-3">
            {fmtDateTime(e.at)}
            {e.location ? ` · ${e.location}` : ""}
            {e.source === "app" ? " · from this app" : ""}
          </p>
          {e.remarks && <p className="mt-0.5 text-xs text-ink-2">{e.remarks}</p>}
        </li>
      ))}
    </ol>
  );
}

function EditModal({ s, open, onClose }: { s: Shipment; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const reverse = s.kind === "reverse";
  const [contact, setContact] = useState("");
  const [alt, setAlt] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [cod, setCod] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const target = { contact: contact || undefined, alternateContact: alt || undefined, address: address || undefined, pincode: pincode || undefined };
    try {
      const r = await api.updateShipment({
        awb: s.awb,
        ...(reverse ? { pickup: target } : { delivery: target }),
        order: !reverse && (cod || weight) ? { codAmount: cod || undefined, actualWeightKg: weight || undefined } : undefined,
      });
      if (r.ok) {
        toast("good", `Update sent to Shadowfax: ${r.message}`);
        onClose();
      } else setError(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={reverse ? "Edit pickup details" : "Edit delivery details"}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()} disabled={!contact && !alt && !address && !pincode && !cod && !weight}>
            Send update
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-3">Fill only what should change. Shadowfax applies it shortly after accepting.</p>
        <TextInput label="New phone" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={s.customer.contact ?? ""} />
        <TextInput label="New alternate phone" inputMode="tel" value={alt} onChange={(e) => setAlt(e.target.value)} />
        <TextArea label="New full address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={s.customer.address1 ?? ""} />
        <TextInput label="New pincode" inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value)} hint="Only same-city changes, at most twice per order" />
        {!reverse && s.paymentMode === "cod" && (
          <TextInput label="New COD amount ₹" inputMode="decimal" value={cod} onChange={(e) => setCod(e.target.value)} hint="0 converts the order to prepaid (only after pickup)" />
        )}
        {!reverse && s.status === "new" && <TextInput label="Weight (kg)" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} hint="Can be changed once, only while New" />}
        {error && <Alert tone="critical">{error}</Alert>}
      </div>
    </Modal>
  );
}

function CancelModal({ s, open, onClose }: { s: Shipment; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { env } = useAppInfo();
  const [remarks, setRemarks] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = env === "production";
  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.cancelShipment({ awb: s.awb, remarks: remarks.trim() });
      if (r.ok) {
        toast("good", r.queued ? "Cancellation queued — it happens at the next Shadowfax facility." : "Shipment cancelled.");
        onClose();
      } else setError(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cancel ${s.awb}?`}
      footer={
        <>
          <Button onClick={onClose}>Keep shipment</Button>
          <Button variant="danger" loading={busy} disabled={!remarks.trim() || confirmText.trim().toUpperCase() !== "CANCEL"} onClick={() => void cancel()}>
            Yes, cancel
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {live ? (
          <Alert tone="critical" title="This is a real (production) order">
            Cancelling cannot be undone. If it is already moving, Shadowfax queues the cancel and sends it back.
          </Alert>
        ) : (
          <Alert tone="warn">Test mode (staging): safe to try.</Alert>
        )}
        <TextInput label="Reason" value={remarks} onChange={(e) => setRemarks(e.target.value)} required maxLength={200} placeholder="e.g. Customer requested cancellation" />
        <TextInput label='Type "CANCEL" to confirm' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        {error && <Alert tone="critical">{error}</Alert>}
      </div>
    </Modal>
  );
}

function NdrModal({ s, open, onClose }: { s: Shipment; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [action, setAction] = useState<"reopen_ndr" | "rts" | "rto">("reopen_ndr");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.ndrAction({
        awb: s.awb,
        action,
        delivery: action === "reopen_ndr" && (contact || address) ? { contact: contact || undefined, address: address || undefined } : undefined,
      });
      if (r.ok) {
        toast("good", `Sent: ${r.message}`);
        onClose();
      } else setError(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const back = s.orderType === "warehouse" ? "rto" : "rts";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delivery failed — what next?"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" loading={busy} onClick={() => void go()}>
            Send to Shadowfax
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="flex items-start gap-2">
          <input type="radio" name="ndr" checked={action === "reopen_ndr"} onChange={() => setAction("reopen_ndr")} className="mt-1 accent-brand" />
          <span>
            <b>Try delivery again</b> — optionally with a corrected phone or address.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="ndr" checked={action === back} onChange={() => setAction(back)} className="mt-1 accent-brand" />
          <span>
            <b>Send it back to me</b> ({back.toUpperCase()}).
          </span>
        </label>
        {action === "reopen_ndr" && (
          <>
            <TextInput label="Corrected phone (optional)" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} />
            <TextArea label="Corrected address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
          </>
        )}
        <p className="text-xs text-ink-3">Shadowfax only accepts this while the shipment is On Hold / Cancelled after a failed attempt.</p>
        {error && <Alert tone="critical">{error}</Alert>}
      </div>
    </Modal>
  );
}

export function OrderDetailPage() {
  const { awb = "" } = useParams();
  const info = useAppInfo();
  const toast = useToast();
  const { shipment: s, loading, error } = useShipment(awb);
  const [refreshing, setRefreshing] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [podBusy, setPodBusy] = useState(false);
  const [modal, setModal] = useState<null | "edit" | "cancel" | "ndr">(null);

  if (loading) return <Spinner />;
  if (error) return <Alert tone="critical">{error}</Alert>;
  if (!s)
    return (
      <Empty title="Shipment not found">
        <Link to="/orders" className="text-brand">
          Back to orders
        </Link>
      </Empty>
    );

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await api.refreshShipment({ awb: s.awb });
      toast(r.ok ? "good" : "critical", r.ok ? `Updated: ${r.status}` : (r.message ?? "Could not refresh"));
    } catch (err) {
      toast("critical", errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const label = async () => {
    setLabelBusy(true);
    // Open the tab synchronously so pop-up blockers allow it, then point it at the PDF.
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    try {
      const r = await api.getLabel({ awb: s.awb, fileType: "pdf" });
      if (r.ok && /^https:\/\//.test(r.url)) {
        if (win) win.location.href = r.url;
        else window.location.href = r.url;
      } else {
        win?.close();
        toast("critical", r.ok ? "Invalid label link" : r.message);
      }
    } catch (err) {
      win?.close();
      toast("critical", errorMessage(err));
    } finally {
      setLabelBusy(false);
    }
  };

  const pod = async () => {
    setPodBusy(true);
    try {
      const r = await api.getPod({ awb: s.awb });
      toast(r.ok ? "good" : "critical", r.ok ? (r.pod ? "Proof of delivery loaded" : "Shadowfax has no POD for this yet") : r.message);
    } catch (err) {
      toast("critical", errorMessage(err));
    } finally {
      setPodBusy(false);
    }
  };

  const reverse = s.kind === "reverse";
  const podReady = ["delivered", "rts_d", "rto_d"].includes(s.status);
  const sameEnv = s.env === info.env;

  return (
    <div className="space-y-4">
      <Link to={reverse ? "/returns" : "/orders"} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {reverse ? "Returns" : "Orders"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold">{s.awb}</h1>
            <button type="button" aria-label="Copy AWB" className="rounded p-1 text-ink-3 hover:bg-subtle" onClick={() => void navigator.clipboard?.writeText(s.awb).then(() => toast("good", "AWB copied"))}>
              <Copy className="size-4" />
            </button>
            <StatusBadge group={s.statusGroup} kind={s.kind} />
          </div>
          <p className="mt-1 text-sm text-ink-3">
            {s.statusDisplay} · {reverse ? "Return pickup" : s.orderType === "warehouse" ? "Warehouse order" : "Seller pickup order"} · Order {s.clientOrderId ?? "—"} · updated{" "}
            {relative(s.lastEventAt ?? s.updatedAt)}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button icon={<RefreshCw className="size-4" />} loading={refreshing} onClick={() => void refresh()} disabled={!sameEnv}>
            Refresh
          </Button>
          {canPrintLabel(s.kind, s.statusGroup) && (
            <Button icon={<Printer className="size-4" />} loading={labelBusy} onClick={() => void label()} disabled={!sameEnv}>
              Label (PDF)
            </Button>
          )}
          {s.isActive && canEditDelivery(s.statusGroup) && (
            <Button icon={<Pencil className="size-4" />} onClick={() => setModal("edit")} disabled={!sameEnv}>
              Edit
            </Button>
          )}
          {!reverse && s.statusGroup === "ndr" && (
            <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => setModal("ndr")} disabled={!sameEnv}>
              Fix failed delivery
            </Button>
          )}
          {canCancel(s.kind, s.status, s.statusGroup, s.isActive) && (
            <Button variant="ghost" className="text-critical" icon={<Ban className="size-4" />} onClick={() => setModal("cancel")} disabled={!sameEnv}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {!sameEnv && <Alert tone="warn">This shipment was booked on {s.env}; the app is now connected to {info.env}, so actions are disabled.</Alert>}
      {s.cancelRequested && s.statusGroup !== "cancelled" && (
        <Alert tone="warn" title="Cancellation requested">
          {s.cancelRequested.message} ({fmtDateTime(s.cancelRequested.at)})
        </Alert>
      )}
      {s.syncError && <Alert tone="warn">Last refresh: {s.syncError}</Alert>}
      {s.label && s.label.expiresAt.toDate() > new Date() && (
        <Alert tone="info">
          Label ready until {fmtDateTime(s.label.expiresAt)} —{" "}
          <a href={s.label.url} target="_blank" rel="noopener noreferrer">
            open PDF
          </a>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Tracking">
            <Timeline s={s} />
          </Card>
          {s.history?.length > 0 && (
            <Card title="Activity from this app">
              <ul className="space-y-2 text-sm">
                {[...s.history].reverse().map((h, i) => (
                  <li key={i}>
                    <p className="text-ink">{h.detail}</p>
                    <p className="text-xs text-ink-3">
                      {fmtDateTime(h.at)} · {h.by}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title={reverse ? "Pick up from (customer)" : "Deliver to"}>
            <AddressBlock a={s.customer} />
            {s.trackUrl && (
              <a href={s.trackUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-brand">
                Customer tracking page <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            {s.riderName && (
              <p className="mt-3 text-sm text-ink-2">
                Rider: {s.riderName} {s.riderContact ? `· ${s.riderContact}` : ""}
              </p>
            )}
          </Card>
          <Card title="Order">
            <KeyValue
              items={[
                ["Payment", reverse ? "—" : s.paymentMode === "cod" ? "COD" : s.paymentMode === "prepaid" ? "Prepaid" : "—"],
                ["COD amount", reverse ? "—" : money(s.codAmount)],
                ["Product value", money(s.productValue)],
                ["Weight", s.weightKg ? `${s.weightKg} kg` : "—"],
                ["Booked", fmtDateTime(s.createdAt)],
                ["Pickup date", s.pickupDate ? `${s.pickupDate}${s.pickupSlot ? ` · ${s.pickupSlot}` : ""}` : "—"],
                ["Return to", s.returnType === "seller" ? "Seller (RTS)" : s.returnType === "origin" ? "Warehouse (RTO)" : "—"],
                ["Sort code", s.sortCode ?? "—"],
              ]}
            />
          </Card>
          {s.products?.length > 0 && (
            <Card title="Products">
              <ul className="space-y-1 text-sm">
                {s.products.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-ink-2">
                      {p.name} {p.quantity ? `× ${p.quantity}` : ""} <span className="text-xs text-ink-3">{p.skuId}</span>
                    </span>
                    <span className="tabular">{money(p.price)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!reverse && s.pickup && (
            <Card title="Pickup from">
              <AddressBlock a={s.pickup} />
            </Card>
          )}
          <Card title={reverse ? "Return to" : "Return address"}>
            <AddressBlock a={s.returnAddress} />
          </Card>
          {(podReady || s.pod) && (
            <Card title="Proof of delivery" actions={<Button icon={<FileText className="size-4" />} loading={podBusy} onClick={() => void pod()}>Fetch</Button>}>
              {s.pod ? (
                <KeyValue
                  items={Object.entries(s.pod)
                    .filter(([, v]) => typeof v === "string" || typeof v === "number")
                    .map(([k, v]) => [k.replace(/_/g, " "), String(v)] as [string, string])}
                />
              ) : (
                <p className="text-sm text-ink-3">Tap Fetch to load recipient details.</p>
              )}
            </Card>
          )}
          <Card title="Need something else?">
            <p className="mb-3 text-sm text-ink-3">Weight disputes, billing and support tickets are not in the Shadowfax API.</p>
            <PanelLink url={info.panelUrl} />
          </Card>
        </div>
      </div>

      {modal === "edit" && <EditModal s={s} open onClose={() => setModal(null)} />}
      {modal === "cancel" && <CancelModal s={s} open onClose={() => setModal(null)} />}
      {modal === "ndr" && <NdrModal s={s} open onClose={() => setModal(null)} />}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, Trash2 } from "lucide-react";
import { api, errorIssues, errorMessage, type ServiceabilityResult } from "../api";
import { useAddresses, useSettings } from "../hooks/data";
import { AddressFields, SavedAddressPicker, draftFromSaved, draftToPayload, emptyDraft, type AddressDraft } from "../components/AddressFields";
import { ServiceabilityView } from "../components/Serviceability";
import { Alert, Button, Card, PageHeader, Segmented, Spinner, TextInput } from "../components/ui";
import { useToast } from "../components/Toast";
import { todayIST } from "../lib/format";

interface ItemDraft {
  name: string;
  skuId: string;
  price: string;
  quantity: string;
  returnReason: string;
  qcRequired: boolean;
}

const blankItem = (): ItemDraft => ({ name: "", skuId: "", price: "", quantity: "1", returnReason: "", qcRequired: false });

export function NewReturnPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { settings, loading: settingsLoading } = useSettings();
  const addresses = useAddresses();
  const [clientOrderId, setClientOrderId] = useState(() => `RET-${todayIST().slice(2).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  const [customer, setCustomer] = useState<AddressDraft>(emptyDraft);
  const [returnType, setReturnType] = useState<"seller" | "origin">("origin");
  const [returnId, setReturnId] = useState("");
  const [returnAddr, setReturnAddr] = useState<AddressDraft>(emptyDraft);
  const [items, setItems] = useState<ItemDraft[]>([blankItem()]);
  const [ewayBill, setEwayBill] = useState("");
  const [check, setCheck] = useState<ServiceabilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsLoading || addresses.loading) return;
    const r = addresses.items.find((a) => a.id === (settings.defaultReturnId ?? settings.defaultPickupId));
    if (r) {
      setReturnId(r.id);
      setReturnAddr(draftFromSaved(r));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading, addresses.loading]);

  useEffect(() => setCheck(null), [customer.pincode, returnAddr.pincode, returnType]);

  const value = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck(await api.checkServiceability({ kind: "reverse", returnType, customerPincode: customer.pincode, returnPincode: returnAddr.pincode || undefined }));
    } catch (err) {
      setErrors([errorMessage(err)]);
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    setFieldErrors({});
    try {
      const r = await api.createReturn({
        clientOrderId: clientOrderId.trim(),
        customer: { ...draftToPayload(customer), name: customer.name.trim(), contact: customer.contact.trim() },
        returnType,
        returnAddress: draftToPayload(returnAddr),
        price: value,
        ewayBill: ewayBill || undefined,
        items: items.map((i) => ({
          name: i.name.trim(),
          skuId: i.skuId.trim() || undefined,
          price: i.price,
          quantity: i.quantity || undefined,
          returnReason: i.returnReason.trim() || undefined,
          qcRequired: i.qcRequired,
        })),
      });
      if (r.ok) {
        toast("good", `Return pickup booked: ${r.awb}`);
        navigate(`/orders/${encodeURIComponent(r.awb)}`);
      } else setErrors(r.errors);
    } catch (err) {
      setErrors([errorMessage(err)]);
      const map: Record<string, string> = {};
      for (const i of errorIssues(err)) map[i.path] = i.message;
      setFieldErrors(map);
    } finally {
      setBusy(false);
    }
  };

  if (settingsLoading || addresses.loading) return <Spinner />;

  return (
    <form onSubmit={submit} className="space-y-4">
      <PageHeader title="New return pickup" subtitle="Shadowfax picks the item up from your customer and brings it back to you." />
      <Card title="Return">
        <div className="max-w-sm">
          <TextInput label="Return ID" value={clientOrderId} onChange={(e) => setClientOrderId(e.target.value)} required maxLength={200} hint="Unique. Re-sending the same ID within 30 min returns the same pickup." />
        </div>
      </Card>
      <Card title="Pick up from (customer)">
        <AddressFields value={customer} onChange={setCustomer} errors={fieldErrors} prefix="customer" />
      </Card>
      <Card title="Bring it back to">
        <div className="mb-3">
          <Segmented
            label="Return to"
            value={returnType}
            onChange={setReturnType}
            options={[
              { value: "origin", label: "My warehouse (RTO)" },
              { value: "seller", label: "Seller (RTS)" },
            ]}
          />
        </div>
        <div className="mb-3 max-w-md">
          <SavedAddressPicker
            label="Saved address"
            addresses={addresses.items}
            value={returnId}
            onPick={(id, a) => {
              setReturnId(id);
              setReturnAddr(a ? draftFromSaved(a) : emptyDraft());
            }}
          />
        </div>
        <AddressFields value={returnAddr} onChange={setReturnAddr} requireContact={returnType === "seller"} showEmail showCode errors={fieldErrors} prefix="returnAddress" />
      </Card>
      <Card title="Items" actions={<Button type="button" icon={<Plus className="size-4" />} onClick={() => setItems((x) => [...x, blankItem()])}>Add item</Button>}>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-3 sm:grid-cols-4">
              <div className="col-span-2">
                <TextInput label="Item name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} required maxLength={250} />
              </div>
              <TextInput label="Price ₹" inputMode="decimal" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} required />
              <TextInput label="Qty" inputMode="numeric" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              <TextInput label="SKU (optional)" value={it.skuId} onChange={(e) => setItem(i, { skuId: e.target.value })} maxLength={100} />
              <div className="col-span-2 sm:col-span-2">
                <TextInput label="Return reason" value={it.returnReason} onChange={(e) => setItem(i, { returnReason: e.target.value })} maxLength={200} />
              </div>
              <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={it.qcRequired} onChange={(e) => setItem(i, { qcRequired: e.target.checked })} className="size-4 accent-brand" />
                  Doorstep QC
                </label>
                <Button type="button" variant="ghost" aria-label="Remove item" disabled={items.length === 1} onClick={() => setItems((x) => x.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {value >= 50000 && (
          <div className="mt-3 max-w-xs">
            <TextInput label="E-way bill (12 digits)" value={ewayBill} onChange={(e) => setEwayBill(e.target.value)} required maxLength={12} inputMode="numeric" />
          </div>
        )}
      </Card>
      <Card title="Pincode check">
        <Button type="button" icon={<Search className="size-4" />} loading={checking} disabled={!customer.pincode} onClick={() => void runCheck()}>
          Check serviceability
        </Button>
        {check && (
          <div className="mt-3">
            <ServiceabilityView result={check} />
          </div>
        )}
      </Card>
      {errors.length > 0 && (
        <Alert tone="critical" title="Shadowfax did not book this return">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl bg-surface/95 p-3 ring-1 ring-line backdrop-blur lg:bottom-4">
        {!check?.serviceable && <p className="mr-auto self-center text-xs text-ink-3">Run the pincode check first.</p>}
        <Button type="submit" variant="primary" loading={busy} disabled={!check?.serviceable}>
          Book return pickup
        </Button>
      </div>
    </form>
  );
}

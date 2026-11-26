import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Search, Trash2 } from "lucide-react";
import { api, errorIssues, errorMessage, type RateQuote, type ServiceabilityResult } from "../api";
import { useAddresses, useSettings } from "../hooks/data";
import { AddressFields, SavedAddressPicker, draftFromSaved, draftToPayload, emptyDraft, type AddressDraft } from "../components/AddressFields";
import { ServiceabilityView } from "../components/Serviceability";
import { Alert, Button, Card, PageHeader, Segmented, Select, Spinner, TextInput } from "../components/ui";
import { useToast } from "../components/Toast";
import { moneyExact, todayIST } from "../lib/format";

interface ProductDraft {
  name: string;
  skuId: string;
  price: string;
  quantity: string;
}

const newOrderId = () => {
  const d = todayIST().slice(2).replace(/-/g, "");
  return `ORD-${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

export function NewShipmentPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { settings, loading: settingsLoading } = useSettings();
  const addresses = useAddresses();

  const [orderType, setOrderType] = useState<"marketplace" | "warehouse">("marketplace");
  const [clientOrderId, setClientOrderId] = useState(newOrderId);
  const [customer, setCustomer] = useState<AddressDraft>(emptyDraft);
  const [locationType, setLocationType] = useState<"" | "residential" | "commercial">("");
  const [pickupId, setPickupId] = useState("");
  const [pickup, setPickup] = useState<AddressDraft>(emptyDraft);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupSlot, setPickupSlot] = useState("");
  const [returnType, setReturnType] = useState<"seller" | "origin">("seller");
  const [returnSame, setReturnSame] = useState(true);
  const [returnId, setReturnId] = useState("");
  const [returnAddr, setReturnAddr] = useState<AddressDraft>(emptyDraft);
  const [paymentMode, setPaymentMode] = useState<"prepaid" | "cod">("prepaid");
  const [codAmount, setCodAmount] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [ewayBill, setEwayBill] = useState("");
  const [sellerGstin, setSellerGstin] = useState("");
  const [products, setProducts] = useState<ProductDraft[]>([{ name: "", skuId: "", price: "", quantity: "1" }]);

  const [check, setCheck] = useState<ServiceabilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [rate, setRate] = useState<RateQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicateAwb, setDuplicateAwb] = useState<string | null>(null);

  // Apply saved defaults once they load.
  useEffect(() => {
    if (settingsLoading || addresses.loading) return;
    setOrderType(settings.defaultOrderType);
    setReturnType(settings.defaultReturnType);
    setSellerGstin(settings.sellerGstin ?? "");
    const p = addresses.items.find((a) => a.id === settings.defaultPickupId);
    if (p) {
      setPickupId(p.id);
      setPickup(draftFromSaved(p));
    }
    const r = addresses.items.find((a) => a.id === settings.defaultReturnId);
    if (r && r.id !== p?.id) {
      setReturnSame(false);
      setReturnId(r.id);
      setReturnAddr(draftFromSaved(r));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading, addresses.loading]);

  const productValue = useMemo(
    () => Math.round(products.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 1), 0) * 100) / 100,
    [products],
  );
  const returnDraft = returnSame ? pickup : returnAddr;
  const effectiveReturnType = orderType === "warehouse" ? "origin" : returnType;
  const pincodeKey = `${orderType}|${effectiveReturnType}|${pickup.pincode}|${customer.pincode}|${returnDraft.pincode}`;
  useEffect(() => {
    setCheck(null);
    setRate(null);
  }, [pincodeKey]);

  const runCheck = async () => {
    setChecking(true);
    setErrors([]);
    try {
      const r = await api.checkServiceability({
        kind: "forward",
        orderType,
        returnType: effectiveReturnType,
        pickupPincode: pickup.pincode || undefined,
        customerPincode: customer.pincode,
        returnPincode: returnDraft.pincode || undefined,
      });
      setCheck(r);
    } catch (err) {
      setErrors([errorMessage(err)]);
    } finally {
      setChecking(false);
    }
  };

  const runRate = async () => {
    try {
      setRate(await api.getRate({ originPincode: pickup.pincode, destinationPincode: customer.pincode, service: "forward", weightKg: weightKg || undefined }));
    } catch (err) {
      toast("critical", errorMessage(err));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setFieldErrors({});
    setDuplicateAwb(null);
    try {
      const r = await api.createShipment({
        orderType,
        clientOrderId: clientOrderId.trim(),
        paymentMode,
        codAmount: paymentMode === "cod" ? codAmount || productValue : 0,
        productValue,
        actualWeightKg: weightKg || undefined,
        ewayBill: ewayBill || undefined,
        sellerGstin: sellerGstin || undefined,
        customer: { ...draftToPayload(customer), name: customer.name.trim(), contact: customer.contact.trim(), locationType: locationType || undefined },
        pickup: { ...draftToPayload(pickup), pickupDate: orderType === "marketplace" ? pickupDate || undefined : undefined, pickupSlot: orderType === "marketplace" ? pickupSlot || undefined : undefined },
        returnType: effectiveReturnType,
        returnAddress: draftToPayload(returnDraft),
        products: products.map((p) => ({ name: p.name.trim(), skuId: p.skuId.trim(), price: p.price, quantity: p.quantity || undefined })),
      });
      if (r.ok) {
        toast("good", `Booked! AWB ${r.awb}`);
        navigate(`/orders/${encodeURIComponent(r.awb)}`);
        return;
      }
      setErrors(r.errors);
      if (r.duplicate) setDuplicateAwb(r.awb);
    } catch (err) {
      setErrors([errorMessage(err)]);
      const map: Record<string, string> = {};
      for (const i of errorIssues(err)) map[i.path] = i.message;
      setFieldErrors(map);
    } finally {
      setSubmitting(false);
    }
  };

  if (settingsLoading || addresses.loading) return <Spinner />;

  const setProduct = (i: number, patch: Partial<ProductDraft>) => setProducts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const bigOrder = productValue >= 50000;

  return (
    <form onSubmit={submit} className="space-y-4">
      <PageHeader title="New shipment" subtitle="Check the pincodes first, then book. The AWB is saved automatically." />

      <Card title="Order">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-ink-2">Order type</p>
            <Segmented
              label="Order type"
              value={orderType}
              onChange={setOrderType}
              options={[
                { value: "marketplace", label: "Seller pickup" },
                { value: "warehouse", label: "Warehouse" },
              ]}
            />
          </div>
          <TextInput label="Order ID" value={clientOrderId} onChange={(e) => setClientOrderId(e.target.value)} required maxLength={100} hint="Must be unique" error={fieldErrors.clientOrderId} />
        </div>
      </Card>

      <Card title="Deliver to (customer)">
        <AddressFields value={customer} onChange={setCustomer} errors={fieldErrors} prefix="customer" />
        <div className="mt-3 max-w-xs">
          <Select label="Address type" value={locationType} onChange={(e) => setLocationType(e.target.value as typeof locationType)}>
            <option value="">Not specified</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </Select>
        </div>
      </Card>

      <Card title={orderType === "warehouse" ? "Pickup from (warehouse)" : "Pickup from (seller)"}>
        <div className="mb-3 max-w-md">
          <SavedAddressPicker
            label="Saved address"
            addresses={addresses.items}
            value={pickupId}
            onPick={(id, a) => {
              setPickupId(id);
              setPickup(a ? draftFromSaved(a) : emptyDraft());
            }}
          />
        </div>
        <AddressFields value={pickup} onChange={setPickup} requireContact={orderType === "marketplace"} showCode errors={fieldErrors} prefix="pickup" />
        {orderType === "marketplace" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput label="Pickup date (optional)" type="date" min={todayIST()} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} hint="Past dates are treated as today" />
            {settings.pickupSlots.length ? (
              <Select label="Pickup slot (optional)" value={pickupSlot} onChange={(e) => setPickupSlot(e.target.value)}>
                <option value="">Any time</option>
                {settings.pickupSlots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            ) : (
              <TextInput label="Pickup slot key (optional)" value={pickupSlot} onChange={(e) => setPickupSlot(e.target.value)} hint="e.g. slot_1 — ask Shadowfax for your slots" maxLength={50} />
            )}
          </div>
        )}
      </Card>

      <Card title="If delivery fails, return to">
        {orderType === "marketplace" ? (
          <div className="mb-3">
            <Segmented
              label="Return type"
              value={returnType}
              onChange={setReturnType}
              options={[
                { value: "seller", label: "Seller (RTS)" },
                { value: "origin", label: "My warehouse (RTO)" },
              ]}
            />
          </div>
        ) : (
          <p className="mb-3 text-sm text-ink-3">Warehouse orders always return to origin (RTO).</p>
        )}
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={returnSame} onChange={(e) => setReturnSame(e.target.checked)} className="size-4 accent-brand" />
          Same as pickup address
        </label>
        {!returnSame && (
          <>
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
            <AddressFields value={returnAddr} onChange={setReturnAddr} requireContact={effectiveReturnType === "seller"} showEmail showCode errors={fieldErrors} prefix="returnAddress" />
          </>
        )}
      </Card>

      <Card
        title="Products"
        actions={
          <Button type="button" icon={<Plus className="size-4" />} onClick={() => setProducts((p) => [...p, { name: "", skuId: "", price: "", quantity: "1" }])}>
            Add product
          </Button>
        }
      >
        <div className="space-y-3">
          {products.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-3 sm:grid-cols-[2fr_1fr_1fr_0.7fr_auto] sm:items-end">
              <div className="col-span-2 sm:col-span-1">
                <TextInput label="Product name" value={p.name} onChange={(e) => setProduct(i, { name: e.target.value })} required maxLength={250} />
              </div>
              <TextInput label="SKU" value={p.skuId} onChange={(e) => setProduct(i, { skuId: e.target.value })} required maxLength={100} />
              <TextInput label="Unit price ₹" inputMode="decimal" value={p.price} onChange={(e) => setProduct(i, { price: e.target.value })} required />
              <TextInput label="Qty" inputMode="numeric" value={p.quantity} onChange={(e) => setProduct(i, { quantity: e.target.value })} />
              <Button type="button" variant="ghost" aria-label="Remove product" disabled={products.length === 1} onClick={() => setProducts((ps) => ps.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          Product value: <b className="tabular">{moneyExact(productValue)}</b>
        </p>
      </Card>

      <Card title="Payment & package">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-sm font-medium text-ink-2">Payment</p>
            <Segmented
              label="Payment"
              value={paymentMode}
              onChange={setPaymentMode}
              options={[
                { value: "prepaid", label: "Prepaid" },
                { value: "cod", label: "COD" },
              ]}
            />
          </div>
          {paymentMode === "cod" && (
            <TextInput label="Collect from customer ₹" inputMode="decimal" value={codAmount} placeholder={String(productValue)} onChange={(e) => setCodAmount(e.target.value)} error={fieldErrors.codAmount} />
          )}
          <TextInput label="Weight (kg)" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 0.5" hint="In kilograms" error={fieldErrors.actualWeightKg} />
        </div>
        {bigOrder && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput label="E-way bill (12 digits)" value={ewayBill} onChange={(e) => setEwayBill(e.target.value)} required inputMode="numeric" maxLength={12} error={fieldErrors.ewayBill} />
            <TextInput label="Seller GSTIN" value={sellerGstin} onChange={(e) => setSellerGstin(e.target.value)} required maxLength={50} error={fieldErrors.sellerGstin} />
          </div>
        )}
      </Card>

      <Card title="Pincode check">
        <div className="flex flex-wrap gap-2">
          <Button type="button" icon={<Search className="size-4" />} loading={checking} disabled={!customer.pincode || !pickup.pincode} onClick={() => void runCheck()}>
            Check serviceability
          </Button>
          <Button type="button" variant="ghost" disabled={!customer.pincode || !pickup.pincode} onClick={() => void runRate()}>
            Estimate charge
          </Button>
        </div>
        {check && (
          <div className="mt-3">
            <ServiceabilityView result={check} />
          </div>
        )}
        {rate && (
          <div className="mt-3">
            {rate.available ? (
              <Alert tone="info" title={`Estimated: ${moneyExact((rate.shippingRate ?? 0) + (rate.gst ?? 0))} incl. GST`}>
                Zone {rate.zone} · rate {moneyExact(rate.shippingRate)} + GST {moneyExact(rate.gst)} (quote only, for prepaid-wallet accounts)
              </Alert>
            ) : (
              <Alert tone="warn">{rate.message}</Alert>
            )}
          </div>
        )}
      </Card>

      {errors.length > 0 && (
        <Alert tone="critical" title="Shadowfax did not book this order">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {duplicateAwb && (
            <p className="mt-1">
              An order with this ID already exists: <Link to={`/orders/${encodeURIComponent(duplicateAwb)}`}>open {duplicateAwb}</Link>
            </p>
          )}
        </Alert>
      )}

      <div className="sticky bottom-16 z-10 flex justify-end gap-2 rounded-xl bg-surface/95 p-3 ring-1 ring-line backdrop-blur lg:bottom-4">
        {!check?.serviceable && <p className="mr-auto self-center text-xs text-ink-3">Run the pincode check first.</p>}
        <Button type="submit" variant="primary" loading={submitting} disabled={!check?.serviceable}>
          Book shipment
        </Button>
      </div>
    </form>
  );
}

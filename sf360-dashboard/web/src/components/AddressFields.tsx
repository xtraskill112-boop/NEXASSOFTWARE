import type { SavedAddress } from "../types";
import { Select, TextInput } from "./ui";

export interface AddressDraft {
  name: string;
  contact: string;
  alternateContact: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  email: string;
  uniqueCode: string;
}

export const emptyDraft = (): AddressDraft => ({
  name: "",
  contact: "",
  alternateContact: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  pincode: "",
  email: "",
  uniqueCode: "",
});

export function draftFromSaved(a: SavedAddress | undefined | null): AddressDraft {
  if (!a) return emptyDraft();
  return {
    name: a.name ?? "",
    contact: a.contact ?? "",
    alternateContact: a.alternateContact ?? "",
    address1: a.address1,
    address2: a.address2 ?? "",
    city: a.city,
    state: a.state ?? "",
    pincode: String(a.pincode),
    email: a.email ?? "",
    uniqueCode: a.uniqueCode ?? "",
  };
}

/** Strips empty strings so optional fields are simply left out. */
export function draftToPayload(d: AddressDraft) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) if (v.trim()) out[k] = v.trim();
  return out as unknown as {
    name?: string;
    contact?: string;
    alternateContact?: string;
    address1: string;
    address2?: string;
    city: string;
    state?: string;
    pincode: string;
    email?: string;
    uniqueCode?: string;
  };
}

const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export function AddressFields({
  value,
  onChange,
  errors = {},
  requireContact = true,
  showEmail = false,
  showCode = false,
  prefix,
}: {
  value: AddressDraft;
  onChange: (v: AddressDraft) => void;
  errors?: Record<string, string>;
  requireContact?: boolean;
  showEmail?: boolean;
  showCode?: boolean;
  /** Path prefix used to match server validation errors, e.g. "customer". */
  prefix?: string;
}) {
  const set = (k: keyof AddressDraft) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const err = (k: string) => errors[prefix ? `${prefix}.${k}` : k];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <TextInput label="Name" value={value.name} onChange={set("name")} required={requireContact} maxLength={100} autoComplete="name" error={err("name")} />
      <TextInput
        label="Phone"
        value={value.contact}
        onChange={set("contact")}
        required={requireContact}
        inputMode="tel"
        autoComplete="tel"
        placeholder="10-digit mobile"
        maxLength={14}
        error={err("contact")}
      />
      <div className="sm:col-span-2">
        <TextInput label="Address" value={value.address1} onChange={set("address1")} required maxLength={500} placeholder="House / flat, street, area" error={err("address1")} />
      </div>
      <TextInput label="Landmark / line 2" value={value.address2} onChange={set("address2")} maxLength={250} error={err("address2")} />
      <TextInput label="Alternate phone" value={value.alternateContact} onChange={set("alternateContact")} inputMode="tel" maxLength={14} error={err("alternateContact")} />
      <TextInput label="City" value={value.city} onChange={set("city")} required maxLength={50} error={err("city")} />
      <Select label="State" value={value.state} onChange={set("state")} error={err("state")}>
        <option value="">Select state</option>
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <TextInput
        label="Pincode"
        value={value.pincode}
        onChange={set("pincode")}
        required
        inputMode="numeric"
        pattern="[1-9][0-9]{5}"
        maxLength={6}
        autoComplete="postal-code"
        error={err("pincode")}
      />
      {showEmail && <TextInput label="E-mail" type="email" value={value.email} onChange={set("email")} maxLength={100} error={err("email")} />}
      {showCode && <TextInput label="Warehouse code (optional)" value={value.uniqueCode} onChange={set("uniqueCode")} maxLength={255} hint="Your own code for this location" />}
    </div>
  );
}

export function SavedAddressPicker({
  label,
  addresses,
  value,
  onPick,
}: {
  label: string;
  addresses: SavedAddress[];
  value: string;
  onPick: (id: string, address: SavedAddress | undefined) => void;
}) {
  if (!addresses.length) return null;
  return (
    <Select label={label} value={value} onChange={(e) => onPick(e.target.value, addresses.find((a) => a.id === e.target.value))}>
      <option value="">Type a new address</option>
      {addresses.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label} — {a.city} {a.pincode}
        </option>
      ))}
    </Select>
  );
}

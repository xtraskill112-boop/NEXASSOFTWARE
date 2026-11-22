"use client";
import { useState } from "react";
import { CheckCircle2, LocateFixed, MapPin, XCircle } from "lucide-react";
import { Button, Input, Sheet } from "@naamdev/ui";
import { useLocation } from "@/lib/location";
import { errorMessage } from "@/lib/api";

export function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { location, checkPincode, setLocation } = useLocation();
  const [pin, setPin] = useState(location?.pincode ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkPincode>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const check = async (code = pin) => {
    if (!/^[1-9]\d{5}$/.test(code)) return setError("Enter a valid 6-digit PIN code");
    setBusy(true);
    setError(null);
    try {
      const r = await checkPincode(code);
      setResult(r);
      if (r.serviceable) {
        setLocation(r);
        setTimeout(onClose, 700);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const locate = () => {
    if (!navigator.geolocation || !mapsKey) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${pos.coords.latitude},${pos.coords.longitude}&key=${mapsKey}`).then((x) => x.json());
          const code = r.results?.[0]?.address_components?.find((c: { types: string[] }) => c.types.includes("postal_code"))?.long_name;
          if (code) {
            setPin(code);
            await check(code);
          } else setError("Couldn't detect your PIN code. Please enter it.");
        } catch {
          setError("Couldn't detect your location. Please enter your PIN code.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setError("Location permission denied. Please enter your PIN code.");
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} side="bottom" title="Choose delivery location" className="sm:mx-auto sm:max-w-lg">
      <div className="space-y-5 p-5">
        {mapsKey && (
          <button type="button" onClick={locate} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-left font-semibold text-maroon-800 dark:border-maroon-300/40 dark:text-maroon-200">
            <LocateFixed className="h-5 w-5" /> Use my current location
          </button>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void check(); }} className="flex gap-2">
          <Input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter 6-digit PIN code" leading={<MapPin className="h-4 w-4" />} aria-label="PIN code" autoFocus />
          <Button type="submit" loading={busy} size="lg">Check</Button>
        </form>
        {error && <p className="text-sm font-medium text-maroon-600">{error}</p>}
        {result && (
          <div className={`flex items-start gap-3 rounded-2xl p-4 ${result.serviceable ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-maroon-50 text-maroon-800 dark:bg-maroon-500/10 dark:text-maroon-200"}`}>
            {result.serviceable ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
            <div className="text-sm">
              {result.serviceable ? (
                <><p className="font-semibold">We deliver to {result.area ?? result.pincode}!</p><p className="opacity-80">Typically arrives in about {result.etaMinutes} minutes.</p></>
              ) : (
                <><p className="font-semibold">We don&apos;t deliver to {result.pincode} yet</p><p className="opacity-80">We&apos;re expanding fast — please check back soon.</p></>
              )}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

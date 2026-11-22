import Link from "next/link";
import { Emblem, buttonStyles } from "@naamdev/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Emblem size={96} className="mx-auto" />
        <p className="mt-6 text-[13px] font-semibold text-maroon-700">Error 404</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-ink">This sweet box is empty</h1>
        <p className="mx-auto mt-3 max-w-sm text-muted">The page you&apos;re looking for has moved, or never existed. Let&apos;s get you back to something delicious.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className={buttonStyles({ size: "lg" })}>Back to home</Link>
          <Link href="/search" className={buttonStyles({ variant: "outline", size: "lg" })}>Search sweets</Link>
        </div>
      </div>
    </main>
  );
}

"use client";
import { Button, ErrorState } from "@naamdev/ui";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-lg place-items-center px-6">
      <ErrorState title="We dropped the laddu" description="Something went wrong while loading this page. Please try again." action={<Button onClick={reset}>Try again</Button>} />
    </main>
  );
}

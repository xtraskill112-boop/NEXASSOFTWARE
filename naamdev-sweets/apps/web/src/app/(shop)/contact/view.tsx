"use client";
import { Card } from "@naamdev/ui";
import { ContactForm } from "@/components/common/contact-form";
import { Markdown } from "@/components/common/markdown";
import { usePublic } from "@/lib/use-public";

export function ContactView() {
  const { data: d } = usePublic<{ page: { body: string } }>("/public/pages/contact");
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-2">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink">Contact us</h1>
        {d && <div className="mt-6"><Markdown>{d.page.body}</Markdown></div>}
      </div>
      <Card className="p-6 sm:p-8"><h2 className="mb-4 font-display text-2xl font-semibold text-ink">Send us a message</h2><ContactForm /></Card>
    </div>
  );
}

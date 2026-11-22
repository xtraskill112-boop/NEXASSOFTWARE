"use client";
import Link from "next/link";
import { Card } from "@naamdev/ui";
import { usePublic } from "@/lib/use-public";

type Faq = { id: string; question: string; answer: string; category: string };
export function FaqsView() {
  const { data: d } = usePublic<{ faqs: Faq[] }>("/public/faqs");
  const faqs = d?.faqs ?? [];
  const groups = [...new Set(faqs.map((f) => f.category))];
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) };
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <h1 className="font-display text-4xl font-semibold text-ink">How can we help?</h1>
      <p className="mt-2 text-muted">Can&apos;t find your answer? <Link href="/contact" className="font-semibold text-maroon-700">Contact us</Link>.</p>
      {groups.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="mb-3 text-[13px] font-semibold text-maroon-700 dark:text-maroon-200">{g}</h2>
          <Card className="divide-y divide-line-soft">
            {faqs.filter((f) => f.category === g).map((f) => (
              <details key={f.id} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">{f.question}<span className="text-xl text-muted transition group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{f.answer}</p>
              </details>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

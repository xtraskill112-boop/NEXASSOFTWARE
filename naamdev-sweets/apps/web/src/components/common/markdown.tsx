import ReactMarkdown from "react-markdown";

/** Renders admin-managed CMS content. Raw HTML is never rendered (XSS-safe by default). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-saffron-700 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-ink [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2">
      <ReactMarkdown skipHtml>{children}</ReactMarkdown>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderEmail(opts: { title: string; body: string; ctaLabel?: string; ctaUrl?: string | null; preheader?: string }) {
  const cta =
    opts.ctaUrl && opts.ctaLabel
      ? `<tr><td style="padding:8px 32px 28px"><a href="${esc(opts.ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,#F57F0E,#D96506);color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:14px;font-family:Arial,sans-serif">${esc(opts.ctaLabel)}</a></td></tr>`
      : "";
  const html = `<!doctype html><html><body style="margin:0;background:#FBF4E6;padding:24px 0">
<span style="display:none">${esc(opts.preheader ?? opts.body).slice(0, 120)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 30px rgba(110,21,40,.12)">
<tr><td style="background:linear-gradient(135deg,#6E1528,#8F1D34);padding:26px 32px">
<div style="font-family:Georgia,serif;color:#FFD39C;font-size:24px;letter-spacing:3px;font-weight:700">NAAMDEV</div>
<div style="font-family:Arial,sans-serif;color:#FBE4E6;font-size:11px;letter-spacing:6px">SWEETS</div></td></tr>
<tr><td style="padding:30px 32px 8px;font-family:Georgia,serif;font-size:22px;color:#2E0711;font-weight:700">${esc(opts.title)}</td></tr>
<tr><td style="padding:4px 32px 20px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#4A3B37">${esc(opts.body).replace(/\n/g, "<br>")}</td></tr>
${cta}
<tr><td style="padding:18px 32px;background:#FFF7EC;font-family:Arial,sans-serif;font-size:12px;color:#8A7A74">Mithaas that feels like home · This is an automated message from NAAMDEV SWEETS.</td></tr>
</table></td></tr></table></body></html>`;
  return { html, text: `${opts.title}\n\n${opts.body}${opts.ctaUrl ? `\n\n${opts.ctaUrl}` : ""}` };
}

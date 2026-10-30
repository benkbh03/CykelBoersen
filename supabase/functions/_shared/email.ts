// Fælles mailskabelon for alle edge functions der sender mail via Resend.
//
// Før 18. okt. 2026 havde hver function sin egen kopi af layoutet, og de var
// drevet fra hinanden (creme flade, tre radier, grønne og orange knapper, en
// Georgia-overskrift ét sted). Nu bygges alle mails her, så de ikke kan drive.
//
// Stilen følger "Rubrik, ikke reklame" (design/design-audit.md): hvid flade,
// skovgrøn kun i toppen, orange som eneste knapfarve, 6 px radius, ingen
// skygger, ingen emoji, ingen pile i knaptekst. Archivo kan ikke hentes
// pålideligt i mailklienter, så skriften er Arial.
//
// Importeres som "../_shared/email.ts". Deploy en function med denne fil ved
// siden af index.ts (Supabase-connectoren gør det; i Dashboard: tilføj filen
// som _shared/email.ts).

import { asciiEmail } from "./ascii-email.ts";

const FOREST = "#2A3D2E";
const RUST = "#C8502A";
const CHARCOAL = "#1A1A18";
const MUTED = "#5F6360";
const BORDER = "#E4E4E0";
const SURFACE = "#F4F4F2";
const FONT = "Arial,Helvetica,sans-serif";

/* Links bruger punycode-formen: enkelte mailklienter ødelægger "ø" i en
   href. Teksten læseren ser, er stadig cykelbørsen.dk. */
export const SITE = "https://xn--cykelbrsen-5cb.dk";

/* Den officielle afsender. Bruges hvis secret EMAIL_FROM ikke er sat; den
   tidligere fallback var Resends testadresse, som kun leverer til
   kontoejeren, så mails forsvandt uden fejl. */
export const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Cykelbørsen <hej@xn--cykelbrsen-5cb.dk>";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Fjern linjeskift og afgræns længden før tekst går i et Subject (header-injection).
export function safeSubject(s: unknown, maxLen = 120): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, maxLen);
}

export function kr(n: number): string {
  return `${Number(n).toLocaleString("da-DK")} kr.`;
}

// ── Byggeklodser. Al tekst ind i dem er allerede escapet HTML. ──

export function heading(html: string): string {
  return `<h1 style="margin:0 0 16px;font:bold 20px/1.3 ${FONT};color:${CHARCOAL};">${html}</h1>`;
}

export function p(html: string): string {
  return `<p style="margin:0 0 16px;font:16px/1.5 ${FONT};color:${CHARCOAL};">${html}</p>`;
}

export function small(html: string): string {
  return `<p style="margin:24px 0 0;font:14px/1.5 ${FONT};color:${MUTED};">${html}</p>`;
}

// Citat af brugerens egen tekst (en besked, en henvendelse).
export function quote(html: string): string {
  return `<div style="margin:0 0 24px;padding:16px;background:${SURFACE};border-radius:6px;font:16px/1.5 ${FONT};color:${CHARCOAL};white-space:pre-wrap;">${html}</div>`;
}

// Fakta som label/værdi-linjer, fx en annonce eller en ansøgning.
export function facts(rows: Array<[string, string]>): string {
  const tr = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr>
      <td style="padding:4px 16px 4px 0;font:14px/1.5 ${FONT};color:${MUTED};vertical-align:top;white-space:nowrap;">${k}</td>
      <td style="padding:4px 0;font:14px/1.5 ${FONT};color:${CHARCOAL};">${v}</td>
    </tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${tr}</table>`;
}

export function button(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:8px 0 0;"><tr>
    <td style="background:${RUST};border-radius:6px;">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 20px;font:bold 16px/1 ${FONT};color:#FFFFFF;text-decoration:none;">${label}</a>
    </td></tr></table>`;
}

// Annonce som i en liste: billede, titel, pris, linje med fakta.
export function bikeCard(o: { href: string; title: string; price?: number | null; meta?: string; image?: string | null }): string {
  const img = o.image && /^https:\/\//.test(o.image)
    ? `<a href="${esc(o.href)}"><img src="${esc(o.image)}" alt="" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:6px 6px 0 0;"></a>`
    : "";
  return `<div style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:6px;">
    ${img}
    <div style="padding:16px;">
      <a href="${esc(o.href)}" style="font:bold 16px/1.4 ${FONT};color:${CHARCOAL};text-decoration:none;">${esc(o.title)}</a>
      ${o.price != null ? `<div style="margin-top:4px;font:bold 20px/1.3 ${FONT};color:${CHARCOAL};">${kr(o.price)}</div>` : ""}
      ${o.meta ? `<div style="margin-top:4px;font:14px/1.5 ${FONT};color:${MUTED};">${esc(o.meta)}</div>` : ""}
    </div>
  </div>`;
}

/* Hele mailen. `reason` er den linje i bunden der siger hvorfor man får
   mailen, og hvordan man slår den fra hvis det kan lade sig gøre. */
export function layout(content: string, reason = ""): string {
  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#FFFFFF;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;">
    <tr><td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:${FOREST};padding:20px 32px;border-radius:6px 6px 0 0;">
            <a href="${SITE}"><img src="https://xn--cykelbrsen-5cb.dk/img/brand/logo-dark-email.png" width="160" height="32" alt="Cykelbørsen" style="display:block;border:0;width:160px;height:32px;font:bold 20px ${FONT};color:#FFFFFF;"></a>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;border:1px solid ${BORDER};border-top:0;border-radius:0 0 6px 6px;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;font:12px/1.5 ${FONT};color:${MUTED};">
            ${reason ? `${reason}<br>` : ""}Cykelbørsen · <a href="${SITE}" style="color:${MUTED};">cykelbørsen.dk</a> · <a href="mailto:hej@xn--cykelbrsen-5cb.dk" style="color:${MUTED};">hej@cykelbørsen.dk</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* Tekstudgave af en HTML-mail. Nogle klienter og spamfiltre foretrækker en,
   og den koster intet at lave ud fra HTML'en. */
export function toText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const l = label.replace(/<[^>]+>/g, "").trim();
      return l && !href.startsWith("mailto:") && l !== href ? `${l} (${href})` : l;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  // Modtagere med "ø" i domænet sendes som punycode, så de ikke afvises.
  to = asciiEmail(to) ?? to;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject: safeSubject(subject, 160), html, text: toText(html) }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Resend fejl: ${JSON.stringify(body)}`);
  return body;
}

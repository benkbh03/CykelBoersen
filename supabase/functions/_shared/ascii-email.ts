// Mailadresse i en form som Stripe og Resend godtager.
//
// Danske domæner med æ, ø eller å (fx cykelbørsen.dk) afvises af Stripe
// Checkout og Connect med "ugyldig e-mail". Domænet omskrives derfor til
// punycode (xn--cykelbrsen-5cb.dk), som er samme adresse. Har selve navnet
// før @ ikke-ASCII-tegn, kan det ikke omskrives, og så returneres null:
// kalderen udelader da adressen i stedet for at få hele kaldet afvist.
//
// Importeres som "../_shared/ascii-email.ts" og skal deployes sammen med
// de functions der bruger den (create-rental-checkout, connect-onboarding,
// og via email.ts alle der sender mail).

export function asciiEmail(email: string | null | undefined): string | null {
  const s = String(email ?? "").trim();
  const at = s.lastIndexOf("@");
  if (at < 1) return null;
  const local = s.slice(0, at);
  if (!/^[\x21-\x7e]+$/.test(local)) return null;
  try {
    const domain = new URL(`http://${s.slice(at + 1)}`).hostname;
    return domain ? `${local}@${domain}` : null;
  } catch {
    return null;
  }
}

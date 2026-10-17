/* ============================================================
   E-MAIL TIL VISNING
   Supabase gemmer domæner med æ/ø/å som punycode
   ("hej@xn--cykelbrsen-5cb.dk"). Til visning oversættes de tilbage
   ("hej@cykelbørsen.dk"). Brug KUN til visning; send altid den
   rå adresse videre til auth og e-mail.
   ============================================================ */

const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700;

function adapt(delta, numPoints, firstTime) {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function digit(cp) {
  if (cp >= 48 && cp <= 57) return cp - 22;
  if (cp >= 65 && cp <= 90) return cp - 65;
  if (cp >= 97 && cp <= 122) return cp - 97;
  return BASE;
}

// RFC 3492-afkodning af én label uden "xn--"-præfiks
function decodeLabel(input) {
  const out = [];
  const basic = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(basic, 0); j++) out.push(input.charCodeAt(j));
  let n = 128, i = 0, bias = 72;
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length;) {
    const oldi = i;
    for (let w = 1, k = BASE; ; k += BASE) {
      if (idx >= input.length) throw new Error('punycode');
      const d = digit(input.charCodeAt(idx++));
      if (d >= BASE) throw new Error('punycode');
      i += d * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (d < t) break;
      w *= BASE - t;
    }
    const len = out.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

export function displayEmail(email) {
  if (!email || typeof email !== 'string') return email || '';
  const at = email.lastIndexOf('@');
  if (at < 0) return email;
  const domain = email.slice(at + 1).split('.').map(label => {
    if (!/^xn--/i.test(label)) return label;
    try { return decodeLabel(label.slice(4).toLowerCase()); } catch { return label; }
  }).join('.');
  return email.slice(0, at + 1) + domain;
}

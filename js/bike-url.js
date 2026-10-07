/* Annoncens adresse: /bike/<mærke-model>-<første 8 tegn af id>.

   Eksempel: /bike/trek-domane-sl6-09f32150

   Adressen bygges KUN her. Browseren (routeren, kort, profil, sammenlign) og
   prerender/sitemap i scripts/ importerer samme fil, så de to sider aldrig kan
   drive fra hinanden. Filen må derfor ikke røre `window`/`document`.

   De gamle adresser /bike/<fuldt uuid> virker stadig: routeren accepterer
   begge former, og prerender skriver en lille videresendelsesside på den
   gamle adresse. E-mails fra edge functions bruger stadig den gamle form.

   8 hex-tegn = 4 mia. muligheder. Med nogle tusinde annoncer er en kollision
   usandsynlig; sker den, viser vi den ældste og retter adressen til dens
   egen slug, så siden er stadig konsistent. */

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT_RE = /(?:^|-)([0-9a-f]{8})$/i;

export function bikeSlug(brand, model) {
  const s = `${brand || ''} ${model || ''}`
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // é → e, ü → u
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return s || 'cykel';
}

/* Sti uden afsluttende skråstreg, som de øvrige app-ruter. canonicalUrl()
   i utils.js tilføjer skråstregen hvor det er en adresse til omverdenen. */
export function bikePath(b) {
  const id = String(b?.id || '');
  return `/bike/${bikeSlug(b?.brand, b?.model)}-${id.slice(0, 8).toLowerCase()}`;
}

/* Læs /bike/<…>-delen. Giver { id } for den gamle form med fuldt uuid,
   { prefix } for den nye, ellers null. */
export function parseBikeParam(param) {
  const p = String(param || '').replace(/\/+$/, '');
  if (UUID_RE.test(p)) return { id: p.toLowerCase() };
  const m = p.match(SHORT_RE);
  return m ? { prefix: m[1].toLowerCase() } : null;
}

/* Grænser til et uuid-intervalopslag: id >= lo AND id <= hi. Postgres
   sammenligner uuid byte for byte, så alle id'er der starter med de 8 tegn
   ligger i intervallet. */
export function prefixRange(prefix) {
  return {
    lo: `${prefix}-0000-0000-0000-000000000000`,
    hi: `${prefix}-ffff-ffff-ffff-ffffffffffff`,
  };
}

/* Er stien en annonceadresse for netop dette id (ny eller gammel form)? */
export function pathIsBike(path, id) {
  const m = String(path || '').match(/^\/bike\/([^/?#]+)\/?$/);
  if (!m || !id) return false;
  const ref = parseBikeParam(m[1]);
  if (!ref) return false;
  const lid = String(id).toLowerCase();
  return ref.id ? ref.id === lid : lid.startsWith(ref.prefix);
}

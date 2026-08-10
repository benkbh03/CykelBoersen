/* ────────────────────────────────────────────────────────────────
   import-parse.js — udtræk annonce-felter af ren TEKST

   Bruges når sælgeren henter sin egen annonce fra et link (DBA,
   Gul&Gratis m.fl.) i sælg-flowet. Her må der IKKE køre AI-billedanalyse:
   annoncens tekst indeholder allerede oplysningerne, og et Claude-kald
   ville både koste penge og risikere at gætte noget andet end det
   sælgeren selv har skrevet.

   Derfor: ren regel-baseret parsing af titel + beskrivelse. Reglerne er
   bevidst spejlet fra `supabase/functions/import-dealer-feed/index.ts`
   (funktionen enrichFields), så et felt udledes ens uanset om annoncen
   kommer fra et forhandler-feed eller fra et indsat link.

   GRUNDREGEL: hellere et TOMT felt end et forkert. Alt herunder sættes
   kun når teksten siger det entydigt — vi udleder aldrig et felt af et
   andet felt, og vi gætter aldrig ved tvetydighed. Sælgeren retter selv
   i trin 2 og 3, og et forkert forudfyldt felt er sværere at opdage end
   et tomt.
──────────────────────────────────────────────────────────────── */

import { KNOWN_BRANDS } from './brand-data-v2.js';

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Kanoniske værdilister — SKAL matche select-optionerne i sælg-flowet
   (js/sell-page.js renderSellStep2HTML). Skriver vi en værdi der ikke
   findes som <option>, sætter browseren feltet til tomt uden fejl. */
const TYPE_RULES = [
  // Rækkefølgen er prioriteret: mest specifikke signal først. En "el-ladcykel"
  // er en ladcykel, og en "el-mountainbike" er en el-cykel efter vores
  // typeliste — derfor testes ladcykel FØR el.
  [/ladcykel|christiania|cargo\s*bike|long\s*john|bakfiets/i, 'Ladcykel'],
  // Der findes ingen "el-MTB"-type i sortimentet — el er den overordnede
  // kategori, så "el-mountainbike" skal lande på El-cykel og ikke Mountainbike.
  [/\bel-?(cykel|mtb|mountainbike|racer|bike)\b|\be-?bike\b|\bebike\b|elektrisk\s*cykel|\bpedelec\b/i, 'El-cykel'],
  [/\bgravel\b|grusracer|cyclocross|\bcx-?cykel\b/i, 'Gravel'],
  [/racercykel|\bracer\b|road\s*bike|landev(e|ej)scykel/i, 'Racercykel'],
  [/mountainbike|\bmtb\b|\bhardtail\b|\bfully\b|terr(æ|ae)ncykel/i, 'Mountainbike'],
  [/b(ø|o)rnecykel|juniorcykel|\bdrengecykel\b|\bpigecykel\b/i, 'Børnecykel'],
  [/seniorcykel|senior\s*cykel|trehjulet|\btrike\b/i, 'Senior cykel'],
  [/bycykel|citybike|city\s*cykel|damecykel|herrecykel|classic\s*bike|\bpendlercykel\b/i, 'Citybike'],
];

/* Stand: KUN når det står eksplicit. "brugt" alene er ikke et signal —
   alt på DBA er brugt, og "Brugt" ville derfor blive standardsvaret
   frem for sælgerens egen vurdering. */
const CONDITION_RULES = [
  [/\bhelt\s*ny\b|\bfabriksny\b|\bubrugt\b|aldrig\s*(brugt|k(ø|o)rt)|\bny\s*i\s*kassen\b/i, 'Ny'],
  [/\bsom\s*ny\b|næsten\s*ny|n(æ|ae)sten\s*ubrugt|\bmint\b/i, 'Som ny'],
  [/\bgod\s*stand\b|\bvelholdt\b|\bfin\s*stand\b|\bpæn\s*stand\b|\bp(æ|ae)n\s*stand\b/i, 'God stand'],
];

const COLOR_RULES = [
  [/\bsort\b|\bblack\b|\bmatsort\b/i, 'Sort'],
  [/\bhvid\b|\bwhite\b/i, 'Hvid'],
  [/gr(å|aa)|\bgrey\b|\bgray\b|antracit|gunmetal/i, 'Grå'],
  [/s(ø|o)lv|\bsilver\b/i, 'Sølv'],
  [/lyser(ø|o)d|\bpink\b|\brosa\b/i, 'Lyserød'],
  [/r(ø|o)d|\bred\b|bordeaux|vinr(ø|o)d|koral/i, 'Rød'],
  [/bl(å|aa)|\bblue\b|\bnavy\b|petrol|turkis|denim/i, 'Blå'],
  [/gr(ø|o)n|\bgreen\b|oliven|\barmy\b|\bmint\b/i, 'Grøn'],
  [/\bgul\b|\byellow\b|okker/i, 'Gul'],
  [/\borange\b/i, 'Orange'],
  [/\blilla\b|\bpurple\b|violet/i, 'Lilla'],
  [/cappuccino|\bbrun\b|\bbrown\b|kaffe|chokolade/i, 'Brun'],
  [/\bbeige\b|\bcreme\b|\bnude\b/i, 'Beige'],
];

// Længste/mest specifikke først — filtrene matcher groupset som prefix.
const GROUPSETS = [
  'Shimano Dura-Ace', 'Shimano Ultegra', 'Shimano GRX', 'Shimano 105',
  'Shimano XT', 'Shimano Deore', 'SRAM Red XPLR', 'SRAM Force XPLR',
  'SRAM Rival XPLR', 'SRAM Red', 'SRAM Force', 'SRAM Apex', 'SRAM Rival',
  'Campagnolo Ekar',
];

const MOTOR_BRANDS = ['Bosch', 'Shimano', 'Promovec', 'Yamaha', 'Bafang', 'Mahle', 'Brose', 'Fazua'];

/* Stelstørrelse i cm → den bucket sælg-formularen bruger. Grænserne er
   taget direkte fra option-labels, så tallet og bogstavet aldrig kommer
   til at modsige hinanden på annoncen. */
function sizeBucketFromCm(cm) {
  if (!Number.isFinite(cm)) return null;
  if (cm <= 48) return 'XS (44–48 cm)';
  if (cm <= 52) return 'S (49–52 cm)';
  if (cm <= 56) return 'M (53–56 cm)';
  if (cm <= 60) return 'L (57–60 cm)';
  return 'XL (61+ cm)';
}

function matchFirst(rules, text) {
  for (const [re, value] of rules) if (re.test(text)) return value;
  return null;
}

function extractColors(text) {
  let work = text;
  const out = [];
  for (const [re, name] of COLOR_RULES) {
    if (re.test(work) && !out.includes(name)) {
      out.push(name);
      // Fjern træfferen, så "lyserød" ikke også tælles som "rød".
      work = work.replace(new RegExp(re.source, 'gi'), ' ');
    }
  }
  return out.slice(0, 3);
}

/* Mærke: længste match vinder, så "Riese & Müller" ikke bliver til noget
   kortere, og "Velo de Ville" ikke bliver til "Velo". */
function extractBrand(text) {
  let best = null;
  for (const b of KNOWN_BRANDS) {
    if (!new RegExp(`(^|[^\\wæøå])${escapeRe(b)}([^\\wæøå]|$)`, 'i').test(text)) continue;
    if (!best || b.length > best.length) best = b;
  }
  return best;
}

/* Model = titlen renset for mærke, årstal, pris og typiske DBA-tilføjelser.
   Vi beholder resten som den står — sælgerens egen formulering er bedre
   end vores forsøg på at normalisere den. */
function extractModel(title, brand) {
  let t = String(title || '')
    .replace(/\s*[|–—-]\s*(dba\.dk|dba|gul\s*og\s*gratis|gulogratis\.dk|guloggratis)[^|]*$/i, '')
    .replace(/\bk(ø|o)bes\b|\bs(æ|ae)lges\b|\btil\s*salg\b/gi, ' ');
  if (brand) t = t.replace(new RegExp(escapeRe(brand), 'ig'), ' ');
  t = t
    .replace(/\b(19[5-9]\d|20[0-3]\d)\b/g, ' ')                  // årstal
    .replace(/\d{1,3}(?:[.\s]\d{3})+\s*(kr|dkk|,-)/gi, ' ')      // pris
    .replace(/\b\d{3,7}\s*(kr|dkk|,-)/gi, ' ')
    // Størrelses-mærkater — de får deres eget felt, så de larmer kun i modellen.
    .replace(/\bst(ø|o)?r(relse)?\.?\s*[:\s]\s*(XS|S|M|L|XL|\d{2}\s*cm)\b/gi, ' ')
    .replace(/\b[3-7]\d\s*cm\b/gi, ' ')
    .replace(/[|·•]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, '')
    .trim();
  return t.length >= 2 ? t.slice(0, 80) : null;
}

/**
 * Udtræk annonce-felter af titel + beskrivelse fra et hentet link.
 *
 * @param {{title?: string, description?: string}} src
 * @returns {Object} felter der kunne læses entydigt. Nøgler matcher
 *   `applyAiSuggestion`-formen (brand, model, type, size, size_cm,
 *   wheel_size, year, condition, colors, groupset, brake_type,
 *   weight_kg, geartype, step_type, suspension, motor, motor_position,
 *   battery_wh). Felter der ikke kunne læses udelades helt.
 */
export function parseImportedListing({ title = '', description = '' } = {}) {
  const name = String(title || '');                 // titel alene
  const spec = `${name} ${description || ''}`;      // titel + beskrivelse
  const out = {};

  const brand = extractBrand(name) || extractBrand(spec);
  if (brand) out.brand = brand;

  const model = extractModel(name, brand);
  if (model) out.model = model;

  const type = matchFirst(TYPE_RULES, spec);
  if (type) out.type = type;

  const condition = matchFirst(CONDITION_RULES, spec);
  if (condition) out.condition = condition;

  // Årgang — kun et realistisk modelår, og kun fra titlen. I beskrivelsen
  // står der ofte andre årstal ("købt i 2019, serviceret 2023").
  const ym = name.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  if (ym) {
    const y = Number(ym[1]);
    if (y >= 1990 && y <= 2031) out.year = y;
  }

  /* Farve læses af TITLEN, ikke af hele beskrivelsen: dér står der typisk
     "sort sadel" eller "rødt styrbånd", og en farve-match på løbende tekst
     ville gøre cyklen sort fordi sadlen er det. Undtagelsen er en eksplicit
     farve-mærkat ("Farve: mat sort"), som er utvetydig. */
  const colorLabel = String(description || '').match(/\bfarve[nr]?\s*[:\-–]\s*([^\n.;,|]{2,40})/i);
  const colors = extractColors(colorLabel ? `${name} ${colorLabel[1]}` : name);
  if (colors.length) out.colors = colors;

  /* Hjulstørrelse. Et bart tomme-tal er TVETYDIGT: gamle herre-/damecykler
     måles i tommer-STEL (fx »Raleigh Tourist 24"« = 24" stel, 28" hjul).
     26/27.5/28/29" findes ikke som stelmål → entydigt hjul. 24" sættes kun
     ved et tydeligt børne-/junior-signal. Samme regel som feed-importen. */
  if (/27[.,]5|650b/i.test(spec)) {
    out.wheel_size = '27.5" / 650b';
  } else {
    const wm = spec.match(/\b(12|14|16|18|20|24|26|28|29)\s*("|''|″|tommer|inch)\b/i)
            || spec.match(/\b(12|14|16|18|20|24|26|28|29)in\b/i);
    if (wm) {
      const inch = Number(wm[1]);
      if (inch === 24) {
        const kids  = /\bdreng[a-zæøå]*\b|\bpige[a-zæøå]*\b|\bjunior\b|\bb(ø|o)rn[a-zæøå]*\b|\bkids?\b|\byouth\b/i.test(name);
        const adult = /\bherre[a-zæøå]*\b|\bdame[a-zæøå]*\b|\bvoksen\b|\bmen'?s\b|\bwomen'?s\b/i.test(name);
        if (kids && !adult) out.wheel_size = '24"';
      } else {
        out.wheel_size = `${inch}"`;
      }
    }
  }

  // Stelstørrelse i cm → både tallet og bogstav-bucket'en.
  const sm = spec.match(/\b([3-7]\d)\s*cm\b/i);
  if (sm) {
    const n = Number(sm[1]);
    if (n >= 38 && n <= 70) {
      out.size_cm = n;
      const bucket = sizeBucketFromCm(n);
      if (bucket) out.size = bucket;
    }
  } else {
    // Bogstavstørrelse uden cm — kun når det står som en isoleret mærkat
    // ("Str. M", "Størrelse L"), aldrig et løst M/L midt i en sætning.
    const lm = spec.match(/\b(?:st(?:ø|o)?r(?:relse)?\.?)\s*[:\s]\s*(XS|S|M|L|XL)\b/i);
    if (lm) {
      const letter = lm[1].toUpperCase();
      const bucket = ['XS (44–48 cm)', 'S (49–52 cm)', 'M (53–56 cm)', 'L (57–60 cm)', 'XL (61+ cm)']
        .find(o => o.split(' ')[0] === letter);
      if (bucket) out.size = bucket;
    }
  }

  // Komponentgruppe (prefix-match — samme semantik som filtrene).
  for (const g of GROUPSETS) {
    if (new RegExp(escapeRe(g), 'i').test(spec)) { out.groupset = g; break; }
  }

  /* Bremsetype — kun når teksten nævner ÉN type. Klassiske bycykler har
     ofte både fod- og fælgbremse, og et gæt gav tidligere forkert
     "Tromlebremser". Generisk "skivebremser" uden hydraulisk/mekanisk
     efterlades tomt frem for at vælge en af dem. */
  {
    const disc = /skivebrems|disc\s*brake/i.test(spec);
    const rim  = /f(æ|ae)lgbrems|v-?brems|rim\s*brake|caliper|stempelbrems/i.test(spec);
    const drum = /tromlebrems|rullebrems|roller\s*brake|drum\s*brake/i.test(spec);
    if (Number(disc) + Number(rim) + Number(drum) === 1) {
      if (disc) {
        if (/hydraulisk/i.test(spec)) out.brake_type = 'Skivebremser hydrauliske';
        else if (/mekanisk/i.test(spec)) out.brake_type = 'Skivebremser mekaniske';
      } else if (rim) {
        out.brake_type = 'Fælgbremser';
      } else {
        out.brake_type = 'Tromlebremser';
      }
    }
  }

  // Vægt
  const gm = spec.match(/\b(\d{1,2}(?:[.,]\d)?)\s*kg\b/i);
  if (gm) {
    const w = parseFloat(gm[1].replace(',', '.'));
    if (w >= 2 && w <= 50) out.weight_kg = w;
  }

  // Geartype — kun hvad der bogstaveligt står. Vi udleder ikke af
  // komponentnavne (fx "Nexus"), selvom det teknisk er entydigt.
  if (/navgear|indvendig[a-zæøå]*\s*gear|internal\s*(hub\s*)?gear|hub\s*gear/i.test(spec)) out.geartype = 'Indvendig';
  else if (/k(æ|ae)deskifter|derailleur|udvendig[a-zæøå]*\s*gear|external\s*gear/i.test(spec)) out.geartype = 'Udvendig';

  // Indstigning — dame = step-through, herre = diamantstel. Pålidelig nok
  // for cykler til at være en bevidst undtagelse fra "udled ikke"-reglen.
  if (/lav\s*indstigning|low[\s-]?step|step[\s-]?thru|step[\s-]?through|\bwave\b|\bdame[a-zæøå]*\b|\bunisex\b/i.test(name)) out.step_type = 'Lav indstigning';
  else if (/h(ø|o)j\s*indstigning|high[\s-]?step|\bherre[a-zæøå]*\b/i.test(name)) out.step_type = 'Høj indstigning';

  // Affjedring — kun relevant for MTB/Gravel/El-cykel, og kun når
  // affjedring nævnes eksplicit (en stiv cykel har også en "forgaffel").
  if (['Mountainbike', 'Gravel', 'El-cykel'].includes(out.type)) {
    if (/\bfully\b|fuld\s*affjedring|full[\s-]?suspension|dual\s*suspension|dobbelt\s*affjedr/i.test(spec)) out.suspension = 'Fuld affjedring (fully)';
    else if (/\bhardtail\b|affjedret\s*forgaffel|fjedergaffel|luftgaffel|front\s*suspension|suspension\s*fork/i.test(spec)) out.suspension = 'Forgaffel (hardtail)';
  }

  // El-cykel: motor, placering, batteri
  if (out.type === 'El-cykel') {
    for (const b of MOTOR_BRANDS) {
      if (new RegExp(`\\b${escapeRe(b)}\\b`, 'i').test(spec)) { out.motor = b; break; }
    }
    if (/midtermotor|mid[\s-]?motor|mid[\s-]?drive/i.test(spec)) out.motor_position = 'Midtermotor';
    else if (/forhjuls?\s*motor|front[\s-]?(motor|hub)/i.test(spec)) out.motor_position = 'Forhjulsmotor';
    else if (/baghjuls?\s*motor|rear[\s-]?(motor|hub)/i.test(spec)) out.motor_position = 'Baghjulsmotor';
    const bm = spec.match(/\b(\d{3,4})\s*wh\b/i);
    if (bm) {
      const wh = Number(bm[1]);
      if (wh >= 100 && wh <= 2000) out.battery_wh = wh;
    }
  }

  return out;
}

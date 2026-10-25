// Pæn modeltekst til annoncer fra forhandler-feeds.
//
// Webshops skriver produktnavne til deres egen side: VERSALER, koder som
// "FODBR." og "3G", stelstørrelse, årgang og farve i én lang streng med
// bindestreger og lodrette streger. På et annoncekort blev det til
// "Raleigh TOURIST DE LUXE DA…". Årgang, størrelse, hjul og type står
// allerede i egne felter, så de fjernes her. Farven bliver, fordi samme
// model ofte ligger i flere farver lige efter hinanden, og det er den
// eneste forskel kortene imellem.
//
// Resultatet er "<model> <køn> <gear>, <farve>", fx
// "Tourist De Luxe Dame 3 gear, sort".
//
// Bruges af import-dealer-feed. Engangsrettelsen af de 94 eksisterende
// Forum-annoncer (25. okt.) blev lavet med samme funktion, så nye og gamle
// annoncer har samme stil. Ret her, ikke i hånden i databasen.

const COLORS = [
  "sort", "black", "hvid", "white", "grå", "grey", "gray", "sølv", "silver",
  "blå", "blue", "isblå", "mørkeblå", "lyseblå", "aqua", "grøn", "green",
  "mørkegrøn", "lysegrøn", "støvgrøn", "rød", "red", "bordeaux", "postkasserød",
  "orange", "mango", "gul", "yellow", "guld", "gold", "brun", "brown", "kobber",
  "copper", "beige", "cappuccino", "mokka", "creme", "lyserød", "pink", "lilla",
  "purple", "petrol", "army", "oliven", "sand", "turkis",
];
// Ord der kun beskriver en farve ("mat sort", "lys grøn", "shiny grey").
const COLOR_MODS = ["mat", "matt", "blank", "shiny", "lys", "mørk", "mørke", "metallic"];
// Engelske farver fra udenlandske feeds skrives på dansk, så filtrene og
// titlerne taler samme sprog.
const DA: Record<string, string> = {
  black: "sort", white: "hvid", grey: "grå", gray: "grå", silver: "sølv",
  blue: "blå", green: "grøn", red: "rød", yellow: "gul", gold: "guld",
  brown: "brun", copper: "kobber", purple: "lilla", matt: "mat", shiny: "blank",
};
const GENDER: Record<string, string> = {
  dame: "Dame", damecykel: "Dame", herre: "Herre", herrecykel: "Herre",
  pige: "Pige", pigecykel: "Pige", dreng: "Dreng", drengecykel: "Dreng",
  junior: "Junior", unisex: "Unisex",
};
// Ord der ikke siger noget på et kort: typen står i eget felt.
const NOISE = ["mountainbike", "mountain", "cykel", "bike", "citybike", "fodbr", "fodbremse", "susp"];
// Småord der står med småt midt i et modelnavn.
const SMALL = ["med", "lad", "og", "til"];
// Forkortelser der skal stå med versaler.
const KEEP_UPPER = ["XP", "DNA", "RB", "SL", "GT", "MTB", "LTD", "XC", "CX"];

const lc = (s: string) => s.toLocaleLowerCase("da-DK");

function fixCase(w: string): string {
  if (/\d/.test(w)) return w;                              // "N3", "S9", "6Six"
  if (KEEP_UPPER.includes(w.toUpperCase()) && w === w.toUpperCase()) return w;
  const letters = w.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return w;
  // Kun ord i versaler (eller "MørkeGrøn"-blandinger) skrives om; "Luxe" og
  // "de" står som forhandleren skrev dem.
  const upper = letters === letters.toLocaleUpperCase("da-DK");
  const inner = /\p{Ll}\p{Lu}/u.test(w);
  if (!upper && !inner) return w;
  return w.charAt(0).toLocaleUpperCase("da-DK") + lc(w.slice(1));
}

export function cleanModel(raw: string, brand = ""): string {
  let s = String(raw ?? "").replace(/<[^>]*>/g, " ");
  if (brand) s = s.replace(new RegExp(`^\\s*${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "");

  // Gear først, før tal-oprydningen: "3G", "7g", "7 GEAR", "8sp", "21 Gear"
  let gear = "";
  s = s.replace(/\b(\d{1,2})\s*(?:-\s*)?(?:g|gear|gears|sp|speed)\b\.?/gi, (_m, n) => {
    if (!gear) gear = `${n} gear`;
    return " ";
  });
  s = s
    .replace(/\b(dame|herre)\s+(\d)\s*$/i, (_m, g, n) => { if (!gear) gear = `${n} gear`; return ` ${g} `; })
    .replace(/\bmed\s+(\d{1,2})\s*$/i, (_m, n) => { if (!gear) gear = `${n} gear`; return " "; })
    .replace(/\bde\s*luxe\b/gi, "De Luxe")
    .replace(/\bstr\.?\s*\d+([.,]\d+)?\s*(tommer|in|"|cm)?/gi, " ")   // "Str. 15 tommer"
    .replace(/\b\d+([.,]\d+)?\s*(cm|in|tommer|")(?![\p{L}])/giu, " ")  // "56 cm", "20.5in", "29 tommer"
    .replace(/"\s*/g, " ")                                             // løse tomme-tegn
    .replace(/\b\d{2}\/\d{3}\b/g, " ")                                 // "56/700"
    .replace(/\b\d{2},\d{2}\b/g, " ")                                  // "56,60" (to stelstørrelser)
    .replace(/\b(19[89]\d|20[0-3]\d)\b/g, " ")                         // årgang
    .replace(/\bhydr\.?\s*disc\b/gi, " ")
    .replace(/\bm\.\s*lad\b/gi, "med lad")
    .replace(/[|–—]/g, " ")
    .replace(/(^|\s)-(?=\s|$)|-\p{Lu}*\s*$/gu, " ")                    // " - " og "Grøn-" i halen
    .replace(/[.,]+(?=\s|$)/g, " ")
    .replace(/(^|\s)(1[2-9]|2\d)(?=\s|$)/g, " ");                     // bart hjul-tal: "G-Style 24"

  const model: string[] = [];
  const colors: string[] = [];
  let gender = "";
  let mod = "";
  for (const tok of s.split(/\s+/).filter(Boolean)) {
    const w = lc(tok);
    const parts = w.split("/");
    if (parts.every((p) => COLORS.includes(p))) {
      const c = parts.map((p) => DA[p] || p).join("/");
      const full = mod ? `${DA[mod] || mod} ${c}` : c;
      if (!colors.includes(full)) colors.push(full);
      mod = "";
      continue;
    }
    if (COLOR_MODS.includes(w)) { mod = w; continue; }
    if (mod) { model.push(fixCase(mod)); mod = ""; }
    if (GENDER[w]) { if (!gender) gender = GENDER[w]; continue; }
    if (NOISE.includes(w.replace(/\.$/, ""))) continue;
    // Et modelnavn er et egennavn: "kent" bliver "Kent", men "med lad" står.
    const t = fixCase(tok);
    model.push(SMALL.includes(w) ? w : t.charAt(0).toLocaleUpperCase("da-DK") + t.slice(1));
  }
  if (mod) model.push(mod);

  let head = [model.join(" "), gender, gear].filter(Boolean).join(" ").trim();
  head = head.charAt(0).toLocaleUpperCase("da-DK") + head.slice(1);
  const color = colors.join("/");
  if (!head) return color ? color.charAt(0).toLocaleUpperCase("da-DK") + color.slice(1) : "";
  return color ? `${head}, ${color}` : head;
}

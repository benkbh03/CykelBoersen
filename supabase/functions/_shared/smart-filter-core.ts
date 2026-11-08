// Fælles kerne for smart-filter: filterlister, instruktion til modellen og
// oprydning i svaret. Ingen imports og ingen Deno-kald, så den samme fil
// bruges af edge-funktionen OG af testsættet (scripts/smart-filter-test.mjs,
// som kører den med Node). Ret instruktionen HER, kør testsættet, og deploy
// så smart-filter med denne fil som _shared/smart-filter-core.ts.

// Samme model i funktionen og i testsættet.
export const MODEL = "claude-haiku-5-5";

// ── Kanoniske værdier: SKAL svare til data-value i index.html ─────────────
const TYPES = ["Racercykel", "Mountainbike", "El-cykel", "Citybike", "Ladcykel", "Børnecykel", "Gravel", "Senior cykel"];
const CONDITIONS = ["Ny", "Som ny", "God stand", "Brugt"];
const SIZES = ["XS (44–47 cm)", "S (48–51 cm)", "M (52–55 cm)", "L (56–58 cm)", "XL (59+ cm)"];
const WHEELS = ['12"', '14"', '16"', '18"', '20"', '24"', '26"', '27.5" / 650b', '28"', '29"'];
const FRAMES = ["Carbon", "Aluminium", "Stål", "Titanium"];
const BRAKES = ["Skivebremser hydrauliske", "Skivebremser mekaniske", "Fælgbremser", "Rullebremser"];
const GROUPSETS = ["Shimano 105", "Shimano Ultegra", "Shimano Dura-Ace", "SRAM Rival", "SRAM Force", "SRAM Red", "Shimano GRX", "SRAM Apex", "SRAM Rival XPLR", "SRAM Force XPLR", "SRAM Red XPLR", "Campagnolo Ekar", "Shimano Deore", "Shimano XT"];
const MOTORS = ["Bosch", "Shimano", "Promovec", "Yamaha", "Bafang", "Mahle", "Brose", "Fazua"];
const MOTOR_POS = ["Midtermotor", "Forhjulsmotor", "Baghjulsmotor"];
const SUSPENSIONS = ["Forgaffel (hardtail)", "Fuld affjedring (fully)"];
const GEARTYPES = ["Indvendig", "Udvendig"];
const STEP_TYPES = ["Lav indstigning", "Høj indstigning"];
const COLORS = ["Sort", "Hvid", "Grå", "Sølv", "Rød", "Blå", "Grøn", "Gul", "Orange", "Lyserød", "Lilla", "Brun", "Beige"];
const BRANDS = ["Amladcykler", "Avenue", "Babboe", "Batavus", "Bergamont", "Bianchi", "Bike by Gubi", "Black Iron Horse", "BMC", "Brabus", "Brompton", "Butchers & Bicycles", "Cannondale", "Canyon", "Carqon", "Centurion", "Cervélo", "Christiania Bikes", "Colnago", "Conway", "Corratec", "Cube", "E-Fly", "Early Rider", "Ebsen", "Electra", "Everton", "FACTOR", "Falcon", "Felt", "Focus", "Frog Bikes", "Gazelle", "Ghost", "Giant", "GT", "Gudereit", "Haibike", "Husqvarna", "Kalkhoff", "Kildemoes", "Koga", "Kona", "Kreidler", "Lapierre", "Larry vs Harry / Bullitt", "Lindebjerg", "Liv", "LOOK", "Marin", "Mate Bike", "MBK", "Merida", "Momentum", "Mondraker", "Motobecane", "Moustache", "Nihola", "Nishiki", "Norden", "Norco", "Omnium", "Orbea", "Pegasus", "Pinarello", "Principia", "Puky", "Qio", "QWIC", "Raleigh", "Remington", "Riese & Müller", "Ridley", "Royal Cargobike", "Santa Cruz", "SCO", "Scott", "Seaside Bike", "Silverback", "Sparta", "Specialized", "Stevens", "Superior", "Tern", "Trek", "Triobike", "Urban Arrow", "uVelo", "Van De Falk", "VanMoof", "Velo", "Velo de Ville", "Velo Lux", "Victoria", "Wilier", "Winther", "Woom", "Yuba"];

// [felt i svaret, tilladte værdier]
export const LISTS: [string, string[]][] = [
  ["types", TYPES], ["conditions", CONDITIONS], ["sizes", SIZES],
  ["wheelSizes", WHEELS], ["frameMaterials", FRAMES], ["brakeTypes", BRAKES],
  ["groupsets", GROUPSETS], ["motors", MOTORS], ["motorPositions", MOTOR_POS],
  ["suspensions", SUSPENSIONS], ["geartypes", GEARTYPES], ["stepTypes", STEP_TYPES],
  ["colors", COLORS], ["brands", BRANDS],
];

export const SYSTEM_PROMPT = `Du oversætter en dansk (eller engelsk) beskrivelse af en cykel, som en køber leder efter, til filtre på cykelbørsen.dk.

Svar KUN med ét JSON-objekt, uden forklaring og uden kodeblok. Brug kun de værdier der står herunder, stavet præcis sådan. Udelad et felt, eller giv en tom liste, når beskrivelsen ikke siger noget om det. Gæt ikke: et filter der ikke blev bedt om, skjuler cykler køberen gerne ville se.

Køberne er både almindelige mennesker der skriver i hverdagssprog ("damecykel med kurv") og kendere der skriver præcise specifikationer ("Ultegra Di2 carbon 56 cm"). Oversæt hverdagsord til det filter de tydeligt betyder (se "Hjælp til tolkning"). Ord der ikke passer i et filter, men som siger noget om cyklen (udstyr som kurv, bagagebærer, lygter, barnestol, støttehjul, skærme), kommer i "keywords". De filtrerer ikke; de sætter de annoncer der nævner dem øverst.

Felter (lister kan have flere værdier, som betyder "en af dem"):
- "types": ${JSON.stringify(TYPES)}
- "conditions": ${JSON.stringify(CONDITIONS)}. "Ny" kun når køberen vil have en ny cykel. "Brugt" alene betyder ikke at der skal filtreres; udelad så feltet.
- "sizes": ${JSON.stringify(SIZES)}
- "wheelSizes": ${JSON.stringify(WHEELS)}
- "frameMaterials": ${JSON.stringify(FRAMES)}
- "brakeTypes": ${JSON.stringify(BRAKES)}
- "groupsets": ${JSON.stringify(GROUPSETS)}
- "motors" (el-cykelmotorens mærke): ${JSON.stringify(MOTORS)}
- "motorPositions": ${JSON.stringify(MOTOR_POS)}
- "suspensions": ${JSON.stringify(SUSPENSIONS)}
- "geartypes": ${JSON.stringify(GEARTYPES)} (Indvendig = navgear, Udvendig = kædeskifter)
- "stepTypes": ${JSON.stringify(STEP_TYPES)}
- "colors": ${JSON.stringify(COLORS)}
- "brands": ${JSON.stringify(BRANDS)}
- "minPrice", "maxPrice": hele kroner. "under 3.000" og "max 3k" giver maxPrice 3000. "omkring 10.000" giver 8000 til 12000. Euro omregnes med 7,5.
- "maxWeight": kg, kun når en vægt nævnes.
- "batteryMin": Wh, kun når batteristørrelse nævnes.
- "sellerType": "dealer" (forhandler/butik) eller "private". Udelad hvis begge er fine.
- "electronicShifting": true for Di2/AXS/elektronisk gear.
- "city": én dansk by eller ét postnummer, kun når køberen nævner hvor.
- "search": KUN et modelnavn, fx "Tarmac" eller "Domane". Højst tre ord. Det filtrerer på mærke og model, så alt andet end et modelnavn giver en tom liste. Ikke mærker, typer, materialer eller udstyr.
- "keywords": op til fem korte ord i grundform og ental, som annoncens tekst sandsynligvis indeholder, fx ["kurv"] for "med kurv foran" og ["bagagebærer", "lygte"] for "med bagagebærer og lys". Ikke ord der allerede er blevet til et filter, og ikke fyldord (god, pæn, billig, foran, med).

Hjælp til tolkning:
- Højde til stelstørrelse (voksen): under 160 cm XS, 160-167 S, 168-175 M, 176-184 L, 185 og derover XL. Stelmål i cm (racer, gravel, bycykel, el-cykel): til 47 XS, 48-51 S, 52-55 M, 56-58 L, 59 og derover XL; sæt kun den ene størrelse. Mountainbikes måles kortere, så giv ingen størrelse ud fra cm når typen er Mountainbike. Giv højst to nabostørrelser.
- Barn: types Børnecykel. Alder til hjul: 2-4 år 12", 3-5 år 14", 4-6 år 16", 5-7 år 18", 6-9 år 20", 8-12 år 24".
- "racer", "landevej" = Racercykel. "MTB" = Mountainbike. "elcykel", "e-bike" = El-cykel. "ladcykel", "cargo", "christianiacykel" = Ladcykel. "bycykel", "pendlercykel" = Citybike, medmindre der står el.
- "fully" = Fuld affjedring (fully). "hardtail" = Forgaffel (hardtail).
- "billig" alene giver ingen pris.
- "dame", "damecykel", "damestel", "pigecykel" = stepTypes ["Lav indstigning"]. "herre", "herrecykel", "herrestel", "drengecykel" = stepTypes ["Høj indstigning"]. "lav indstigning", "nem at stige på", "svanehals" = ["Lav indstigning"]. En damecykel uden anden type er ikke automatisk en Citybike.
- "city bike", "city-cykel", "bycykel" = Citybike.
- "navgear", "nexus" = geartypes ["Indvendig"]. "kædeskifter" = ["Udvendig"]. "fodbremse", "contrabremse" = brakeTypes ["Rullebremser"].`;

export const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

/** Modellens svar → kun kendte felter og kendte værdier. Alt andet smides væk. */
export function sanitize(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, allowed] of LISTS) {
    const v = raw[field];
    if (!Array.isArray(v)) continue;
    const hits = [...new Set(v.filter((x) => typeof x === "string" && allowed.includes(x)))];
    if (hits.length) out[field] = hits.slice(0, 6);
  }
  let minPrice = num(raw.minPrice, 1, 1_000_000);
  let maxPrice = num(raw.maxPrice, 1, 1_000_000);
  if (minPrice && maxPrice && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  if (minPrice) out.minPrice = minPrice;
  if (maxPrice) out.maxPrice = maxPrice;
  const maxWeight = num(raw.maxWeight, 3, 80);
  if (maxWeight) out.maxWeight = maxWeight;
  const batteryMin = num(raw.batteryMin, 100, 2000);
  if (batteryMin) out.batteryMin = batteryMin;
  if (raw.sellerType === "dealer" || raw.sellerType === "private") out.sellerType = raw.sellerType;
  if (raw.electronicShifting === true) out.electronicShifting = true;
  const text = (v: unknown, max: number) =>
    typeof v === "string" ? v.replace(/[<>{}"]/g, "").trim().slice(0, max) : "";
  const city = text(raw.city, 40);
  if (city) out.city = city;
  const search = text(raw.search, 40);
  if (search) out.search = search;
  return out;
}

// Ord der står i næsten alle annoncer og derfor ikke kan sortere noget.
const STOP_WORDS = new Set(["cykel", "cykler", "foran", "bagpå", "med", "uden", "god", "pæn", "fin", "billig", "sælges", "gerne", "stand"]);

/** Sorteringsord: korte, rene ord. Ord der allerede er et filter, smides væk. */
export function sanitizeKeywords(raw: unknown, filters: Record<string, unknown>): string[] {
  if (!Array.isArray(raw)) return [];
  const used = JSON.stringify(filters).toLowerCase();
  const words = raw
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.toLowerCase().replace(/[^a-zæøåäöüé0-9 -]/g, "").trim().slice(0, 25))
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !used.includes(w));
  return [...new Set(words)].slice(0, 5);
}

/* Dame/herre er det mest almindelige hverdagsord og må ikke afhænge af om
   modellen husker reglen. Står ordet i teksten og er indstigning ikke sat,
   sættes den her. Gælder kun hele ord ("damecykel", ikke "madame"). */
export function addStepTypeFromWords(text: string, filters: Record<string, unknown>) {
  if (filters.stepTypes) return;
  const t = text.toLowerCase();
  const dame  = /(^|[^a-zæøå])(dame|pige)/.test(t);
  const herre = /(^|[^a-zæøå])(herre|dreng)/.test(t);
  if (dame && !herre)  filters.stepTypes = ["Lav indstigning"];
  if (herre && !dame)  filters.stepTypes = ["Høj indstigning"];
}

/** Modellens rå tekstsvar + brugerens tekst → det frontenden får. */
export function parseReply(reply: string, text: string): { filters: Record<string, unknown>; keywords: string[] } {
  const match = reply.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  try { parsed = match ? JSON.parse(match[0]) : {}; } catch { parsed = {}; }
  const filters = sanitize(parsed);
  addStepTypeFromWords(text, filters);
  return { filters, keywords: sanitizeKeywords(parsed.keywords, filters) };
}

/* Teksten gemmes i smart_search_logs for at se hvad smart søgning tager fejl
   af. Den er anonym (ingen IP, ingen bruger), men nogen skriver måske en
   e-mail eller et telefonnummer i feltet. Det har vi ikke brug for, så det
   fjernes før gemning. */
export function redactForLog(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[e-mail]")
    .replace(/(\+?\d[\d\s-]{6,}\d)/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[nummer]" : m))
    .slice(0, 300);
}

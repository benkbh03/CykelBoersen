/* Fakta-linjen på annoncekort: "Shimano Ultegra · 2021 · Str. 56 cm".
   Cykeltypen var første led, men den siger mindst: brugeren har som regel
   allerede valgt typen i søgningen. Groupset (racer/gravel/MTB) og motor
   (el-cykel) er det en køber sorterer efter. Mangler begge, står typen.
   Ligger i sin egen fil frem for i utils.js: en ny eksport i et eksisterende
   modul kan møde en cachet gammel udgave og vælte siden (se CLAUDE.md). */
import { bikeMetaFacts } from './utils.js';

// Sælgere skriver ofte kun "105" eller "Ultegra". Vis mærket med, så linjen
// kan læses af en der ikke kender Shimanos navne.
const SHIMANO_BARE = /^(105|ultegra|dura-ace|grx|deore|xt|xtr|slx|tiagra|sora|claris|cues)\b/i;

export function bikeSpec(b) {
  if (!b) return '';
  const isEbike = b.type === 'El-cykel' || !!b.motor;
  if (isEbike && b.motor) return String(b.motor).trim();
  const g = b.groupset ? String(b.groupset).trim() : '';
  if (g) return SHIMANO_BARE.test(g) ? `Shimano ${g}` : g;
  return '';
}

export function cardFacts(b) {
  return [bikeSpec(b) || b?.type, ...bikeMetaFacts(b)].filter(Boolean);
}

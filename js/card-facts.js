/* Faktalinjen på annoncekort MED stand først: "Ny · Citybike · 2026 · Grøn".
   Standen stod før som en mørk mærkat oven på kortbilledet (31. okt.). Når
   næsten alle kort på forsiden er nye cykler fra samme forhandler, var det
   en række ens mørke klodser oven på produktfotos, og forsiden så tung ud.
   Som tekst er den stadig det første man læser under prisen.
   Egen fil frem for en ny eksport i card-spec.js: en ny eksport i et
   eksisterende modul kan møde en cachet gammel udgave (se CLAUDE.md). */
import { cardFacts } from './card-spec.js';

export function cardFactsWithCondition(b) {
  return [b?.condition, ...cardFacts(b)].filter(Boolean);
}

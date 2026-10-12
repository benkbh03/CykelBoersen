/* seller-mix.js — bland sælgerne i "Nyeste først"

   En forhandler der lægger 50 cykler op på én dag, fyldte hele første side,
   og en køber så ikke ét privat salg før langt nede. Her flyttes kortene
   inden for den hentede side, så højst MAX_PER_WINDOW af hver WINDOW kort
   kommer fra samme sælger. Rækkefølgen er ellers uændret: hvert kort er det
   nyeste der må stå på pladsen. Er der kun én sælger tilbage, kommer resten
   i den oprindelige rækkefølge.

   Egen fil (ikke utils.js): en ny eksport i et eksisterende modul kan møde
   en cachet gammel udgave hos besøgende, se CLAUDE.md. */

const WINDOW = 6;
const MAX_PER_WINDOW = 2;

export function mixSellers(bikes) {
  if (!Array.isArray(bikes) || bikes.length < 3) return bikes;
  const rest = bikes.slice();
  const out = [];
  while (rest.length) {
    const recent = out.slice(-(WINDOW - 1));
    let i = rest.findIndex(b =>
      recent.filter(r => r.user_id === b.user_id).length < MAX_PER_WINDOW);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

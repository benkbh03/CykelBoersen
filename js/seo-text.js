/* Titler og meta-descriptions der skal stå ens i appen (updateSEOMeta ved
   routing) og i de prerendrede sider (scripts/prerender.mjs). Før stod de
   som kopier begge steder og drev fra hinanden: /forhandlere/ viste et tal
   i den prerendrede udgave og en anden tekst i appen.

   Regler for descriptions: højst 160 tegn, ingen afkortning midt i et ord,
   ingen tal der ændrer sig (antal forhandlere, mærker, annoncer). Titler
   skrives med stort kun i første ord og egennavne.

   Ny fil med vilje: statiske imports har ingen ?v= i URL'en, så en ny eksport
   i en eksisterende fil kan møde en cachet gammel udgave (se CLAUDE.md). */

export const HOME_TITLE = 'Cykelbørsen – køb og sælg nye og brugte cykler';
export const HOME_DESC  = 'Markedsplads kun for cykler. Køb og sælg racercykler, mountainbikes, el-cykler og ladcykler fra private og cykelhandlere i Danmark. Gratis at sætte til salg.';

export const BLOG_TITLE = 'Blog: guides til køb og salg af cykler | Cykelbørsen';
export const BLOG_DESC  = 'Guides til at købe og sælge brugte cykler: størrelse, el-cykler, billeder og sikker handel.';

export const BRANDS_DESC = 'Find brugte og nye cykler efter mærke, fra Trek og Cube til Christiania Bikes og Brompton.';

export const DEALERS_DESC = 'Verificerede cykelforhandlere på Cykelbørsen. Se deres cykler og hvor butikken ligger.';

export const BECOME_DEALER_TITLE = 'Bliv forhandler på Cykelbørsen – gratis at komme i gang';
export const BECOME_DEALER_DESC  = 'Opret en butiksprofil på Cykelbørsen og sæt jeres cykler til salg. Gratis at oprette. Ingen binding.';

export function brandTitle(name) {
  return `Brugte og nye ${name}-cykler til salg | Cykelbørsen`;
}

export function brandDescription(name) {
  return `Brugte og nye ${name}-cykler til salg på Cykelbørsen. Filtrér på type, størrelse og pris.`;
}

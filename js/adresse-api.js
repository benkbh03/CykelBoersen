// Adresseopslag (autocomplete, adressevask, postnumre).
//
// DAWA (api.dataforsyningen.dk) lukkede 1. oktober 2026 og svarer nu 410 Gone
// på alt. Det gav "Ingen adresser fundet" på hver eneste adresse. Statens
// afløser, Datafordeleren, kræver en virksomhedsaftale og login, og kan ikke
// kaldes fra en browser uden at nøglen ligger synligt i koden.
//
// companydata.dk kører en kopi af DAWA's API med de samme stier, parametre og
// JSON, og med data fra Danmarks Adresseregister (DAR), opdateret hver nat.
// Uden nøgle: 60 kald i minuttet og 2.000 om dagen pr. IP-adresse. Kaldene
// sendes fra den besøgendes browser, så loftet gælder pr. besøgende.
//
// Skal udbyderen skiftes, er det her og i CSP'ens connect-src i index.html.
// /steder (stednavne) findes ikke hos companydata.dk.
export const ADRESSE_API = 'https://dawa.companydata.dk';

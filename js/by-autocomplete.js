// Flyttet til adresse-autocomplete.js (18. okt.), da adressefeltet skiftede fra
// den lukkede DAWA til companydata.dk. En statisk import har ingen ?v= i
// adressen, så en browser med den gamle by-autocomplete.js i cachen ville blive
// ved med at spørge DAWA. Nyt filnavn = ingen gammel udgave i nogen cache.
// Filen bliver stående, så en cachet main.js der importerer det gamle navn,
// ikke får en 404. Slet efter 15. nov.
export * from './adresse-autocomplete.js';

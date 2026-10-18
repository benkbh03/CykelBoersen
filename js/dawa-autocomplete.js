// Flyttet til by-autocomplete.js (11. okt.). Filen bliver stående et par uger,
// så en main.js der ligger i en browsers cache og stadig importerer det gamle
// navn, ikke får en 404 og tager hele siden med sig. Slet efter 1. nov.
export * from './adresse-autocomplete.js';

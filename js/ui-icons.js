/* ============================================================
   UI-IKONER DER AFLØSER EMOJI (Lucide: lightbulb, search, cookie)
   + pladsholder til annoncekort uden billede.

   HVORFOR EN EGEN FIL og ikke i utils.js ved siden af de andre iconX():
   statiske imports (`from './utils.js'`) har INGEN cache-version i URL'en.
   Da disse eksporter blev lagt i utils.js, hentede nye main.js?v=… en
   gammel, cachet utils.js uden dem → "does not provide an export named
   'iconSearch'" → hele appen død indtil cachen udløb. En ny fil har ingen
   gammel udgave i nogen cache. Se CLAUDE.md, "Mønstre set mere end én gang".
   ============================================================ */
import { iconBike } from './utils.js';

const _svg = (paths, size = 13) => {
  const sw = size >= 28 ? 1.5 : size >= 20 ? 1.75 : 2;
  const va = size <= 16 ? 'vertical-align:-2px;' : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="${va}" aria-hidden="true">${paths}</svg>`;
};

export const iconBulb   = (s) => _svg('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>', s);
export const iconSearch = (s) => _svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', s);
export const iconCookie = (s) => _svg('<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>', s);

/* Pladsholder til annoncekort uden billede. Én funktion til alle kort-
   renderere. Styles i .no-image (02-listings.css). */
export const noImagePlaceholder = () =>
  `<div class="no-image" role="img" aria-label="Intet billede">${iconBike(40)}<span>Intet billede</span></div>`;

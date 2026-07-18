/* ============================================================
   UDLEJNING — delte konstanter
   ============================================================ */

// Samme kanoniske cykeltyper som salg (index.html type-filter).
export const RENTAL_TYPES = [
  'Racercykel', 'Mountainbike', 'El-cykel', 'Citybike',
  'Gravel', 'Ladcykel', 'Børnecykel',
];

// Platform-kommission på udlejnings-bookinger (bruges i Fase 2 checkout + vist til forhandler).
export const PLATFORM_FEE_PCT = 12;

// Grænser for lejeperiode (dage).
export const RENTAL_MIN_DAYS = 1;
export const RENTAL_MAX_DAYS = 90;

/* ============================================================
   SÆLG-SUBMIT — læs, tjek og byg annoncen (ingen sideeffekter)
   ============================================================
   submitSellPage() i js/sell-page.js var 240 linjer der både læste
   ~30 felter, validerede, valgte oprettelsesvej og sendte
   notifikationer. Delene uden sideeffekter ligger her, så de kan
   læses og afprøves for sig:

     readBikeForm(getVal, ctx) → form   (rå feltværdier → typede værdier)
     validateBikeForm(form)    → besked eller null
     buildBikeRow(form, userId)→ rækken til bikes

   Selve oprettelsen (insert / admin-create-bike, billeder,
   notifikationer) bliver i sell-page.js.
   ============================================================ */

import { bikeTitle } from './utils.js';
import { cleanText } from './ai-suggestion-clean.js';

// Cykeltyper hvor affjedring giver mening (hardtail/fully)
const SUSPENSION_TYPES = ['Mountainbike', 'Gravel', 'El-cykel'];

/* Admin der opretter på vegne af en forhandler (sessionStorage-flag).
   Læses ét sted: før stod den samme parse tre gange i submitSellPage
   under tre navne. */
export function readActingAs() {
  try {
    const raw = sessionStorage.getItem('_adminActingAs');
    return raw ? (JSON.parse(raw) || null) : null;
  } catch { return null; }
}

/* ctx.isDealerListing: forhandler, eller admin på vegne af en. Styrer
   gave (kun private), webshop-link og før-pris (kun forhandlere). */
export function readBikeForm(getVal, { colors = [], upgrades = [], isDealerListing = false } = {}) {
  const type = getVal('sell-type');
  const giveaway = !isDealerListing && getVal('sell-giveaway') === '1';

  const electronicRaw = getVal('sell-electronic-shifting');
  const weightKgRaw   = getVal('sell-weight-kg');
  const isEbike       = type === 'El-cykel';
  const batteryWhRaw  = getVal('sell-battery-wh');

  return {
    // "null"/"undefined" som tekst er aldrig et mærke eller en model.
    brand:     cleanText(getVal('sell-brand')) || '',
    model:     cleanText(getVal('sell-model')) || '',
    giveaway,
    price:     giveaway ? 0 : parseInt(getVal('sell-price')),
    year:      parseInt(getVal('sell-year')) || null,
    city:      getVal('sell-city'),
    desc:      getVal('sell-desc'),
    type,
    size:      getVal('sell-size') || null,
    sizeCm:    parseInt(getVal('sell-size-cm')) || null,
    condition: getVal('sell-condition'),
    wheelSize: getVal('sell-wheel-size') || null,
    warranty:  getVal('sell-warranty') || null,
    externalUrl: (isDealerListing ? (getVal('sell-external-url') || '').trim() : '') || null,
    // Forhandler-valgfri før-pris (vejl. udsalgspris) → driver rabatbadge.
    origPrice: isDealerListing ? (parseInt(getVal('sell-original-price')) || null) : null,
    // Valgfrit stelnr. Vises som "oplyst", tjekkes IKKE (opslaget er fjernet)
    frameNumber: getVal('sell-frame-number'),
    colors,

    groupset:        getVal('sell-groupset') || null,
    frameMaterial:   getVal('sell-frame-material') || null,
    brakeType:       getVal('sell-brake-type') || null,
    electronicShift: electronicRaw === 'true' ? true : (electronicRaw === 'false' ? false : null),
    weightKg:        weightKgRaw ? parseFloat(weightKgRaw) : null,

    // El-cykel-felter (kun relevante når type = El-cykel)
    motor:         isEbike ? (getVal('sell-motor') || null) : null,
    motorPosition: isEbike ? (getVal('sell-motor-position') || null) : null,
    batteryWh:     isEbike && batteryWhRaw ? (parseInt(batteryWhRaw) || null) : null,

    suspension: SUSPENSION_TYPES.includes(type) ? (getVal('sell-suspension') || null) : null,
    geartype:   getVal('sell-geartype') || null,
    stepType:   getVal('sell-step-type') || null,
    upgrades,
  };
}

export function validateBikeForm(form) {
  const { brand, city, type, condition, giveaway, price } = form;
  // !price ville også afvise en gave, fordi 0 er falsy. Derfor tjekkes
  // prisen kun når annoncen ikke er en gave.
  if (!brand || !city || !type || !condition || (!giveaway && !price)) {
    return 'Udfyld alle påkrævede felter (*)';
  }
  if (!giveaway && (!Number.isFinite(price) || price < 1 || price > 9999999)) {
    return 'Angiv en gyldig pris mellem 1 og 9.999.999 kr.';
  }
  return null;
}

export function buildBikeRow(form, userId) {
  const f = form;
  const row = {
    user_id: userId,
    brand: f.brand, model: f.model, price: f.price, year: f.year, city: f.city,
    is_giveaway: f.giveaway,
    // En gave har hverken pris eller førpris, ellers ville kortet vise et
    // falsk prisfald ("Spar 5.999 kr.") på noget der er gratis. Ellers:
    // forhandlerens før-pris hvis højere, ellers pris-snapshot (driver
    // "Reduceret fra X"-mærket).
    original_price: f.giveaway ? 0 : ((f.origPrice && f.origPrice > f.price) ? f.origPrice : f.price),
    description: f.desc || null,
    type: f.type, size: f.size || null, size_cm: f.sizeCm, condition: f.condition,
    wheel_size: f.wheelSize || null,
    warranty: f.warranty || null,
    external_url: f.externalUrl,
    color: f.colors.length ? f.colors.join(', ') : null,
    colors: f.colors.length ? f.colors : null,
    title: bikeTitle(f.brand, f.model),
    is_active: true,
    groupset:            f.groupset,
    frame_material:      f.frameMaterial,
    brake_type:          f.brakeType,
    electronic_shifting: f.electronicShift,
    weight_kg:           !isNaN(f.weightKg) ? f.weightKg : null,
    motor:               f.motor,
    motor_position:      f.motorPosition,
    battery_wh:          f.batteryWh,
    suspension:          f.suspension,
    geartype:            f.geartype,
    step_type:           f.stepType,
  };
  // Kun med når der er noget: så virker oprettelse uden opgraderinger
  // også før add_bike_upgrades.sql er kørt.
  if (f.upgrades.length) row.upgrades = f.upgrades;
  return row;
}

/* ============================================================
   OPGRADERINGER: dele sælgeren har skiftet siden købet
   ============================================================
   En brugt racer, gravel eller MTB er sjældent som den kom fra fabrikken.
   Sælgeren skriver hver opgradering som én række (del, mærke/model, pris),
   og annoncen viser listen ved prisen med en sum. Så kan køberen se hvad
   prisen dækker over i stedet for at afskrive cyklen som for dyr.

   Ét modul til både sælg-flowet, redigér-modalen og annoncesiden, så
   reglerne (antal, længder, pris) kun står ét sted i frontenden. Databasen
   håndhæver de samme grænser (supabase/sql/add_bike_upgrades.sql).
   ============================================================ */

import { esc } from './utils.js';

// Typer hvor sektionen står åben fra start. For de andre typer er den en
// enkelt "Tilføj opgradering"-knap.
export const UPGRADE_PROMINENT_TYPES = ['Racercykel', 'Mountainbike', 'Gravel'];

export const UPGRADES_MAX = 15;
const PART_MAX  = 40;
const NAME_MAX  = 80;
const PRICE_MAX = 200000;

// Forslag til "Del"-feltet. Fri tekst er tilladt.
const PARTS_HINT = [
  'Hjul', 'Dæk', 'Gear', 'Kranksæt', 'Kassette', 'Powermeter', 'Pedaler',
  'Sadel', 'Sadelpind', 'Dropper post', 'Styr', 'Frempind', 'Bremser',
  'Forgaffel', 'Støddæmper', 'Cykelcomputer', 'Lygter', 'Andet',
];

const fmtKr = n => `${Number(n).toLocaleString('da-DK')} kr.`;

/* Rens en liste fra formular eller database. Rækker uden mærke/model
   kasseres, og priser uden for grænsen bliver til null frem for en fejl. */
export function normalizeUpgrades(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name ?? '').trim().slice(0, NAME_MAX);
    if (!name) continue;
    const part = String(r.part ?? '').trim().slice(0, PART_MAX);
    const p = parseInt(String(r.price ?? '').replace(/[^\d]/g, ''), 10);
    const price = Number.isFinite(p) && p >= 0 && p <= PRICE_MAX ? p : null;
    out.push({ part: part || null, name, price });
    if (out.length >= UPGRADES_MAX) break;
  }
  return out;
}

export function upgradesTotal(list) {
  return (list || []).reduce((s, u) => s + (Number.isFinite(u.price) ? u.price : 0), 0);
}

/* ── Visning på annoncesiden ───────────────────────────────── */

export function upgradesDisplayHTML(raw) {
  const list = normalizeUpgrades(raw);
  if (!list.length) return '';
  const total = upgradesTotal(list);
  const rows = list.map(u => `
      <li class="bike-upgrades-row">
        <span class="bike-upgrades-what">${u.part ? `<span class="bike-upgrades-part">${esc(u.part)}</span>` : ''}${esc(u.name)}</span>
        <span class="bike-upgrades-price">${u.price != null ? fmtKr(u.price) : ''}</span>
      </li>`).join('');
  return `
    <section class="bike-upgrades" aria-label="Opgraderinger">
      <div class="bike-upgrades-head">
        <span class="bike-upgrades-title">Opgraderet siden køb</span>
        ${total > 0 ? `<span class="bike-upgrades-total">${fmtKr(total)}</span>` : ''}
      </div>
      <ul class="bike-upgrades-list">${rows}</ul>
      <p class="bike-upgrades-note">Dele og priser er oplyst af sælger.</p>
    </section>`;
}

/* ── Editor (sælg-flow og redigér-modal) ───────────────────── */

const iconX = () => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function rowHTML(u, i) {
  return `
    <div class="upg-row" data-i="${i}">
      <input type="text" class="upg-part" placeholder="Del, fx Hjul" value="${esc(u.part || '')}" maxlength="${PART_MAX}" list="upg-parts-list" aria-label="Del">
      <input type="text" class="upg-name" placeholder="Mærke og model, fx DT Swiss ERC 1400" value="${esc(u.name || '')}" maxlength="${NAME_MAX}" aria-label="Mærke og model">
      <div class="upg-price-wrap">
        <input type="text" inputmode="numeric" class="upg-price" placeholder="Pris" value="${u.price != null && u.price !== '' ? esc(String(u.price)) : ''}" maxlength="7" aria-label="Pris i kroner">
        <span class="upg-suffix">kr.</span>
      </div>
      <button type="button" class="upg-remove" aria-label="Fjern opgradering">${iconX()}</button>
    </div>`;
}

/* Tegner editoren i `root` og holder styr på rækkerne.
   opts.initial   — liste fra cache/database
   opts.prominent — åben sektion med én tom række og forklaring
   opts.onChange  — kaldes med den rensede liste ved hver ændring
   Returnerer { get } der giver den rensede liste. */
export function mountUpgradesEditor(root, { initial = [], prominent = false, onChange } = {}) {
  if (!root) return { get: () => [] };
  // Rå rækker (også halvt udfyldte), så en tom række ikke forsvinder mens man skriver.
  let rows = (Array.isArray(initial) ? initial : []).map(u => ({
    part: u.part || '', name: u.name || '', price: u.price ?? '',
  }));
  if (!rows.length && prominent) rows = [{ part: '', name: '', price: '' }];

  const clean = () => normalizeUpgrades(rows);

  // Redigér-modalen genbruger samme root; fjern lytterne fra sidste gang.
  root._upgAbort?.abort();
  const ac = new AbortController();
  root._upgAbort = ac;

  function renderTotal() {
    const el = root.querySelector('.upg-total');
    if (!el) return;
    const t = upgradesTotal(clean());
    el.textContent = t > 0 ? `Opgraderinger i alt: ${fmtKr(t)}` : '';
    el.hidden = !(t > 0);
  }

  function render() {
    const open = rows.length > 0;
    root.innerHTML = `
      <div class="upg-head">
        <div class="upg-title">Opgraderinger <span class="hint">valgfrit</span></div>
        <p class="upg-why">Har du skiftet hjul, gear eller andet siden købet? Skriv det her med prisen.
          Listen står ved prisen i annoncen, så køberen kan se hvad prisen dækker over.</p>
      </div>
      ${open ? `<div class="upg-rows">${rows.map(rowHTML).join('')}</div>` : ''}
      <datalist id="upg-parts-list">${PARTS_HINT.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      ${rows.length < UPGRADES_MAX ? `<button type="button" class="upg-add">${open ? 'Tilføj en til' : 'Tilføj opgradering'}</button>` : ''}
      <p class="upg-total" hidden></p>`;
    renderTotal();
  }

  function emit() {
    renderTotal();
    if (onChange) onChange(clean());
  }

  root.addEventListener('input', e => {
    const row = e.target.closest('.upg-row');
    if (!row) return;
    const r = rows[+row.dataset.i];
    if (!r) return;
    if (e.target.classList.contains('upg-name'))  r.name  = e.target.value;
    if (e.target.classList.contains('upg-part'))  r.part  = e.target.value;
    if (e.target.classList.contains('upg-price')) {
      // Kun cifre; "5.000" og "5000 kr" bliver til 5000.
      const digits = e.target.value.replace(/[^\d]/g, '');
      if (digits !== e.target.value) e.target.value = digits;
      r.price = digits;
    }
    emit();
  }, { signal: ac.signal });

  root.addEventListener('click', e => {
    if (e.target.closest('.upg-add')) {
      rows.push({ part: '', name: '', price: '' });
      render();
      root.querySelector('.upg-row:last-child .upg-part')?.focus();
      emit();
      return;
    }
    const rm = e.target.closest('.upg-remove');
    if (rm) {
      rows.splice(+rm.closest('.upg-row').dataset.i, 1);
      render();
      emit();
    }
  }, { signal: ac.signal });

  render();
  return { get: clean };
}

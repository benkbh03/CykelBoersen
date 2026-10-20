#!/usr/bin/env node
/**
 * Fejler hvis en migration i supabase/sql/ opretter en tabel i "public" uden
 * GRANTs og RLS i samme fil.
 *
 * Fra 30. oktober 2026 giver Supabase ikke længere nye tabeller i "public"
 * adgang til Data API'et af sig selv. En tabel uden GRANT svarer "permission
 * denied" til supabase-js, også til edge functions med service-nøglen. Fejlen
 * ses først når nogen bruger funktionen, så den fanges her i stedet.
 *
 * Reglen pr. ny tabel:
 *   - ALTER TABLE ... ENABLE ROW LEVEL SECURITY
 *   - mindst én GRANT til service_role (edge functions)
 *   - aldrig GRANT ALL til anon eller PUBLIC
 * anon og authenticated får kun det frontenden bruger, og kun bevidst.
 *
 * Tabeller der fandtes før 30. oktober har deres grants og er undtaget.
 *
 *   node scripts/check-sql-grants.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/sql';

// Alle tabeller i public på produktion 20. okt. 2026. De fik grants automatisk
// og skal ikke have dem skrevet ind bagefter. Tilføj aldrig en ny tabel her.
const LEGACY = new Set([
  'bike_images', 'bike_price_history', 'bike_views', 'bikes', 'boost_orders',
  'buy_requests', 'client_errors', 'contact_messages', 'dealer_feeds',
  'dealer_followers', 'free_boosts', 'messages', 'moderation_log',
  'price_drop_watches', 'profiles', 'rate_limits', 'rate_limits_anon',
  'rental_bookings', 'rental_item_images', 'rental_items', 'reviews',
  'saved_bikes', 'saved_searches', 'search_logs', 'sell_funnel_events',
  'trades', 'user_suspensions',
  // Engangs-sikkerhedskopier af profiles (RLS uden politikker = ingen adgang).
  'profiles_snapshot_20261013', 'profiles_address_removed_20261012',
  'profiles_phone_removed_20260901',
]);
// Sikkerhedskopierne er navngivet efter dato i filen; dæk også mønsteret.
const isLegacy = (t) => LEGACY.has(t) || /^profiles_(snapshot|\w+_removed)_/.test(t);

// Tabelnavnet med eller uden "public." og anførselstegn.
const tableRef = (t) => String.raw`(?:"?public"?\.)?"?${t}"?`;

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ');
}

const errors = [];
let checked = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = stripComments(readFileSync(join(DIR, file), 'utf8'));
  const created = new Set();
  const re = new RegExp(String.raw`create (?:unlogged )?table (?:if not exists )?((?:"?[a-z_]+"?\.)?)"?([a-z_][a-z0-9_]*)"?`, 'gi');
  for (const m of sql.matchAll(re)) {
    const schema = m[1].replace(/[".]/g, '').toLowerCase();
    if (schema && schema !== 'public') continue;
    created.add(m[2].toLowerCase());
  }

  for (const t of created) {
    if (isLegacy(t)) continue;
    checked++;
    const on = String.raw`on (?:table )?${tableRef(t)}\b`;
    const grants = [...sql.matchAll(new RegExp(String.raw`grant [^;]*? ${on} to ([^;]+);`, 'gi'))];
    const rls = new RegExp(String.raw`alter table (?:if exists )?(?:only )?${tableRef(t)} enable row level security`, 'i').test(sql);

    if (!rls) errors.push(`${file}: ${t} mangler "ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY"`);
    if (!grants.some((g) => /\bservice_role\b/i.test(g[1]))) {
      errors.push(`${file}: ${t} mangler en GRANT til service_role (edge functions får ellers "permission denied")`);
    }
    for (const g of grants) {
      if (/^grant all\b/i.test(g[0]) && /\b(anon|public)\b/i.test(g[1])) {
        errors.push(`${file}: ${t} giver GRANT ALL til anon/PUBLIC. Giv kun de rettigheder frontenden bruger`);
      }
    }
  }
}

if (errors.length) {
  console.error('Nye tabeller uden grants eller RLS:\n  ' + errors.join('\n  '));
  console.error('\nSe "Nye tabeller: GRANT i samme fil" i CLAUDE.md.');
  process.exit(1);
}
console.log(`SQL-grants OK (${checked} nye tabeller tjekket, ${LEGACY.size} ældre undtaget).`);

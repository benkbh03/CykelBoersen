# Aktuelle RLS-politikker — facitliste

**Øjebliksbillede: 4. september 2026.** Verificeret mod databasen, ikke udledt af migrationerne.

## Hvorfor denne fil findes

Migrationerne i `supabase/sql/` er **ikke** kilden til sandhed om adgangskontrol. En stor del af politikkerne blev oprettet direkte i Supabase Dashboard før denne mappe eksisterede, og de findes derfor ikke i nogen fil. Stikprøve 2. september: seks ud af syv politikker fandtes kun i databasen.

Konsekvensen er, at man ikke kan afgøre om en tabel er beskyttet ved at læse repoet. Læser man `supabase/sql/` og ikke finder nogen SELECT-politik på `profiles`, kan man konkludere enten "ingen politik, altså lukket" eller "ingen politik, altså åben". Begge er forkerte.

Denne fil er øjebliksbilledet af hvad databasen faktisk håndhæver.

## To ting den IKKE dækker

**1. Kolonne-rettigheder.** `pg_policies` viser kun rækkeadgang. To huller er lukket med `REVOKE`/`GRANT` på kolonneniveau i stedet for med politikker, fordi RLS ikke kan begrænse kolonner (se `harden_messages_and_reviews.sql`):

- `messages` UPDATE ser ud til at mangle `WITH CHECK`, men modtageren kan kun ændre kolonnen `read`
- `reviews` UPDATE ser ud til at mangle `WITH CHECK`, men anmelderen kan kun ændre `rating` og `comment`

**Uden den viden vil enhver gennemgang rapportere de to som huller.** De er det ikke. Kør forespørgslen under "Kolonne-rettigheder" nedenfor for at se det aktuelle billede.

**2. Triggere.** Tre politikker ser løsere ud end de er:

- `profiles` INSERT tjekker kun `auth.uid() = id` og siger intet om kolonnerne. `protect_privileged_profile_columns` (nu `BEFORE INSERT OR UPDATE`) tvinger `is_admin`, `verified`, `id_verified` og Stripe-kolonnerne ned ved INSERT, og blokerer ændring af dem ved UPDATE. **Var `BEFORE UPDATE` alene indtil 3. september, hvor en ny konto kunne indsætte sin egen række med `is_admin = true`.**
- `profiles` UPDATE ser løs ud af samme grund; samme trigger dækker den.
- `reviews` INSERT tjekker kun `reviewer_id`. `require_trade_before_review` kræver at der findes en accepteret-besked mellem parterne. Forbeholdet står i `harden_profile_insert_and_reviews.sql`: en angriber kan selv sende sådan en besked, så det hæver barren uden at lukke den.
- `strip_private_phone` nulstiller `phone` på ikke-forhandlere.

Bekræft dem med:

```sql
SELECT tgname, tgrelid::regclass AS tabel,
       CASE WHEN (tgtype & 2) > 0 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
       concat_ws(' OR ',
         CASE WHEN (tgtype & 4)  > 0 THEN 'INSERT' END,
         CASE WHEN (tgtype & 8)  > 0 THEN 'DELETE' END,
         CASE WHEN (tgtype & 16) > 0 THEN 'UPDATE' END) AS haendelser
FROM pg_trigger WHERE NOT tgisinternal
  AND tgrelid IN ('public.profiles'::regclass, 'public.reviews'::regclass);
```

Bekræftet 3. september: `protect_profile_columns` og `strip_private_phone` står som `BEFORE INSERT OR UPDATE`, `require_trade_before_review` som `BEFORE INSERT`.

## Sådan opdateres filen

Kør i Supabase Dashboard → SQL Editor, og erstat tabellen nedenfor med resultatet:

```sql
SELECT c.relname AS tabel, c.relrowsecurity AS rls, p.policyname, p.cmd,
       p.roles::text AS roller,
       replace(COALESCE(p.qual, '-'), E'\n', ' ')       AS using_udtryk,
       replace(COALESCE(p.with_check, '-'), E'\n', ' ') AS with_check_udtryk
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname, p.cmd, p.policyname;
```

### Storage-politikker

`pg_policies` med `schemaname = 'public'` viser IKKE buckets. De ligger i
`storage`-skemaet og skal hentes for sig:

```sql
SELECT policyname, cmd, roles::text,
       replace(COALESCE(qual, '-'), E'\n', ' ')       AS using_udtryk,
       replace(COALESCE(with_check, '-'), E'\n', ' ') AS with_check_udtryk
FROM pg_policies WHERE schemaname = 'storage'
ORDER BY policyname;
```

Tre buckets i drift: `bike-images` (offentlig læsning), `avatars` (offentlig
læsning, skrivning låst til `<bruger-id>/`) og `id-documents` (kun ejer og
admin).

### Kolonne-rettigheder

```sql
SELECT table_name, grantee, column_name
FROM information_schema.column_privileges
WHERE table_schema  = 'public'
  AND table_name    IN ('messages', 'reviews')
  AND grantee       IN ('anon', 'authenticated')
  AND privilege_type = 'UPDATE'
ORDER BY table_name, grantee, column_name;
```

Forventet resultat, og intet andet:

| table_name | grantee | column_name |
|---|---|---|
| messages | authenticated | read |
| reviews | authenticated | comment |
| reviews | authenticated | rating |

Står der flere kolonner, eller er resultatet tomt, er kolonne-GRANT'en fra `harden_messages_and_reviews.sql` ikke i kraft, og så **er** de to UPDATE-politikker reelt huller.

**Kørt og bekræftet 2. september 2026:** resultatet var nøjagtig de tre rækker ovenfor. Kolonne-begrænsningen er altså i kraft, ikke bare skrevet.

---

## Forkortelser brugt nedenfor

- `ER_ADMIN` = `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)`
- `EJER_AF_BIKE` = `auth.uid() = (SELECT bikes.user_id FROM bikes WHERE bikes.id = <denne tabel>.bike_id)`

## Politikker

| Tabel | Cmd | Politik | Roller | USING | WITH CHECK |
|---|---|---|---|---|---|
| bike_images | DELETE | Users can delete their own bike images | authenticated | `EJER_AF_BIKE` | – |
| bike_images | INSERT | Kun ejer kan tilføje billeder | public | – | `EJER_AF_BIKE` |
| bike_images | SELECT | Alle kan se billeder | public | `true` | – |
| bike_images | SELECT | bike_images_admin_select_all | public | `ER_ADMIN` | – |
| bike_images | UPDATE | Users can update their own bike images | authenticated | `EJER_AF_BIKE` | `EJER_AF_BIKE` |
| bike_price_history | SELECT | Anyone can read history for active bikes | public | `EXISTS (bikes WHERE id = bike_id AND is_active)` | – |
| bike_price_history | SELECT | Service role can read all price history | **service_role** | `true` | – |
| bike_views | SELECT | bike_views_select_admin | public | `ER_ADMIN` | – |
| bikes | DELETE | Kun ejer kan slette annonce | public | `auth.uid() = user_id` | – |
| bikes | INSERT | bikes_insert_verified_only | public | – | `auth.uid() = user_id AND (seller_type <> 'dealer' OR verified)` |
| bikes | SELECT | Alle kan se aktive annoncer | public | `is_active OR auth.uid() = user_id` | – |
| bikes | SELECT | bikes_admin_select_all | public | `ER_ADMIN` | – |
| bikes | UPDATE | Kun ejer kan redigere annonce | public | `auth.uid() = user_id` | `auth.uid() = user_id` |
| boost_orders | – | *(ingen politikker)* | – | – | – |
| client_errors | INSERT | client_errors_insert | public | – | `true` |
| client_errors | SELECT | client_errors_select_admin | public | `ER_ADMIN` | – |
| contact_messages | INSERT | Alle kan sende kontaktbesked | public | – | `true` |
| contact_messages | SELECT | Kun admins kan læse kontaktbeskeder | public | `ER_ADMIN` | – |
| dealer_feeds | ALL | dealer_feeds_admin_all | public | `ER_ADMIN` | `ER_ADMIN` |
| dealer_feeds | SELECT | dealer_feeds_owner_read | public | `user_id = auth.uid()` | – |
| dealer_followers | DELETE | dealer_followers_delete_self | public | `auth.uid() = user_id` | – |
| dealer_followers | INSERT | dealer_followers_insert_self | public | – | `auth.uid() = user_id` |
| dealer_followers | SELECT | dealer_followers_select_self | public | `auth.uid() = user_id OR auth.uid() = dealer_id` | – |
| free_boosts | – | *(ingen politikker)* | – | – | – |
| messages | INSERT | Indlogget bruger kan sende besked | public | – | `auth.uid() = sender_id` |
| messages | SELECT | Kun afsender og modtager kan se beskeder | public | `auth.uid() = sender_id OR auth.uid() = receiver_id` | – |
| messages | UPDATE | Modtager kan markere som læst | public | `auth.uid() = receiver_id` | – ¹ |
| price_drop_watches | DELETE | Users can delete own price-drop watches | public | `auth.uid() = user_id` | – |
| price_drop_watches | INSERT | Users can insert own price-drop watches | public | – | `auth.uid() = user_id` |
| price_drop_watches | SELECT | Users can read own price-drop watches | public | `auth.uid() = user_id` | – |
| price_drop_watches | SELECT | Service role can read all watches | **service_role** | `true` | – |
| price_drop_watches | UPDATE | Service role can update notification timestamp | **service_role** | `true` | – |
| profiles | INSERT | Kun ejer kan indsætte profil | public | – | `auth.uid() = id` |
| profiles | SELECT | Alle kan se profiler | public | `true` ² | – |
| profiles | UPDATE | Ejer eller admin kan opdatere profil | public | `auth.uid() = id OR ER_ADMIN` | – ³ |
| profiles_phone_removed_20260901 | – | *(ingen politikker — bevidst)* | – | – | – |
| rate_limits | – | *(ingen politikker — bevidst)* | – | – | – |
| rental_bookings | SELECT | rental_bookings_select | public | `renter_id = auth.uid() OR dealer_id = auth.uid()` | – |
| rental_item_images | DELETE | rental_item_images_delete | public | `EXISTS (rental_items WHERE id = item_id AND dealer_id = auth.uid())` | – |
| rental_item_images | INSERT | rental_item_images_insert | public | – | `EXISTS (rental_items WHERE id = item_id AND dealer_id = auth.uid())` |
| rental_item_images | SELECT | rental_item_images_select | public | `true` | – |
| rental_items | DELETE | rental_items_delete | public | `dealer_id = auth.uid()` | – |
| rental_items | INSERT | rental_items_insert | public | – | `dealer_id = auth.uid() AND seller_type = 'dealer' AND verified = true` |
| rental_items | SELECT | rental_items_select | public | `is_active OR dealer_id = auth.uid()` | – |
| rental_items | UPDATE | rental_items_update | public | `dealer_id = auth.uid()` | `dealer_id = auth.uid()` |
| reviews | INSERT | Indlogget bruger kan indsætte | public | – | `auth.uid() = reviewer_id` ⁴ |
| reviews | SELECT | Alle kan se vurderinger | public | `true` | – |
| reviews | UPDATE | Bruger kan opdatere egne | public | `auth.uid() = reviewer_id` | – ¹ |
| saved_bikes | DELETE | Bruger kan slette eget save | public | `auth.uid() = user_id` | – |
| saved_bikes | DELETE | Kun ejer kan fjerne gemte annoncer ⁵ | public | `auth.uid() = user_id` | – |
| saved_bikes | INSERT | Bruger kan indsætte eget save | public | – | `auth.uid() = user_id` |
| saved_bikes | INSERT | Kun ejer kan gemme annoncer ⁵ | public | – | `auth.uid() = user_id` |
| saved_bikes | SELECT | Bruger kan se egne saves | public | `auth.uid() = user_id` | – |
| saved_bikes | SELECT | Kun ejer kan se gemte annoncer ⁵ | public | `auth.uid() = user_id` | – |
| saved_bikes | SELECT | Ejer af bike kan se interesserede | public | `EXISTS (bikes WHERE id = bike_id AND user_id = auth.uid())` | – |
| saved_searches | ALL | Users manage own saved searches | public | `auth.uid() = user_id` | – ⁶ |
| search_logs | INSERT | search_logs_insert | public | – | `true` |
| search_logs | SELECT | search_logs_select_admin | public | `ER_ADMIN` | – |
| sell_funnel_events | INSERT | sell_funnel_insert | public | – | `true` |
| sell_funnel_events | SELECT | sell_funnel_select_admin | public | `ER_ADMIN` | – |

**RLS er slået til på samtlige tabeller.**

### Noter

1. **Ikke et hul.** For UPDATE genbruger Postgres `USING` som `WITH CHECK` når sidstnævnte mangler, så rækken kan ikke gives videre til en anden. Kolonneadgangen er begrænset med `GRANT` i stedet — se afsnittet om kolonne-rettigheder øverst.
2. **Kendt og accepteret.** Hele tabellen er læsbar med den offentlige anon-nøgle. Den eneste følsomme kolonne, `phone`, er fjernet for private profiler og håndhæves af triggeren `strip_private_phone`. Ændres skemaet med en ny følsom kolonne, bliver den offentlig samme dag.
3. Beskyttet af triggeren `protect_privileged_profile_columns`, ikke af politikken.
4. Ingen kontrol af at en handel har fundet sted. Begrænset af unik-indekset `reviews_unique_per_trade` og CHECK-constrainten `reviews_no_self_review`.
5. Dublet af den foregående politik. Politikker OR'es sammen, så det er harmløst, men to migrationer har lavet den samme regel under forskellige navne.
6. `FOR ALL` uden `WITH CHECK` er i orden: `USING` bruges også som check.

---

## Storage-politikker

Ligger i `storage`-skemaet, ikke i `public`, og kommer derfor ikke med i
forespørgslen ovenfor. Det var her det største ukendte lå indtil 3. september.

Forkortelse: `MAPPE1` = `(storage.foldername(name))[1]`, altså første led i
objektets sti.

| Bucket | Cmd | Politik | Roller | Udtryk |
|---|---|---|---|---|
| bike-images | SELECT | Public read | public | `bucket_id = 'bike-images'` |
| bike-images | INSERT | bike_images_insert_own | authenticated | `MAPPE1 = auth.uid()` **eller** `MAPPE1` er et annonce-id kalderen ejer |
| bike-images | DELETE | bike_images_delete_own | authenticated | samme betingelse |
| avatars | SELECT | Public can view avatars | public | `bucket_id = 'avatars'` |
| avatars | INSERT | Authenticated users can upload avatars | authenticated | `MAPPE1 = auth.uid()` |
| avatars | UPDATE | Users can update their own avatar | authenticated | `MAPPE1 = auth.uid()` |
| avatars | DELETE | Users can delete their own avatar | authenticated | `MAPPE1 = auth.uid()` |
| id-documents | SELECT | Users can view their own id-documents | authenticated | `MAPPE1 = auth.uid()` |
| id-documents | SELECT | Admins can view all id-documents | authenticated | `ER_ADMIN` |
| id-documents | INSERT | Authenticated users can upload id-documents | authenticated | `MAPPE1 = auth.uid()` |
| id-documents | DELETE | Users can delete their own id-documents | authenticated | `MAPPE1 = auth.uid()` |

### Tre ting værd at vide om bike-images

**Der er INGEN UPDATE-politik, og det er med vilje.** Alle fire upload-steder
bruger `upsert: false`, så ingen har brug for at overskrive en fil. Uden UPDATE
kan en angriber heller ikke overskrive en andens billede. Tilføjes en
UPDATE-politik senere, åbnes den dør.

**Den dobbelte betingelse er ikke slendrian.** Annoncebilleder ligger under
`<annonce-id>/…`, mens udlejnings- og admin-billeder ligger under
`<bruger-id>/rental/…` og `<bruger-id>/admin-onbehalf/…`. Havde politikken kun
accepteret bruger-id, ville alle eksisterende annoncebilleder være blevet
uslettelige; havde den kun accepteret annonce-id, ville de to andre stier være
faldet ud.

**Den tidligere tilstand var to fejl med samme rod:** `"Authenticated upload"`
tillod enhver indlogget at skrive hvor som helst i bucket'en, og
`"Owner delete"` krævede at første mappeled var brugerens id — hvad det aldrig
er for et annoncebillede, så DELETE virkede for ingen. Rettet i
`harden_bike_images_bucket.sql`, kørt og verificeret 4. september 2026.

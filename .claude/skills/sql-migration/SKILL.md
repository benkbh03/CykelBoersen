---
name: sql-migration
description: Genererer komplette og sikre SQL-migrationer til Supabase Postgres med proper RLS, indekser og backfill. Brug AUTOMATISK når brugeren beder om at tilføje/ændre kolonner eller tabeller (fx "tilføj X-kolonne", "ny tabel til Y", "schema-ændring"). Brug også når frontend-kode peger på en kolonne der ikke findes i db. Brug ikke til simple SELECTs eller engangs-data-fixes.
---

# SQL-migration (CykelBørsen)

## Formål
Sikre at hver schema-ændring deployes konsistent, idempotent og med korrekte sikkerhedspolicies. Lige nu bliver migrationer kørt manuelt i Supabase Dashboard → SQL Editor → Run, så scriptet SKAL kunne køres igen uden fejl.

## Standardstruktur for hver migration

Hver migration placeres i `supabase/sql/<beskrivende-navn>.sql` og skal indeholde:

### 1. Header-kommentar
```sql
-- ============================================================
-- <Kort beskrivelse af hvad migrationen gør>
-- ============================================================
-- <2-4 linjers forklaring af formål, hvad det driver i frontend>
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================
```

### 2. DDL (Data Definition Language)
ALTID brug `IF NOT EXISTS` / `IF EXISTS`:

For en ny kolonne:
```sql
ALTER TABLE <tabel>
  ADD COLUMN IF NOT EXISTS <kolonne> <type> DEFAULT NULL;
```

For en ny tabel:
```sql
CREATE TABLE IF NOT EXISTS <tabel> (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  <felter>    <type>      NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (<de naturlige nøgler>)
);
```

### 3. Backfill (NULLABLE kolonner)
Hvis kolonnen ikke har sensibel default, opdatér eksisterende rækker:
```sql
UPDATE <tabel>
  SET <ny_kolonne> = <fornuftig_default>
  WHERE <ny_kolonne> IS NULL;
```

### 4. Indekser
Tilføj `CREATE INDEX IF NOT EXISTS` på:
- Foreign keys (user_id, bike_id osv.)
- Kolonner brugt i WHERE-clauses i frontend-queries

```sql
CREATE INDEX IF NOT EXISTS idx_<tabel>_<kolonne> ON <tabel>(<kolonne>);
```

### 5. Row Level Security (KRITISK)
Aktivér RLS og opret policies:

```sql
ALTER TABLE <tabel> ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own rows" ON <tabel>;
CREATE POLICY "Users can read own rows"
  ON <tabel> FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own rows" ON <tabel>;
CREATE POLICY "Users can insert own rows"
  ON <tabel> FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Service role policies** hvis edge functions (notify-message osv.) skal kunne læse på tværs af brugere:
```sql
DROP POLICY IF EXISTS "Service role can read all" ON <tabel>;
CREATE POLICY "Service role can read all"
  ON <tabel> FOR SELECT
  TO service_role
  USING (true);
```

`DROP POLICY IF EXISTS` foran hver `CREATE POLICY` gør at re-kørsel ikke fejler.

## Tjekliste før migration leveres til brugeren

- [ ] Idempotent — kan køres flere gange uden fejl?
- [ ] RLS aktiveret hvis tabellen indeholder bruger-data?
- [ ] Backfill kører automatisk for eksisterende rækker?
- [ ] Indekser på foreign keys og frequent WHERE-kolonner?
- [ ] Header-kommentar forklarer FORMÅL, ikke bare hvad SQL'en gør?
- [ ] Tilsvarende frontend-kode (`select('..., ny_kolonne, ...')` osv.) er identificeret og opdateret?
- [ ] Hvis edge function bruger kolonnen, er den også opdateret?
- [ ] Brugeren får TYDELIG instruktion: "Kør X i Supabase Dashboard → SQL Editor FØR du hard-refresher"

## Eksempel-flow

Bruger siger: "Tilføj en kolonne `views_count` til bikes så vi kan vise hvor mange der har set annoncen"

Mine trin:
1. Lav `supabase/sql/add_views_count.sql` med ALTER TABLE + DEFAULT 0
2. Backfill alle eksisterende bikes til 0
3. Forklar brugeren: "Kør SQL'en i Supabase Dashboard FØR jeg push'er frontend-ændringer"
4. Tilføj `views_count` til SELECT-statements i `bikes-list.js`, `bike-detail.js`
5. Tilføj visning i bike-detail HTML (fx "👁 234 visninger")
6. Hvis der findes en `increment_bike_views(bike_id)` RPC, sikrer at den faktisk eksisterer

## ANTI-MØNSTRE — undgå

- ❌ `DROP TABLE` uden eksplicit godkendelse
- ❌ `ALTER COLUMN ... NOT NULL` uden backfill først
- ❌ Composite primary keys uden god grund
- ❌ Glemme RLS — defaulter til "ingen kan tilgå tabellen via anon key"
- ❌ Forudsætte at policies fra én tabel automatisk gælder på en ny
- ❌ Sende SQL der ikke kan re-køres (no IF EXISTS / DROP POLICY IF EXISTS)

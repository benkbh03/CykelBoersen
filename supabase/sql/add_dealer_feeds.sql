-- ============================================================
-- Forhandler-feed-synkronisering (FASE 2) — automatisk import fra webshop-feed
-- ============================================================
-- Bygger oven på add_dealer_feed_sync.sql (external_id, sold_at, reconcile RPC).
-- En forhandler-feed = en URL til forhandlerens produkt-feed (typisk Google
-- Shopping XML). Edge-functionen import-dealer-feed henter den, opretter/opdaterer
-- cykler (upsert på user_id+external_id) og deaktiverer udsolgte (reconcile).
--
-- Synkronisering sker:
--   1) automatisk hver nat via pg_cron → import-dealer-feed (run-all)
--   2) manuelt fra admin-panelet ("Synkronisér nu" / "Test feed")
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent — sikker at gentage.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Feed-konfiguration pr. forhandler
CREATE TABLE IF NOT EXISTS dealer_feeds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feed_url       text NOT NULL,
  format         text NOT NULL DEFAULT 'google_xml',  -- google_xml | csv
  default_type   text,                                -- fallback-cykeltype hvis feedet ikke angiver
  active         boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_status    text,                                -- 'ok' | fejlbesked
  last_count     int,                                 -- antal cykler i sidste sync
  last_deactivated int,                               -- antal deaktiverede (udsolgt) i sidste sync
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealer_feeds_active ON dealer_feeds(active) WHERE active = true;

ALTER TABLE dealer_feeds ENABLE ROW LEVEL SECURITY;

-- 2. RLS: kun admins administrerer feeds fra frontend (service-role i edge function
--    omgår RLS). Forhandleren selv kan se sin egen feed-status (read-only).
DROP POLICY IF EXISTS dealer_feeds_admin_all ON dealer_feeds;
CREATE POLICY dealer_feeds_admin_all ON dealer_feeds
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP POLICY IF EXISTS dealer_feeds_owner_read ON dealer_feeds;
CREATE POLICY dealer_feeds_owner_read ON dealer_feeds
  FOR SELECT
  USING (user_id = auth.uid());

-- 3. Nattlig cron kl. 04:00 → kalder import-dealer-feed i "run-all"-tilstand.
--    x-cron-secret matches FEED_CRON_SECRET i edge-functionens env (sæt som secret).
--    Erstat <FEED_CRON_SECRET> herunder med samme værdi som secret'en.
SELECT cron.unschedule('dealer-feed-sync')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dealer-feed-sync');

SELECT cron.schedule(
  'dealer-feed-sync',
  '0 4 * * *',
  $$
  SELECT extensions.net.http_post(
    url     := 'https://ktufgncydxhkhfttojkh.supabase.co/functions/v1/import-dealer-feed',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  '<FEED_CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

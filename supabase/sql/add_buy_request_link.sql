-- ══════════════════════════════════════════════════════════════════════
--  Opkøbsønske: link til forhandlerens egen side
--  Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
-- ══════════════════════════════════════════════════════════════════════
--
--  23. okt.: en forhandler skal kunne linke fra sit opkøbsønske til sin
--  egen side (fx Upways side om opkøb). Kun https, højst 300 tegn, og
--  ingen tegn der kan bryde ud af en HTML-attribut. Reglen ligger her, så
--  den også gælder for et kald uden om formularen.
--
--  Skal køres FØR frontenden merges: /opkoeb beder om kolonnen link_url,
--  og uden den fejler hele listen.

ALTER TABLE buy_requests ADD COLUMN IF NOT EXISTS link_url text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.buy_requests'::regclass
                    AND conname = 'buy_requests_link_url_check') THEN
    ALTER TABLE buy_requests ADD CONSTRAINT buy_requests_link_url_check
      CHECK (link_url IS NULL
             OR (char_length(link_url) <= 300 AND link_url ~ '^https://[^\s<>"'']+$'));
  END IF;
END $$;

-- Tabellen har kolonne-GRANTs (add_buy_requests.sql). Den nye kolonne skal
-- nævnes, ellers afviser databasen et ønske med link.
GRANT INSERT (link_url), UPDATE (link_url) ON buy_requests TO authenticated;

-- ── Tjek bagefter: skal give to rækker med OK ─────────────────────────
SELECT 'kolonnen link_url findes' AS tjek,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'buy_requests' AND column_name = 'link_url')
            THEN 'OK' ELSE 'MANGLER' END AS status
UNION ALL
SELECT 'forhandlere må skrive link_url',
       CASE WHEN has_column_privilege('authenticated', 'public.buy_requests', 'link_url', 'UPDATE')
            THEN 'OK' ELSE 'MANGLER' END;

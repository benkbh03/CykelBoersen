-- ============================================================
-- LIST_TEST_ACCOUNTS.sql — READ-ONLY. Ændrer ingenting.
--
-- Kandidater til at blive skjult fra offentlige lister, søgning og
-- sitemap: "Cykelbørsen Demo" og konti der ligner test. Kør den, send
-- resultatet, og sig hvilke der skal skjules. Først derefter skrives
-- oprydningen, med præcis de id'er du har godkendt.
--
-- Sådan skjules en konto (når listen er godkendt):
--   * forhandler: verified = false. Alle offentlige forhandlerlister,
--     prerender og sitemap henter kun verified = true, så kontoen
--     forsvinder alle steder på én gang uden kodeændringer.
--   * annoncer: is_active = false (hverken solgt eller slettet, altså
--     "skjult/deaktiveret" i add_deleted_at.sql's forstand). Forsiden,
--     søgning, kortet og sitemap viser kun aktive annoncer.
-- Begge dele kan rulles tilbage med én UPDATE.
--
-- Kolonnen "grund" siger hvorfor rækken er med. Admin-konti vises, men
-- skal næppe skjules: de er markeret, så de ikke rammes ved en fejl.
-- ============================================================

SELECT
  p.id,
  COALESCE(NULLIF(p.shop_name, ''), p.name)          AS navn,
  u.email,
  p.seller_type,
  p.verified,
  p.is_admin,
  (SELECT count(*) FROM bikes b WHERE b.user_id = p.id AND b.is_active) AS aktive_annoncer,
  to_char(p.created_at, 'YYYY-MM-DD')                AS oprettet,
  to_char(p.last_seen,  'YYYY-MM-DD')                AS sidst_aktiv,
  concat_ws(', ',
    CASE WHEN p.shop_name = 'Cykelbørsen Demo' THEN 'demo-butik' END,
    CASE WHEN concat(p.name, ' ', p.shop_name) ~* '\m(test|demo|dummy|prøve)' THEN 'navn' END,
    CASE WHEN u.email ~* '(test|demo|dummy|example\.|mailinator|yopmail|\+)' THEN 'e-mail' END,
    CASE WHEN u.email ~* '(cykelbørsen|cykelbrsen)' THEN 'eget domæne' END
  )                                                  AS grund
FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.shop_name = 'Cykelbørsen Demo'
   OR concat(p.name, ' ', p.shop_name) ~* '\m(test|demo|dummy|prøve)'
   OR u.email ~* '(test|demo|dummy|example\.|mailinator|yopmail|\+|cykelbørsen|cykelbrsen)'
ORDER BY p.is_admin, aktive_annoncer DESC, p.created_at;

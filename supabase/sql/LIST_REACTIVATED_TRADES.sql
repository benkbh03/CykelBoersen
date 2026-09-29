-- ============================================================
-- LIST_REACTIVATED_TRADES.sql — READ-ONLY. Ændrer ingenting.
--
-- Viser de handler, der vil blive annulleret af
-- cancel_reactivated_trades.sql: annoncen blev solgt (✅-besked fra
-- sælgeren), men er i dag aktiv igen. Kør den, send resultatet, og
-- godkend listen, før oprydningen køres.
--
-- Kan køres både før og efter add_trades.sql, fordi den læser
-- beskederne direkte.
--
-- Anden forespørgsel (længere nede) viser ✅-beskeder, der IKKE blev
-- sendt af annoncens sælger. De bliver ikke til handler efter
-- add_trades.sql, og en vurdering, der hvilede på dem, kan ikke
-- længere oprettes. Eksisterende vurderinger bliver stående.
-- ============================================================

-- 1. Solgt, men aktiv igen
SELECT
  b.brand || ' ' || COALESCE(NULLIF(b.model, ''), '')      AS annonce,
  b.id                                                   AS bike_id,
  COALESCE(ps.shop_name, ps.name)                        AS saelger,
  COALESCE(pb.shop_name, pb.name)                        AS koeber,
  to_char(m.created_at, 'YYYY-MM-DD')                    AS solgt_dato,
  b.is_active                                            AS aktiv_nu,
  b.sold_via,
  (SELECT count(*) FROM reviews r
    WHERE r.bike_id = b.id
      AND ((r.reviewer_id = m.sender_id AND r.reviewed_user_id = m.receiver_id)
        OR (r.reviewer_id = m.receiver_id AND r.reviewed_user_id = m.sender_id)))
                                                         AS vurderinger_der_skjules
FROM (
  SELECT DISTINCT ON (bike_id) bike_id, sender_id, receiver_id, created_at
    FROM messages
   WHERE content ILIKE '✅%accepteret%'
   ORDER BY bike_id, created_at DESC
) m
JOIN bikes b          ON b.id = m.bike_id AND b.user_id = m.sender_id
LEFT JOIN profiles ps ON ps.id = m.sender_id
LEFT JOIN profiles pb ON pb.id = m.receiver_id
WHERE b.is_active = true
ORDER BY m.created_at DESC;


-- 2. ✅-beskeder der ikke er sendt af annoncens sælger
-- SELECT m.id, m.bike_id, m.sender_id, m.receiver_id, m.created_at, left(m.content, 60) AS indhold
--   FROM messages m
--   LEFT JOIN bikes b ON b.id = m.bike_id
--  WHERE m.content ILIKE '✅%accepteret%'
--    AND (b.id IS NULL OR b.user_id <> m.sender_id)
--  ORDER BY m.created_at DESC;

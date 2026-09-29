-- ============================================================
-- cancel_reactivated_trades.sql — KØR FØRST EFTER GODKENDELSE
--
-- Annullerer handler, hvor annoncen i dag er aktiv igen, og nulstiller
-- sold_via på de annoncer. Se listen i LIST_REACTIVATED_TRADES.sql
-- først. Forudsætter add_trades.sql.
--
-- Fremover sker det automatisk (trg_cancel_trade_on_reactivate). Filen
-- her rydder kun op i det, der skete før triggeren fandtes.
--
-- Vurderinger på de annullerede handler bliver skjult (RLS), ikke
-- slettet. Idempotent.
--
-- Rollback af en enkelt handel:
--   UPDATE trades SET status = 'gennemført', cancelled_at = NULL WHERE id = '<id>';
-- ============================================================

UPDATE trades t
   SET status = 'annulleret', cancelled_at = now()
  FROM bikes b
 WHERE b.id = t.bike_id
   AND b.is_active = true
   AND t.status = 'gennemført';

UPDATE bikes
   SET sold_via = NULL
 WHERE is_active = true
   AND sold_via IS NOT NULL;

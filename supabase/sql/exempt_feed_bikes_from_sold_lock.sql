-- ============================================================
-- Undtag feed-cykler fra "solgt = låst for redigering"-triggeren
-- ============================================================
-- prevent_sold_bike_edits() blokerer redigering af indholdsfelter når en annonce
-- er inaktiv (is_active=false → behandlet som "solgt"). Det er buyer-protection
-- for ægte P2P-salg.
--
-- MEN: feed-importerede forhandler-cykler (external_id IS NOT NULL) er skjult
-- (kladde) eller udsolgt — der er INGEN køber at beskytte. Når en admin retter
-- en skjult feed-cykel (is_active=false → forbliver false), ramte triggeren og
-- afviste gemningen ("Solgte annoncer kan ikke redigeres"). Derfor kunne man
-- ikke gemme rettelser i kladde-gennemgangen.
--
-- Fix: spring tjekket over for feed-cykler. Private annoncer beskyttes som før.
--
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_sold_bike_edits()
RETURNS TRIGGER AS $$
BEGIN
  -- Kun for ægte private salg. Feed-importerede cykler (external_id sat) er
  -- forhandler-katalog og må redigeres af admin uanset synlighed.
  IF OLD.is_active = false AND NEW.is_active = false AND OLD.external_id IS NULL THEN
    IF NEW.brand          IS DISTINCT FROM OLD.brand
    OR NEW.model          IS DISTINCT FROM OLD.model
    OR NEW.type           IS DISTINCT FROM OLD.type
    OR NEW.price          IS DISTINCT FROM OLD.price
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.condition      IS DISTINCT FROM OLD.condition
    OR NEW.year           IS DISTINCT FROM OLD.year
    OR NEW.size           IS DISTINCT FROM OLD.size
    OR NEW.color          IS DISTINCT FROM OLD.color
    OR NEW.city           IS DISTINCT FROM OLD.city
    OR NEW.warranty       IS DISTINCT FROM OLD.warranty
    THEN
      RAISE EXCEPTION 'Solgte annoncer kan ikke redigeres. Genaktiver annoncen først.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggeren peger allerede på funktionen; ingen ændring nødvendig der.

-- ============================================================
-- Cykelbørsen – Udlejnings-inventar (Fase 1)
-- ============================================================
-- Kør i Supabase Dashboard → SQL Editor → Run. Idempotent.
--
-- Tabeller til at forhandlere kan udbyde cykler til udlejning. Selve
-- bookinger + betaling kommer i en senere migration (add_rental_bookings.sql).
--
-- FORUDSÆTNING: add_stripe_connect.sql er kørt (stripe_account_status på profiles).
-- ============================================================

-- ── Udlejnings-items (én pr. udlejningscykel-type hos en forhandler) ──
CREATE TABLE IF NOT EXISTS public.rental_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title          text NOT NULL,
  type           text,                       -- Racercykel, Mountainbike, El-cykel, …
  description    text,
  daily_rate     int  NOT NULL,              -- kr/dag
  weekly_rate    int,                        -- kr/uge (valgfri rabatpris)
  deposit_amount int  NOT NULL DEFAULT 0,    -- depositum i kr (kort-reservation)
  min_days       int  NOT NULL DEFAULT 1,
  max_days       int  NOT NULL DEFAULT 30,
  quantity       int  NOT NULL DEFAULT 1,    -- antal identiske enheder
  city           text,
  address        text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_items_active ON public.rental_items (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rental_items_dealer ON public.rental_items (dealer_id);
CREATE INDEX IF NOT EXISTS idx_rental_items_type   ON public.rental_items (type) WHERE is_active;

ALTER TABLE public.rental_items ENABLE ROW LEVEL SECURITY;

-- Alle må se aktive udlejnings-items; forhandleren ser også sine egne inaktive.
DROP POLICY IF EXISTS "rental_items_select" ON public.rental_items;
CREATE POLICY "rental_items_select" ON public.rental_items
  FOR SELECT USING (is_active OR dealer_id = auth.uid());

-- Kun forhandlere må oprette, og kun for sig selv.
DROP POLICY IF EXISTS "rental_items_insert" ON public.rental_items;
CREATE POLICY "rental_items_insert" ON public.rental_items
  FOR INSERT WITH CHECK (
    dealer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND seller_type = 'dealer'
    )
  );

-- Forhandleren må opdatere/slette sine egne.
DROP POLICY IF EXISTS "rental_items_update" ON public.rental_items;
CREATE POLICY "rental_items_update" ON public.rental_items
  FOR UPDATE USING (dealer_id = auth.uid()) WITH CHECK (dealer_id = auth.uid());

DROP POLICY IF EXISTS "rental_items_delete" ON public.rental_items;
CREATE POLICY "rental_items_delete" ON public.rental_items
  FOR DELETE USING (dealer_id = auth.uid());

-- ── Billeder til udlejnings-items (spejler bike_images) ──
CREATE TABLE IF NOT EXISTS public.rental_item_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES public.rental_items(id) ON DELETE CASCADE,
  url        text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_item_images_item ON public.rental_item_images (item_id);

ALTER TABLE public.rental_item_images ENABLE ROW LEVEL SECURITY;

-- Billede-URLs er ikke følsomme → offentlig læsning.
DROP POLICY IF EXISTS "rental_item_images_select" ON public.rental_item_images;
CREATE POLICY "rental_item_images_select" ON public.rental_item_images
  FOR SELECT USING (true);

-- Kun ejeren af det tilknyttede item må tilføje/slette billeder.
DROP POLICY IF EXISTS "rental_item_images_insert" ON public.rental_item_images;
CREATE POLICY "rental_item_images_insert" ON public.rental_item_images
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rental_items
      WHERE id = item_id AND dealer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "rental_item_images_delete" ON public.rental_item_images;
CREATE POLICY "rental_item_images_delete" ON public.rental_item_images
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.rental_items
      WHERE id = item_id AND dealer_id = auth.uid()
    )
  );

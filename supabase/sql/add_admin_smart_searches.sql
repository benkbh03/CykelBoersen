-- ══════════════════════════════════════════════════════════════════════
--  admin_smart_searches(): smart søgnings log i admin → Statistik
--  Idempotent: sikker at køre igen. Kræver add_smart_search_logs.sql.
-- ══════════════════════════════════════════════════════════════════════
--
--  smart_search_logs har ingen GRANT til browseren, og det skal den blive
--  ved med. Admin-panelet læser i stedet gennem denne funktion, der kun
--  svarer når den der kalder, er admin. Alle andre får nul rækker.
--
--  Rollback: DROP FUNCTION IF EXISTS public.admin_smart_searches(boolean, integer);

CREATE OR REPLACE FUNCTION public.admin_smart_searches(
  p_only_zero boolean DEFAULT false,
  p_limit     integer DEFAULT 50
)
RETURNS TABLE (
  created_at   timestamptz,
  query        text,
  filters      jsonb,
  keywords     text[],
  result_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.created_at, s.query, s.filters, s.keywords, s.result_count
    FROM public.smart_search_logs s
   WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
     AND (NOT p_only_zero OR s.result_count = 0)
   ORDER BY s.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.admin_smart_searches(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_smart_searches(boolean, integer) TO authenticated;

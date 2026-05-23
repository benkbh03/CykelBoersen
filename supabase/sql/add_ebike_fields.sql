-- ============================================================
-- El-cykel-felter: motor, motor-placering, batteri-kapacitet
-- ============================================================
-- Gør el-cykler søgbare på motor (Bosch/Shimano/Promovec m.fl.),
-- motor-placering (midter/for/bag) og batteri-kapacitet i Wh.
--
-- Kør i Supabase Dashboard → SQL Editor → Run
-- ============================================================

ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS motor          TEXT,
  ADD COLUMN IF NOT EXISTS motor_position TEXT,    -- 'Midtermotor' | 'Forhjulsmotor' | 'Baghjulsmotor'
  ADD COLUMN IF NOT EXISTS battery_wh     INTEGER; -- batteri-kapacitet i watt-timer

-- Indekser på de felter der filtreres på
CREATE INDEX IF NOT EXISTS idx_bikes_motor          ON bikes(motor)          WHERE motor          IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bikes_motor_position ON bikes(motor_position) WHERE motor_position IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bikes_battery_wh     ON bikes(battery_wh)     WHERE battery_wh     IS NOT NULL;

COMMENT ON COLUMN bikes.motor          IS 'El-cykel motor-system, fx "Bosch Performance Line CX"';
COMMENT ON COLUMN bikes.motor_position IS 'Midtermotor | Forhjulsmotor | Baghjulsmotor';
COMMENT ON COLUMN bikes.battery_wh     IS 'Batteri-kapacitet i Wh, fx 500';

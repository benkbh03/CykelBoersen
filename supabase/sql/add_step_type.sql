ALTER TABLE bikes
  ADD COLUMN IF NOT EXISTS step_type TEXT;

CREATE INDEX IF NOT EXISTS idx_bikes_step_type
  ON bikes(step_type) WHERE step_type IS NOT NULL;

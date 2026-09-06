-- Canonical measurement kinds already used by observations and event resolution.
-- Preserve explicit unknown classifications; do not infer or rewrite measurements.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.event_types
  ADD CONSTRAINT event_types_measure_check
  CHECK (measure IN ('time', 'distance', 'points', 'unknown')) NOT VALID;
ALTER TABLE public.event_types VALIDATE CONSTRAINT event_types_measure_check;
ALTER TABLE public.event_types ALTER COLUMN measure SET NOT NULL;

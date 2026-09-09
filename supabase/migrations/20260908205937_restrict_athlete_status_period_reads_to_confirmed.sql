-- Preserve provisional review rows while exposing only confirmed status periods to app roles.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP POLICY IF EXISTS athlete_status_periods_public_read
  ON public.athlete_status_periods;

CREATE POLICY athlete_status_periods_public_read
  ON public.athlete_status_periods FOR SELECT TO anon, authenticated
  USING (resolution_status = 'confirmed');

COMMIT;

BEGIN;

DROP POLICY IF EXISTS athlete_status_periods_public_read
  ON public.athlete_status_periods;

CREATE POLICY athlete_status_periods_public_read
  ON public.athlete_status_periods FOR SELECT TO anon, authenticated
  USING (true);

COMMIT;

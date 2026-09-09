BEGIN;

DROP VIEW public.v_athlete_status_summary;
REVOKE SELECT ON public.v_athlete_collegiate_history FROM anon, authenticated;

COMMIT;

-- Publish a narrow athlete-status read model without exposing private evidence or provisional rows.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE VIEW public.v_athlete_status_summary
WITH (security_invoker = true)
AS
SELECT
  history.athlete_id,
  history.current_school_id,
  history.current_school_institution_type,
  history.has_collegiate_school,
  history.has_collegiate_team_season,
  history.has_collegiate_individual_result,
  history.has_collegiate_relay_result,
  history.has_collegiate_history,
  current_status.career_stage AS confirmed_current_career_stage,
  current_status.career_stage_from AS confirmed_current_career_stage_from,
  current_status.career_stage_to AS confirmed_current_career_stage_to,
  current_status.professional_status AS confirmed_current_professional_status,
  current_status.professional_status_from AS confirmed_current_professional_status_from,
  current_status.professional_status_to AS confirmed_current_professional_status_to
FROM public.v_athlete_collegiate_history history
JOIN public.v_athlete_current_status current_status USING (athlete_id);

REVOKE ALL ON public.v_athlete_status_summary FROM PUBLIC;
GRANT SELECT ON public.v_athlete_collegiate_history TO anon, authenticated;
GRANT SELECT ON public.v_athlete_status_summary TO anon, authenticated;
GRANT SELECT ON public.v_athlete_status_summary TO service_role;

COMMENT ON VIEW public.v_athlete_status_summary IS
  'Public athlete status summary: historical collegiate evidence is separate from confirmed current career/professional status; private and provisional evidence is excluded.';

COMMIT;

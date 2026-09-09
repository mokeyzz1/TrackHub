-- Read-only evidence audit for athlete career-stage modeling.
-- Snapshot date: 2026-09-08. This script intentionally performs no writes.

WITH season_evidence AS (
  SELECT DISTINCT ats.athlete_id
  FROM public.athlete_team_seasons ats
  JOIN public.teams t USING (team_id)
  JOIN public.schools s USING (school_id)
  WHERE s.institution_type = 'collegiate'
), individual_evidence AS (
  SELECT DISTINCT r.athlete_id
  FROM public.results r
  JOIN public.teams t USING (team_id)
  JOIN public.schools s USING (school_id)
  WHERE s.institution_type = 'collegiate'
), relay_evidence AS (
  SELECT DISTINCT ra.athlete_id
  FROM public.relay_athletes ra
  JOIN public.relay_results rr USING (relay_result_id)
  JOIN public.teams t USING (team_id)
  JOIN public.schools s USING (school_id)
  WHERE s.institution_type = 'collegiate' AND ra.athlete_id IS NOT NULL
)
SELECT s.institution_type AS current_school_type,
       s.institution_type = 'collegiate' AS current_school_collegiate,
       se.athlete_id IS NOT NULL AS collegiate_roster_evidence,
       ie.athlete_id IS NOT NULL AS collegiate_individual_result_evidence,
       re.athlete_id IS NOT NULL AS collegiate_relay_evidence,
       count(*) AS athletes
FROM public.athletes a
JOIN public.schools s USING (school_id)
LEFT JOIN season_evidence se USING (athlete_id)
LEFT JOIN individual_evidence ie USING (athlete_id)
LEFT JOIN relay_evidence re USING (athlete_id)
GROUP BY 1,2,3,4,5
ORDER BY athletes DESC;

SELECT s.institution_type,
       count(*) AS athletes,
       count(*) FILTER (WHERE nullif(btrim(a.tfrrs_athlete_id),'') IS NOT NULL) AS tfrrs_ids,
       count(*) FILTER (WHERE nullif(btrim(a.athletic_net_url),'') IS NOT NULL) AS athletic_net_urls,
       count(*) FILTER (WHERE nullif(btrim(a.class_year),'') IS NOT NULL) AS class_years,
       count(*) FILTER (WHERE a.grad_year IS NOT NULL) AS grad_years,
       count(*) FILTER (WHERE a.is_active IS TRUE) AS active_true,
       count(*) FILTER (WHERE a.is_active IS FALSE) AS active_false
FROM public.athletes a
JOIN public.schools s USING (school_id)
GROUP BY s.institution_type
ORDER BY athletes DESC;

SELECT count(*) AS rows,
       count(DISTINCT athlete_id) AS athletes,
       count(DISTINCT team_id) AS teams,
       count(DISTINCT season_code) AS season_codes,
       min(season_code) AS min_season,
       max(season_code) AS max_season,
       count(*) FILTER (WHERE status IS NULL) AS null_status,
       count(*) FILTER (WHERE year_in_school IS NULL) AS null_year_in_school
FROM public.athlete_team_seasons;

SELECT status, count(*) AS rows, count(DISTINCT athlete_id) AS athletes
FROM public.athlete_team_seasons
GROUP BY status
ORDER BY rows DESC;

SELECT coalesce(t.team_type,'<NULL>') AS team_type,
       s.institution_type,
       count(*) AS teams
FROM public.teams t
JOIN public.schools s USING (school_id)
GROUP BY t.team_type, s.institution_type
ORDER BY teams DESC;

SELECT coalesce(t.team_type,'<NULL>') AS team_type,
       s.institution_type,
       count(*) AS results,
       count(DISTINCT r.athlete_id) AS athletes
FROM public.results r
LEFT JOIN public.teams t USING (team_id)
LEFT JOIN public.schools s ON s.school_id = t.school_id
GROUP BY t.team_type, s.institution_type
ORDER BY results DESC;

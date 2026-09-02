-- Read-only school identity scan used for the 2026-09-02 database review.
-- This intentionally reports candidates; normalized-name equality is not proof
-- that two schools are the same institution.
SET statement_timeout = '15min';

\echo '== Every normalized-name collision group and every school row =='
WITH school_usage AS (
  SELECT s.school_id,
         lower(regexp_replace(trim(s.official_name), '[^a-z0-9]+', '', 'g')) AS normalized_name,
         (SELECT count(*) FROM public.athletes a WHERE a.school_id = s.school_id) AS athletes,
         (SELECT count(*) FROM public.results r JOIN public.teams t ON t.team_id = r.team_id
           WHERE t.school_id = s.school_id) AS results,
         (SELECT count(*) FROM public.relay_results rr JOIN public.teams t ON t.team_id = rr.team_id
           WHERE t.school_id = s.school_id) AS relays,
         (SELECT count(*) FROM public.athlete_team_seasons ats JOIN public.teams t ON t.team_id = ats.team_id
           WHERE t.school_id = s.school_id) AS athlete_team_seasons,
         (SELECT count(*) FROM ingest.observations o JOIN public.teams t ON t.team_id = o.target_team_id
           WHERE t.school_id = s.school_id) AS observations,
         (SELECT count(*) FROM ingest.team_aliases ta JOIN public.teams t ON t.team_id = ta.team_id
           WHERE t.school_id = s.school_id) AS team_aliases,
         (SELECT count(*) FROM public.external_ids e
           WHERE e.school_id = s.school_id
              OR e.team_id IN (SELECT team_id FROM public.teams WHERE school_id = s.school_id)) AS external_ids
    FROM public.schools s
   WHERE s.official_name IS NOT NULL AND trim(s.official_name) <> ''
), collision_names AS (
  SELECT normalized_name
    FROM school_usage
   GROUP BY normalized_name
  HAVING count(*) > 1
)
SELECT u.normalized_name, s.school_id, s.official_name, s.short_name, s.city, s.state,
       s.division, s.division_id, s.current_conference_id, s.region_id, s.is_active,
       s.created_at, u.athletes, u.results, u.relays, u.athlete_team_seasons,
       u.observations, u.team_aliases, u.external_ids
  FROM school_usage u
  JOIN collision_names c USING (normalized_name)
  JOIN public.schools s USING (school_id)
 ORDER BY u.normalized_name, s.school_id;

\echo '== Collision-group classification inputs =='
WITH school_usage AS (
  SELECT s.school_id,
         lower(regexp_replace(trim(s.official_name), '[^a-z0-9]+', '', 'g')) AS normalized_name,
         ((SELECT count(*) FROM public.athletes a WHERE a.school_id = s.school_id)
        + (SELECT count(*) FROM public.results r JOIN public.teams t ON t.team_id = r.team_id
            WHERE t.school_id = s.school_id)
        + (SELECT count(*) FROM public.relay_results rr JOIN public.teams t ON t.team_id = rr.team_id
            WHERE t.school_id = s.school_id)
        + (SELECT count(*) FROM public.athlete_team_seasons ats JOIN public.teams t ON t.team_id = ats.team_id
            WHERE t.school_id = s.school_id)
        + (SELECT count(*) FROM ingest.observations o JOIN public.teams t ON t.team_id = o.target_team_id
            WHERE t.school_id = s.school_id)
        + (SELECT count(*) FROM ingest.team_aliases ta JOIN public.teams t ON t.team_id = ta.team_id
            WHERE t.school_id = s.school_id)
        + (SELECT count(*) FROM public.external_ids e
            WHERE e.school_id = s.school_id
               OR e.team_id IN (SELECT team_id FROM public.teams WHERE school_id = s.school_id))) AS substantive_rows
    FROM public.schools s
   WHERE s.official_name IS NOT NULL AND trim(s.official_name) <> ''
), collisions AS (
  SELECT normalized_name, count(*) AS school_rows,
         count(*) FILTER (WHERE substantive_rows > 0) AS substantive_school_rows
    FROM school_usage
   GROUP BY normalized_name
  HAVING count(*) > 1
)
SELECT *,
       CASE WHEN substantive_school_rows > 1 THEN 'both/multiple substantive'
            WHEN substantive_school_rows = 1 THEN 'one substantive'
            ELSE 'no substantive rows'
       END AS evidence_bucket
  FROM collisions
 ORDER BY evidence_bucket, normalized_name;

\echo '== Creation batches represented in collision rows =='
WITH collisions AS (
  SELECT lower(regexp_replace(trim(official_name), '[^a-z0-9]+', '', 'g')) AS normalized_name
    FROM public.schools
   WHERE official_name IS NOT NULL AND trim(official_name) <> ''
   GROUP BY 1 HAVING count(*) > 1
)
SELECT s.created_at, count(*) AS school_rows,
       min(s.school_id) AS first_school_id, max(s.school_id) AS last_school_id
  FROM public.schools s
  JOIN collisions c
    ON c.normalized_name = lower(regexp_replace(trim(s.official_name), '[^a-z0-9]+', '', 'g'))
 GROUP BY s.created_at
 ORDER BY s.created_at;

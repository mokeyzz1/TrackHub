-- Read-only affiliation dry run.
-- This script intentionally contains SELECTs only. It does not create tables, update rows,
-- change constraints, or reinterpret division values.

\echo '1) Current mandatory-link shape'
SELECT table_schema, table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE (table_schema, table_name, column_name) IN
      (('public','athletes','school_id'), ('public','teams','school_id'))
ORDER BY table_schema, table_name;

\echo '2) Explicit placeholder-like school labels (bounded review cohort)'
SELECT s.school_id, s.official_name, s.short_name, s.city, s.state, s.division,
       count(DISTINCT t.team_id)::bigint AS team_count,
       count(DISTINCT a.athlete_id)::bigint AS athlete_count
FROM public.schools s
LEFT JOIN public.teams t ON t.school_id = s.school_id
LEFT JOIN public.athletes a ON a.school_id = s.school_id
WHERE lower(coalesce(s.official_name, '')) ~
      '(unattached|track club|club|high school|international|united states|^usa$|academy)'
GROUP BY s.school_id, s.official_name, s.short_name, s.city, s.state, s.division
ORDER BY athlete_count DESC, s.school_id
LIMIT 250;

\echo '3) Placeholder school dependency counts (all facts)'
WITH placeholder_schools AS (
  SELECT school_id
  FROM public.schools
  WHERE lower(coalesce(official_name, '')) ~
        '(unattached|track club|club|high school|international|united states|^usa$|academy)'
)
SELECT ps.school_id,
       s.official_name,
       (SELECT count(*) FROM public.athletes a WHERE a.school_id = ps.school_id)::bigint AS athletes,
       (SELECT count(*) FROM public.teams t WHERE t.school_id = ps.school_id)::bigint AS teams,
       (SELECT count(*)
          FROM public.results r
         WHERE EXISTS (SELECT 1 FROM public.athletes a
                       WHERE a.athlete_id = r.athlete_id AND a.school_id = ps.school_id))::bigint AS individual_results,
       (SELECT count(*)
          FROM public.relay_results rr
         WHERE rr.team_id IN (SELECT t.team_id FROM public.teams t WHERE t.school_id = ps.school_id))::bigint AS relay_results,
       (SELECT count(*)
          FROM public.athlete_team_seasons ats
         WHERE ats.team_id IN (SELECT t.team_id FROM public.teams t WHERE t.school_id = ps.school_id))::bigint AS season_links
FROM placeholder_schools ps
JOIN public.schools s ON s.school_id = ps.school_id
ORDER BY athletes DESC, ps.school_id;

\echo '4) Current-school athletes versus time-aware bridge coverage'
SELECT s.school_id, s.official_name,
       count(DISTINCT a.athlete_id)::bigint AS athletes,
       count(DISTINCT ats.athlete_id)::bigint AS athletes_with_season_link,
       count(DISTINCT ats.ats_id)::bigint AS bridge_rows
FROM public.schools s
JOIN public.athletes a ON a.school_id = s.school_id
LEFT JOIN public.athlete_team_seasons ats ON ats.athlete_id = a.athlete_id
GROUP BY s.school_id, s.official_name
HAVING count(DISTINCT a.athlete_id) > 0
ORDER BY athletes_with_season_link ASC, athletes DESC
LIMIT 100;

\echo '5) Safety assertions (must be zero before any destructive retirement)'
SELECT 'unattached_school_missing' AS check_name,
       count(*)::bigint AS failures
FROM public.schools
WHERE school_id = 1835
  AND official_name <> 'Unattached'
UNION ALL
SELECT 'orphan_athlete_school_fk', count(*)::bigint
FROM public.athletes a
LEFT JOIN public.schools s ON s.school_id = a.school_id
WHERE s.school_id IS NULL
UNION ALL
SELECT 'orphan_team_school_fk', count(*)::bigint
FROM public.teams t
LEFT JOIN public.schools s ON s.school_id = t.school_id
WHERE s.school_id IS NULL;

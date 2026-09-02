-- Read-only integrity checks over canonical fact and dimension tables.
SET statement_timeout = '10min';

SELECT 'results_rows', count(*) FROM public.results;
SELECT 'results_null_team', count(*) FROM public.results WHERE team_id IS NULL;
SELECT 'results_null_meet', count(*) FROM public.results WHERE meet_id IS NULL;
SELECT 'results_null_event_type', count(*) FROM public.results WHERE event_type_id IS NULL;
SELECT 'relay_rows', count(*) FROM public.relay_results;
SELECT 'relay_null_team', count(*) FROM public.relay_results WHERE team_id IS NULL;
SELECT 'relay_null_meet', count(*) FROM public.relay_results WHERE meet_id IS NULL;
SELECT 'relay_null_event_type', count(*) FROM public.relay_results WHERE event_type_id IS NULL;
SELECT 'relay_null_mark', count(*) FROM public.relay_results WHERE mark_raw IS NULL;
SELECT 'relay_athletes_null_relay', count(*) FROM public.relay_athletes WHERE relay_result_id IS NULL;
SELECT 'relay_athletes_null_athlete', count(*) FROM public.relay_athletes WHERE athlete_id IS NULL;
SELECT 'relay_duplicate_numeric_keys', count(*)
  FROM (
    SELECT meet_id,event_type_id,team_id,place,
           lower(regexp_replace(mark_raw,'[ah]$','','g')),round
      FROM public.relay_results
     WHERE mark_raw ~ '[0-9]' AND team_id IS NOT NULL AND meet_id IS NOT NULL
     GROUP BY 1,2,3,4,5,6 HAVING count(*) > 1
  ) d;
SELECT 'result_duplicate_keys', count(*)
  FROM (
    SELECT athlete_id,meet_id,event_type_id,mark_raw,place,round
      FROM public.results
     WHERE meet_id IS NOT NULL
     GROUP BY 1,2,3,4,5,6 HAVING count(*) > 1
  ) d;

-- Standing invariant checks (read-only copies of scrapers/verify-data-invariants.js).
SELECT 'same_round_conflicting_place', COALESCE(count(*),0)::bigint FROM (
  SELECT athlete_id, meet_id, event_type_id,
         lower(regexp_replace(mark_raw,'[ah]$','')) AS nm,
         count(DISTINCT COALESCE(round,'~NULL~')) AS dr,
         count(DISTINCT COALESCE(place,-1)) AS dp
    FROM public.results
   WHERE meet_id IS NOT NULL AND athlete_id IS NOT NULL AND mark_raw ~ '[0-9]'
   GROUP BY 1,2,3,4 HAVING count(*) > 1
) k WHERE dr=1 AND dp>1;
SELECT 'parseable_mark_without_seconds', count(*) FROM (
  SELECT regexp_replace(btrim(regexp_replace(mark_raw,'\s*\([-+]?[0-9.]+\)\s*$','')),'[ahcyAHCY]$','') AS core
    FROM public.results WHERE mark_seconds IS NULL AND mark_meters IS NULL AND mark_raw IS NOT NULL
  UNION ALL
  SELECT regexp_replace(btrim(regexp_replace(mark_raw,'\s*\([-+]?[0-9.]+\)\s*$','')),'[ahcyAHCY]$','')
    FROM public.relay_results WHERE mark_seconds IS NULL AND mark_raw IS NOT NULL
  UNION ALL
  SELECT regexp_replace(btrim(regexp_replace(mark_raw,'\s*\([-+]?[0-9.]+\)\s*$','')),'[ahcyAHCY]$','')
    FROM public.athlete_prs WHERE mark_seconds IS NULL AND mark_meters IS NULL AND mark_raw IS NOT NULL
) c WHERE (core ~ '^[0-9]+:[0-9]{2}:[0-9]{1,2}(\.[0-9]+)?$' OR core ~ '^[0-9]+:[0-9]{2}(\.[0-9]+)?$' OR core ~ '^[0-9]+\.[0-9]+$') AND core !~ '^[0:.]+$';
SELECT 'zero_or_truncated_seconds',
  (SELECT count(*) FROM public.results WHERE mark_seconds IS NOT NULL AND (mark_seconds<=0 OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds<600)))
 + (SELECT count(*) FROM public.relay_results WHERE mark_seconds IS NOT NULL AND (mark_seconds<=0 OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds<600)))
 + (SELECT count(*) FROM public.athlete_prs WHERE mark_seconds IS NOT NULL AND (mark_seconds<=0 OR (mark_raw ~ '^[0-9]+:[0-9]{2}:[0-9]' AND mark_seconds<600)));
SELECT 'result_date_more_than_7_days_from_meet', count(*) FROM public.results r JOIN public.meets m ON m.meet_id=r.meet_id WHERE r.date IS NOT NULL AND m.date IS NOT NULL AND abs(r.date-m.date)>7;

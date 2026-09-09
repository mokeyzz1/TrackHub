-- Read-only timing-platform repair scan.
--
-- This reproduces the CASE order in
-- supabase/migrations/20260527_expand_timing_platform_detection.sql, but
-- intentionally does not update public.meets or replace the live function.
-- Run against production with psql. Every query is SELECT-only.

\echo '0) Eligible rows versus rows that would change'
WITH candidates AS (
  SELECT
    m.timing_platform AS stored_timing_platform,
    CASE
      WHEN m.meet_url LIKE '%athletic.net%'
        OR m.meet_url LIKE '%jdlfasttrack%'
        OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
      WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
      WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
      WHEN m.meet_url LIKE '%finishtiming%'
        OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
      WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
      WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
      WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
      WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
      WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
      WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
      WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
      WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
      WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
      WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
      WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
      WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
      WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
      WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
      WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
      ELSE 'other'
    END AS projected_timing_platform
  FROM public.meets AS m
  WHERE m.meet_url IS NOT NULL
    AND (
      m.timing_platform IS NULL
      OR m.timing_platform IN ('other', 'other_timing')
    )
)
SELECT
  count(*) AS eligible_rows,
  count(*) FILTER (
    WHERE stored_timing_platform IS DISTINCT FROM projected_timing_platform
  ) AS rows_that_would_change,
  count(*) FILTER (
    WHERE stored_timing_platform IS NOT DISTINCT FROM projected_timing_platform
  ) AS already_matching
FROM candidates;

\echo '1) Rows that would change, by stored and projected platform'
WITH candidates AS (
  SELECT
    m.meet_id,
    m.name,
    m.date,
    m.meet_url,
    m.timing_platform AS stored_timing_platform,
    CASE
      WHEN m.meet_url IS NULL THEN NULL
      WHEN m.meet_url LIKE '%athletic.net%'
        OR m.meet_url LIKE '%jdlfasttrack%'
        OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
      WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
      WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
      WHEN m.meet_url LIKE '%finishtiming%'
        OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
      WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
      WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
      WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
      WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
      WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
      WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
      WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
      WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
      WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
      WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
      WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
      WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
      WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
      WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
      WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
      ELSE 'other'
    END AS projected_timing_platform
  FROM public.meets AS m
  WHERE m.meet_url IS NOT NULL
    AND (
      m.timing_platform IS NULL
      OR m.timing_platform IN ('other', 'other_timing')
    )
),
changed AS (
  SELECT *
  FROM candidates
  WHERE stored_timing_platform IS DISTINCT FROM projected_timing_platform
)
SELECT
  stored_timing_platform,
  projected_timing_platform,
  count(*) AS meet_count
FROM changed
GROUP BY stored_timing_platform, projected_timing_platform
ORDER BY stored_timing_platform NULLS FIRST, projected_timing_platform;

\echo '2) Candidate totals by projected platform'
WITH candidates AS (
  SELECT
    m.timing_platform AS stored_timing_platform,
    CASE
      WHEN m.meet_url LIKE '%athletic.net%'
        OR m.meet_url LIKE '%jdlfasttrack%'
        OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
      WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
      WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
      WHEN m.meet_url LIKE '%finishtiming%'
        OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
      WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
      WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
      WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
      WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
      WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
      WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
      WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
      WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
      WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
      WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
      WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
      WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
      WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
      WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
      WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
      ELSE 'other'
    END AS projected_timing_platform
  FROM public.meets AS m
  WHERE m.meet_url IS NOT NULL
    AND (
      m.timing_platform IS NULL
      OR m.timing_platform IN ('other', 'other_timing')
    )
)
SELECT projected_timing_platform, count(*) AS meet_count
FROM candidates
WHERE stored_timing_platform IS DISTINCT FROM projected_timing_platform
GROUP BY projected_timing_platform
ORDER BY meet_count DESC, projected_timing_platform;

\echo '3) Host/domain review for every candidate'
WITH candidates AS (
  SELECT
    m.meet_id,
    m.name,
    m.date,
    m.meet_url,
    m.timing_platform AS stored_timing_platform,
    CASE
      WHEN m.meet_url LIKE '%athletic.net%'
        OR m.meet_url LIKE '%jdlfasttrack%'
        OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
      WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
      WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
      WHEN m.meet_url LIKE '%finishtiming%'
        OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
      WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
      WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
      WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
      WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
      WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
      WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
      WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
      WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
      WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
      WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
      WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
      WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
      WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
      WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
      WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
      ELSE 'other'
    END AS projected_timing_platform
  FROM public.meets AS m
  WHERE m.meet_url IS NOT NULL
    AND (
      m.timing_platform IS NULL
      OR m.timing_platform IN ('other', 'other_timing')
    )
)
SELECT
  split_part(regexp_replace(meet_url, '^https?://', ''), '/', 1) AS host,
  stored_timing_platform,
  projected_timing_platform,
  count(*) AS meet_count,
  min(meet_id) AS first_meet_id,
  max(meet_id) AS last_meet_id
FROM candidates
WHERE stored_timing_platform IS DISTINCT FROM projected_timing_platform
GROUP BY host, stored_timing_platform, projected_timing_platform
ORDER BY meet_count DESC, host;

\echo '4) Review sample (newest 250 candidates, no writes)'
WITH candidates AS (
  SELECT
    m.meet_id,
    m.name,
    m.date,
    m.meet_url,
    m.timing_platform AS stored_timing_platform,
    CASE
      WHEN m.meet_url LIKE '%athletic.net%'
        OR m.meet_url LIKE '%jdlfasttrack%'
        OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
      WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
      WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
      WHEN m.meet_url LIKE '%finishtiming%'
        OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
      WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
      WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
      WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
      WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
      WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
      WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
      WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
      WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
      WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
      WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
      WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
      WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
      WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
      WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
      WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
      ELSE 'other'
    END AS projected_timing_platform
  FROM public.meets AS m
  WHERE m.meet_url IS NOT NULL
    AND (
      m.timing_platform IS NULL
      OR m.timing_platform IN ('other', 'other_timing')
    )
)
SELECT meet_id, name, date, stored_timing_platform, projected_timing_platform, meet_url
FROM candidates
WHERE stored_timing_platform IS DISTINCT FROM projected_timing_platform
ORDER BY date DESC NULLS LAST, meet_id DESC
LIMIT 250;

\echo '5) Conservative repair policy: known provider versus fallback review'
WITH candidates AS (
  SELECT
    m.meet_id,
    m.name,
    m.date,
    m.meet_url,
    m.timing_platform AS stored_timing_platform,
    CASE
      WHEN m.meet_url LIKE '%athletic.net%'
        OR m.meet_url LIKE '%jdlfasttrack%'
        OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
      WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
      WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
      WHEN m.meet_url LIKE '%finishtiming%'
        OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
      WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
      WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
      WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
      WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
      WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
      WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
      WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
      WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
      WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
      WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
      WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
      WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
      WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
      WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
      WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
      ELSE 'other'
    END AS projected_timing_platform
  FROM public.meets AS m
  WHERE m.meet_url IS NOT NULL
    AND (
      m.timing_platform IS NULL
      OR m.timing_platform IN ('other', 'other_timing')
    )
),
classified AS (
  SELECT
    *,
    CASE
      WHEN projected_timing_platform IN (
        'athletic_net', 'milesplit', 'pt_timing', 'finish_timing', 'tfrrs',
        'flashresults', 'rosterathletics', 'xpresstiming', 'halfmiletiming',
        'windsortiming', 'leonetiming', 'wayzatatiming', 'deltatiming',
        'lexicontiming', 'herostiming', 'omegatiming', 'domtel', 'live_results'
      ) THEN 'high_confidence_known_provider'
      ELSE 'hold_fallback_or_unknown_host'
    END AS repair_class
  FROM candidates
  WHERE stored_timing_platform IS DISTINCT FROM projected_timing_platform
)
SELECT repair_class, count(*) AS meet_count
FROM classified
GROUP BY repair_class
ORDER BY repair_class;

\echo '6) Held fallback/unknown-host groups for owner review'
WITH candidates AS (
  SELECT
    m.meet_id,
    m.meet_url,
    m.timing_platform AS stored_timing_platform,
    CASE
      WHEN m.meet_url LIKE '%athletic.net%'
        OR m.meet_url LIKE '%jdlfasttrack%'
        OR m.meet_url LIKE '%blacksquirrel%' THEN 'athletic_net'
      WHEN m.meet_url LIKE '%milesplit%' THEN 'milesplit'
      WHEN m.meet_url LIKE '%pttiming%' THEN 'pt_timing'
      WHEN m.meet_url LIKE '%finishtiming%'
        OR m.meet_url LIKE '%finishlynx%' THEN 'finish_timing'
      WHEN m.meet_url LIKE '%tfrrs%' THEN 'tfrrs'
      WHEN m.meet_url LIKE '%flashresults%' THEN 'flashresults'
      WHEN m.meet_url LIKE '%rosterathletics%' THEN 'rosterathletics'
      WHEN m.meet_url LIKE '%xpresstiming%' THEN 'xpresstiming'
      WHEN m.meet_url LIKE '%halfmiletiming%' THEN 'halfmiletiming'
      WHEN m.meet_url LIKE '%windsortiming%' THEN 'windsortiming'
      WHEN m.meet_url LIKE '%leonetiming%' THEN 'leonetiming'
      WHEN m.meet_url LIKE '%wayzatatiming%' THEN 'wayzatatiming'
      WHEN m.meet_url LIKE '%deltatiming%' THEN 'deltatiming'
      WHEN m.meet_url LIKE '%lexicontiming%' THEN 'lexicontiming'
      WHEN m.meet_url LIKE '%herostiming%' THEN 'herostiming'
      WHEN m.meet_url LIKE '%omegatiming%' THEN 'omegatiming'
      WHEN m.meet_url LIKE '%domtel-sport%' THEN 'domtel'
      WHEN m.meet_url LIKE '%liveres.%' THEN 'live_results'
      WHEN m.meet_url LIKE '%timing%' THEN 'other_timing'
      ELSE 'other'
    END AS projected_timing_platform
  FROM public.meets AS m
  WHERE m.meet_url IS NOT NULL
    AND (
      m.timing_platform IS NULL
      OR m.timing_platform IN ('other', 'other_timing')
    )
),
held AS (
  SELECT *
  FROM candidates
  WHERE stored_timing_platform IS DISTINCT FROM projected_timing_platform
    AND projected_timing_platform IN ('other', 'other_timing')
)
SELECT
  split_part(regexp_replace(meet_url, '^https?://', ''), '/', 1) AS host,
  projected_timing_platform,
  count(*) AS meet_count,
  min(meet_id) AS first_meet_id,
  max(meet_id) AS last_meet_id
FROM held
GROUP BY host, projected_timing_platform
ORDER BY meet_count DESC, host;

-- Rollback for 20260904195352_fix_v_athlete_prs_points_source.sql.
-- Restores the prior view definition exactly; it does not touch canonical rows.

CREATE OR REPLACE VIEW public.v_athlete_prs AS
WITH ranked AS (
  SELECT
    r.result_id,
    r.athlete_id,
    r.event_type_id,
    r.environment,
    r.mark_raw,
    r.mark_seconds,
    r.mark_meters,
    CASE et.measure
      WHEN 'points' THEN NULLIF(regexp_replace(r.mark_raw, '\D', '', 'g'), '')::numeric
    END AS mark_points,
    r.date,
    r.meet_id,
    et.measure,
    ROW_NUMBER() OVER (
      PARTITION BY r.athlete_id, r.event_type_id, r.environment
      ORDER BY
        CASE et.measure
          WHEN 'time'     THEN  r.mark_seconds
          WHEN 'distance' THEN -r.mark_meters
          WHEN 'points'   THEN -(
            NULLIF(regexp_replace(r.mark_raw, '\D', '', 'g'), '')::numeric
          )
        END ASC,
        r.date ASC NULLS LAST
    ) AS rn
  FROM public.results r
  JOIN public.event_types et ON et.event_type_id = r.event_type_id
  WHERE r.athlete_id IS NOT NULL
    AND (
         (et.measure = 'time'     AND r.mark_seconds IS NOT NULL)
      OR (et.measure = 'distance' AND r.mark_meters  IS NOT NULL)
      OR (et.measure = 'points'   AND r.mark_raw ~ '\d')
    )
)
SELECT
  athlete_id,
  event_type_id,
  environment,
  mark_raw,
  mark_seconds,
  mark_meters,
  mark_points,
  date       AS achieved_on,
  meet_id    AS achieved_at_meet_id,
  result_id  AS source_result_id
FROM ranked
WHERE rn = 1;

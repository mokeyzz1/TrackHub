-- Pre-change SELECT from the verified schema archive; retain invoker security.
-- Emergency regression rollback only: restores the old whitespace extraction behavior.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE VIEW public.v_athlete_prs WITH (security_invoker=true) AS
 WITH ranked AS (
         SELECT r.result_id,
            r.athlete_id,
            r.event_type_id,
            r.environment,
            r.mark_raw,
            r.mark_seconds,
            r.mark_meters,
                CASE et.measure
                    WHEN 'points'::text THEN NULLIF("substring"(TRIM(BOTH FROM r.mark_raw), '^[0-9]{3,5}'::text), ''::text)::numeric
                    ELSE NULL::numeric
                END AS mark_points,
            r.date,
            r.meet_id,
            et.measure,
            row_number() OVER (PARTITION BY r.athlete_id, r.event_type_id, r.environment ORDER BY (
                CASE et.measure
                    WHEN 'time'::text THEN r.mark_seconds
                    WHEN 'distance'::text THEN - r.mark_meters
                    WHEN 'points'::text THEN (- NULLIF("substring"(TRIM(BOTH FROM r.mark_raw), '^[0-9]{3,5}'::text), ''::text)::numeric)::double precision
                    ELSE NULL::double precision
                END), r.date, r.result_id) AS rn
           FROM results r
             JOIN event_types et ON et.event_type_id = r.event_type_id
          WHERE r.athlete_id IS NOT NULL AND (et.measure = 'time'::text AND r.mark_seconds IS NOT NULL OR et.measure = 'distance'::text AND r.mark_meters IS NOT NULL OR et.measure = 'points'::text AND r.mark_seconds IS NULL AND r.mark_meters IS NULL AND r.mark_raw ~ '^\s*[0-9]{3,5}(\s|$)'::text)
        )
 SELECT athlete_id,
    event_type_id,
    environment,
    mark_raw,
    mark_seconds,
    mark_meters,
    mark_points,
    date AS achieved_on,
    meet_id AS achieved_at_meet_id,
    result_id AS source_result_id
   FROM ranked
  WHERE rn = 1;
COMMIT;

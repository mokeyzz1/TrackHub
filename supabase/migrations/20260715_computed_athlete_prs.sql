-- Computed personal records — derived from results, not scraped.
-- backend-rebuild TODO #2 / docs/DOMAIN_LOGIC.md open question. Principle #4:
-- "Derived, not trusted" — a PR is the best legal mark an athlete has actually recorded,
-- computed from results, replacing the scraped `athlete_prs` table + `is_pr` flags.
--
-- APPLIED to prod 2026-07-19 as a plain VIEW.
-- MEASURED: per-athlete query = 0.6 ms (index scan; the athlete filter pushes into the window
-- function) -> the app can read this VIEW directly for athlete profiles; NO materialized view or
-- refresh job needed. A leaderboard-style scan (all PRs in one event) = ~8 s (seq-scans results),
-- so only materialize (or index results(event_type_id, environment)) IF PR-based leaderboards
-- get built. Current leaderboards use the separate WA-scoring top_performances functions.
--
-- DO NOT DROP athlete_prs. Measured on a 150-athlete sample (normalized via event_aliases):
-- computed-only = 299 athlete/event pairs, but SCRAPED-ONLY = 189 — the scraped table holds real
-- career bests from TFRRS profile pages for meets whose results were never imported. The two are
-- COMPLEMENTARY; those 189 also flag missing meet results worth backfilling.
--
-- PR bucket = (athlete_id × event_type_id × environment). Indoor 200m, outdoor 200m,
-- and an XC 8k are always separate PRs — exactly the target-schema design.
--
-- "Best" depends on event_types.measure:
--   time     -> smallest mark_seconds        (23.61 < 23.62)
--   distance -> largest  mark_meters         (5.08m > 5.05m)
--   points   -> largest  mark_raw::int       (multis store points only in mark_raw)
-- Normalized so LOWER is always better (negate distance/points), then rank per bucket.
--
-- v1 SCOPE: best mark ignoring wind legality. `wind` is free text (`+2.1`,`NWI`,null) and
-- most rows lack it, so filtering on it here would drop legitimate marks. Wind-legal PRs
-- (outdoor sprints/jumps with wind <= +2.0) are a documented v2 refinement once wind is
-- parsed into wind_ms/wind_legal columns.

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
          WHEN 'points'   THEN -(NULLIF(regexp_replace(r.mark_raw, '\D', '', 'g'), '')::numeric)
        END ASC,
        r.date ASC NULLS LAST          -- tie-break: earliest achievement of the best mark
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

-- PRODUCTION FORM (apply instead of the plain view once the logic is signed off):
-- A MATERIALIZED VIEW reads fast for the app and refreshes after each import batch.
--   CREATE MATERIALIZED VIEW public.mv_athlete_prs AS <same SELECT>;
--   CREATE UNIQUE INDEX mv_athlete_prs_key
--     ON public.mv_athlete_prs (athlete_id, event_type_id, environment);
--   -- refresh after imports (CONCURRENTLY needs the unique index above):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_athlete_prs;
-- Retiring scraped PRs: once mv is trusted, drop athlete_prs and stop writing results.is_pr;
-- is_pr/is_season_best become computed (a row is a PR iff it equals its bucket's mv mark).

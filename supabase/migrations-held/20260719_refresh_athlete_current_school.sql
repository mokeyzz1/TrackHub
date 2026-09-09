-- Fix stale athlete school after transfers (APPLIED 2026-07-19; re-runnable/idempotent).
--
-- PROBLEM (owner-reported): athletes who transferred still displayed their OLD school. The app
-- reads `athletes.school_id` — a single "current school" — which goes stale when someone moves.
-- Measured: 5,446 athletes were showing the wrong school (e.g. Obiora Okeke displayed "Columbia"
-- while competing for Notre Dame at both ACC and NCAA Championships in 2026).
--
-- FIX: derive current school from the athlete's most recent DATED result's team.
-- Safety: never flip an athlete TO Unattached (1835) — a college athlete running one open race
-- shouldn't lose their school affiliation. (At apply time all 5,446 were real-school→real-school.)
--
-- RE-RUN THIS periodically (e.g. after each season's imports) — transfers are continuous.
-- Longer term the app should read the per-result team (results.team_id -> teams -> schools) for
-- "who did they compete for at this meet", with athletes.school_id only as the current affiliation.
WITH latest AS (
  SELECT DISTINCT ON (r.athlete_id) r.athlete_id, t.school_id AS latest_school_id
  FROM public.results r
  JOIN public.teams t ON t.team_id = r.team_id
  WHERE r.team_id IS NOT NULL AND r.date IS NOT NULL
  ORDER BY r.athlete_id, r.date DESC
)
UPDATE public.athletes a
SET school_id = l.latest_school_id, updated_at = now()
FROM latest l
WHERE a.athlete_id = l.athlete_id
  AND a.school_id <> l.latest_school_id
  AND l.latest_school_id <> 1835;

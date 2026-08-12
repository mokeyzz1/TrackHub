-- Drop exact-duplicate indexes flagged by the DB linter (2026-07-14).
-- Each has an identical twin that remains, so no query loses coverage.
-- Lightens write cost on results (14 -> 12 indexes), speeding future backfills.
DROP INDEX IF EXISTS public.idx_athletes_school;      -- twin: idx_athletes_school_id (school_id)
DROP INDEX IF EXISTS public.idx_results_athlete;      -- twin: idx_results_athlete_id (athlete_id)
DROP INDEX IF EXISTS public.idx_results_meet_date;    -- twin: idx_results_meet_name_date (meet_name, date)

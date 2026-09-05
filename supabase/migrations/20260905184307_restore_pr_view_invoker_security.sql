-- Restore the caller-policy boundary lost when the PR view was replaced.
-- No result selection, score interpretation, columns, grants, or base-table policies change.
SET LOCAL lock_timeout = '5s';
ALTER VIEW public.v_athlete_prs SET (security_invoker = true);

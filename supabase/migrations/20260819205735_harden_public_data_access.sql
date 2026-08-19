-- Establish the browser/API security boundary from the live schema audit.
-- Public clients may read the product's published data and submit a waitlist entry.
-- Ingestion, backups, event curation, and administrative writes remain service-only.

BEGIN;

-- Every user table in the exposed public schema must be protected by RLS. Tables without a
-- public policy below intentionally become service-only, including historical backup tables.
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

-- Remove inherited/default API privileges before granting the small public surface explicitly.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Replace policies that currently target the pseudo-role PUBLIC. Explicit API roles make future
-- policy review auditable and prevent an accidental policy from granting browser writes.
DROP POLICY IF EXISTS "Allow public read access" ON public.athlete_prs;
DROP POLICY IF EXISTS "Allow service role full access" ON public.athlete_prs;
CREATE POLICY athlete_prs_public_read
  ON public.athlete_prs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY athlete_prs_service_write
  ON public.athlete_prs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read access" ON public.athlete_team_seasons;
CREATE POLICY athlete_team_seasons_public_read
  ON public.athlete_team_seasons FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.athletes;
CREATE POLICY athletes_public_read
  ON public.athletes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.conference_memberships;
CREATE POLICY conference_memberships_public_read
  ON public.conference_memberships FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.conferences;
CREATE POLICY conferences_public_read
  ON public.conferences FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow public read access to events" ON public.events;
CREATE POLICY events_public_read
  ON public.events FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.external_ids;
CREATE POLICY external_ids_public_read
  ON public.external_ids FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow public read access to meets" ON public.meets;
CREATE POLICY meets_public_read
  ON public.meets FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.regions;
CREATE POLICY regions_public_read
  ON public.regions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.relay_athletes;
CREATE POLICY relay_athletes_public_read
  ON public.relay_athletes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.relay_results;
CREATE POLICY relay_results_public_read
  ON public.relay_results FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.results;
CREATE POLICY results_public_read
  ON public.results FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.schools;
CREATE POLICY schools_public_read
  ON public.schools FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read access" ON public.teams;
CREATE POLICY teams_public_read
  ON public.teams FOR SELECT TO anon, authenticated USING (true);

-- These catalog tables were not protected by RLS in the live database, although the app reads
-- them through joins and the scraper uses them as the canonical event dictionary.
CREATE POLICY divisions_public_read
  ON public.divisions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY event_types_public_read
  ON public.event_types FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY event_aliases_public_read
  ON public.event_aliases FOR SELECT TO anon, authenticated USING (true);

-- The mobile app already queries live_results. The missing policy was a live compatibility bug,
-- not a reason to grant unrestricted table writes.
CREATE POLICY live_results_public_read
  ON public.live_results FOR SELECT TO anon, authenticated USING (true);

-- Unknown event names are ingestion diagnostics, never client data.
CREATE POLICY unmapped_events_service_write
  ON public.unmapped_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Waitlist is the one direct public insert surface. Do not allow public read/update/delete.
DROP POLICY IF EXISTS "Allow anon inserts" ON public.waitlist;
DROP POLICY IF EXISTS "Allow public inserts" ON public.waitlist;
DROP POLICY IF EXISTS "Public insert access" ON public.waitlist;
CREATE POLICY waitlist_public_insert
  ON public.waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(trim(email)) BETWEEN 3 AND 320
    AND position('@' IN trim(email)) > 1
    AND feature IS NOT NULL
    AND length(trim(feature)) BETWEEN 1 AND 100
  );

-- Push tokens are written through a narrowly validated function. The old table policies allowed
-- any browser request to update any token row and accidentally exposed SELECT to PUBLIC.
DROP POLICY IF EXISTS "Anyone can insert push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Anyone can update push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Service role can read all" ON public.push_tokens;

CREATE OR REPLACE FUNCTION public.register_push_token(
  p_expo_push_token text,
  p_platform text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  token text := trim(p_expo_push_token);
  platform_name text := lower(nullif(trim(p_platform), ''));
BEGIN
  IF token IS NULL OR length(token) NOT BETWEEN 10 AND 512 THEN
    RAISE EXCEPTION 'Invalid Expo push token' USING ERRCODE = '22023';
  END IF;

  IF platform_name IS NOT NULL AND platform_name NOT IN ('android', 'ios', 'web') THEN
    RAISE EXCEPTION 'Invalid push-token platform' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_tokens (expo_push_token, platform, is_active)
  VALUES (token, platform_name, true)
  ON CONFLICT (expo_push_token) DO UPDATE
    SET platform = EXCLUDED.platform,
        is_active = true;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.register_push_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO anon, authenticated, service_role;

-- Keep service-role access explicit even though it bypasses RLS by design.
CREATE POLICY push_tokens_service_read
  ON public.push_tokens FOR SELECT TO service_role USING (true);
CREATE POLICY push_tokens_service_write
  ON public.push_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The computed PR view was created by postgres and therefore bypassed base-table RLS. Make it
-- obey the caller's policies before exposing it through the Data API.
ALTER VIEW public.v_athlete_prs SET (security_invoker = true);

-- Harden every existing public function that the live audit found without an explicit search path.
ALTER FUNCTION public.detect_timing_platform(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_top_performances(date, date, text, char, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_weekly_performances(date, date, text, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;

-- New public tables must opt in to API access deliberately.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Explicitly grant the published read surface after the blanket revoke above.
GRANT SELECT ON TABLE
  public.athlete_prs,
  public.athlete_team_seasons,
  public.athletes,
  public.conference_memberships,
  public.conferences,
  public.divisions,
  public.event_aliases,
  public.event_types,
  public.events,
  public.external_ids,
  public.live_results,
  public.meets,
  public.regions,
  public.relay_athletes,
  public.relay_results,
  public.results,
  public.schools,
  public.teams,
  public.v_athlete_prs
TO anon, authenticated;

GRANT INSERT ON TABLE public.waitlist TO anon, authenticated;

COMMIT;

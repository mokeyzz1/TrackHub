BEGIN;

LOCK TABLE public.meets IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.meets
  ADD COLUMN meet_timezone text,
  ADD COLUMN status_override text;

-- Every live row already has end_date. Keep this repair for reproducible empty/older fixtures and
-- make the range invariant explicit for every future writer.
UPDATE public.meets
SET end_date = date
WHERE end_date IS NULL;

ALTER TABLE public.meets
  ALTER COLUMN end_date SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.meets DROP CONSTRAINT meets_status_check;
ALTER TABLE public.meets
  ADD CONSTRAINT meets_status_check
  CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled', 'postponed')) NOT VALID,
  ADD CONSTRAINT meets_status_override_check
  CHECK (status_override IS NULL OR status_override IN ('cancelled', 'postponed')) NOT VALID,
  ADD CONSTRAINT meets_date_range_check
  CHECK (end_date >= date) NOT VALID;

CREATE FUNCTION public.is_valid_time_zone_name(value text)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT value IS NULL OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names AS zones WHERE zones.name = value
  );
$$;

ALTER TABLE public.meets
  ADD CONSTRAINT meets_timezone_check
  CHECK (public.is_valid_time_zone_name(meet_timezone)) NOT VALID;

ALTER TABLE public.meets VALIDATE CONSTRAINT meets_status_check;
ALTER TABLE public.meets VALIDATE CONSTRAINT meets_status_override_check;
ALTER TABLE public.meets VALIDATE CONSTRAINT meets_date_range_check;
ALTER TABLE public.meets VALIDATE CONSTRAINT meets_timezone_check;

CREATE FUNCTION public.meet_effective_status(
  meet_date date,
  meet_end_date date,
  timing_url text,
  explicit_override text,
  time_zone_name text,
  as_of timestamp with time zone DEFAULT now()
)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH local_clock AS (
    SELECT pg_catalog.timezone(
      COALESCE(time_zone_name, 'America/Chicago'),
      as_of
    ) AS local_now
  )
  SELECT CASE
    WHEN explicit_override IS NOT NULL THEN explicit_override
    WHEN meet_date > local_now::date THEN 'upcoming'
    WHEN meet_end_date < local_now::date THEN 'completed'
    WHEN meet_end_date = local_now::date
      AND EXTRACT(hour FROM local_now) >= 23 THEN 'completed'
    WHEN meet_date <= local_now::date
      AND meet_end_date >= local_now::date
      AND timing_url IS NOT NULL THEN 'live'
    ELSE 'upcoming'
  END
  FROM local_clock;
$$;

CREATE VIEW public.v_meets_lifecycle
WITH (security_invoker = true)
AS
SELECT
  meets.*,
  public.meet_effective_status(
    meets.date,
    meets.end_date,
    meets.meet_url,
    meets.status_override,
    meets.meet_timezone
  ) AS effective_status,
  COALESCE(meets.meet_timezone, 'America/Chicago') AS lifecycle_timezone,
  meets.meet_timezone IS NULL AS timezone_is_assumed
FROM public.meets;

COMMENT ON COLUMN public.meets.meet_timezone IS
  'IANA timezone for the meet site. NULL means lifecycle evaluation uses the documented America/Chicago fallback; it is not fabricated location evidence.';
COMMENT ON COLUMN public.meets.status_override IS
  'Explicit exceptional lifecycle state (cancelled or postponed). Normal upcoming/live/completed states are derived from dates, timing URL, timezone and current time.';
COMMENT ON COLUMN public.meets.status IS
  'Compatibility cache synchronized from v_meets_lifecycle.effective_status. Do not use as the authoritative display or ingestion lifecycle.';
COMMENT ON VIEW public.v_meets_lifecycle IS
  'Authoritative current meet lifecycle. Computes effective_status at read time and exposes whether its timezone is assumed.';

REVOKE ALL ON FUNCTION public.is_valid_time_zone_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_time_zone_name(text) TO service_role;

REVOKE ALL ON FUNCTION public.meet_effective_status(date, date, text, text, text, timestamp with time zone)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meet_effective_status(date, date, text, text, text, timestamp with time zone)
  TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.v_meets_lifecycle FROM PUBLIC;
GRANT SELECT ON TABLE public.v_meets_lifecycle TO anon, authenticated, service_role;

COMMIT;

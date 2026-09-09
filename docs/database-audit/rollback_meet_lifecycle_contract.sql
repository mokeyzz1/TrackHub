BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.meets
    WHERE meet_timezone IS NOT NULL
       OR status_override IS NOT NULL
       OR status IN ('cancelled', 'postponed')
  ) THEN
    RAISE EXCEPTION 'Refusing lifecycle rollback: new timezone or override data must be preserved first';
  END IF;
END;
$$;

DROP VIEW public.v_meets_lifecycle;
DROP FUNCTION public.meet_effective_status(date, date, text, text, text, timestamp with time zone);

ALTER TABLE public.meets
  DROP CONSTRAINT meets_timezone_check,
  DROP CONSTRAINT meets_date_range_check,
  DROP CONSTRAINT meets_status_override_check,
  DROP CONSTRAINT meets_status_check;

DROP FUNCTION public.is_valid_time_zone_name(text);

ALTER TABLE public.meets
  ADD CONSTRAINT meets_status_check
  CHECK (status IN ('upcoming', 'live', 'completed')) NOT VALID;
ALTER TABLE public.meets VALIDATE CONSTRAINT meets_status_check;

ALTER TABLE public.meets
  ALTER COLUMN end_date DROP NOT NULL,
  ALTER COLUMN status DROP NOT NULL,
  DROP COLUMN meet_timezone,
  DROP COLUMN status_override;

COMMENT ON COLUMN public.meets.status IS NULL;

COMMIT;

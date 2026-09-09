-- A source privacy label is not an athlete identity. Provider observations may retain these
-- values privately, but public athlete profiles must have a usable display identity.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.athletes athlete
    WHERE btrim(athlete.full_name) = ''
       OR regexp_replace(lower(btrim(athlete.full_name)), '[^a-z0-9]+', '', 'g') IN (
         'namewithheld', 'identitywithheld', 'withheld', 'unknown', 'unknownathlete',
         'anonymous', 'redacted', 'unidentified', 'noname', 'notavailable', 'na',
         'athlete', 'unattached'
       )
  ) THEN
    RAISE EXCEPTION 'public.athletes still contains placeholder athlete names';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.athletes'::regclass
      AND conname = 'athletes_full_name_not_placeholder'
  ) THEN
    ALTER TABLE public.athletes
      ADD CONSTRAINT athletes_full_name_not_placeholder
      CHECK (
        btrim(full_name) <> ''
        AND regexp_replace(lower(btrim(full_name)), '[^a-z0-9]+', '', 'g') NOT IN (
          'namewithheld', 'identitywithheld', 'withheld', 'unknown', 'unknownathlete',
          'anonymous', 'redacted', 'unidentified', 'noname', 'notavailable', 'na',
          'athlete', 'unattached'
        )
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.athletes
  VALIDATE CONSTRAINT athletes_full_name_not_placeholder;

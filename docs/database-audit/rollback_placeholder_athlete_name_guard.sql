BEGIN;

ALTER TABLE public.athletes
  DROP CONSTRAINT IF EXISTS athletes_full_name_not_placeholder;

COMMIT;

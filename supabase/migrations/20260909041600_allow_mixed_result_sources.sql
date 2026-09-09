-- A completed meet can be backed by more than one provider while every source row still points
-- to one canonical result through ingest.source_links. Keep the meet column as a summary only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.meets'::regclass
       AND conname = 'meets_results_source_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%mixed%'
  ) THEN
    ALTER TABLE public.meets DROP CONSTRAINT meets_results_source_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.meets'::regclass
       AND conname = 'meets_results_source_check'
  ) THEN
    ALTER TABLE public.meets
      ADD CONSTRAINT meets_results_source_check
      CHECK (
        results_source IS NULL OR results_source IN (
          'athletic_net', 'tfrrs', 'mixed', 'ustfccca', 'timing_site', 'manual', 'other'
        )
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.meets VALIDATE CONSTRAINT meets_results_source_check;

COMMENT ON COLUMN public.meets.results_source IS
  'Summary of providers linked to canonical meet results. mixed means multiple providers; ingest.source_links retains per-result provenance.';

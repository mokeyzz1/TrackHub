-- Roll back 20260909041600_allow_mixed_result_sources without discarding provenance.
-- Refuse to proceed while any meet genuinely has more than one linked provider summary.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.meets WHERE results_source = 'mixed') THEN
    RAISE EXCEPTION
      'Rollback refused: meets.results_source contains mixed values; preserve or reclassify them first';
  END IF;
END
$$;

ALTER TABLE public.meets DROP CONSTRAINT IF EXISTS meets_results_source_check;
ALTER TABLE public.meets
  ADD CONSTRAINT meets_results_source_check
  CHECK (
    results_source IS NULL OR results_source IN (
      'athletic_net', 'tfrrs', 'ustfccca', 'timing_site', 'manual', 'other'
    )
  ) NOT VALID;
ALTER TABLE public.meets VALIDATE CONSTRAINT meets_results_source_check;

COMMENT ON COLUMN public.meets.results_source IS
  'Provider summary for meet results. Exact per-result provenance may also exist in ingest.source_links.';

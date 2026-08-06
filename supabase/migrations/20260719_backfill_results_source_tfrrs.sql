-- Make results provenance explicit (APPLIED 2026-07-19).
-- meets.results_source was added after most data already existed, so ~11.8k historical meets had
-- NULL. Everything with results that predates the athletic.net pipeline came from the
-- TFRRS/USTFCCCA era, so stamp it 'tfrrs'. Empty meets correctly stay NULL.
-- Result: tfrrs=11,853 · athletic_net=108 · NULL=717 (no results yet).
UPDATE public.meets m
SET results_source = 'tfrrs'
WHERE m.results_source IS NULL
  AND EXISTS (SELECT 1 FROM public.results r WHERE r.meet_id = m.meet_id);

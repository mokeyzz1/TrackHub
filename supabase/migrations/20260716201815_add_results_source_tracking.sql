-- Records WHICH source a meet's results were imported from — the orchestrator writes this
-- after comparing sources, so we always know how each meet got filled (and can see which
-- source is winning over time). Additive, nullable. APPLIED to prod 2026-07-16.
--
-- Also (data op, same day): copied athletic.net links out of the meet_url catch-all into the
-- dedicated athletic_net_results_url column (563 meets) so each source has its own home.
-- Link-column model going forward:
--   meet_url                 = raw LIVE / timing link (where the meet runs live; any system)
--   athletic_net_results_url = athletic.net RESULTS link (post-meet)
--   tfrrs_url                = TFRRS RESULTS link (post-meet)
--   wa_results_url           = World Athletics results link
ALTER TABLE public.meets
  ADD COLUMN IF NOT EXISTS results_source text
  CHECK (results_source IN ('athletic_net','tfrrs','ustfccca','timing_site','manual','other'));

COMMENT ON COLUMN public.meets.results_source IS
  'Which source the imported results came from (set by the results orchestrator). '
  'Pairs with results_status. Link columns: meet_url=live/timing link; '
  'athletic_net_results_url / tfrrs_url / wa_results_url = per-source RESULTS links.';

-- Add FK integrity on the meet_id links (results, relay_results) + clean pre-existing orphans.
-- APPLIED to prod 2026-07-15: 222 orphans cleaned; both FKs added + VALIDATED (convalidated=true).
-- backend-rebuild. Principle: "one authoritative link for everything — FKs, not text matching"
-- (docs/TARGET_SCHEMA_BLUEPRINT.md). results.event_type_id already has its FK
-- (see 20260714_create_event_types_and_aliases.sql); this covers meet_id.
--
-- WEAK-INSTANCE SAFE PATTERN (this DB is write-slow; a plain ADD FK takes an ACCESS EXCLUSIVE
-- lock and full-scans 3.6M rows). Instead:
--   1. clean orphans (cheap, index-driven on meet_id)
--   2. ADD CONSTRAINT ... NOT VALID  -> brief lock, does NOT scan existing rows
--   3. VALIDATE CONSTRAINT           -> SHARE UPDATE EXCLUSIVE (concurrent reads/writes OK)
-- Run steps 2 and 3 off-peak; VALIDATE will ERROR if any orphan remains, which is the gate.
--
-- NULLs are allowed: ~563k results.meet_id are legitimately null (athlete-history rows with no
-- matching meet). FK on a nullable column permits NULL, so those are fine — meet_id stays nullable.
-- ON DELETE default (NO ACTION/RESTRICT) is intentional: you must reassign results off a meet
-- before deleting it (the dedup tooling already does), so a meet can't be deleted out from under
-- live results.

-- 1a. Clean results orphans. Known orphan meet_ids (audit 2026-07-09): 94641, 94729 (~222 rows).
--     IN on indexed meet_id = cheap. Rows keep displaying via meet_name+date; only the bad link drops.
UPDATE public.results SET meet_id = NULL WHERE meet_id IN (94641, 94729);

-- 1b. Belt-and-suspenders: null any OTHER results.meet_id not present in meets (catches orphans
--     created by later meet merges). This scans results — on this instance run it via the throttled
--     backfill tooling if it times out, or trust the VALIDATE in step 3 to surface stragglers.
--     Uncomment to run:
-- UPDATE public.results r SET meet_id = NULL
--   WHERE r.meet_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.meets m WHERE m.meet_id = r.meet_id);

-- 1c. Clean relay_results orphans (small table — anti-join is cheap here).
UPDATE public.relay_results rr SET meet_id = NULL
  WHERE rr.meet_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.meets m WHERE m.meet_id = rr.meet_id);

-- 2. Add the FKs without scanning existing rows (enforced on all new writes immediately).
ALTER TABLE public.results
  ADD CONSTRAINT results_meet_id_fkey
  FOREIGN KEY (meet_id) REFERENCES public.meets(meet_id) NOT VALID;

ALTER TABLE public.relay_results
  ADD CONSTRAINT relay_results_meet_id_fkey
  FOREIGN KEY (meet_id) REFERENCES public.meets(meet_id) NOT VALID;

-- 3. Validate existing rows (run each separately, off-peak). Errors loudly if an orphan remains.
ALTER TABLE public.results         VALIDATE CONSTRAINT results_meet_id_fkey;
ALTER TABLE public.relay_results   VALIDATE CONSTRAINT relay_results_meet_id_fkey;

-- Verification (should both return 0):
--   SELECT count(*) FROM results r WHERE meet_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM meets m WHERE m.meet_id=r.meet_id);
--   SELECT count(*) FROM relay_results rr WHERE meet_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM meets m WHERE m.meet_id=rr.meet_id);

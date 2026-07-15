-- Drop dead ghost tables — backend-rebuild TODO #4. "No ghost tables that confuse readers"
-- (docs/TARGET_SCHEMA_BLUEPRINT.md). APPLIED to prod 2026-07-15: dropped event_entries +
-- meet_entries, removed live_results.entry_id (FK + all-null column). events deferred (frontend).
--
-- REALITY CHECK (row counts, 2026-07-15) — the blueprint's "6 empty tables" list was partly
-- wrong. Actual state:
--   events                 0    -> DEFERRED (see below — still read by the frontend)
--   event_entries          0    -> DROP (dead; entries feature never shipped)
--   meet_entries           0    -> DROP (dead; entries feature never shipped)
--   conference_memberships 0    -> KEEP (empty join table for the conferences feature)
--   conferences         1114    -> KEEP — actually POPULATED (powers division/conf filtering)
--   regions               27    -> KEEP — actually POPULATED
--   external_ids           0    -> KEEP (forward-looking multi-source ID map; portability)
--
-- events is NOT dropped here: frontend/hooks/useMeetDetails.ts still does `.from('events')`
-- (returns [] today since the table is empty, but a DROP would make that query ERROR). Dropping
-- events belongs with the frontend migration (TODO #6): first remove that fetch, then drop.
--
-- FK cleanup: meet_entries is referenced by live_results.entry_id (a KEPT table). That column is
-- all-null (meet_entries is empty), so we drop the FK and the now-purposeless column. The drop
-- candidates' own outbound FKs (event_entries->events, meet_entries->meets/athletes/teams) drop
-- automatically with their tables.

BEGIN;

-- Detach live_results from meet_entries, then remove the dead, all-null linking column.
ALTER TABLE public.live_results DROP CONSTRAINT IF EXISTS live_results_entry_id_fkey;
ALTER TABLE public.live_results DROP COLUMN IF EXISTS entry_id;

-- Drop the two dead entries-feature tables (0 rows, no code references).
DROP TABLE IF EXISTS public.event_entries;
DROP TABLE IF EXISTS public.meet_entries;

COMMIT;

-- Deferred to the frontend migration:
--   1. Edit frontend/hooks/useMeetDetails.ts — drop the `.from('events')` fetch (always [] now),
--      set events: [] directly (or remove the field if nothing consumes it).
--   2. DROP TABLE public.events;   -- its event_entries FK is already gone by then.

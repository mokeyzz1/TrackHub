-- Relay event normalization — closes the last gap in event canonicalization.
-- results.event_type_id is 100% resolved, but relay_results still carried only free-text
-- event_name. This adds relay_results.event_type_id (+ FK), maps the 21 unmapped relay
-- spellings, and backfills all 224,430 relay rows. backend-rebuild.
--
-- Two genuinely distinct relays had no canonical home, so we ADD them to the catalog rather
-- than approximate (4x1500m != 4x1600m; 4x1000m is its own thing) — per user.
-- APPLIED to prod 2026-07-15: +2 event_types, +21 aliases, column added, all 224,430 relay
-- rows backfilled (0 null). Relay importer (import-relay-results.js) wired with EventResolver.

-- 1. New canonical relay events (match existing relay convention: relay/time/both).
INSERT INTO public.event_types (code, category, measure, environment_scope) VALUES
  ('4x1500m', 'relay', 'time', 'both'),
  ('4x1000m', 'relay', 'time', 'both')
ON CONFLICT (code) DO NOTHING;

-- 2. Alias the 21 relay spellings the original build missed (it used the '4x400m' forms,
--    not the '4 x 400 Relay' forms). Yard relays map to their metric equivalents.
INSERT INTO public.event_aliases (raw_name, event_type_id) VALUES
  ('4 x 100 Relay',                    33),  -- 4x100m
  ('4 x 100 Relay HS Div. I',          33),
  ('4 x 100 Relay HS Div. II',         33),
  ('4 x 200 Relay HS Div. I',          34),  -- 4x200m
  ('4 x 200 Relay HS Div. II',         34),
  ('4 x 220 Relay (Yards)',            34),  -- 220y ~ 200m
  ('4 x 400 Relay HS Div. I',          35),  -- 4x400m
  ('4 x 400 Relay Open',               35),
  ('4 x 400 Relay Invitational',       35),
  ('4 x 440 Relay (Yards)',            35),  -- 440y ~ 400m
  ('4 x 880 Relay (Yards)',            36),  -- 880y ~ 800m -> 4x800m
  ('4 x Mile Relay',                   32),  -- mile ~ 1600m -> 4x1600m
  ('Distance Medley Relay',            49),  -- DMR
  ('Distance Medley Relay Open',       49),
  ('Sprint Medley Relay',              60),  -- SMR
  ('Sprint Medley Relay (800 Meters)', 60),
  ('Sprint Medley Relay High School',  60),
  ('Shuttle Hurdle Relay',             59),
  ('Shuttle Hurdle Relay (110 Meters)',59),
  ('4 x 1500 Relay', (SELECT event_type_id FROM public.event_types WHERE code='4x1500m')),
  ('4 x 1000 Relay', (SELECT event_type_id FROM public.event_types WHERE code='4x1000m'))
ON CONFLICT (raw_name) DO NOTHING;

-- 3. Add the canonical link to relay_results (nullable + FK; new column is all-null so the
--    FK validates instantly).
ALTER TABLE public.relay_results
  ADD COLUMN IF NOT EXISTS event_type_id integer REFERENCES public.event_types(event_type_id);

-- 4. Backfill every relay row from the alias map (case/space-insensitive match).
UPDATE public.relay_results rr
SET event_type_id = ea.event_type_id
FROM public.event_aliases ea
WHERE rr.event_type_id IS NULL
  AND lower(trim(rr.event_name)) = lower(trim(ea.raw_name));

-- Verify (expect near-0 unresolved; anything left is a genuinely new spelling to alias):
--   SELECT count(*) FROM relay_results WHERE event_type_id IS NULL;

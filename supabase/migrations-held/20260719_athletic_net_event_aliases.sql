-- athletic.net short-code event aliases (APPLIED to prod 2026-07-19).
-- athletic.net writes compact event codes ('1mile', '60mh', 'weight', 'indoor-pentathlon',
-- 'distmed12,4,8,16') that weren't in the alias map, so 3,589 imported results landed with a
-- NULL event_type_id. These aliases + a backfill restored 100% canonical event coverage.
-- 80mh and 1_5ksteeple have no canonical equivalent -> Other (uncommon).
INSERT INTO public.event_aliases (raw_name, event_type_id) VALUES
  ('1mile', 7),               -- Mile
  ('60mh', 45),               -- 60m H
  ('weight', 61),             -- Weight Throw
  ('indoor-pentathlon', 58),  -- Pentathlon
  ('distmed12,4,8,16', 49),   -- DMR (1200/400/800/1600)
  ('55mh', 42),               -- 55m H
  ('1600m', 19), ('1200m', 17), ('2000m', 24),
  ('5000m-rw', 41), ('3000m-rw', 30), ('10-km-rw', 9),
  ('80mh', 15), ('1_5ksteeple', 15)
ON CONFLICT (raw_name) DO NOTHING;

UPDATE public.results r
SET event_type_id = ea.event_type_id
FROM public.event_aliases ea
WHERE r.event_type_id IS NULL
  AND lower(trim(r.event_name)) = lower(trim(ea.raw_name));

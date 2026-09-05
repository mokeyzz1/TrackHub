-- Close the last 463 results (0.01%) that had no event_type_id.
-- All 19 are existing events carrying a section/flight/division suffix the alias table didn't
-- know: "Seeded"/"Unseeded", "D1 Elite"/"D2"/"D3", "QUALIFYING", "Oly Dev", flight "A"/"B".
-- Found while deduping D2 -- rows with a NULL event_type_id were being skipped by the join.
--
-- "Shot Put Ambulatory" is a para classification; it is still a shot put, so it groups with one.
--
-- NOTE: backfilling results.event_type_id is deliberately NOT done here. Resolving these rows
-- makes some of them collide with an existing row under results_no_exact_duplicate -- they were
-- always duplicates, hidden by the NULL. See scrapers/backfill-null-event-types.js, which
-- deletes the duplicate instead of updating it.

INSERT INTO event_aliases (raw_name, event_type_id)
SELECT v.raw_name, et.event_type_id
FROM (VALUES
  ('100 M Dash',                 '100m'),
  ('100 M Dash QUALIFYING',      '100m'),
  ('100 M Oly Dev',              '100m'),
  ('100 Meter Dash D1 Elite',    '100m'),
  ('100 Meter Dash D2',          '100m'),
  ('100 Meter Dash D2 & D3',     '100m'),
  ('100 Meter Dash D3',          '100m'),
  ('100 Meter Hurdles Invite',   '100m H'),
  ('110 Meter Hurdles Invite',   '110m H'),
  ('200 M Oly Dev',              '200m'),
  ('5000 M Open',                '5000m'),
  ('Decathlon U-20',             'Decathlon'),
  ('Discus Throw Seeded',        'Discus'),
  ('Discus Throw Unseeded',      'Discus'),
  ('Hammer Throw Seeded',        'Hammer'),
  ('Hammer Throw Unseeded',      'Hammer'),
  ('Pole Vault A',               'Pole Vault'),
  ('Pole Vault B',               'Pole Vault'),
  ('Shot Put Ambulatory',        'Shot Put')
) AS v(raw_name, code)
JOIN event_types et ON et.code = v.code
ON CONFLICT (raw_name) DO NOTHING;

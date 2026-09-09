-- AthleticLIVE uses a few qualifier suffixes that are presentation labels,
-- not distinct events. Keep the exact raw label for provenance while resolving
-- to the existing canonical event catalog.
WITH aliases(raw_name, code) AS (
  VALUES
    ('1000m College', '1000m'),
    ('200m College', '200m'),
    ('3000m College', '3000m'),
    ('400m College', '400m'),
    ('5000m College', '5000m'),
    ('600m College', '600m'),
    ('60m College', '60m'),
    ('60m College Unseeded', '60m'),
    ('60m Hurdles College', '60m H'),
    ('800m College', '800m'),
    ('Indoor Pentathlon 60m Hurdles College', '60m H'),
    ('Indoor Pentathlon 800m College', '800m'),
    ('Indoor Pentathlon High Jump College', 'High Jump'),
    ('Indoor Pentathlon Long Jump College', 'Long Jump'),
    ('Indoor Pentathlon Shot Put College', 'Shot Put'),
    ('Pole Vault College', 'Pole Vault'),
    ('Triple Jump College', 'Triple Jump')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

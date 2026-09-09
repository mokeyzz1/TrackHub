-- Some AthleticLIVE exports retain a trailing punctuation marker in relay
-- labels. Preserve the source spelling while resolving to canonical relays.
WITH aliases(raw_name, code) AS (
  VALUES
    ('4x400m Relay .', '4x400m'),
    ('4000m Distance Medley .', 'DMR')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

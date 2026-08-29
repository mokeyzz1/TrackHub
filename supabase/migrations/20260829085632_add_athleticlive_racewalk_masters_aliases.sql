-- AthleticLIVE qualifier labels for two existing timed events.
WITH aliases(raw_name, code) AS (
  VALUES
    ('3000m Race Walk College', '3000m RW'),
    ('60m Hurdles Masters', '60m H')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

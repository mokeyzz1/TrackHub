-- AthleticLIVE sometimes emits a trailing presentation period or a seeded
-- qualifier. These are labels for existing canonical events.
WITH aliases(raw_name, code) AS (
  VALUES
    ('200m .', '200m'),
    ('200m Seeded', '200m'),
    ('3000m Race Walk .', '3000m RW'),
    ('400m .', '400m'),
    ('400m Seeded', '400m'),
    ('600m .', '600m'),
    ('60m .', '60m'),
    ('60m Hurdles .', '60m H')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

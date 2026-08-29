-- AthleticLIVE publishes pentathlon component events as individual result
-- labels. They must use their timed/field event types, not the points-based
-- aggregate Pentathlon type.
WITH aliases(raw_name, code) AS (
  VALUES
    ('Indoor Pentathlon High Jump', 'High Jump'),
    ('Indoor Pentathlon Shot Put', 'Shot Put'),
    ('Indoor Pentathlon Long Jump', 'Long Jump'),
    ('1 Mile Run', 'Mile')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

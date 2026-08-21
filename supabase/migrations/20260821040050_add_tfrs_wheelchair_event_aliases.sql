-- TFRRS wheelchair division labels use a measurement-qualified event name;
-- preserve the source label and resolve it to the canonical sprint event.
WITH aliases(raw_name, code) AS (
  VALUES
    ('400 M Run Wheelchair', '400m'),
    ('800 M Run Wheelchair', '800m')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

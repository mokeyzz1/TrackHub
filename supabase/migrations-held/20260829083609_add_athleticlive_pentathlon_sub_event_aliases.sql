-- AthleticLIVE labels timed sub-events inside an indoor pentathlon with the
-- multi-event prefix. They remain individual timed performances, not Pentathlon
-- point totals, so resolve them to the existing canonical timed event types.
WITH aliases(raw_name, code) AS (
  VALUES
    ('Indoor Pentathlon 60m H', '60m H'),
    ('Indoor Pentathlon 800m', '800m')
)
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT a.raw_name, e.event_type_id
  FROM aliases a
  JOIN public.event_types e ON e.code = a.code
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

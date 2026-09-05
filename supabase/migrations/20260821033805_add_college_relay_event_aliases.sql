-- Preserve AthleticLIVE's college relay labels while resolving them to the
-- existing canonical relay event types.
INSERT INTO public.event_aliases (raw_name, event_type_id)
VALUES
  ('4x400m Relay College', 35),
  ('4000m Distance Medley College', 49)
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

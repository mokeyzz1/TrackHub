-- A mixed 4x400m is semantically distinct from a gendered 4x400m relay.
-- Give it a first-class catalog identity so mixed relay facts are not
-- silently mislabeled or discarded.
INSERT INTO public.event_types (code, category, measure, environment_scope)
VALUES ('Mixed 4x400m', 'relay', 'time', 'both')
ON CONFLICT (code) DO UPDATE
  SET category = EXCLUDED.category,
      measure = EXCLUDED.measure,
      environment_scope = EXCLUDED.environment_scope;

INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT 'Mixed 4x400m Relay Collegiate', event_type_id
  FROM public.event_types
 WHERE code = 'Mixed 4x400m'
ON CONFLICT (raw_name) DO UPDATE
      SET event_type_id = EXCLUDED.event_type_id;

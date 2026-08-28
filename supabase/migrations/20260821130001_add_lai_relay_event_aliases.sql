-- TrackScoreboard's LAI program includes two Puerto Rico-specific mixed relays. They are not
-- equivalent to 4x1600m or DMR, so give them explicit canonical event types instead of forcing
-- them into a nearby distance label.

INSERT INTO public.event_types (code, category, measure, environment_scope)
VALUES
  ('1600m Mixto Corto', 'relay', 'time', 'both'),
  ('4000m Mixto Largo', 'relay', 'time', 'both')
ON CONFLICT (code) DO UPDATE
SET category = EXCLUDED.category,
    measure = EXCLUDED.measure,
    environment_scope = EXCLUDED.environment_scope;

INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT '1600m Mixto Corto', event_type_id
FROM public.event_types WHERE code = '1600m Mixto Corto'
ON CONFLICT (raw_name) DO UPDATE SET event_type_id = EXCLUDED.event_type_id;

INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT '4000m Mixto Largo', event_type_id
FROM public.event_types WHERE code = '4000m Mixto Largo'
ON CONFLICT (raw_name) DO UPDATE SET event_type_id = EXCLUDED.event_type_id;

INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT 'Mixed 4x400m Relay', event_type_id
FROM public.event_types WHERE code = 'Mixed 4x400m'
ON CONFLICT (raw_name) DO UPDATE SET event_type_id = EXCLUDED.event_type_id;

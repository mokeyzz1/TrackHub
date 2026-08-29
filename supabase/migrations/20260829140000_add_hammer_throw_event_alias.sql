-- AthleticLIVE uses the complete field-event phrase while the canonical catalog uses Hammer.
-- The canonical event is already verified as a distance event and outdoor-only.
INSERT INTO public.event_aliases (raw_name, event_type_id)
SELECT 'Hammer Throw', event_type_id
FROM public.event_types
WHERE code = 'Hammer'
ON CONFLICT (raw_name) DO UPDATE
SET event_type_id = EXCLUDED.event_type_id;
